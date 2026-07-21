import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  connectorTemplate,
  coreOntology,
  generatedIndustryOntologyCatalog,
  type ContextContract,
  type ContractRegistryEntry,
  type ContractRelease,
  type CreateContractRequest,
  type EntityTypeDefinition,
  type IndustryOntology,
  type IndustryWorkspace,
  type RelationshipTypeDefinition,
} from '@lattice/contracts'

interface RegistryDocument {
  schemaVersion: '1.0' | '1.1'
  entries: Record<string, ContractRegistryEntry>
  workspaces?: Record<string, IndustryWorkspace>
}

export interface PublishRequest {
  contract: ContextContract
  bump?: 'major' | 'minor' | 'patch'
  notes?: string
}

export class ContractRegistry {
  private document: RegistryDocument
  private writeQueue: Promise<void> = Promise.resolve()

  private constructor(private readonly filePath: string, document: RegistryDocument) {
    this.document = document
  }

  static async open(filePath: string, seed: ContextContract): Promise<ContractRegistry> {
    try {
      const document = JSON.parse(await readFile(filePath, 'utf8')) as RegistryDocument
      for (const entry of Object.values(document.entries)) {
        entry.draft = hydratePolicyMetadata(entry.draft)
        entry.releases = entry.releases.map((release) => ({ ...release, contract: hydratePolicyMetadata(release.contract) }))
        entry.runtimeStatus = entry.runtimeStatus ?? (entry.releases.length > 0 ? 'ACTIVE' : 'NO_RELEASE')
        const latestDigest = entry.releases.at(-1)?.digest
        if (!entry.activeReleaseDigest && latestDigest) entry.activeReleaseDigest = latestDigest
      }
      document.workspaces = hydrateWorkspaces(document.entries, document.workspaces)
      document.workspaces = seedGeneratedOntologies(document.workspaces)
      repairGeneratedContractScopes(document.entries, document.workspaces)
      document.schemaVersion = '1.1'
      attachOntologyReferences(document.entries, document.workspaces)
      const registry = new ContractRegistry(filePath, document)
      await registry.persist()
      return registry
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      if (!missing) throw error
      const initialRelease: ContractRelease = {
        version: seed.version,
        digest: seed.digest,
        publishedAt: '2026-07-18T23:30:00.000Z',
        notes: 'Initial financial-services example.',
        contract: structuredClone(seed),
      }
      const document: RegistryDocument = {
        schemaVersion: '1.1',
        entries: {
          [seed.id]: {
            contractId: seed.id,
            draft: structuredClone(seed),
            updatedAt: new Date().toISOString(),
            releases: [initialRelease],
            runtimeStatus: 'ACTIVE',
            activeReleaseDigest: initialRelease.digest,
          },
        },
        workspaces: {},
      }
      document.workspaces = hydrateWorkspaces(document.entries, document.workspaces)
      document.workspaces = seedGeneratedOntologies(document.workspaces)
      repairGeneratedContractScopes(document.entries, document.workspaces)
      attachOntologyReferences(document.entries, document.workspaces)
      const registry = new ContractRegistry(filePath, document)
      await registry.persist()
      return registry
    }
  }

  list(): ContractRegistryEntry[] {
    return Object.values(this.document.entries).map((entry) => structuredClone(entry))
  }

  listWorkspaces(): IndustryWorkspace[] {
    return Object.values(this.document.workspaces ?? {}).map((workspace) => structuredClone(workspace))
  }

  getWorkspace(workspaceId: string): IndustryWorkspace | undefined {
    const workspace = this.document.workspaces?.[workspaceId]
    return workspace ? structuredClone(workspace) : undefined
  }

