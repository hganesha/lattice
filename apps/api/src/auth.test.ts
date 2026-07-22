import assert from 'node:assert/strict'
import test from 'node:test'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { authenticatorFromEnvironment, createOidcAuthenticator } from './auth.js'

test('verifies OIDC signatures, issuer, audience, expiry, and identity claims', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(publicKey)
  const authenticator = createOidcAuthenticator({ issuer: 'https://identity.example.com', audience: 'lattice-api', jwksUrl: 'https://identity.example.com/jwks', algorithms: ['RS256'], tenantClaim: 'tid', principalClaim: 'sub', rolesClaim: 'roles' }, createLocalJWKSet({ keys: [{ ...publicJwk, kid: 'key-1', alg: 'RS256', use: 'sig' }] }))
  const token = await new SignJWT({ tid: 'tenant-risk', roles: ['AUTHOR', 'REVIEWER'], scope: 'contracts:read contracts:write' })
    .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
    .setIssuer('https://identity.example.com')
    .setAudience('lattice-api')
    .setSubject('user-42')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)

  assert.deepEqual(await authenticator.authenticate(`Bearer ${token}`), { tenantId: 'tenant-risk', principalId: 'user-42', roles: ['AUTHOR', 'REVIEWER'], scopes: ['contracts:read', 'contracts:write'] })
  assert.equal(await authenticator.authenticate(`Bearer ${token} trailing`), undefined)
  assert.equal(await authenticator.authenticate(undefined), undefined)
})

test('rejects tokens with the wrong audience or missing tenant identity', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  const publicJwk = await exportJWK(publicKey)
  const authenticator = createOidcAuthenticator({ issuer: 'https://identity.example.com', audience: 'lattice-api', jwksUrl: 'https://identity.example.com/jwks', algorithms: ['ES256'], tenantClaim: 'tid', principalClaim: 'sub', rolesClaim: 'roles' }, createLocalJWKSet({ keys: [{ ...publicJwk, kid: 'key-2', alg: 'ES256', use: 'sig' }] }))
  const wrongAudience = await new SignJWT({ tid: 'tenant-risk' }).setProtectedHeader({ alg: 'ES256', kid: 'key-2' }).setIssuer('https://identity.example.com').setAudience('other-api').setSubject('user-42').setIssuedAt().setExpirationTime('5m').sign(privateKey)
  const missingTenant = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'key-2' }).setIssuer('https://identity.example.com').setAudience('lattice-api').setSubject('user-42').setIssuedAt().setExpirationTime('5m').sign(privateKey)

  assert.equal(await authenticator.authenticate(`Bearer ${wrongAudience}`), undefined)
  assert.equal(await authenticator.authenticate(`Bearer ${missingTenant}`), undefined)
})

test('accepts Supabase-style identity before tenant membership resolution', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256')
  const publicJwk = await exportJWK(publicKey)
  const authenticator = createOidcAuthenticator({ issuer: 'https://project.supabase.co/auth/v1', audience: 'authenticated', jwksUrl: 'https://project.supabase.co/auth/v1/.well-known/jwks.json', algorithms: ['ES256'], tenantClaim: 'organization_id', principalClaim: 'sub', rolesClaim: 'app_metadata.roles', allowMissingTenant: true }, createLocalJWKSet({ keys: [{ ...publicJwk, kid: 'supabase-key', alg: 'ES256', use: 'sig' }] }))
  const token = await new SignJWT({ app_metadata: { roles: ['AUTHOR'] } })
    .setProtectedHeader({ alg: 'ES256', kid: 'supabase-key' })
    .setIssuer('https://project.supabase.co/auth/v1')
    .setAudience('authenticated')
    .setSubject('1351f96b-8103-4851-b7c2-a9e4f60dde1b')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)

  assert.deepEqual(await authenticator.authenticate(`Bearer ${token}`), {
    principalId: '1351f96b-8103-4851-b7c2-a9e4f60dde1b',
    roles: ['AUTHOR'],
    scopes: [],
  })
})

