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
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