  async saveWorkspaceOntology(workspaceId: string, ontology: IndustryOntology): Promise<IndustryWorkspace> {
    const existing = this.document.workspaces?.[workspaceId]
    if (!existing || ontology.workspaceId !== workspaceId || ontology.id !== existing.ontology.id) throw new Error('WORKSPACE_NOT_FOUND')
    const ontologyIssues = validateOntologyDefinition(ontology)
    if (ontologyIssues.length > 0) throw new ContractValidationError(ontologyIssues)
    const updatedAt = new Date().toISOString()
    const nextOntology: IndustryOntology = {
      ...structuredClone(ontology),
      bindings: (ontology.bindings ?? []).map((binding) => ({
        ...structuredClone(binding),
        scope: 'ONTOLOGY',
        ontologyId: ontology.id,
      })),
      releaseStatus: 'UNPUBLISHED',
      digest: 'sha256:unpublished',
    }
    const workspace: IndustryWorkspace = { ...existing, ontology: nextOntology, updatedAt }
    this.document.workspaces![workspaceId] = workspace
    for (const contractId of workspace.contractIds) {
      const entry = this.document.entries[contractId]
      if (!entry) continue
      entry.draft = applyOntologySnapshot(entry.draft, workspace)
      entry.updatedAt = updatedAt
    }
    await this.persist()
    return structuredClone(workspace)
  }

  get(contractId: string): ContractRegistryEntry | undefined {
    const entry = this.document.entries[contractId]
    return entry ? structuredClone(entry) : undefined
  }

  async create(request: CreateContractRequest): Promise<ContractRegistryEntry> {
    const baseId = `contract-${slugify(request.name)}`
    const contractId = uniqueId(baseId, Object.keys(this.document.entries))
    let contract = createContract(contractId, request)
    const workspaceId = `workspace-${slugify(request.domain)}`
    const currentWorkspace = this.document.workspaces?.[workspaceId]
    const workspace = currentWorkspace ? mergeContractIntoWorkspace(currentWorkspace, contract) : workspaceFromContract(contract)
    this.document.workspaces ??= {}
    this.document.workspaces[workspaceId] = { ...workspace, contractIds: [...new Set([...workspace.contractIds, contractId])] }
    if (request.conceptScope) contract = { ...contract, conceptScope: [...new Set(request.conceptScope)] }
    contract = applyOntologySnapshot(contract, this.document.workspaces[workspaceId], !request.conceptScope)
    for (const siblingId of this.document.workspaces[workspaceId].contractIds) {
      const sibling = this.document.entries[siblingId]
      if (sibling) sibling.draft = applyOntologySnapshot(sibling.draft, this.document.workspaces[workspaceId])
    }
    const entry: ContractRegistryEntry = {
      contractId,
      draft: contract,
      updatedAt: new Date().toISOString(),
      releases: [],
      runtimeStatus: 'NO_RELEASE',
    }
    this.document.entries[contractId] = entry
    await this.persist()
    return structuredClone(entry)
  }

  latestPublished(contractId: string): ContextContract | undefined {
    const entry = this.document.entries[contractId]
    if (!entry || entry.runtimeStatus !== 'ACTIVE') return undefined
    const release = entry.releases.find((candidate) => candidate.digest === entry.activeReleaseDigest) ?? entry.releases.at(-1)
    return release?.contract ? structuredClone(release.contract) : undefined
  }

  async saveDraft(contract: ContextContract): Promise<ContractRegistryEntry> {
    const existing = this.document.entries[contract.id]
    const workspaceId = contract.ontologyRef?.workspaceId ?? `workspace-${slugify(contract.domain)}`
    const workspace = this.document.workspaces?.[workspaceId]
    const authoritativeDraft = workspace ? applyOntologySnapshot(contract, workspace) : contract
    const entry: ContractRegistryEntry = {
      contractId: contract.id,
      draft: { ...structuredClone(authoritativeDraft), releaseStatus: 'UNPUBLISHED' },
      updatedAt: new Date().toISOString(),
      releases: existing?.releases ?? [],
      runtimeStatus: existing?.runtimeStatus ?? 'NO_RELEASE',
      ...(existing?.activeReleaseDigest ? { activeReleaseDigest: existing.activeReleaseDigest } : {}),
    }
    this.document.entries[contract.id] = entry
    if (workspace && !workspace.contractIds.includes(contract.id)) workspace.contractIds.push(contract.id)
    await this.persist()
    return structuredClone(entry)
  }

