import type { EntityTypeDefinition, IndustryOntology, PropertyDefinition, RelationshipTypeDefinition } from './types.js'

const property = (typeId: string, id: string, name: string, dataType: PropertyDefinition['dataType'], description: string, options: Pick<PropertyDefinition, 'required' | 'identifier'> = {}): PropertyDefinition => ({
  id: `${typeId}.${id}`,
  name,
  dataType,
  description,
  ...options,
})

const type = (id: string, label: string, icon: string, description: string, properties: PropertyDefinition[]): EntityTypeDefinition => ({
  id,
  label,
  description,
  group: 'Core foundation',
  icon,
  properties,
  evidenceStatus: 'TEMPLATE_DERIVED',
  approvalStatus: 'APPROVED',
  impact: 'MEDIUM',
})

const relationship = (id: string, sourceTypeId: string, targetTypeId: string, cardinality: RelationshipTypeDefinition['cardinality'], description: string): RelationshipTypeDefinition => ({
  id,
  label: id.toLocaleUpperCase(),
  sourceTypeId,
  targetTypeId,
  cardinality,
  description,
  impact: 'MEDIUM',
})

export const coreOntology: IndustryOntology = {
  id: 'core-ontology',
  workspaceId: 'workspace-core',
  name: 'Lattice Core Ontology',
  description: 'Published cross-industry concepts that provide a stable semantic foundation for every industry workspace.',
  domain: 'core',
  version: '1.0.0',
  digest: 'sha256:3ad6248d90ba945bd7e8165e24d16ef852f297810e26e8945a5749bfcd833489',
  releaseStatus: 'PUBLISHED',
  composedFrom: [],
  entityTypes: [
    type('person', 'Person', 'PE', 'A human being identified in a governed business context.', [
      property('person', 'person_id', 'Person identifier', 'string', 'Stable governed identifier for the person.', { required: true, identifier: true }),
      property('person', 'display_name', 'Display name', 'string', 'Preferred name used in governed interfaces.', { required: true }),
      property('person', 'effective_from', 'Effective from', 'datetime', 'Time from which this person record is valid.'),
    ]),
    type('organization', 'Organization', 'OR', 'A governed legal, public, or operating organization.', [
      property('organization', 'organization_id', 'Organization identifier', 'string', 'Stable governed identifier for the organization.', { required: true, identifier: true }),
      property('organization', 'legal_name', 'Legal name', 'string', 'Registered or otherwise authoritative organization name.', { required: true }),
      property('organization', 'organization_type', 'Organization type', 'string', 'Governed classification of the organization.'),
    ]),
    type('agent', 'Agent', 'AG', 'A human or software actor authorized to perform governed activity.', [
      property('agent', 'agent_id', 'Agent identifier', 'string', 'Stable governed identifier for the actor.', { required: true, identifier: true }),
      property('agent', 'agent_type', 'Agent type', 'enum', 'Whether the actor is human, service, or automated.'),
      property('agent', 'active', 'Active', 'boolean', 'Whether the agent is currently authorized.'),
    ]),
    type('location', 'Location', 'LO', 'A physical, administrative, or virtual place relevant to governed activity.', [
      property('location', 'location_id', 'Location identifier', 'string', 'Stable governed identifier for the location.', { required: true, identifier: true }),
      property('location', 'name', 'Location name', 'string', 'Human-readable location name.', { required: true }),
      property('location', 'country_code', 'Country code', 'string', 'ISO country code when applicable.'),
    ]),
    type('document', 'Document', 'DO', 'A governed information artifact with identity, version, and provenance.', [
      property('document', 'document_id', 'Document identifier', 'string', 'Stable governed identifier for the document.', { required: true, identifier: true }),
      property('document', 'title', 'Title', 'string', 'Authoritative document title.', { required: true }),
      property('document', 'version', 'Version', 'string', 'Document version or revision.'),
      property('document', 'issued_at', 'Issued at', 'datetime', 'Time at which the document was issued.'),
    ]),
    type('event', 'Event', 'EV', 'A governed occurrence bounded by time and business meaning.', [
      property('event', 'event_id', 'Event identifier', 'string', 'Stable governed identifier for the event.', { required: true, identifier: true }),
      property('event', 'event_type', 'Event type', 'string', 'Governed classification of the event.', { required: true }),
      property('event', 'occurred_at', 'Occurred at', 'datetime', 'Time at which the event occurred.', { required: true }),
    ]),
    type('asset', 'Asset', 'AS', 'A governed physical, digital, or financial resource.', [
      property('asset', 'asset_id', 'Asset identifier', 'string', 'Stable governed identifier for the asset.', { required: true, identifier: true }),
      property('asset', 'name', 'Asset name', 'string', 'Human-readable asset name.', { required: true }),
      property('asset', 'asset_type', 'Asset type', 'string', 'Governed classification of the asset.'),
    ]),
    type('policy', 'Policy', 'PO', 'A versioned rule or standard governing decisions and actions.', [
      property('policy', 'policy_id', 'Policy identifier', 'string', 'Stable governed identifier for the policy.', { required: true, identifier: true }),
      property('policy', 'title', 'Policy title', 'string', 'Authoritative policy title.', { required: true }),
      property('policy', 'version', 'Version', 'string', 'Approved policy version.', { required: true }),
      property('policy', 'effective_from', 'Effective from', 'datetime', 'Time from which the policy applies.'),
    ]),
  ],
  relationshipTypes: [
    relationship('member_of', 'person', 'organization', 'MANY_TO_MANY', 'A person is affiliated with an organization.'),
    relationship('acts_for', 'agent', 'organization', 'MANY_TO_ONE', 'An agent acts on behalf of an organization.'),
    relationship('located_at', 'organization', 'location', 'MANY_TO_MANY', 'An organization operates at a location.'),
    relationship('documents', 'document', 'event', 'MANY_TO_MANY', 'A document records or describes an event.'),
    relationship('involves_asset', 'event', 'asset', 'MANY_TO_MANY', 'An event involves a governed asset.'),
    relationship('governed_by_policy', 'event', 'policy', 'MANY_TO_MANY', 'An event is governed by an applicable policy.'),
    relationship('owned_by_organization', 'asset', 'organization', 'MANY_TO_ONE', 'An asset is owned or stewarded by an organization.'),
  ],
  schemaLayout: {
    person: { x: 60, y: 60 }, organization: { x: 340, y: 60 }, agent: { x: 60, y: 210 }, location: { x: 620, y: 60 },
    document: { x: 60, y: 360 }, event: { x: 340, y: 360 }, asset: { x: 620, y: 360 }, policy: { x: 620, y: 210 },
  },
}
