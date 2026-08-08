import { exportOntology, type OntologyExportDocument, type OntologyExportFormat } from '@lattice/exporter-core'

export interface JsonExportDocument {
  id: string
  version: string
}

export interface JsonExportArtifact {
  content: string
  filename: string
}

export function buildJsonExport(document: JsonExportDocument): JsonExportArtifact {
  return {
    content: JSON.stringify(sanitizeExportDocument(document), null, 2),
    filename: `${document.id}-${document.version}.json`,
  }
}

export function sanitizeExportDocument<T>(document: T): T {
  return sanitizeValue(document) as T
}

export function downloadJson(document: JsonExportDocument): void {
  const { content, filename } = buildJsonExport(document)
  downloadArtifact(content, filename, 'application/json')
}

export function downloadOntology(document: OntologyExportDocument, format: OntologyExportFormat): void {
  const artifact = exportOntology(document, format)
  downloadArtifact(artifact.content, artifact.filename, artifact.mediaType)
}

export function downloadJsonArtifact(document: unknown, filename: string): void {
  downloadArtifact(JSON.stringify(document, null, 2), filename, 'application/json')
}

function downloadArtifact(content: string, filename: string, mediaType: string): void {
  const blob = new Blob([content], { type: mediaType })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function sanitizeValue(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).flatMap(([entryKey, entryValue]) => {
      if (entryKey === 'samplePayload') return []
      if (entryKey === 'credentialRef') return [[entryKey, safeCredentialReference(entryValue)]]
      if (sensitiveKey(entryKey)) return [[entryKey, '[REDACTED]']]
      return [[entryKey, sanitizeValue(entryValue, entryKey)]]
    }))
  }
  if (typeof value === 'string' && ['endpoint', 'locator', 'source'].includes(key)) return sanitizeUrl(value)
  return value
}

function safeCredentialReference(value: unknown): string {
  if (typeof value !== 'string') return '[REDACTED]'
  const reference = value.trim()
  if (/^env:[A-Z][A-Z0-9_]+$/.test(reference)) return reference
  if (/^(vault|workload-identity|managed-identity):[A-Za-z0-9._/@-]+$/.test(reference)) return reference
  return '[REDACTED]'
}

function sensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return normalized === 'credential'
    || normalized === 'authorization'
    || normalized.endsWith('token')
    || normalized.endsWith('password')
    || normalized.endsWith('apikey')
    || normalized.endsWith('privatekey')
    || normalized.endsWith('connectionstring')
    || normalized.includes('secret')
}

function sanitizeUrl(value: string): string {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value
  let url: URL
  try { url = new URL(value) } catch { return '[REDACTED_INVALID_URL]' }
  url.username = ''
  url.password = ''
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (sensitiveQueryParameter(key)) url.searchParams.set(key, '[REDACTED]')
  }
  return url.toString()
}

function sensitiveQueryParameter(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return ['code', 'key', 'sig'].includes(normalized)
    || normalized.includes('token')
    || normalized.includes('secret')
    || normalized.includes('password')
    || normalized.includes('credential')
    || normalized.includes('signature')
    || normalized.includes('authorization')
    || normalized.includes('apikey')
}
