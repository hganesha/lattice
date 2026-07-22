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
  const healthy = await store.append({ ...base, status: 'HEALTHY', checkedAt: healthyAt }, 60)
  const failed = await store.append({ ...base, status: 'UNHEALTHY', checkedAt: '2026-07-22T13:01:00.000Z', errorCode: 'CONNECT_TIMEOUT' }, 60)

  assert.equal(healthy.freshnessStatus, 'CURRENT')
  assert.equal(failed.lastSuccessfulAt, healthyAt)
  assert.equal(failed.freshnessStatus, 'STALE')
  assert.deepEqual(store.list('binding-fabric').map((record) => record.status), ['UNHEALTHY', 'HEALTHY'])
  assert.match(await readFile(path, 'utf8'), /connector_health_/)
})
