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
  const format = detectFormat(input.sourceText, input.sourceName, input.format ?? 'AUTO')
  if (format === 'CSV') return previewCsvImport(input)
  if (format === 'RDF_XML' || format === 'TURTLE') return previewRdfImport(input, format)

  const document = parseDocument(input.sourceText)
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

interface RdfEntity {
  sourceId: string
  label: string
  description: string | undefined
}

interface RdfProperty {
  sourceId: string
  label: string
  description: string | undefined
  domain: string
  range: string | undefined
  cardinality: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY' | undefined
}

interface ParsedRdfOntology {
  entities: RdfEntity[]
  properties: RdfProperty[]
  relationships: RdfProperty[]
  warnings: string[]
}

function previewCsvImport(input: PreviewImportInput): ImportProposal {
  const rows = parseCsv(input.sourceText)
  const header = rows[0]?.map((value) => value.trim()) ?? []
  if (header.length === 0 || header.every((value) => !value)) throw new Error('CSV_HEADER_REQUIRED')
  if (header.some((value) => !value)) throw new Error('CSV_HEADER_CONTAINS_BLANK_COLUMN')
  const normalizedHeaders = header.map(slugify)
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) throw new Error('CSV_HEADER_COLUMNS_MUST_BE_UNIQUE')
  const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim()))
  if (dataRows.some((row) => row.length !== header.length)) throw new Error('CSV_ROW_WIDTH_MISMATCH')

  const sourceId = input.sourceName.replace(/\.[^.]+$/, '') || 'ImportedRecord'
  const id = slugify(sourceId)
  const label = humanize(sourceId)
  const properties = header.map((name, index) => inferCsvProperty(id, name, dataRows.map((row) => row[index]?.trim() ?? '')))
  const collision = findCollision(input.contract, id, label)
  return createProposal(input, 'CSV', [{
    sourceId,
    type: {
      id,
      label,
      description: `Imported ${label} tabular definition from ${input.sourceName}.`,
      group: 'Imported Data',
      icon: DEFAULT_ENTITY_ICON,
      properties,
      evidenceStatus: 'TEMPLATE_DERIVED',
      approvalStatus: 'DRAFT',
      impact: 'MEDIUM',
    },
    ...(collision ? { collision } : {}),
    warnings: dataRows.length === 0 ? ['The CSV contains headers only; property types defaulted to string.'] : [],
  }], [], dataRows.length > 500 ? ['Type inference sampled the first 500 data rows.'] : [])
}

function inferCsvProperty(parentId: string, name: string, allValues: string[]): PropertyDefinition {
  const values = allValues.slice(0, 500).filter(Boolean)
  let dataType: PropertyDefinition['dataType'] = 'string'
  if (values.length > 0 && values.every((value) => /^(true|false)$/i.test(value))) dataType = 'boolean'
  else if (values.length > 0 && values.every((value) => /^-?\d+$/.test(value))) dataType = 'integer'
  else if (values.length > 0 && values.every((value) => /^-?(?:\d+\.\d+|\d+e[+-]?\d+)$/i.test(value))) dataType = 'decimal'
  else if (values.length > 0 && values.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) dataType = 'date'
  else if (values.length > 0 && values.every((value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)))) dataType = 'datetime'

  const distinct = [...new Set(values)]
  const identifier = /(^id$|id$|identifier$)/i.test(name)
  const allowedValues = !identifier && dataType === 'string' && distinct.length > 0 && distinct.length <= 12 && distinct.length <= Math.max(2, Math.ceil(values.length / 2))
    ? distinct
    : undefined
  return {
    id: `${parentId}.${slugify(name)}`,
    name: humanize(name),
    dataType: allowedValues ? 'enum' : dataType,
    description: `Imported ${humanize(name)} column.`,
    required: allValues.length > 0 && allValues.every(Boolean),
    identifier,
    ...(allowedValues ? { allowedValues } : {}),
  }
}