  async publish(request: PublishRequest): Promise<{ entry: ContractRegistryEntry; release: ContractRelease }> {
    const issues = validateContract(request.contract)
    if (issues.length > 0) throw new ContractValidationError(issues)

    const existing = this.document.entries[request.contract.id]
    const latestVersion = existing?.releases.at(-1)?.version ?? request.contract.version
    const version = bumpVersion(latestVersion, request.bump ?? 'patch')
    const unsigned: ContextContract = {
      ...structuredClone(request.contract),
      version,
      releaseStatus: 'PUBLISHED',
      digest: '',
      versions: { ...request.contract.versions, contract: `${request.contract.id}@${version}` },
    }
    const digest = `sha256:${createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')}`
    const publishedAt = new Date().toISOString()
    const contract: ContextContract = { ...unsigned, digest }
    const release: ContractRelease = {
      version,
      digest,
      publishedAt,
      notes: request.notes?.trim() || `Published ${version}`,
      contract,
    }
    const entry: ContractRegistryEntry = {
      contractId: contract.id,
      draft: structuredClone(contract),
      updatedAt: publishedAt,
      releases: [...(existing?.releases ?? []), release],
      runtimeStatus: 'ACTIVE',
      activeReleaseDigest: digest,
    }
    this.document.entries[contract.id] = entry
    await this.persist()
    return { entry: structuredClone(entry), release: structuredClone(release) }
  }

  async setRuntimeStatus(contractId: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<ContractRegistryEntry> {
    const existing = this.document.entries[contractId]
    if (!existing) throw new Error('CONTRACT_NOT_FOUND')
    if (existing.releases.length === 0) throw new Error('CONTRACT_HAS_NO_RELEASE')
    const entry: ContractRegistryEntry = { ...existing, runtimeStatus: status, updatedAt: new Date().toISOString() }
    this.document.entries[contractId] = entry
    await this.persist()
    return structuredClone(entry)
  }

  async restoreRelease(contractId: string, digest: string): Promise<ContractRegistryEntry> {
    const existing = this.document.entries[contractId]
    if (!existing) throw new Error('CONTRACT_NOT_FOUND')
    const release = existing.releases.find((candidate) => candidate.digest === digest)
    if (!release) throw new Error('RELEASE_NOT_FOUND')
    const draft: ContextContract = {
      ...structuredClone(release.contract),
      releaseStatus: 'UNPUBLISHED',
      digest: 'sha256:unpublished',
      versions: { ...release.contract.versions, contract: `${contractId}@draft-from-${release.version}` },
    }
    const entry: ContractRegistryEntry = { ...existing, draft, updatedAt: new Date().toISOString() }
    this.document.entries[contractId] = entry
    await this.persist()
    return structuredClone(entry)
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      const temporaryPath = `${this.filePath}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(this.document, null, 2)}\n`, 'utf8')
      await rename(temporaryPath, this.filePath)
    })
    await this.writeQueue
  }
}

export class ContractValidationError extends Error {
  constructor(readonly issues: string[]) {
    super('CONTRACT_VALIDATION_FAILED')
  }
}

