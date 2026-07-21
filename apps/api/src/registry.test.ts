import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { counterpartyRiskContract, type ContractStarter } from '@lattice/contracts'
import { ContractRegistry, ContractValidationError } from './registry.js'

test('persists drafts and publishes immutable versioned releases', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-registry-'))
  const file = join(directory, 'registry.json')
  const registry = await ContractRegistry.open(file, counterpartyRiskContract)
  const draft = { ...counterpartyRiskContract, description: 'Updated draft' }

  await registry.saveDraft(draft)
  const published = await registry.publish({ contract: draft, bump: 'minor', notes: 'Schema milestone' })

  assert.equal(published.release.version, '1.1.0')
  assert.match(published.release.digest, /^sha256:[a-f0-9]{64}$/)
  assert.equal(published.entry.releases.length, 2)
  assert.equal(published.entry.runtimeStatus, 'ACTIVE')
  assert.equal(published.entry.releases[0]?.version, '1.0.0')
  assert.equal(JSON.parse(await readFile(file, 'utf8')).entries[counterpartyRiskContract.id].releases.length, 2)
})

test('suspends runtime compilation without mutating an immutable release', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-registry-suspend-'))
  const registry = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const digest = registry.get(counterpartyRiskContract.id)?.releases[0]?.digest

  await registry.setRuntimeStatus(counterpartyRiskContract.id, 'SUSPENDED')
  assert.equal(registry.latestPublished(counterpartyRiskContract.id), undefined)
  assert.equal(registry.get(counterpartyRiskContract.id)?.releases[0]?.digest, digest)
  await registry.setRuntimeStatus(counterpartyRiskContract.id, 'ACTIVE')
  assert.equal(registry.latestPublished(counterpartyRiskContract.id)?.version, '1.0.0')
})

test('restores an immutable release as a new unpublished draft', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-registry-restore-'))
  const registry = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const release = registry.get(counterpartyRiskContract.id)!.releases[0]!
  const restored = await registry.restoreRelease(counterpartyRiskContract.id, release.digest)

  assert.equal(restored.draft.releaseStatus, 'UNPUBLISHED')
  assert.equal(restored.draft.digest, 'sha256:unpublished')
  assert.equal(restored.releases[0]?.digest, release.digest)
  assert.equal(restored.runtimeStatus, 'ACTIVE')
})

test('rolls back the active release pointer and appends a digest-backed audit event', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-registry-rollback-'))
  const file = join(directory, 'registry.json')
  const registry = await ContractRegistry.open(file, counterpartyRiskContract)
  const first = registry.get(counterpartyRiskContract.id)!.releases[0]!
  const draft = structuredClone(counterpartyRiskContract)
  draft.description = 'A later valid release.'
  const published = await registry.publish({ contract: draft, bump: 'minor', notes: 'Later release' })

  const rolledBack = await registry.rollbackRelease(counterpartyRiskContract.id, first.digest, 'Production evidence requires returning to the prior governed release.', 'principal_release_manager', new Date('2026-07-21T12:00:00.000Z'))

  assert.equal(rolledBack.entry.activeReleaseDigest, first.digest)
  assert.equal(rolledBack.entry.releases.length, 2)
  assert.equal(rolledBack.event.fromRelease.digest, published.release.digest)
  assert.equal(rolledBack.event.toRelease.digest, first.digest)
  assert.equal(rolledBack.event.actorId, 'principal_release_manager')
  assert.match(rolledBack.event.artifactDigest, /^sha256:[a-f0-9]{64}$/)
  assert.equal(rolledBack.entry.releaseEvents?.length, 1)
  const reopened = await ContractRegistry.open(file, counterpartyRiskContract)
  assert.equal(reopened.get(counterpartyRiskContract.id)?.releaseEvents?.[0]?.artifactDigest, rolledBack.event.artifactDigest)
  await assert.rejects(() => reopened.rollbackRelease(counterpartyRiskContract.id, first.digest, 'Duplicate rollback.', 'principal_release_manager'), /RELEASE_ALREADY_ACTIVE/)
})