function parseCsv(sourceText: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < sourceText.length; index += 1) {
    const character = sourceText[index]!
    if (quoted) {
      if (character === '"' && sourceText[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
    } else if (character === '"' && field.length === 0) quoted = true
    else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && sourceText[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += character
  }
  if (quoted) throw new Error('CSV_UNTERMINATED_QUOTED_FIELD')
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function previewRdfImport(input: PreviewImportInput, format: 'RDF_XML' | 'TURTLE'): ImportProposal {
  const ontology = format === 'RDF_XML' ? parseRdfXml(input.sourceText) : parseTurtle(input.sourceText)
  if (ontology.entities.length === 0) throw new Error('NO_OWL_CLASSES_FOUND')
  const idBySource = new Map(ontology.entities.map((entity) => [entity.sourceId, slugify(localName(entity.sourceId))]))
  const entityTypes: ProposedEntityType[] = ontology.entities.map((entity) => {
    const id = idBySource.get(entity.sourceId)!
    const label = entity.label || humanize(localName(entity.sourceId))
    const properties = ontology.properties
      .filter((property) => property.domain === entity.sourceId)
      .map((property) => rdfDatatypeProperty(id, property))
    const collision = findCollision(input.contract, id, label)
    return {
      sourceId: entity.sourceId,
      type: {
        id,
        label,
        description: entity.description ?? `Imported ${label} ontology class from ${input.sourceName}.`,
        group: 'Imported Ontology',
        icon: DEFAULT_ENTITY_ICON,
        properties,
        evidenceStatus: 'TEMPLATE_DERIVED',
        approvalStatus: 'DRAFT',
        impact: 'MEDIUM',
      },
      ...(collision ? { collision } : {}),
      warnings: [],
    }
  })
  const relationshipTypes: ProposedRelationshipType[] = ontology.relationships.flatMap((relationship) => {
    const sourceTypeId = idBySource.get(relationship.domain)
    const targetTypeId = relationship.range ? idBySource.get(relationship.range) : undefined
    if (!sourceTypeId || !targetTypeId) return []
    return [{
      sourceId: relationship.sourceId,
      type: {
        id: slugify(localName(relationship.sourceId)),
        label: relationship.label || humanize(localName(relationship.sourceId)).toLocaleUpperCase(),
        sourceTypeId,
        targetTypeId,
        cardinality: relationship.cardinality ?? 'MANY_TO_MANY',
        description: relationship.description ?? `Imported ontology relationship ${relationship.label}.`,
        impact: 'MEDIUM' as const,
      },
      warnings: relationship.cardinality ? [] : ['OWL cardinality was not declared; imported as many-to-many for review.'],
    }]
  })
  const unboundProperties = ontology.properties.filter((property) => !idBySource.has(property.domain)).length
  const unboundRelationships = ontology.relationships.filter((relationship) => !idBySource.has(relationship.domain) || !relationship.range || !idBySource.has(relationship.range)).length
  const warnings = [...ontology.warnings]
  if (unboundProperties > 0) warnings.push(`${unboundProperties} datatype properties were skipped because their domain class was not included.`)
  if (unboundRelationships > 0) warnings.push(`${unboundRelationships} object properties were skipped because their domain or range class was not included.`)
  return createProposal(input, format, entityTypes, relationshipTypes, warnings)
}

function rdfDatatypeProperty(parentId: string, property: RdfProperty): PropertyDefinition {
  const range = localName(property.range ?? '').toLocaleLowerCase()
  const dataType: PropertyDefinition['dataType'] = range === 'boolean' ? 'boolean'
    : ['integer', 'int', 'long', 'short', 'nonnegativeinteger', 'positiveinteger'].includes(range) ? 'integer'
      : ['decimal', 'double', 'float'].includes(range) ? 'decimal'
        : range === 'date' ? 'date'
          : ['datetime', 'datetimestamp'].includes(range) ? 'datetime'
            : 'string'
  const name = property.label || humanize(localName(property.sourceId))
  const localId = slugify(localName(property.sourceId))
  const propertyId = localId.startsWith(`${parentId}_`) ? localId.slice(parentId.length + 1) : localId
  return {
    id: `${parentId}.${propertyId}`,
    name,
    dataType,
    description: property.description ?? `Imported ${name} datatype property.`,
    required: false,
    identifier: /(^id$|id$|identifier$)/i.test(localName(property.sourceId)),
  }
}

function createProposal(
  input: PreviewImportInput,
  format: Exclude<ImportFormat, 'AUTO'>,
  entityTypes: ProposedEntityType[],
  relationshipTypes: ProposedRelationshipType[],
  warnings: string[],
): ImportProposal {
  return {
    id: `import_${randomUUID()}`,
    contractId: input.contract.id,
    sourceName: input.sourceName,
    format,
    checksum: `sha256:${createHash('sha256').update(input.sourceText).digest('hex')}`,
    createdAt: new Date().toISOString(),
    entityTypes,
    relationshipTypes,
    warnings,
  }
}

function parseRdfXml(sourceText: string): ParsedRdfOntology {
  if (!/<(?:rdf:RDF|owl:Ontology|owl:Class|rdfs:Class)\b/.test(sourceText)) throw new Error('INVALID_RDF_XML')
  const classElements = [...extractXmlElements(sourceText, 'owl:Class'), ...extractXmlElements(sourceText, 'rdfs:Class')]
  const entities = uniqueBy(classElements.flatMap((element) => {
    const sourceId = rdfSubject(element.attributes)
    return sourceId ? [{ sourceId, label: xmlText(element.body, 'rdfs:label') ?? humanize(localName(sourceId)), description: xmlText(element.body, 'rdfs:comment') }] : []
  }), (entity) => entity.sourceId)
  const properties = parseRdfXmlProperties(sourceText, 'owl:DatatypeProperty')
  const relationships = parseRdfXmlProperties(sourceText, 'owl:ObjectProperty')
  return { entities, properties, relationships, warnings: [] }
}

function parseRdfXmlProperties(sourceText: string, tag: string): RdfProperty[] {
  return extractXmlElements(sourceText, tag).flatMap((element) => {
    const sourceId = rdfSubject(element.attributes)
    const domain = xmlResource(element.body, 'rdfs:domain')
    if (!sourceId || !domain) return []
    return [{
      sourceId,
      domain,
      range: xmlResource(element.body, 'rdfs:range'),
      cardinality: rdfCardinality(xmlText(element.body, 'lattice:cardinality')),
      label: xmlText(element.body, 'rdfs:label') ?? humanize(localName(sourceId)),
      description: xmlText(element.body, 'rdfs:comment'),
    }]
  })
}

function extractXmlElements(sourceText: string, tag: string): Array<{ attributes: string; body: string }> {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = new RegExp(`<${escapedTag}\\b([^>]*?)(?:\\/\\s*>|>([\\s\\S]*?)<\\/${escapedTag}\\s*>)`, 'gi')
  return [...sourceText.matchAll(expression)].map((match) => ({ attributes: match[1] ?? '', body: match[2] ?? '' }))
}

function rdfSubject(attributes: string): string | undefined {
  const about = xmlAttribute(attributes, 'rdf:about')
  if (about) return about
  const id = xmlAttribute(attributes, 'rdf:ID')
  return id ? `#${id}` : undefined
}

function xmlText(body: string, tag: string): string | undefined {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = body.match(new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}\\s*>`, 'i'))
  if (!match?.[1]) return undefined
  return decodeXml(match[1].replace(/<[^>]+>/g, '').trim()) || undefined
}

function xmlResource(body: string, tag: string): string | undefined {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = body.match(new RegExp(`<${escapedTag}\\b([^>]*)\\/?\\s*>`, 'i'))
  return match?.[1] ? xmlAttribute(match[1], 'rdf:resource') : undefined
}

function xmlAttribute(attributes: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = attributes.match(new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
  return match?.[2] ? decodeXml(match[2]) : undefined
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}

interface TurtleTriple {
  subject: string
  predicate: string
  object: string
  literal: boolean
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDFS_CLASS = 'http://www.w3.org/2000/01/rdf-schema#Class'
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'
const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment'
const RDFS_DOMAIN = 'http://www.w3.org/2000/01/rdf-schema#domain'
const RDFS_RANGE = 'http://www.w3.org/2000/01/rdf-schema#range'
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class'
const OWL_DATATYPE_PROPERTY = 'http://www.w3.org/2002/07/owl#DatatypeProperty'
const OWL_OBJECT_PROPERTY = 'http://www.w3.org/2002/07/owl#ObjectProperty'
const LATTICE_CARDINALITY = 'https://lattice.dev/vocab#cardinality'

function parseTurtle(sourceText: string): ParsedRdfOntology {
  const prefixes = new Map<string, string>([
    ['rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'],
    ['rdfs', 'http://www.w3.org/2000/01/rdf-schema#'],
    ['owl', 'http://www.w3.org/2002/07/owl#'],
    ['xsd', 'http://www.w3.org/2001/XMLSchema#'],
  ])
  const prefixExpression = /(?:@prefix|PREFIX)\s+([A-Za-z][\w-]*)?:\s*<([^>]+)>\s*\.?/gi
  for (const match of sourceText.matchAll(prefixExpression)) prefixes.set(match[1] ?? '', match[2]!)
  const content = stripTurtleComments(sourceText.replace(prefixExpression, ''))
  const triples: TurtleTriple[] = []
  for (const statement of splitTurtle(content, '.')) {
    const segments = splitTurtle(statement, ';').map((segment) => segment.trim()).filter(Boolean)
    if (segments.length === 0) continue
    const first = turtleTerms(segments[0]!)
    if (first.length < 3) continue
    const subject = expandTurtleTerm(first[0]!, prefixes)
    pushTurtleTriple(triples, subject, first[1]!, first.slice(2).join(' '), prefixes)
    for (const segment of segments.slice(1)) {
      const terms = turtleTerms(segment)
      if (terms.length >= 2) pushTurtleTriple(triples, subject, terms[0]!, terms.slice(1).join(' '), prefixes)
    }
  }

  const typedSubjects = (type: string) => uniqueBy(triples.filter((triple) => triple.predicate === RDF_TYPE && triple.object === type).map((triple) => triple.subject), (value) => value)
  const classSubjects = uniqueBy([...typedSubjects(OWL_CLASS), ...typedSubjects(RDFS_CLASS)], (value) => value)
  const literalFor = (subject: string, predicate: string) => triples.find((triple) => triple.subject === subject && triple.predicate === predicate && triple.literal)?.object
  const resourceFor = (subject: string, predicate: string) => triples.find((triple) => triple.subject === subject && triple.predicate === predicate && !triple.literal)?.object
  const entities = classSubjects.map((sourceId) => ({
    sourceId,
    label: literalFor(sourceId, RDFS_LABEL) ?? humanize(localName(sourceId)),
    description: literalFor(sourceId, RDFS_COMMENT),
  }))
  const mapProperty = (sourceId: string): RdfProperty | undefined => {
    const domain = resourceFor(sourceId, RDFS_DOMAIN)
    if (!domain) return undefined
    return {
      sourceId,
      domain,
      range: resourceFor(sourceId, RDFS_RANGE),
      cardinality: rdfCardinality(literalFor(sourceId, LATTICE_CARDINALITY)),
      label: literalFor(sourceId, RDFS_LABEL) ?? humanize(localName(sourceId)),
      description: literalFor(sourceId, RDFS_COMMENT),
    }
  }
  const properties = typedSubjects(OWL_DATATYPE_PROPERTY).map(mapProperty).filter((value): value is RdfProperty => Boolean(value))
  const relationships = typedSubjects(OWL_OBJECT_PROPERTY).map(mapProperty).filter((value): value is RdfProperty => Boolean(value))
  return { entities, properties, relationships, warnings: [] }
}

function rdfCardinality(value: string | undefined): RdfProperty['cardinality'] {
  return value === 'ONE_TO_ONE' || value === 'ONE_TO_MANY' || value === 'MANY_TO_ONE' || value === 'MANY_TO_MANY' ? value : undefined
}

function pushTurtleTriple(triples: TurtleTriple[], subject: string, predicateToken: string, objectToken: string, prefixes: Map<string, string>) {
  const predicate = predicateToken === 'a' ? RDF_TYPE : expandTurtleTerm(predicateToken, prefixes)
  const literal = objectToken.startsWith('"') || objectToken.startsWith("'")
  triples.push({ subject, predicate, object: literal ? parseTurtleLiteral(objectToken) : expandTurtleTerm(objectToken.split(/\s+/)[0]!, prefixes), literal })
}

function turtleTerms(value: string): string[] {
  return value.match(/"(?:\\.|[^"\\])*"(?:@[\w-]+|\^\^[^\s;,]+)?|'(?:\\.|[^'\\])*'(?:@[\w-]+|\^\^[^\s;,]+)?|<[^>]*>|[^\s]+/g) ?? []
}

function expandTurtleTerm(token: string, prefixes: Map<string, string>): string {
  const trimmed = token.trim()
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return trimmed.slice(1, -1)
  const separator = trimmed.indexOf(':')
  if (separator >= 0) {
    const namespace = prefixes.get(trimmed.slice(0, separator))
    if (namespace !== undefined) return `${namespace}${trimmed.slice(separator + 1)}`
  }
  return trimmed
}

function parseTurtleLiteral(token: string): string {
  const quote = token[0] ?? '"'
  const end = token.lastIndexOf(quote)
  const value = end > 0 ? token.slice(1, end) : token.slice(1)
  return value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\')
}

function stripTurtleComments(value: string): string {
  let result = ''
  let quote = ''
  let inUri = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!
    if (quote) {
      result += character
      if (character === quote && value[index - 1] !== '\\') quote = ''
    } else if (character === '"' || character === "'") {
      quote = character
      result += character
    } else if (character === '<') {
      inUri = true
      result += character
    } else if (character === '>') {
      inUri = false
      result += character
    } else if (character === '#' && !inUri) {
      while (index < value.length && value[index] !== '\n') index += 1
      result += '\n'
    } else result += character
  }
  return result
}

function splitTurtle(value: string, separator: '.' | ';'): string[] {
  const parts: string[] = []
  let current = ''
  let quote = ''
  let inUri = false
  let bracketDepth = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!
    if (quote) {
      current += character
      if (character === quote && value[index - 1] !== '\\') quote = ''
    } else if (character === '"' || character === "'") {
      quote = character
      current += character
    } else if (character === '<') {
      inUri = true
      current += character
    } else if (character === '>') {
      inUri = false
      current += character
    } else if (character === '[' || character === '(') {
      bracketDepth += 1
      current += character
    } else if (character === ']' || character === ')') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      current += character
    } else if (character === separator && !inUri && bracketDepth === 0) {
      parts.push(current)
      current = ''
    } else current += character
  }
  if (current.trim()) parts.push(current)
  return parts
}

function localName(value: string): string {
  const hash = value.lastIndexOf('#')
  const slash = value.lastIndexOf('/')
  const colon = value.lastIndexOf(':')
  return decodeURIComponent(value.slice(Math.max(hash, slash, colon) + 1)) || value
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const identifier = key(value)
    if (seen.has(identifier)) return false
    seen.add(identifier)
    return true
  })
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

function detectFormat(sourceText: string, sourceName: string, requested: ImportFormat): Exclude<ImportFormat, 'AUTO'> {
  if (requested !== 'AUTO') return requested
  const normalizedName = sourceName.toLocaleLowerCase()
  const trimmed = sourceText.trimStart()
  if (/\.(rdf|owl|xml)$/.test(normalizedName) || /<(?:rdf:RDF|owl:Ontology|owl:Class)\b/.test(trimmed)) return 'RDF_XML'
  if (/\.(ttl|turtle)$/.test(normalizedName) || /(?:^|\n)\s*(?:@prefix|PREFIX)\s+/i.test(trimmed)) return 'TURTLE'
  if (/\.csv$/.test(normalizedName)) return 'CSV'
  const nonEmptyLines = trimmed.split(/\r?\n/).filter((line) => line.trim())
  if (!/^[{[]/.test(trimmed) && nonEmptyLines.length > 1 && nonEmptyLines[0]?.includes(',')) return 'CSV'
  const document = parseDocument(sourceText)
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
