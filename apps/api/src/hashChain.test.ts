import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { SignedExecutionPlan } from '@lattice/contracts'
import { counterpartyRiskContract } from '@lattice/contracts'
import { ExecutionStore } from './executionStore.js'
import { CHAIN_GENESIS, linkArtifact, nextChainState, verifyChain, type ChainedArtifact } from './hashChain.js'

function chained(entries: Array<{ id: string; artifactDigest: string }>): ChainedArtifact[] {
  let previousDigest = CHAIN_GENESIS
  return entries.map((entry, index) => {
    const chain = linkArtifact(previousDigest, entry.artifactDigest, index)
    previousDigest = chain.chainDigest
    return { ...entry, chain }
  })
}

function plan(planId: string): SignedExecutionPlan {
  return {
    schemaVersion: '1.1', planId, resolutionId: 'res', decision: 'RESOLVED', riskTier: 'INFORMATIONAL',
    principalId: 'agent', tenantId: 'tenant_a', grounding: 'LIVE', operation: 'op', arguments: {}, metrics: [],
    intent: { resolverVersion: 'v', method: 'LEXICAL', indexDigest: 'sha256:i', operationId: 'op', matchedQuestionIds: [], lexicalScore: 1, aggregateScore: 1, acceptance: 'AUTOMATIC', candidateMargin: 1, thresholds: { minimumSupportedScore: 0.5, automaticAcceptanceScore: 0.75, minimumCandidateMargin: 0.05 } },
    sourceBindings: [], requiredPermissions: [], expectedResultSchema: 's', evidenceRefs: [],
    versions: counterpartyRiskContract.versions, contractDigest: 'sha256:c',
    expiresAt: '2030-01-01T00:00:00.000Z', nonce: planId,
    keyId: 'k', signatureAlgorithm: 'Ed25519', signature: 'sig',
  }
}

async function storeWithReceipts(count: number): Promise<{ path: string; store: ExecutionStore }> {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-chain-'))
  const path = join(directory, 'receipts.json')
  const store = await ExecutionStore.open(path)
  for (let index = 0; index < count; index += 1) {
    await store.append({
      tenantId: 'tenant_a', contractId: 'contract-1', contractVersion: '1.0.0', plan: plan(`plan-${index}`),
      principalId: 'agent', status: 'SUCCESS', startedAt: '2026-08-02T00:00:00.000Z',
      completedAt: '2026-08-02T00:00:01.000Z', grantedPermissions: [], bindingResults: [],
    })
  }
  return { path, store }
}

test('an intact chain verifies', () => {
  const records = chained([{ id: 'a', artifactDigest: 'sha256:1' }, { id: 'b', artifactDigest: 'sha256:2' }])
  assert.deepEqual(verifyChain(records), { valid: true })
})

test('editing an artifact breaks its own link', () => {
  const records = chained([{ id: 'a', artifactDigest: 'sha256:1' }, { id: 'b', artifactDigest: 'sha256:2' }])
  records[1] = { ...records[1]!, artifactDigest: 'sha256:tampered' }

  const verification = verifyChain(records)
  assert.equal(verification.valid, false)
  assert.equal(verification.brokenAt, 'b')
  assert.match(verification.reason ?? '', /does not match the chain digest/)
})

test('removing a record breaks every link after it', () => {
  const records = chained([
    { id: 'a', artifactDigest: 'sha256:1' },
    { id: 'b', artifactDigest: 'sha256:2' },
    { id: 'c', artifactDigest: 'sha256:3' },
  ])
  const withoutMiddle = [records[0]!, records[2]!]

  const verification = verifyChain(withoutMiddle)
  assert.equal(verification.valid, false)
  assert.equal(verification.brokenAt, 'c')
})

test('reordering records is detected', () => {
  const records = chained([
    { id: 'a', artifactDigest: 'sha256:1' },
    { id: 'b', artifactDigest: 'sha256:2' },
    { id: 'c', artifactDigest: 'sha256:3' },
  ])
  const verification = verifyChain([records[0]!, records[2]!, records[1]!])
  assert.equal(verification.valid, false)
})

test('records written before chaining are tolerated only as an unbroken prefix', () => {
  const legacy = { id: 'legacy', artifactDigest: 'sha256:0' }
  const chainedTail = chained([{ id: 'a', artifactDigest: 'sha256:1' }])

  assert.equal(verifyChain([legacy, ...chainedTail]).valid, true)

  // Stripping a link to hide a deletion must not pass as "legacy".
  const stripped = verifyChain([...chainedTail, legacy])
  assert.equal(stripped.valid, false)
  assert.match(stripped.reason ?? '', /appears after chaining began/)
})

test('the next link continues from the last chained record', () => {
  const records = chained([{ id: 'a', artifactDigest: 'sha256:1' }])
  const next = nextChainState(records)
  assert.equal(next.sequence, 1)
  assert.equal(next.previousDigest, records[0]!.chain!.chainDigest)
  assert.deepEqual(nextChainState([]), { previousDigest: CHAIN_GENESIS, sequence: 0 })
})

test('the execution ledger chains what it appends', async () => {
  const { path } = await storeWithReceipts(3)
  const document = JSON.parse(await readFile(path, 'utf8')) as { receipts: ChainedArtifact[] }

  assert.equal(document.receipts.length, 3)
  assert.deepEqual(document.receipts.map((receipt) => receipt.chain?.sequence), [0, 1, 2])
  assert.deepEqual(verifyChain(document.receipts), { valid: true })
})

test('a tampered execution ledger refuses to load', async () => {
  const { path } = await storeWithReceipts(2)
  const document = JSON.parse(await readFile(path, 'utf8')) as { receipts: Array<Record<string, unknown>> }
  document.receipts[0]!.principalId = 'someone-else'
  await writeFile(path, JSON.stringify(document), 'utf8')

  await assert.rejects(() => ExecutionStore.open(path), /Execution ledger integrity check failed/)
})

test('a deleted execution receipt refuses to load', async () => {
  const { path } = await storeWithReceipts(3)
  const document = JSON.parse(await readFile(path, 'utf8')) as { receipts: unknown[] }
  document.receipts.splice(1, 1)
  await writeFile(path, JSON.stringify(document), 'utf8')

  await assert.rejects(() => ExecutionStore.open(path), /integrity check failed/)
})

test('editing a record without touching its digest is caught by the content check', () => {
  const records = chained([{ id: 'a', artifactDigest: 'sha256:1' }])
  const tampered = [{ ...records[0]!, principalId: 'someone-else' }] as Array<ChainedArtifact & { principalId?: string }>

  // Without a content digest the stale recorded digest still lines up.
  assert.equal(verifyChain(tampered).valid, true)

  const verification = verifyChain(tampered, (record) => (record.principalId === 'someone-else' ? 'sha256:different' : 'sha256:1'))
  assert.equal(verification.valid, false)
  assert.match(verification.reason ?? '', /does not match its recorded digest/)
})
