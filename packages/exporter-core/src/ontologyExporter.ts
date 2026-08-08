import type { EntityTypeDefinition, RelationshipTypeDefinition } from '@lattice/contracts'

export type OntologyExportFormat = 'RDF_XML' | 'TURTLE'

export interface OntologyExportDocument {
  id: string
  name: string
  description: string
  domain: string
  version: string
  entityTypes: EntityTypeDefinition[]
  relationshipTypes: RelationshipTypeDefinition[]
}

export interface OntologyExportArtifact {
  content: string
  filename: string
  mediaType: 'application/rdf+xml' | 'text/turtle'
  format: OntologyExportFormat
  ontologyIri: string
}

export interface OntologyExportOptions {
  baseIri?: string
}

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const OWL = 'http://www.w3.org/2002/07/owl#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const LATTICE = 'https://lattice.dev/vocab#'

export function exportOntology(document: OntologyExportDocument, format: OntologyExportFormat, options: OntologyExportOptions = {}): OntologyExportArtifact {
  const ontologyIri = normalizeBaseIri(options.baseIri ?? `https://lattice.dev/ontologies/${encodeURIComponent(document.id)}/${encodeURIComponent(document.version)}`)
  const content = format === 'RDF_XML' ? serializeRdfXml(document, ontologyIri) : serializeTurtle(document, ontologyIri)
  return {
    content,
    filename: `${safeFilename(document.id)}-${safeFilename(document.version)}.${format === 'RDF_XML' ? 'rdf' : 'ttl'}`,
    mediaType: format === 'RDF_XML' ? 'application/rdf+xml' : 'text/turtle',
    format,
    ontologyIri,
  }
}

