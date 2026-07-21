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
    content: JSON.stringify(document, null, 2),
    filename: `${document.id}-${document.version}.json`,
  }
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
import { exportOntology, type OntologyExportDocument, type OntologyExportFormat } from '@lattice/exporter-core'