test('allows explicit development authentication outside production only', async () => {
  const previousDevAuth = process.env.LATTICE_DEV_AUTH
  const previousNodeEnv = process.env.NODE_ENV
  const previousIssuer = process.env.LATTICE_OIDC_ISSUER
  const previousSupabaseUrl = process.env.LATTICE_SUPABASE_URL
  const previousAudience = process.env.LATTICE_OIDC_AUDIENCE
  const previousJwksUrl = process.env.LATTICE_OIDC_JWKS_URL
  delete process.env.LATTICE_OIDC_ISSUER
  delete process.env.LATTICE_OIDC_AUDIENCE
  delete process.env.LATTICE_OIDC_JWKS_URL
  delete process.env.LATTICE_SUPABASE_URL
  process.env.LATTICE_DEV_AUTH = 'true'
  process.env.NODE_ENV = 'development'
  try {
    const identity = await authenticatorFromEnvironment().authenticate('Bearer studio-author')
    assert.equal(identity?.tenantId, 'tenant_dev')
    assert.deepEqual(identity?.roles, ['DEVELOPER'])
    process.env.NODE_ENV = 'production'
    assert.throws(() => authenticatorFromEnvironment(), /DEV_AUTH_NOT_ALLOWED_IN_PRODUCTION/)
  } finally {
    previousDevAuth === undefined ? delete process.env.LATTICE_DEV_AUTH : process.env.LATTICE_DEV_AUTH = previousDevAuth
    previousNodeEnv === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = previousNodeEnv
    previousIssuer === undefined ? delete process.env.LATTICE_OIDC_ISSUER : process.env.LATTICE_OIDC_ISSUER = previousIssuer
    previousAudience === undefined ? delete process.env.LATTICE_OIDC_AUDIENCE : process.env.LATTICE_OIDC_AUDIENCE = previousAudience
    previousJwksUrl === undefined ? delete process.env.LATTICE_OIDC_JWKS_URL : process.env.LATTICE_OIDC_JWKS_URL = previousJwksUrl
    previousSupabaseUrl === undefined ? delete process.env.LATTICE_SUPABASE_URL : process.env.LATTICE_SUPABASE_URL = previousSupabaseUrl
  }
})

test('fails closed for incomplete, insecure, or symmetric OIDC configuration', () => {
  const keys = ['LATTICE_OIDC_ISSUER', 'LATTICE_OIDC_AUDIENCE', 'LATTICE_OIDC_JWKS_URL', 'LATTICE_OIDC_ALGORITHMS', 'LATTICE_DEV_AUTH', 'LATTICE_SUPABASE_URL'] as const
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  try {
    delete process.env.LATTICE_DEV_AUTH
    delete process.env.LATTICE_SUPABASE_URL
    process.env.LATTICE_OIDC_ISSUER = 'https://identity.example.com'
    delete process.env.LATTICE_OIDC_AUDIENCE
    delete process.env.LATTICE_OIDC_JWKS_URL
    assert.throws(() => authenticatorFromEnvironment(), /OIDC_CONFIGURATION_INCOMPLETE/)

    process.env.LATTICE_OIDC_AUDIENCE = 'lattice-api'
    process.env.LATTICE_OIDC_JWKS_URL = 'http://identity.example.com/jwks'
    assert.throws(() => authenticatorFromEnvironment(), /OIDC_JWKS_URL_INVALID/)

    process.env.LATTICE_OIDC_JWKS_URL = 'https://identity.example.com/jwks'
    process.env.LATTICE_OIDC_ALGORITHMS = 'HS256'
    assert.throws(() => authenticatorFromEnvironment(), /OIDC_ALGORITHM_NOT_ALLOWED/)
  } finally {
    for (const key of keys) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key]
  }
})
