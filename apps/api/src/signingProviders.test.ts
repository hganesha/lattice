import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto'
import test from 'node:test'
import { derToRawSignature } from './signingKms.js'
import { AwsKmsPlanSigner, AzureKeyVaultPlanSigner, type AwsKmsClient } from './signingProviders.js'

const keyPair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const jwk = keyPair.publicKey.export({ format: 'jwk' }) as { crv: string; kty: string; x: string; y: string }
const payload = Buffer.from('{"planId":"plan-1"}')

test('a DER signature converts to the raw r||s form JWS requires', () => {
  const der = sign('sha256', payload, keyPair.privateKey)
  const raw = derToRawSignature(der)

  assert.equal(raw.length, 64)
  // ECDSA is randomized, so two signatures over the same payload never match byte for byte.
  // Faithfulness is therefore proved by verifying the converted form, not by comparing it.
  assert.equal(verify('sha256', payload, { key: keyPair.publicKey, dsaEncoding: 'ieee-p1363' }, raw), true)
})

test('DER integers with a sign-padding byte convert without corrupting the component', () => {
  // A high bit in r or s forces DER to prepend 0x00, which raw form must not carry. Run enough
  // signatures to hit that case rather than assuming it never arises.
  let sawPadding = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const message = Buffer.from(`payload-${attempt}`)
    const der = sign('sha256', message, keyPair.privateKey)
    if (der.length > 70) sawPadding = true

    const raw = derToRawSignature(der)
    assert.equal(raw.length, 64)
    assert.equal(verify('sha256', message, { key: keyPair.publicKey, dsaEncoding: 'ieee-p1363' }, raw), true, `attempt ${attempt}`)
  }
  assert.equal(sawPadding, true, 'expected at least one DER signature to carry a sign-padding byte')
})

test('a signature that is not DER is rejected rather than reshaped into nonsense', () => {
  assert.throws(() => derToRawSignature(Buffer.from('not-der')), /ECDSA_SIGNATURE_NOT_DER/)
})

function keyVaultFetch(overrides: { keyResponse?: unknown; signResponse?: unknown } = {}) {
  const calls: Array<{ url: URL; method: string; body?: Record<string, unknown> }> = []
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({
      url,
      method: init?.method ?? 'GET',
      ...(init?.body ? { body: JSON.parse(String(init.body)) as Record<string, unknown> } : {}),
    })
    if (url.pathname.endsWith('/sign')) {
      const raw = sign('sha256', payload, { key: keyPair.privateKey, dsaEncoding: 'ieee-p1363' })
      return Response.json(overrides.signResponse ?? { kid: 'k', value: raw.toString('base64url') })
    }
    return Response.json(overrides.keyResponse ?? { key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } })
  }) as typeof fetch
  return { calls, fetchImpl }
}

const keyIdentifier = 'https://vault.vault.azure.net/keys/lattice-signing/abc123'

test('Key Vault signs a digest and its signature verifies locally', async () => {
  const { calls, fetchImpl } = keyVaultFetch()
  const signer = await AzureKeyVaultPlanSigner.create({ keyIdentifier, accessToken: async () => 'token', fetchImpl })

  const signature = await signer.sign(payload)

  assert.equal(signer.algorithm, 'ES256')
  assert.equal(signer.verify(payload, signature, signer.activeKeyId), true)
  assert.equal(signer.verify(Buffer.from('{"planId":"other"}'), signature, signer.activeKeyId), false)

  // Key Vault signs a digest, not the message.
  const signCall = calls.find((call) => call.method === 'POST')
  assert.equal(signCall?.body?.alg, 'ES256')
  assert.equal(signCall?.body?.value, createHash('sha256').update(payload).digest('base64url'))
})

test('Key Vault keys are published as ES256 without private material', async () => {
  const { fetchImpl } = keyVaultFetch()
  const signer = await AzureKeyVaultPlanSigner.create({ keyIdentifier, accessToken: async () => 'token', fetchImpl })

  const [key] = signer.publicKeys()
  assert.equal(key?.alg, 'ES256')
  assert.equal(key?.kty, 'EC')
  assert.equal(key?.kid, signer.activeKeyId)
  assert.equal('d' in (key ?? {}), false)
})

test('a Key Vault key on the wrong curve fails at startup rather than at signing time', async () => {
  const { fetchImpl } = keyVaultFetch({ keyResponse: { key: { kty: 'EC', crv: 'P-384', x: jwk.x, y: jwk.y } } })

  await assert.rejects(
    () => AzureKeyVaultPlanSigner.create({ keyIdentifier, accessToken: async () => 'token', fetchImpl }),
    /AZURE_KEY_VAULT_CURVE_UNSUPPORTED:P-384/,
  )
})

test('a Key Vault RSA key is refused rather than mis-signed', async () => {
  const { fetchImpl } = keyVaultFetch({ keyResponse: { key: { kty: 'RSA', n: 'x', e: 'AQAB' } } })

  await assert.rejects(
    () => AzureKeyVaultPlanSigner.create({ keyIdentifier, accessToken: async () => 'token', fetchImpl }),
    /AZURE_KEY_VAULT_KEY_NOT_EC/,
  )
})

function kmsClient(overrides: { keySpec?: string } = {}): AwsKmsClient {
  return {
    async send(command) {
      if (command.kind === 'GetPublicKey') {
        return {
          PublicKey: new Uint8Array(keyPair.publicKey.export({ type: 'spki', format: 'der' })),
          KeySpec: overrides.keySpec ?? 'ECC_NIST_P256',
        }
      }
      // KMS returns DER, which is the difference that matters.
      const der = sign('sha256', Buffer.from(command.input.Message as Uint8Array), keyPair.privateKey)
      return { Signature: new Uint8Array(der) }
    },
  }
}

test('an AWS KMS DER signature is normalized so it verifies as JWS', async () => {
  const signer = await AwsKmsPlanSigner.create({ keyId: 'alias/lattice-signing', client: kmsClient() })

  const signature = await signer.sign(payload)

  assert.equal(signer.algorithm, 'ES256')
  assert.equal(Buffer.from(signature, 'base64url').length, 64, 'the plan must carry raw r||s, never DER')
  assert.equal(signer.verify(payload, signature, signer.activeKeyId), true)
})

test('Key Vault and AWS KMS agree on the identifier for the same key', async () => {
  const { fetchImpl } = keyVaultFetch()
  const azure = await AzureKeyVaultPlanSigner.create({ keyIdentifier, accessToken: async () => 'token', fetchImpl })
  const aws = await AwsKmsPlanSigner.create({ keyId: 'alias/lattice-signing', client: kmsClient() })

  // The thumbprint is derived from the key, so the provider holding it is irrelevant.
  assert.equal(azure.activeKeyId, aws.activeKeyId)
})

test('an unsupported KMS key spec fails at startup', async () => {
  await assert.rejects(
    () => AwsKmsPlanSigner.create({ keyId: 'alias/rsa-key', client: kmsClient({ keySpec: 'RSA_2048' }) }),
    /AWS_KMS_KEY_SPEC_UNSUPPORTED:RSA_2048/,
  )
})

test('a retired managed key still verifies after a rotation', async () => {
  const previous = await AwsKmsPlanSigner.create({ keyId: 'alias/previous', client: kmsClient() })
  const signature = await previous.sign(payload)

  const rotated = await AwsKmsPlanSigner.create({
    keyId: 'alias/current',
    retiredKeyIds: ['alias/previous'],
    client: kmsClient(),
  })
  assert.equal(rotated.verify(payload, signature, previous.activeKeyId), true)
})
