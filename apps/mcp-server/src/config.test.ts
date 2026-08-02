import assert from 'node:assert/strict'
import test from 'node:test'
import { configFromEnvironment } from './config.js'

test('requires a service identity token', () => {
  assert.throws(() => configFromEnvironment({}), /LATTICE_API_TOKEN is required/)
})

test('defaults to the local Context API', () => {
  const config = configFromEnvironment({ LATTICE_API_TOKEN: 'token' })
  assert.equal(config.apiUrl.origin, 'http://127.0.0.1:8787')
  assert.equal(config.organizationId, undefined)
})

test('carries the selected organization when one is configured', () => {
  const config = configFromEnvironment({ LATTICE_API_TOKEN: 'token', LATTICE_ORGANIZATION_ID: 'org-1' })
  assert.equal(config.organizationId, 'org-1')
})

test('refuses to send a bearer token over plaintext to a remote host', () => {
  assert.throws(
    () => configFromEnvironment({ LATTICE_API_TOKEN: 'token', LATTICE_API_URL: 'http://api.example.com' }),
    /must use HTTPS/,
  )
  assert.doesNotThrow(() => configFromEnvironment({ LATTICE_API_TOKEN: 'token', LATTICE_API_URL: 'https://api.example.com' }))
  assert.doesNotThrow(() => configFromEnvironment({ LATTICE_API_TOKEN: 'token', LATTICE_API_URL: 'http://localhost:8787' }))
})

test('rejects credentials embedded in the API URL', () => {
  assert.throws(
    () => configFromEnvironment({ LATTICE_API_TOKEN: 'token', LATTICE_API_URL: 'https://user:secret@api.example.com' }),
    /must not embed credentials/,
  )
})

test('rejects a malformed API URL', () => {
  assert.throws(() => configFromEnvironment({ LATTICE_API_TOKEN: 'token', LATTICE_API_URL: 'not a url' }), /not a valid URL/)
})