export function validateContract(contract: ContextContract): string[] {
  const issues: string[] = []
  const typeIds = contract.entityTypes.map((type) => type.id)
  const relationshipIds = contract.relationshipTypes.map((type) => type.id)
  const propertyIds = new Set(contract.entityTypes.flatMap((type) => type.properties.map((property) => property.id)))
  const bindingIds = new Set(contract.bindings.map((binding) => binding.id))
  if (typeIds.length === 0) issues.push('At least one entity type is required before publishing.')
  if (contract.competencyQuestions.length === 0) issues.push('At least one competency question is required before publishing.')
  if (new Set(typeIds).size !== typeIds.length) issues.push('Entity type identifiers must be unique.')
  if (new Set(relationshipIds).size !== relationshipIds.length) issues.push('Relationship type identifiers must be unique.')
  for (const type of contract.entityTypes) {
    if (!type.label.trim()) issues.push(`${type.id} needs a display name.`)
    if (!type.description.trim()) issues.push(`${type.label || type.id} needs a description.`)
    const propertyIds = type.properties.map((property) => property.id)
    if (new Set(propertyIds).size !== propertyIds.length) issues.push(`${type.label} has duplicate property identifiers.`)
    if (type.approvalStatus !== 'APPROVED' && type.approvalStatus !== 'APPROVED_WITH_EXCEPTION') issues.push(`${type.label} must be approved before publishing.`)
  }
  for (const relationship of contract.relationshipTypes) {
    if (!typeIds.includes(relationship.sourceTypeId) || !typeIds.includes(relationship.targetTypeId)) {
      issues.push(`${relationship.label} has an invalid relationship endpoint.`)
    }
    if (!relationship.description.trim()) issues.push(`${relationship.label} needs a description.`)
  }
  for (const question of contract.competencyQuestions) {
    const operation = contract.operations.find((candidate) => candidate.id === question.operationId)
    if (!operation) {
      issues.push(`Competency question ${question.id} must be linked to an implemented operation.`)
      continue
    }
    if (operation.sourceBindingIds.length === 0 || operation.sourceBindingIds.some((id) => !bindingIds.has(id))) issues.push(`${operation.label} must reference valid source bindings.`)
  }
  for (const binding of contract.bindings) {
    const mappings = binding.mappings ?? []
    if (mappings.length === 0 || mappings.some((mapping) => !typeIds.includes(mapping.targetTypeId) || !propertyIds.has(mapping.targetPropertyId))) issues.push(`${binding.sourceSystem} must map source fields to valid ontology properties.`)
    if (!binding.endpoint || !binding.method || binding.freshnessMinutes <= 0 || binding.requiredPermissions.length === 0) issues.push(`${binding.sourceSystem} has an incomplete runtime binding contract.`)
    if (binding.connector) {
      const template = connectorTemplate(binding.connector.provider)
      const resourceComplete = template.resourceFields.every((field) => binding.connector?.resource[field]?.trim())
      if (!binding.connector.credentialRef.trim() || !binding.connector.readOnly || !resourceComplete) issues.push(`${binding.sourceSystem} must use a complete read-only resource scope and an external credential reference.`)
    }
    if (binding.approvalStatus !== 'APPROVED' && binding.approvalStatus !== 'APPROVED_WITH_EXCEPTION') issues.push(`${binding.sourceSystem} must be approved before publishing.`)
  }
  const requiredRiskTiers = new Set(contract.operations.map((operation) => operation.riskTier))
  for (const riskTier of requiredRiskTiers) {
    const policy = contract.policies.find((candidate) => candidate.riskTier === riskTier)
    if (!policy) {
      issues.push(`${riskTier.replaceAll('_', ' ')} operations require a matching runtime policy.`)
      continue
    }
    if (!policy.label.trim() || !policy.description.trim() || !policy.owner.trim() || !policy.version.trim() || policy.maximumEvidenceAgeMinutes <= 0) issues.push(`${policy.label || policy.id} has an incomplete runtime policy definition.`)
    if (policy.approvalStatus !== 'APPROVED' && policy.approvalStatus !== 'APPROVED_WITH_EXCEPTION') issues.push(`${policy.label || policy.id} must be approved before publishing.`)
  }
  if (contract.tests.some((test) => test.status === 'FAIL')) issues.push('Failing assurance tests must be resolved before publishing.')
  return issues
}

