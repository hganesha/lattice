import { createHash, randomUUID } from 'node:crypto'
import { parse as parseYaml } from 'yaml'
import type {
  ContextContract,
  ImportFormat,
  ImportProposal,
  PropertyDefinition,
  ProposedEntityType,
  ProposedRelationshipType,
} from '@lattice/contracts'

type JsonObject = Record<string, unknown>

// Default entity-type icon key for imported types; mirrors DEFAULT_ENTITY_ICON
// in the studio entity-icon catalog. Users re-pick a specific icon after import.
const DEFAULT_ENTITY_ICON = 'box'

export interface PreviewImportInput {
  contract: ContextContract
  sourceName: string
  sourceText: string
  format?: ImportFormat
}

export function previewImport(input: PreviewImportInput): ImportProposal {
  const document = parseDocument(input.sourceText)
  const format = detectFormat(document, input.format ?? 'AUTO')
  const schemas = schemaEntries(document, format)
  if (schemas.length === 0) throw new Error('NO_OBJECT_SCHEMAS_FOUND')

  const proposedRelationships: ProposedRelationshipType[] = []
  const entityTypes: ProposedEntityType[] = schemas.map(([sourceId, rawSchema]) => {
    const schema = flattenSchema(rawSchema)
    const id = slugify(sourceId)
    const label = stringValue(schema.title) ?? humanize(sourceId)
    const warnings: string[] = []
    const required = new Set(arrayValue(schema.required).filter((value): value is string => typeof value === 'string'))
    const properties: PropertyDefinition[] = []

    for (const [propertyName, rawProperty] of objectEntries(schema.properties)) {
      const property = flattenSchema(rawProperty)
      const directReference = referenceTarget(property.$ref)
      const itemReference = referenceTarget(objectValue(property.items)?.$ref)
      const targetSourceId = directReference ?? itemReference
      if (targetSourceId) {
        const targetId = slugify(targetSourceId)
        proposedRelationships.push({
          sourceId: `${sourceId}.${propertyName}`,
          type: {
            id: uniqueRelationshipId(`${id}_${slugify(propertyName)}`, proposedRelationships),
            label: slugify(propertyName).toLocaleUpperCase(),
            sourceTypeId: id,
            targetTypeId: targetId,
            cardinality: itemReference ? 'ONE_TO_MANY' : 'MANY_TO_ONE',
            description: stringValue(property.description) ?? `${label} references ${humanize(targetSourceId)} through ${humanize(propertyName)}.`,
            impact: 'MEDIUM',
          },
          warnings: schemas.some(([candidate]) => slugify(candidate) === targetId) ? [] : [`Referenced schema ${targetSourceId} was not found in this import.`],
        })
        continue
      }

      const converted = convertProperty(id, propertyName, property, required.has(propertyName))
      properties.push(converted.property)
      if (converted.warning) warnings.push(converted.warning)
    }

    const collision = findCollision(input.contract, id, label)
    return {
      sourceId,
      type: {
        id,
        label,
        description: stringValue(schema.description) ?? `Imported ${label} definition from ${input.sourceName}.`,
        group: format === 'OPENAPI' ? 'Imported API' : 'Imported Schema',
        icon: DEFAULT_ENTITY_ICON,
        properties,
        evidenceStatus: 'TEMPLATE_DERIVED',
        approvalStatus: 'DRAFT',
        impact: 'MEDIUM',
      },
      ...(collision ? { collision } : {}),
      warnings,
    }
  })

  const knownIds = new Set(entityTypes.map((proposal) => proposal.type.id))
  const relationshipTypes = proposedRelationships.filter((relationship) => {
    if (knownIds.has(relationship.type.targetTypeId)) return true
    relationship.warnings.push('Relationship excluded because its target schema is unavailable.')
    return false
  })
  const checksum = `sha256:${createHash('sha256').update(input.sourceText).digest('hex')}`
  return {
    id: `import_${randomUUID()}`,
    contractId: input.contract.id,
    sourceName: input.sourceName,
    format,
    checksum,
    createdAt: new Date().toISOString(),
    entityTypes,
    relationshipTypes,
    warnings: entityTypes.length > 100 ? ['Large import: review namespace and ownership boundaries before applying.'] : [],
  }
}

