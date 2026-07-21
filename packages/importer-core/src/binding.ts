import { createHash, randomUUID } from 'node:crypto'
import { parse as parseYaml } from 'yaml'
import type { BindingOperationProposal, BindingPreview, BindingSourceField } from '@lattice/contracts'

type JsonObject = Record<string, unknown>
const httpMethods = ['get', 'post', 'put', 'patch', 'delete'] as const

export interface PreviewBindingInput {
  contractId: string
  sourceName: string
  sourceText: string
  format?: 'OPENAPI' | 'TABULAR_SCHEMA'
  operationId?: string
  operationLabel?: string
}

export function previewBindingSource(input: PreviewBindingInput): BindingPreview {
  if (input.format === 'TABULAR_SCHEMA') return previewTabularBindingSource(input)
  const document = parseDocument(input.sourceText)
  if (typeof document.openapi !== 'string' && typeof document.swagger !== 'string') throw new Error('OPENAPI_DOCUMENT_REQUIRED')
  const operations: BindingOperationProposal[] = []

  for (const [path, rawPath] of objectEntries(document.paths)) {
    for (const method of httpMethods) {
      const operation = objectValue(rawPath[method])
      if (!operation) continue
      const responseSchema = selectResponseSchema(operation)
      const resolved = responseSchema ? resolveSchema(responseSchema, document) : undefined
      const fields = resolved ? collectFields(resolved, document) : []
      const operationId = stringValue(operation.operationId) ?? `${method}_${slugify(path)}`
      operations.push({
        id: `${method.toUpperCase()} ${path}`,
        operationId,
        method: method.toUpperCase(),
        path,
        summary: stringValue(operation.summary) ?? humanize(operationId),
        expectedResultSchema: referenceName(responseSchema?.$ref) ?? `${slugify(operationId)}_response`,
        fields,
      })
    }
  }

  if (operations.length === 0) throw new Error('NO_API_OPERATIONS_FOUND')
  return {
    id: `binding_preview_${randomUUID()}`,
    contractId: input.contractId,
    sourceName: input.sourceName,
    sourceChecksum: `sha256:${createHash('sha256').update(input.sourceText).digest('hex')}`,
    createdAt: new Date().toISOString(),
    operations,
    warnings: operations.some((operation) => operation.fields.length === 0) ? ['Some operations do not declare a structured success response.'] : [],
  }
}

function previewTabularBindingSource(input: PreviewBindingInput): BindingPreview {
  const document = parseDocument(input.sourceText)
  const fields = tabularFields(document)
  if (fields.length === 0) throw new Error('NO_SOURCE_FIELDS_FOUND')
  const operationId = input.operationId?.trim() || `query_${slugify(input.sourceName)}`
  return {
    id: `binding_preview_${randomUUID()}`,
    contractId: input.contractId,
    sourceName: input.sourceName,
    sourceChecksum: `sha256:${createHash('sha256').update(input.sourceText).digest('hex')}`,
    createdAt: new Date().toISOString(),
    operations: [{
      id: operationId,
      operationId,
      method: 'QUERY',
      path: input.sourceName,
      summary: input.operationLabel?.trim() || `Query ${humanize(input.sourceName)}`,
      expectedResultSchema: `${slugify(input.sourceName)}_row`,
      fields,
    }],
    warnings: fields.some((field) => field.dataType === 'unknown') ? ['Some source fields use unknown data types and need manual review.'] : [],
  }
}

function tabularFields(document: JsonObject): BindingSourceField[] {
  const declared = Array.isArray(document.fields) ? document.fields : undefined
  if (declared) return declared.flatMap((raw) => {
    const field = objectValue(raw)
    const name = stringValue(field?.name)
    if (!name) return []
    return [{ path: `$.${name}`, label: humanize(name), dataType: normalizeDataType(stringValue(field?.type) ?? stringValue(field?.dataType) ?? 'unknown'), required: field?.required === true || field?.nullable === false }]
  })
  return Object.entries(document).flatMap(([name, raw]) => {
    if (name === 'name' || name === 'description') return []
    if (typeof raw === 'string') return [{ path: `$.${name}`, label: humanize(name), dataType: normalizeDataType(raw), required: false }]
    const field = objectValue(raw)
    if (!field) return []
    return [{ path: `$.${name}`, label: humanize(name), dataType: normalizeDataType(stringValue(field.type) ?? stringValue(field.dataType) ?? 'unknown'), required: field.required === true || field.nullable === false }]
  })
}

