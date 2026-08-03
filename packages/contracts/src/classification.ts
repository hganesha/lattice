import type {
  BindingFieldMapping,
  ClassificationAssertion,
  ContextContract,
  DataClassification,
  MappedValueRecord,
  ValueDisclosure,
} from './types.js'

/**
 * Data classification, and what a receipt is allowed to keep because of it.
 *
 * Enterprises already decide sensitivity in their catalog. Lattice's job is to honour that
 * decision at the point where governed data would otherwise be copied into an audit artifact,
 * not to invent a second classification scheme.
 *
 * This module stays free of Node built-ins so the Studio can bundle it: hashing is supplied by
 * the caller that owns a crypto implementation.
 */

const order: Record<DataClassification, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
}

/**
 * Unclassified data is treated as INTERNAL, not PUBLIC. An author who forgets to classify a
 * property should get the cautious answer, not the permissive one.
 */
export const DEFAULT_CLASSIFICATION: DataClassification = 'INTERNAL'

export function isAtLeast(value: DataClassification, floor: DataClassification): boolean {
  return order[value] >= order[floor]
}

export function strictestClassification(values: DataClassification[]): DataClassification {
  return values.reduce<DataClassification>(
    (strictest, value) => (order[value] > order[strictest] ? value : strictest),
    'PUBLIC',
  )
}

export interface ResolvedClassification {
  sensitivity: DataClassification
  categories: string[]
  disclosure: ValueDisclosure
}

/**
 * Resolves the sensitivity that governs one mapped value.
 *
 * The source system wins over the ontology: a column the catalog tags RESTRICTED stays
 * restricted even if the property it maps to is modelled as merely confidential. Where both
 * assert something, categories accumulate — a value can be both PII and CPNI.
 */
export function resolveClassification(
  mapping: Pick<BindingFieldMapping, 'targetTypeId' | 'targetPropertyId' | 'classification'>,
  contract: Pick<ContextContract, 'entityTypes'>,
): ResolvedClassification {
  const property = contract.entityTypes
    .find((type) => type.id === mapping.targetTypeId)
    ?.properties.find((candidate) => candidate.id === mapping.targetPropertyId)

  const assertions = [property?.classification, mapping.classification]
    .filter((assertion): assertion is ClassificationAssertion => Boolean(assertion))

  const sensitivity = assertions.length > 0
    ? strictestClassification(assertions.map((assertion) => assertion.sensitivity))
    : DEFAULT_CLASSIFICATION
  const categories = [...new Set(assertions.flatMap((assertion) => assertion.categories ?? []))].sort()

  return { sensitivity, categories, disclosure: disclosureFor(sensitivity) }
}

/**
 * PUBLIC and INTERNAL values are retained so a receipt stays useful for debugging. CONFIDENTIAL
 * values are reduced to a digest, which still proves the same value was read across two runs
 * without storing it. RESTRICTED values are recorded only as having been read.
 */
export function disclosureFor(sensitivity: DataClassification): ValueDisclosure {
  if (isAtLeast(sensitivity, 'RESTRICTED')) return 'WITHHELD'
  if (isAtLeast(sensitivity, 'CONFIDENTIAL')) return 'DIGEST'
  return 'VALUE'
}

/**
 * Salted hash of a value, supplied by the caller that owns a crypto implementation.
 *
 * Required rather than optional: a missing hasher must be impossible, because the only
 * alternatives are silently storing a confidential value or silently dropping audit fidelity.
 * The salt belongs inside the closure — without one, a digest of a low-cardinality field like a
 * postcode or a status flag is trivially reversed by hashing every candidate.
 */
export type ValueDigest = (value: unknown) => string

/** Builds the receipt record for one mapped value, retaining only what its classification allows. */
export function discloseMappedValue(
  mapping: Pick<BindingFieldMapping, 'sourcePath' | 'targetTypeId' | 'targetPropertyId' | 'classification'>,
  value: unknown,
  contract: Pick<ContextContract, 'entityTypes'>,
  digest: ValueDigest,
): MappedValueRecord {
  const resolved = resolveClassification(mapping, contract)
  const base = {
    sourcePath: mapping.sourcePath,
    targetTypeId: mapping.targetTypeId,
    targetPropertyId: mapping.targetPropertyId,
    disclosure: resolved.disclosure,
    classification: resolved.sensitivity,
    ...(resolved.categories.length > 0 ? { categories: resolved.categories } : {}),
  }

  if (resolved.disclosure === 'VALUE') return { ...base, value }
  if (resolved.disclosure === 'DIGEST') return { ...base, valueDigest: digest(value) }
  return base
}