function bumpVersion(version: string, bump: 'major' | 'minor' | 'patch'): string {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((part) => Number.parseInt(part, 10) || 0)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function hydratePolicyMetadata(contract: ContextContract): ContextContract {
  const defaultOwner = contract.competencyQuestions[0]?.owner || 'Context Governance'
  return {
    ...contract,
    policies: contract.policies.map((policy) => ({
      ...policy,
      label: policy.label || `${policy.riskTier.replaceAll('_', ' ').toLocaleLowerCase().replace(/\b\w/g, (character) => character.toLocaleUpperCase())} policy`,
      owner: policy.owner || defaultOwner,
      approvalStatus: policy.approvalStatus || (contract.releaseStatus === 'PUBLISHED' ? 'APPROVED' : 'DRAFT'),
    })),
  }
}

function createContract(contractId: string, request: CreateContractRequest): ContextContract {
  const schema = starterSchema(request.starter)
  const semanticId = slugify(request.domain)
  return {
    id: contractId,
    name: request.name.trim(),
    description: request.description.trim(),
    domain: semanticId,
    workflow: slugify(request.workflow),
    version: '0.1.0',
    releaseStatus: 'UNPUBLISHED',
    digest: 'sha256:unpublished',
    versions: {
      contract: `${contractId}@0.1.0`,
      semantic: `${semanticId}@0.1.0`,
      policy: 'unassigned@0.0.0',
      bindings: 'unassigned@0.0.0',
      api: 'compile@1.0',
    },
    competencyQuestions: request.competencyQuestions.map((question, index) => ({
      id: `cq-${slugify(question.question).slice(0, 42) || index + 1}`,
      question: question.question.trim(),
      expectedAnswerShape: question.expectedAnswerShape.trim(),
      impact: question.impact,
      owner: request.owner.trim(),
      testIds: [],
      operationId: `draft.${slugify(request.workflow)}.${index + 1}`,
    })),
    entityTypes: schema.entityTypes,
    entities: [],
    relationshipTypes: schema.relationshipTypes,
    relationships: [],
    metrics: [],
    evidence: [],
    bindings: [],
    operations: [],
    policies: [],
    tests: [],
    schemaLayout: Object.fromEntries(schema.entityTypes.map((type, index) => [type.id, { x: 80 + (index % 3) * 280, y: 80 + Math.floor(index / 3) * 145 }])),
  }
}

function starterSchema(starter: CreateContractRequest['starter']): {
  entityTypes: EntityTypeDefinition[]
  relationshipTypes: RelationshipTypeDefinition[]
} {
  if (starter === 'blank') return { entityTypes: [], relationshipTypes: [] }

  const domain = starter.replaceAll('-', '_')
  const pack = generatedIndustryOntologyCatalog.find((artifact) => artifact.ontology.domain === domain)?.ontology
  if (!pack) return { entityTypes: [], relationshipTypes: [] }

  return {
    entityTypes: structuredClone(pack.entityTypes).map((type) => ({
      ...type,
      evidenceStatus: 'TEMPLATE_DERIVED',
      approvalStatus: 'DRAFT',
    })),
    relationshipTypes: structuredClone(pack.relationshipTypes),
  }
}

function hydrateWorkspaces(entries: Record<string, ContractRegistryEntry>, stored?: Record<string, IndustryWorkspace>): Record<string, IndustryWorkspace> {
  const workspaces = structuredClone(stored ?? {})
  for (const workspace of Object.values(workspaces)) {
    workspace.ontology.bindings = (workspace.ontology.bindings ?? []).map((binding) => ({
      ...binding,
      scope: 'ONTOLOGY',
      ontologyId: workspace.ontology.id,
    }))
  }
  const migratingLegacyRegistry = !stored
  for (const entry of Object.values(entries)) {
    const workspaceId = entry.draft.ontologyRef?.workspaceId ?? `workspace-${slugify(entry.draft.domain)}`
    const existing = workspaces[workspaceId]
    const workspace = existing && migratingLegacyRegistry ? mergeContractIntoWorkspace(existing, entry.draft) : existing ?? workspaceFromContract(entry.draft)
    workspaces[workspaceId] = { ...workspace, contractIds: [...new Set([...workspace.contractIds, entry.contractId])] }
  }
  return workspaces
}

function seedGeneratedOntologies(workspaces: Record<string, IndustryWorkspace>): Record<string, IndustryWorkspace> {
  const next = structuredClone(workspaces)
  next['workspace-core'] ??= {
    id: 'workspace-core',
    name: 'Core Foundation',
    description: coreOntology.description,
    domain: coreOntology.domain,
    ontology: structuredClone(coreOntology),
    contractIds: [],
    updatedAt: new Date().toISOString(),
    contractScopeModelVersion: '1.0',
    ontologyCompositionVersion: '1.1',
  }
  next['workspace-core'].ontologyCompositionVersion = '1.1'
  for (const artifact of generatedIndustryOntologyCatalog) {
    const { ontology, provenance } = artifact
    const composedOntology = composeIndustryOntology(ontology)
    const generation = {
      generatorVersion: provenance.generatorVersion,
      sourceSchemaCatalogVersion: provenance.sourceSchemaCatalogVersion,
      sourceFormCount: provenance.coverage.formCount,
      mappedPercent: provenance.coverage.mappedPercent,
      ontologyDigest: ontology.digest,
    }
    const existing = next[ontology.workspaceId]
    if (!existing) {
      next[ontology.workspaceId] = {
        id: ontology.workspaceId,
        name: `${ontology.name.replace(/ Ontology$/, '')} Workspace`,
        description: ontology.description,
        domain: ontology.domain,
        ontology: composedOntology,
        contractIds: [],
        updatedAt: new Date().toISOString(),
        ontologyGeneration: generation,
        contractScopeModelVersion: '1.0',
        ontologyCompositionVersion: '1.1',
      }
      continue
    }
    if (existing.ontologyGeneration?.ontologyDigest === ontology.digest && existing.ontologyCompositionVersion === '1.1') continue
    const merged = mergeOntologyDefinitions(existing.ontology, composedOntology)
    next[ontology.workspaceId] = { ...existing, ontology: merged, ontologyGeneration: generation, ontologyCompositionVersion: '1.1', updatedAt: new Date().toISOString() }
  }
  return next
}

function composeIndustryOntology(industry: IndustryOntology): IndustryOntology {
  const entityTypes = [...structuredClone(coreOntology.entityTypes)]
  for (const type of industry.entityTypes) if (!entityTypes.some((candidate) => candidate.id === type.id)) entityTypes.push(structuredClone(type))
  const relationshipTypes = [...structuredClone(coreOntology.relationshipTypes)]
  for (const relationship of industry.relationshipTypes) if (!relationshipTypes.some((candidate) => candidate.id === relationship.id)) relationshipTypes.push(structuredClone(relationship))
  return {
    ...structuredClone(industry),
    digest: 'sha256:unpublished',
    releaseStatus: 'UNPUBLISHED',
    composedFrom: [
      { id: coreOntology.id, version: coreOntology.version, digest: coreOntology.digest, role: 'FOUNDATION' },
      { id: industry.id, version: industry.version, digest: industry.digest, role: 'INDUSTRY' },
    ],
    entityTypes,
    relationshipTypes,
    schemaLayout: { ...coreOntology.schemaLayout, ...industry.schemaLayout },
  }
}

function repairGeneratedContractScopes(entries: Record<string, ContractRegistryEntry>, workspaces: Record<string, IndustryWorkspace>): void {
  const generatedTypeIds = new Map(generatedIndustryOntologyCatalog.map((artifact) => [artifact.ontology.workspaceId, new Set(artifact.ontology.entityTypes.map((type) => type.id))]))
  for (const workspace of Object.values(workspaces)) {
    if (!workspace.ontologyGeneration || workspace.contractScopeModelVersion === '1.0') continue
    const releaseBaseline = new Set(workspace.contractIds.flatMap((contractId) => entries[contractId]?.releases.flatMap((release) => release.contract.entityTypes.map((type) => type.id)) ?? []))
    const generated = generatedTypeIds.get(workspace.id) ?? new Set<string>()
    for (const contractId of workspace.contractIds) {
      const entry = entries[contractId]
      if (!entry) continue
      const currentScope = entry.draft.conceptScope ?? entry.draft.entityTypes.map((type) => type.id)
      if (currentScope.length !== workspace.ontology.entityTypes.length) continue
      const referenced = new Set([
        ...entry.draft.entities.map((entity) => entity.typeId),
        ...entry.draft.operations.flatMap((operation) => operation.requiredEntityTypes),
        ...entry.draft.bindings.flatMap((binding) => binding.mappings?.map((mapping) => mapping.targetTypeId) ?? []),
      ])
      const repairedScope = currentScope.filter((id) => releaseBaseline.has(id) || !generated.has(id) || referenced.has(id))
      entry.draft = applyOntologySnapshot({ ...entry.draft, conceptScope: repairedScope }, workspace)
    }
    workspace.contractScopeModelVersion = '1.0'
  }
}

function mergeOntologyDefinitions(existing: IndustryOntology, generated: IndustryOntology): IndustryOntology {
  const entityTypes = [...existing.entityTypes]
  for (const type of generated.entityTypes) if (!entityTypes.some((candidate) => candidate.id === type.id)) entityTypes.push(structuredClone(type))
  const relationshipTypes = [...existing.relationshipTypes]
  for (const relationship of generated.relationshipTypes) if (!relationshipTypes.some((candidate) => candidate.id === relationship.id)) relationshipTypes.push(structuredClone(relationship))
  return {
    ...existing,
    ...(generated.composedFrom ? { composedFrom: structuredClone(generated.composedFrom) } : {}),
    releaseStatus: 'UNPUBLISHED',
    digest: 'sha256:unpublished',
    entityTypes,
    relationshipTypes,
    schemaLayout: { ...generated.schemaLayout, ...existing.schemaLayout },
  }
}

function validateOntologyDefinition(ontology: IndustryOntology): string[] {
  const issues: string[] = []
  const typeIds = ontology.entityTypes.map((type) => type.id)
  const relationshipIds = ontology.relationshipTypes.map((relationship) => relationship.id)
  if (typeIds.length === 0) issues.push('At least one fundamental entity type is required.')
  if (new Set(typeIds).size !== typeIds.length) issues.push('Entity type identifiers must be unique.')
  if (new Set(relationshipIds).size !== relationshipIds.length) issues.push('Relationship identifiers must be unique.')
  const bindingIds = (ontology.bindings ?? []).map((binding) => binding.id)
  if (new Set(bindingIds).size !== bindingIds.length) issues.push('Ontology binding identifiers must be unique.')
  for (const type of ontology.entityTypes) if (!type.label.trim() || !type.description.trim()) issues.push(`${type.id} needs a label and description.`)
  for (const relationship of ontology.relationshipTypes) {
    if (!typeIds.includes(relationship.sourceTypeId) || !typeIds.includes(relationship.targetTypeId)) issues.push(`${relationship.id} has an invalid endpoint.`)
  }
  for (const binding of ontology.bindings ?? []) {
    for (const mapping of binding.mappings ?? []) {
      const target = ontology.entityTypes.find((type) => type.id === mapping.targetTypeId)
      if (!target?.properties.some((property) => property.id === mapping.targetPropertyId)) issues.push(`${binding.sourceSystem} maps to an unknown ontology property.`)
    }
  }
  return issues
}

function attachOntologyReferences(entries: Record<string, ContractRegistryEntry>, workspaces: Record<string, IndustryWorkspace>): void {
  for (const entry of Object.values(entries)) {
    const workspaceId = entry.draft.ontologyRef?.workspaceId ?? `workspace-${slugify(entry.draft.domain)}`
    const workspace = workspaces[workspaceId]
    if (!workspace) continue
    entry.draft = applyOntologySnapshot(entry.draft, workspace)
  }
}

function workspaceFromContract(contract: ContextContract): IndustryWorkspace {
  const id = `workspace-${slugify(contract.domain)}`
  const ontologyId = `${slugify(contract.domain)}-ontology`
  const updatedAt = new Date().toISOString()
  return {
    id,
    name: `${titleCase(contract.domain)} Workspace`,
    description: `Shared semantic foundation for ${titleCase(contract.domain)} contracts.`,
    domain: contract.domain,
    contractIds: [contract.id],
    updatedAt,
    ontology: {
      id: ontologyId,
      workspaceId: id,
      name: `${titleCase(contract.domain)} Ontology`,
      description: `Fundamental entities and relationships shared across ${titleCase(contract.domain)} decision contracts.`,
      domain: contract.domain,
      version: contract.versions.semantic.split('@').at(-1) ?? '0.1.0',
      digest: contract.digest,
      releaseStatus: contract.releaseStatus,
      entityTypes: structuredClone(contract.entityTypes),
      relationshipTypes: structuredClone(contract.relationshipTypes),
      bindings: structuredClone(contract.bindings.filter((binding) => binding.scope === 'ONTOLOGY').map((binding) => ({ ...binding, ontologyId }))),
      schemaLayout: structuredClone(contract.schemaLayout ?? {}),
    },
  }
}

function mergeContractIntoWorkspace(workspace: IndustryWorkspace, contract: ContextContract): IndustryWorkspace {
  const entityTypes = [...workspace.ontology.entityTypes]
  for (const type of contract.entityTypes) if (!entityTypes.some((candidate) => candidate.id === type.id)) entityTypes.push(structuredClone(type))
  const relationshipTypes = [...workspace.ontology.relationshipTypes]
  for (const relationship of contract.relationshipTypes) if (!relationshipTypes.some((candidate) => candidate.id === relationship.id)) relationshipTypes.push(structuredClone(relationship))
  const bindings = [...(workspace.ontology.bindings ?? [])]
  for (const binding of contract.bindings.filter((candidate) => candidate.scope === 'ONTOLOGY')) if (!bindings.some((candidate) => candidate.id === binding.id)) bindings.push({ ...structuredClone(binding), ontologyId: workspace.ontology.id })
  return {
    ...workspace,
    ontology: {
      ...workspace.ontology,
      entityTypes,
      relationshipTypes,
      bindings,
      schemaLayout: { ...contract.schemaLayout, ...workspace.ontology.schemaLayout },
    },
  }
}

function applyOntologySnapshot(contract: ContextContract, workspace: IndustryWorkspace, defaultToFullScope = false): ContextContract {
  const availableTypeIds = new Set(workspace.ontology.entityTypes.map((type) => type.id))
  const previousScope = contract.conceptScope ?? contract.entityTypes.map((type) => type.id)
  const conceptScope = defaultToFullScope ? [...availableTypeIds] : previousScope.filter((id) => availableTypeIds.has(id))
  const scope = new Set(conceptScope)
  const sharedBindings = (workspace.ontology.bindings ?? []).flatMap((binding) => {
    const mappings = (binding.mappings ?? []).filter((mapping) => scope.has(mapping.targetTypeId))
    if (mappings.length === 0) return []
    return [{ ...structuredClone(binding), scope: 'ONTOLOGY' as const, ontologyId: workspace.ontology.id, mappings }]
  })
  const sharedIds = new Set(sharedBindings.map((binding) => binding.id))
  const contractBindings = contract.bindings.filter((binding) => binding.scope !== 'ONTOLOGY' && !sharedIds.has(binding.id)).map((binding) => ({ ...structuredClone(binding), scope: 'CONTRACT' as const }))
  return {
    ...contract,
    ontologyRef: {
      workspaceId: workspace.id,
      ontologyId: workspace.ontology.id,
      version: workspace.ontology.version,
      digest: workspace.ontology.digest,
    },
    conceptScope,
    entityTypes: structuredClone(workspace.ontology.entityTypes.filter((type) => scope.has(type.id))),
    relationshipTypes: structuredClone(workspace.ontology.relationshipTypes.filter((relationship) => scope.has(relationship.sourceTypeId) && scope.has(relationship.targetTypeId))),
    bindings: [...sharedBindings, ...contractBindings],
    ontologyBindingRefs: sharedBindings.map((binding) => ({ id: binding.id, version: binding.version })),
    schemaLayout: Object.fromEntries(Object.entries(workspace.ontology.schemaLayout).filter(([id]) => scope.has(id))),
  }
}

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}

function slugify(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'
}

function uniqueId(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base
  let suffix = 2
  while (existing.includes(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}