function normalizeDataType(value: string): string {
  const normalized = value.toLocaleLowerCase().replace(/\(.+\)/, '').trim()
  if (['varchar', 'char', 'text', 'string', 'uuid'].includes(normalized)) return 'string'
  if (['timestamp', 'timestamp_ntz', 'timestamp_ltz', 'timestamp_tz', 'datetime'].includes(normalized)) return 'date-time'
  if (normalized === 'date') return 'date'
  if (['int', 'integer', 'bigint', 'smallint'].includes(normalized)) return 'integer'
  if (['decimal', 'numeric', 'float', 'double', 'real', 'number'].includes(normalized)) return 'number'
  if (['bool', 'boolean'].includes(normalized)) return 'boolean'
  return normalized || 'unknown'
}

function selectResponseSchema(operation: JsonObject): JsonObject | undefined {
  const responses = objectValue(operation.responses)
  if (!responses) return undefined
  const success = objectValue(responses['200']) ?? objectValue(responses['201']) ?? objectEntries(responses).find(([status]) => status.startsWith('2'))?.[1]
  const content = objectValue(success?.content)
  const media = objectValue(content?.['application/json']) ?? objectEntries(content)[0]?.[1]
  return objectValue(media?.schema)
}

function collectFields(schema: JsonObject, document: JsonObject, prefix = '$', required = false, depth = 0): BindingSourceField[] {
  if (depth > 5) return []
  const resolved = resolveSchema(schema, document)
  const arrayItems = resolved.type === 'array' ? objectValue(resolved.items) : undefined
  if (arrayItems) return collectFields(arrayItems, document, `${prefix}[]`, required, depth + 1)
  const properties = objectEntries(resolved.properties)
  if (properties.length === 0) {
    return prefix === '$' ? [] : [{ path: prefix, label: humanize(prefix.split('.').at(-1)?.replace('[]', '') ?? prefix), dataType: dataType(resolved), required }]
  }
  const requiredNames = new Set(arrayValue(resolved.required).filter((value): value is string => typeof value === 'string'))
  return properties.flatMap(([name, property]) => {
    const path = `${prefix}.${name}`
    const child = resolveSchema(property, document)
    if (objectEntries(child.properties).length > 0 || child.type === 'array') return collectFields(child, document, path, requiredNames.has(name), depth + 1)
    return [{ path, label: humanize(name), dataType: dataType(child), required: requiredNames.has(name) }]
  })
}

function resolveSchema(schema: JsonObject, document: JsonObject): JsonObject {
  const reference = stringValue(schema.$ref)
  if (!reference?.startsWith('#/')) return schema
  let current: unknown = document
  for (const part of reference.slice(2).split('/')) current = objectValue(current)?.[decodeURIComponent(part)]
  return objectValue(current) ?? schema
}

function dataType(schema: JsonObject): string {
  if (typeof schema.format === 'string') return schema.format
  if (Array.isArray(schema.enum)) return 'enum'
  return stringValue(schema.type) ?? 'unknown'
}

function parseDocument(sourceText: string): JsonObject {
  try {
    const json = JSON.parse(sourceText) as unknown
    if (!isObject(json)) throw new Error('ROOT_NOT_OBJECT')
    return json
  } catch (jsonError) {
    try {
      const yaml = parseYaml(sourceText) as unknown
      if (!isObject(yaml)) throw new Error('ROOT_NOT_OBJECT')
      return yaml
    } catch {
      throw new Error(jsonError instanceof SyntaxError ? 'INVALID_JSON_OR_YAML' : 'ROOT_NOT_OBJECT')
    }
  }
}

function referenceName(value: unknown): string | undefined {
  return typeof value === 'string' ? value.split('/').at(-1) : undefined
}

function slugify(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'operation'
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
