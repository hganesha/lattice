import assert from 'node:assert/strict'
import { generateKeyPairSync, type KeyObject } from 'node:crypto'
import test from 'node:test'
import { LocalPlanSigner, keyThumbprint, planSignerFromEnvironment } from './signing.js'

function pem(key: KeyObject): string {
  return key.export({ type: 'pkcs8', format: 'pem' }).toString()
}

test('the key identifier is derived from the key, so it cannot be reused for a different one', () => {
  const first = generateKeyPairSync('ed25519')
  const second = generateKeyPairSync('ed25519')

  assert.equal(keyThumbprint(first.publicKey), keyThumbprint(first.publicKey))
  assert.notEqual(keyThumbprint(first.publicKey), keyThumbprint(second.publicKey))
  assert.equal(new LocalPlanSigner(first.privateKey).activeKeyId, keyThumbprint(first.publicKey))
})

test('a signature verifies against the key that produced it', async () => {
  const { privateKey } = generateKeyPairSync('ed25519')
  const signer = new LocalPlanSigner(privateKey)
  const payload = Buffer.from('{"planId":"plan-1"}')

  const signature = await signer.sign(payload)
  assert.equal(signer.verify(payload, signature, signer.activeKeyId), true)
  assert.equal(signer.verify(Buffer.from('{"planId":"plan-2"}'), signature, signer.activeKeyId), false)
})

test('a plan signed before a rotation still verifies afterwards', async () => {
  const previous = generateKeyPairSync('ed25519')
  const current = generateKeyPairSync('ed25519')
  const payload = Buffer.from('{"planId":"plan-1"}')

  const beforeRotation = new LocalPlanSigner(previous.privateKey)
  const signature = await beforeRotation.sign(payload)

  const afterRotation = new LocalPlanSigner(current.privateKey, [previous.publicKey])
  assert.equal(afterRotation.activeKeyId, keyThumbprint(current.publicKey))
  assert.equal(afterRotation.verify(payload, signature, beforeRotation.activeKeyId), true)
})

test('a retired key cannot be passed off as the current one', async () => {
  const previous = generateKeyPairSync('ed25519')
  const current = generateKeyPairSync('ed25519')
  const payload = Buffer.from('{"planId":"plan-1"}')
  const signer = new LocalPlanSigner(current.privateKey, [previous.publicKey])

  const signedByRetired = await new LocalPlanSigner(previous.privateKey).sign(payload)
  // Naming the current key while presenting a retired key's signature must fail.
  assert.equal(signer.verify(payload, signedByRetired, signer.activeKeyId), false)
})

test('an unknown key identifier is rejected rather than tried against every key', async () => {
  const { privateKey } = generateKeyPairSync('ed25519')
  const signer = new LocalPlanSigner(privateKey)
  const signature = await signer.sign(Buffer.from('x'))

  assert.equal(signer.verify(Buffer.from('x'), signature, 'not-a-key'), false)
})

test('published keys carry the identifier a verifier will look them up by', () => {
  const previous = generateKeyPairSync('ed25519')
  const current = generateKeyPairSync('ed25519')
  const keys = new LocalPlanSigner(current.privateKey, [previous.publicKey]).publicKeys()

  assert.deepEqual(keys.map((key) => key.kid), [keyThumbprint(current.publicKey), keyThumbprint(previous.publicKey)])
  for (const key of keys) {
    assert.equal(key.alg, 'EdDSA')
    assert.equal(key.use, 'sig')
    assert.equal(key.kty, 'OKP')
    // Never publish private material on a public endpoint.
    assert.equal('d' in key, false)
  }
})

test('a configured key is used, and its absence is reported as ephemeral', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')

  const configured = await planSignerFromEnvironment({ LATTICE_SIGNING_KEY: pem(privateKey) })
  assert.equal(configured.ephemeral, false)
  assert.equal(configured.signer.activeKeyId, keyThumbprint(publicKey))

  const generated = await planSignerFromEnvironment({})
  assert.equal(generated.ephemeral, true)
})

test('a base64-encoded key is accepted for environments that mangle newlines', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const encoded = Buffer.from(pem(privateKey)).toString('base64')

  const result = await planSignerFromEnvironment({ LATTICE_SIGNING_KEY: encoded })
  assert.equal(result.signer.activeKeyId, keyThumbprint(publicKey))
})

test('retired keys are loaded so a rotation does not invalidate live plans', async () => {
  const previous = generateKeyPairSync('ed25519')
  const current = generateKeyPairSync('ed25519')
  const retiredPem = previous.publicKey.export({ type: 'spki', format: 'pem' }).toString()

  const { signer } = await planSignerFromEnvironment({
    LATTICE_SIGNING_KEY: pem(current.privateKey),
    LATTICE_SIGNING_KEYS_RETIRED: retiredPem,
  })

  assert.deepEqual(signer.publicKeys().map((key) => key.kid), [keyThumbprint(current.publicKey), keyThumbprint(previous.publicKey)])
})

test('malformed key material fails loudly at startup', async () => {
  await assert.rejects(() => planSignerFromEnvironment({ LATTICE_SIGNING_KEY: 'not-a-key' }), /PKCS#8 Ed25519 private key/)
  await assert.rejects(
    () => planSignerFromEnvironment({ LATTICE_SIGNING_KEY: pem(generateKeyPairSync('ed25519').privateKey), LATTICE_SIGNING_KEYS_RETIRED: 'nonsense' }),
    /SPKI public keys/,
  )
  await assert.rejects(() => planSignerFromEnvironment({ LATTICE_SIGNING_PROVIDER: 'GCP_KMS' }), /LOCAL, AZURE_KEY_VAULT, or AWS_KMS/)
})