function parseDocument(sourceText: string): JsonObject {
  try {
    const value = JSON.parse(sourceText) as unknown
    if (!isObject(value)) throw new Error('ROOT_NOT_OBJECT')
    return value
  } catch (jsonError) {
    try {
      const value = parseYaml(sourceText) as unknown
      if (!isObject(value)) throw new Error('ROOT_NOT_OBJECT')
      return value
    } catch {
      throw new Error(jsonError instanceof SyntaxError ? 'INVALID_JSON_OR_YAML' : 'ROOT_NOT_OBJECT')
    }
  }
}

function detectFormat(document: JsonObject, requested: ImportFormat): Exclude<ImportFormat, 'AUTO'> {
  if (requested !== 'AUTO') return requested
  if (typeof document.openapi === 'string' || typeof document.swagger === 'string') return 'OPENAPI'
  return 'JSON_SCHEMA'
}

function schemaEntries(document: JsonObject, format: Exclude<ImportFormat, 'AUTO'>): Array<[string, JsonObject]> {
  if (format === 'OPENAPI') {
    const components = objectValue(document.components)
    return objectEntries(components?.schemas)
  }
  const definitions = objectValue(document.$defs) ?? objectValue(document.definitions)
  if (definitions) return objectEntries(definitions)
  if (document.type === 'object' || isObject(document.properties)) {
    return [[stringValue(document.title) ?? 'Root', document]]
  }
  return []
}

function flattenSchema(schema: JsonObject): JsonObject {
  const allOf = arrayValue(schema.allOf).filter(isObject)
  if (allOf.length === 0) return schema
  const properties = Object.assign({}, ...allOf.map((part) => objectValue(part.properties) ?? {}), objectValue(schema.properties) ?? {}) as JsonObject
  const required = [...new Set([...allOf.flatMap((part) => arrayValue(part.required)), ...arrayValue(schema.required)])]
  return { ...schema, properties, required }
}

function convertProperty(parentId: string, name: string, schema: JsonObject, required: boolean): { property: PropertyDefinition; warning?: string } {
  const sourceType = stringValue(schema.type) ?? (Array.isArray(schema.enum) ? 'string' : 'string')
  let dataType: PropertyDefinition['dataType']
  let warning: string | undefined
  if (schema.format === 'date-time') dataType = 'datetime'
  else if (schema.format === 'date') dataType = 'date'
  else if (Array.isArray(schema.enum)) dataType = 'enum'
  else if (sourceType === 'number') dataType = 'decimal'
  else if (sourceType === 'integer') dataType = 'integer'
  else if (sourceType === 'boolean') dataType = 'boolean'
  else if (sourceType === 'object' || sourceType === 'array') {
    dataType = 'string'
    warning = `${name} uses ${sourceType}; imported as string pending a governed modeling decision.`
  } else dataType = 'string'

  const allowedValues = arrayValue(schema.enum).filter((value): value is string => typeof value === 'string')
  return {
    property: {
      id: `${parentId}.${slugify(name)}`,
      name: humanize(name),
      dataType,
      description: stringValue(schema.description) ?? `Imported ${humanize(name)} property.`,
      required,
      identifier: /(^id$|id$|identifier$)/i.test(name),
      ...(allowedValues.length > 0 ? { allowedValues } : {}),
    },
    ...(warning ? { warning } : {}),
  }
}

function findCollision(contract: ContextContract, id: string, label: string) {
  const exact = contract.entityTypes.find((type) => type.id === id)
  if (exact) return { existingTypeId: exact.id, existingLabel: exact.label, match: 'EXACT_ID' as const }
  const labelMatch = contract.entityTypes.find((type) => type.label.toLocaleLowerCase() === label.toLocaleLowerCase())
  return labelMatch ? { existingTypeId: labelMatch.id, existingLabel: labelMatch.label, match: 'LABEL' as const } : undefined
}

function referenceTarget(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const segment = value.split('/').at(-1)
  return segment ? decodeURIComponent(segment) : undefined
}

function uniqueRelationshipId(base: string, relationships: ProposedRelationshipType[]): string {
  if (!relationships.some((relationship) => relationship.type.id === base)) return base
  let suffix = 2
  while (relationships.some((relationship) => relationship.type.id === `${base}_${suffix}`)) suffix += 1
  return `${base}_${suffix}`
}

function slugify(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unnamed'
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function objectValue(value: unknown): JsonObject | undefined {
  return isObject(value) ? value : undefined
}

function objectEntries(value: unknown): Array<[string, JsonObject]> {
  const object = objectValue(value)
  return object ? Object.entries(object).filter((entry): entry is [string, JsonObject] => isObject(entry[1])) : []
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