function serializeRdfXml(document: OntologyExportDocument, ontologyIri: string): string {
  const namespace = `${ontologyIri}#`
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rdf:RDF xmlns:rdf="${RDF}" xmlns:rdfs="${RDFS}" xmlns:owl="${OWL}" xmlns:xsd="${XSD}" xmlns:lattice="${LATTICE}" xml:base="${escapeXmlAttribute(ontologyIri)}">`,
    `  <owl:Ontology rdf:about="${escapeXmlAttribute(ontologyIri)}">`,
    `    <rdfs:label>${escapeXmlText(document.name)}</rdfs:label>`,
    `    <rdfs:comment>${escapeXmlText(document.description)}</rdfs:comment>`,
    `    <owl:versionInfo>${escapeXmlText(document.version)}</owl:versionInfo>`,
    `    <lattice:domain>${escapeXmlText(document.domain)}</lattice:domain>`,
    '  </owl:Ontology>',
  ]

  for (const entity of sorted(document.entityTypes)) {
    lines.push(
      `  <owl:Class rdf:about="${escapeXmlAttribute(resourceIri(namespace, entity.id))}">`,
      `    <rdfs:label>${escapeXmlText(entity.label)}</rdfs:label>`,
      `    <rdfs:comment>${escapeXmlText(entity.description)}</rdfs:comment>`,
      `    <lattice:group>${escapeXmlText(entity.group)}</lattice:group>`,
      `    <lattice:icon>${escapeXmlText(entity.icon)}</lattice:icon>`,
      `    <lattice:evidenceStatus>${entity.evidenceStatus}</lattice:evidenceStatus>`,
      `    <lattice:approvalStatus>${entity.approvalStatus}</lattice:approvalStatus>`,
      `    <lattice:impact>${entity.impact}</lattice:impact>`,
      '  </owl:Class>',
    )
  }

  for (const entity of sorted(document.entityTypes)) {
    for (const property of sorted(entity.properties)) {
      lines.push(
        `  <owl:DatatypeProperty rdf:about="${escapeXmlAttribute(resourceIri(namespace, property.id))}">`,
        `    <rdfs:label>${escapeXmlText(property.name)}</rdfs:label>`,
        `    <rdfs:comment>${escapeXmlText(property.description)}</rdfs:comment>`,
        `    <rdfs:domain rdf:resource="${escapeXmlAttribute(resourceIri(namespace, entity.id))}" />`,
        `    <rdfs:range rdf:resource="${XSD}${xsdType(property.dataType)}" />`,
        `    <lattice:required>${Boolean(property.required)}</lattice:required>`,
        `    <lattice:identifier>${Boolean(property.identifier)}</lattice:identifier>`,
      )
      for (const value of [...(property.allowedValues ?? [])].sort()) lines.push(`    <lattice:allowedValue>${escapeXmlText(value)}</lattice:allowedValue>`)
      if (property.unit) lines.push(`    <lattice:unit>${escapeXmlText(property.unit)}</lattice:unit>`)
      lines.push('  </owl:DatatypeProperty>')
    }
  }

  for (const relationship of sorted(document.relationshipTypes)) {
    lines.push(
      `  <owl:ObjectProperty rdf:about="${escapeXmlAttribute(resourceIri(namespace, relationship.id))}">`,
      `    <rdfs:label>${escapeXmlText(relationship.label)}</rdfs:label>`,
      `    <rdfs:comment>${escapeXmlText(relationship.description)}</rdfs:comment>`,
      `    <rdfs:domain rdf:resource="${escapeXmlAttribute(resourceIri(namespace, relationship.sourceTypeId))}" />`,
      `    <rdfs:range rdf:resource="${escapeXmlAttribute(resourceIri(namespace, relationship.targetTypeId))}" />`,
      `    <lattice:cardinality>${relationship.cardinality}</lattice:cardinality>`,
      `    <lattice:impact>${relationship.impact}</lattice:impact>`,
      '  </owl:ObjectProperty>',
    )
  }
  lines.push('</rdf:RDF>')
  return `${lines.join('\n')}\n`
}

function serializeTurtle(document: OntologyExportDocument, ontologyIri: string): string {
  const namespace = `${ontologyIri}#`
  const lines = [
    `@prefix rdf: <${RDF}> .`,
    `@prefix rdfs: <${RDFS}> .`,
    `@prefix owl: <${OWL}> .`,
    `@prefix xsd: <${XSD}> .`,
    `@prefix lattice: <${LATTICE}> .`,
    '',
    `<${ontologyIri}> a owl:Ontology ;`,
    `  rdfs:label ${turtleString(document.name)} ;`,
    `  rdfs:comment ${turtleString(document.description)} ;`,
    `  owl:versionInfo ${turtleString(document.version)} ;`,
    `  lattice:domain ${turtleString(document.domain)} .`,
  ]

  for (const entity of sorted(document.entityTypes)) {
    lines.push(
      '',
      `<${resourceIri(namespace, entity.id)}> a owl:Class ;`,
      `  rdfs:label ${turtleString(entity.label)} ;`,
      `  rdfs:comment ${turtleString(entity.description)} ;`,
      `  lattice:group ${turtleString(entity.group)} ;`,
      `  lattice:icon ${turtleString(entity.icon)} ;`,
      `  lattice:evidenceStatus ${turtleString(entity.evidenceStatus)} ;`,
      `  lattice:approvalStatus ${turtleString(entity.approvalStatus)} ;`,
      `  lattice:impact ${turtleString(entity.impact)} .`,
    )
  }

  for (const entity of sorted(document.entityTypes)) {
    for (const property of sorted(entity.properties)) {
      const metadata = [
        `  lattice:required ${turtleString(String(Boolean(property.required)))}`,
        `  lattice:identifier ${turtleString(String(Boolean(property.identifier)))}`,
        ...[...(property.allowedValues ?? [])].sort().map((value) => `  lattice:allowedValue ${turtleString(value)}`),
        ...(property.unit ? [`  lattice:unit ${turtleString(property.unit)}`] : []),
      ]
      lines.push(
        '',
        `<${resourceIri(namespace, property.id)}> a owl:DatatypeProperty ;`,
        `  rdfs:label ${turtleString(property.name)} ;`,
        `  rdfs:comment ${turtleString(property.description)} ;`,
        `  rdfs:domain <${resourceIri(namespace, entity.id)}> ;`,
        `  rdfs:range xsd:${xsdType(property.dataType)} ;`,
        `${metadata.join(' ;\n')} .`,
      )
    }
  }

  for (const relationship of sorted(document.relationshipTypes)) {
    lines.push(
      '',
      `<${resourceIri(namespace, relationship.id)}> a owl:ObjectProperty ;`,
      `  rdfs:label ${turtleString(relationship.label)} ;`,
      `  rdfs:comment ${turtleString(relationship.description)} ;`,
      `  rdfs:domain <${resourceIri(namespace, relationship.sourceTypeId)}> ;`,
      `  rdfs:range <${resourceIri(namespace, relationship.targetTypeId)}> ;`,
      `  lattice:cardinality ${turtleString(relationship.cardinality)} ;`,
      `  lattice:impact ${turtleString(relationship.impact)} .`,
    )
  }
  return `${lines.join('\n')}\n`
}

function xsdType(dataType: EntityTypeDefinition['properties'][number]['dataType']): string {
  if (dataType === 'integer') return 'integer'
  if (dataType === 'decimal') return 'decimal'
  if (dataType === 'boolean') return 'boolean'
  if (dataType === 'date') return 'date'
  if (dataType === 'datetime') return 'dateTime'
  return 'string'
}

function resourceIri(namespace: string, id: string): string {
  return `${namespace}${encodeURIComponent(id)}`
}

function normalizeBaseIri(value: string): string {
  const trimmed = value.trim().replace(/#+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) throw new Error('BASE_IRI_MUST_BE_HTTP_OR_HTTPS')
  return trimmed
}

function safeFilename(value: string): string {
  return value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'ontology'
}

function sorted<T extends { id: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.id.localeCompare(right.id))
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function turtleString(value: string): string {
  return JSON.stringify(value).replace(/\\u2028/g, '\\u2028').replace(/\\u2029/g, '\\u2029')
}
