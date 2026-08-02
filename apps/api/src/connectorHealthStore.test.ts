import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ConnectorHealthStore } from './connectorHealthStore.js'

test('persists connector health history and carries the last successful probe into failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-connector-health-'))
  const path = join(directory, 'health.json')
  const store = await ConnectorHealthStore.open(path)
  const healthyAt = '2026-07-22T12:00:00.000Z'
  const base = {
    bindingId: 'binding-fabric',
    provider: 'MICROSOFT_FABRIC' as const,
    latencyMs: 42,
    credentialSource: 'BROKER' as const,
    probe: 'LIVE_DISCOVERY' as const,
    checks: [{ id: 'reachability', status: 'PASS' as const, message: 'Provider metadata is reachable.' }],
  }
  const healthy = await store.append({ ...base, status: 'HEALTHY', checkedAt: healthyAt }, 60, 'tenant_a')
  const failed = await store.append({ ...base, status: 'UNHEALTHY', checkedAt: '2026-07-22T13:01:00.000Z', errorCode: 'CONNECT_TIMEOUT' }, 60, 'tenant_a')

  assert.equal(healthy.freshnessStatus, 'CURRENT')
  assert.equal(failed.lastSuccessfulAt, healthyAt)
  assert.equal(failed.freshnessStatus, 'STALE')
  assert.deepEqual(store.list('tenant_a', 'binding-fabric').map((record) => record.status), ['UNHEALTHY', 'HEALTHY'])
  assert.match(await readFile(path, 'utf8'), /connector_health_/)
})

test('connector health telemetry is not readable from another tenant', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-connector-health-tenancy-'))
  const store = await ConnectorHealthStore.open(join(directory, 'health.json'))
  await store.append({
    bindingId: 'binding-fabric',
    provider: 'MICROSOFT_FABRIC',
    latencyMs: 42,
    credentialSource: 'BROKER',
    probe: 'LIVE_DISCOVERY',
    checks: [],
    status: 'HEALTHY',
    checkedAt: '2026-07-22T12:00:00.000Z',
  }, 60, 'tenant_a')

  assert.equal(store.list('tenant_a').length, 1)
  assert.equal(store.list('tenant_b').length, 0)
  assert.equal(store.latest('tenant_b', 'binding-fabric'), undefined)
})