test('creates contracts on top of the generated industry ontology', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-registry-create-'))
  const registry = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const base = {
    name: 'Care Authorization Context',
    description: 'Governed context for care authorization decisions.',
    domain: 'Healthcare',
    workflow: 'Care Authorization',
    owner: 'Clinical Policy',
    competencyQuestions: [{ question: 'Is this service authorized?', expectedAnswerShape: 'Decision with rationale', impact: 'CRITICAL' as const }],
  }

  const blank = await registry.create({ ...base, name: 'Blank Care Model', starter: 'blank' })
  const healthcare = await registry.create({ ...base, starter: 'healthcare' })
  const scoped = await registry.create({ ...base, name: 'Scoped Care Model', starter: 'blank', conceptScope: ['person', 'organization', 'patient'] })

  assert.ok(blank.draft.entityTypes.length >= 7)
  assert.ok(healthcare.draft.entityTypes.some((type) => type.id === 'care_authorization'))
  assert.ok(healthcare.draft.entityTypes.some((type) => type.id === 'clinical_encounter'))
  assert.ok(healthcare.draft.entityTypes.every((type) => type.properties.length >= 3))
  assert.ok(healthcare.draft.relationshipTypes.length >= 6)
  assert.equal(healthcare.releases.length, 0)
  assert.equal(healthcare.draft.ontologyRef?.workspaceId, blank.draft.ontologyRef?.workspaceId)
  assert.deepEqual(scoped.draft.conceptScope, ['person', 'organization', 'patient'])
  assert.deepEqual(scoped.draft.entityTypes.map((type) => type.id), ['person', 'organization', 'patient'])
  assert.equal(registry.listWorkspaces().find((workspace) => workspace.domain === 'healthcare')?.contractIds.length, 3)
  assert.equal(registry.get(blank.contractId)?.draft.entityTypes.length, blank.draft.entityTypes.length)
  await assert.rejects(
    () => registry.publish({ contract: blank.draft }),
    (error) => error instanceof ContractValidationError && error.issues.some((issue) => issue.includes('must be linked to an implemented operation')),
  )
})

test('creates property-bearing starters for every shipped industry pack', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-registry-starters-'))
  const registry = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const starters: Exclude<ContractStarter, 'blank'>[] = ['financial-services', 'energy', 'healthcare', 'manufacturing', 'legal', 'insurance', 'real-estate']

  for (const starter of starters) {
    const entry = await registry.create({
      name: `${starter} starter`,
      description: `Editable ${starter} ontology starter.`,
      domain: `starter sandbox ${starter}`,
      workflow: 'First governed decision',
      owner: 'Context Governance',
      starter,
      competencyQuestions: [{ question: 'What context is available?', expectedAnswerShape: 'Governed objects and evidence', impact: 'MEDIUM' }],
    })
    const typeIds = new Set(entry.draft.entityTypes.map((type) => type.id))
    assert.ok(entry.draft.entityTypes.length >= 4, `${starter} should include entity types`)
    assert.ok(entry.draft.entityTypes.every((type) => type.properties.length > 0), `${starter} should not contain property-less types`)
    assert.ok(entry.draft.relationshipTypes.every((relationship) => typeIds.has(relationship.sourceTypeId) && typeIds.has(relationship.targetTypeId)), `${starter} relationships should remain in scope`)
  }
})

test('seeds a provenance-backed ontology workspace for every implemented schema industry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-registry-generated-'))
  const registry = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const generated = registry.listWorkspaces().filter((workspace) => workspace.ontologyGeneration)

  assert.deepEqual(generated.map((workspace) => workspace.id).sort(), ['workspace-energy', 'workspace-financial-services', 'workspace-healthcare', 'workspace-insurance', 'workspace-legal', 'workspace-manufacturing', 'workspace-real-estate'])
  assert.ok(generated.every((workspace) => workspace.ontology.entityTypes.length >= 4))
  assert.equal(generated.reduce((sum, workspace) => sum + (workspace.ontologyGeneration?.sourceFormCount ?? 0), 0), 55)
  assert.equal(registry.getWorkspace('workspace-core')?.ontology.releaseStatus, 'PUBLISHED')
  assert.ok(generated.every((workspace) => workspace.ontology.composedFrom?.some((pack) => pack.role === 'FOUNDATION')))
  const financialServices = registry.getWorkspace('workspace-financial-services')!
  const existingContract = registry.get(counterpartyRiskContract.id)!.draft
  assert.ok(financialServices.ontology.entityTypes.length > existingContract.entityTypes.length)
  assert.equal(existingContract.entityTypes.length, counterpartyRiskContract.entityTypes.length)
  assert.equal(existingContract.conceptScope?.length, counterpartyRiskContract.entityTypes.length)
  assert.equal(financialServices.contractScopeModelVersion, '1.0')
})

test('persists a shared industry ontology and synchronizes contract snapshots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-registry-ontology-'))
  const registry = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const workspace = registry.listWorkspaces()[0]!
  const ontology = structuredClone(workspace.ontology)
  ontology.entityTypes = ontology.entityTypes.filter((type) => type.id !== 'regulatory_report')
  ontology.relationshipTypes = ontology.relationshipTypes.filter((relationship) => relationship.id !== 'reported_in')
  ontology.entityTypes.push({ id: 'market', label: 'Market', description: 'A governed market.', group: 'Core', icon: 'MK', properties: [], evidenceStatus: 'DECLARED', approvalStatus: 'DRAFT', impact: 'MEDIUM' })

  const updated = await registry.saveWorkspaceOntology(workspace.id, ontology)

  assert.equal(updated.ontology.entityTypes.at(-1)?.id, 'market')
  assert.equal(updated.ontology.releaseStatus, 'UNPUBLISHED')
  assert.equal(registry.get(counterpartyRiskContract.id)?.draft.entityTypes.some((type) => type.id === 'market'), false)
  assert.equal(registry.get(counterpartyRiskContract.id)?.draft.ontologyRef?.ontologyId, workspace.ontology.id)
  const reopened = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  assert.equal(reopened.getWorkspace(workspace.id)?.ontology.entityTypes.some((type) => type.id === 'regulatory_report'), false)
})

test('inherits ontology-owned bindings by concept scope and protects them on contract saves', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-registry-shared-binding-'))
  const registry = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const workspace = registry.getWorkspace('workspace-financial-services')!
  const ontology = structuredClone(workspace.ontology)
  const target = ontology.entityTypes.find((type) => counterpartyRiskContract.entityTypes.some((candidate) => candidate.id === type.id) && type.properties.length > 0)!
  const property = target.properties[0]!
  ontology.bindings = [{
    id: 'binding-master-reference',
    sourceSystem: 'Enterprise Master Data',
    operationId: 'master.read_reference',
    environment: 'production',
    freshnessMinutes: 60,
    requiredPermissions: ['master.reference.read'],
    expectedResultSchema: 'master_reference',
    version: '1.0.0',
    approvalStatus: 'APPROVED',
    endpoint: 'master.reference',
    method: 'READ',
    mappings: [{ sourcePath: 'master_id', targetTypeId: target.id, targetPropertyId: property.id, sourceDataType: 'string', confidence: 'MANUAL' }],
  }]

  await registry.saveWorkspaceOntology(workspace.id, ontology)
  const inherited = registry.get(counterpartyRiskContract.id)!.draft
  assert.equal(inherited.bindings.find((binding) => binding.id === 'binding-master-reference')?.scope, 'ONTOLOGY')
  assert.deepEqual(inherited.ontologyBindingRefs, [{ id: 'binding-master-reference', version: '1.0.0' }])

  inherited.bindings = inherited.bindings.filter((binding) => binding.id !== 'binding-master-reference')
  const saved = await registry.saveDraft(inherited)
  assert.ok(saved.draft.bindings.some((binding) => binding.id === 'binding-master-reference'))
})

test('blocks publication without an approved policy for every operation risk tier', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-registry-policy-'))
  const registry = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const contract = structuredClone(counterpartyRiskContract)
  contract.policies = []

  await assert.rejects(
    () => registry.publish({ contract }),
    (error) => error instanceof ContractValidationError && error.issues.some((issue) => issue.includes('require a matching runtime policy')),
  )
})

test('blocks connector publication without a complete read-only resource and credential reference', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lattice-registry-connector-'))
  const registry = await ContractRegistry.open(join(directory, 'registry.json'), counterpartyRiskContract)
  const contract = structuredClone(counterpartyRiskContract)
  contract.bindings[0]!.connector = {
    provider: 'DATABRICKS',
    transport: 'HTTPS',
    credentialRef: '',
    resource: { warehouse: 'warehouse-id', catalog: 'risk', schema: 'governed' },
    queryTemplate: 'SELECT * FROM governed.counterparty_exposure WHERE id = :id',
    parameterStyle: 'NAMED',
    readOnly: true,
  }

  await assert.rejects(
    () => registry.publish({ contract }),
    (error) => error instanceof ContractValidationError && error.issues.some((issue) => issue.includes('complete read-only resource scope')),
  )
})
