import type { ClassificationAssertion, DataClassification } from '@lattice/contracts'

/**
 * Federates classification from the catalog that already owns it.
 *
 * Every enterprise has already decided which columns are sensitive, in Purview, Unity Catalog,
 * or Collibra. Asking an author to decide again in the Studio produces a second, diverging
 * answer and a governance argument Lattice would lose. So classification is imported and marked
 * with where it came from, and the local judgement is only a fallback.
 *
 * The three vendors model this differently — Purview has sensitivity labels and classification
 * rules, Unity Catalog has tags, Collibra has characteristics on assets — so each adapter maps
 * its own vocabulary onto one assertion, and nothing downstream knows which catalog spoke.
 */

export interface CatalogColumnRef {
  /** Fully-qualified source column, for example `catalog.schema.table.column`. */
  qualifiedName: string
}

export interface CatalogClassificationSource {
  readonly catalog: 'purview' | 'unity-catalog' | 'collibra'
  /** Returns an assertion per column that carries one, keyed by qualified name. */
  classify(columns: CatalogColumnRef[]): Promise<Map<string, ClassificationAssertion>>
}

/**
 * Maps a vendor label onto a sensitivity.
 *
 * Deliberately conservative: an unrecognized label becomes CONFIDENTIAL rather than INTERNAL.
 * A catalog bothered to label a column at all, so treating an unfamiliar label as ordinary would
 * be the wrong way to be wrong.
 */
export function sensitivityFromLabel(label: string): DataClassification {
  const normalized = label.trim().toLocaleLowerCase()
  if (/(^|\b)(public|unrestricted|non[- ]?sensitive)\b/.test(normalized)) return 'PUBLIC'
  if (/(^|\b)(internal|general|company[- ]?confidential|business)\b/.test(normalized)) return 'INTERNAL'
  if (/(^|\b)(restricted|highly[- ]?confidential|secret|top[- ]?secret)\b/.test(normalized)) return 'RESTRICTED'
  if (/(^|\b)(confidential|sensitive|private)\b/.test(normalized)) return 'CONFIDENTIAL'
  return 'CONFIDENTIAL'
}

/** Normalizes regime names so PII, PHI, PCI, and CPNI look the same whichever catalog said them. */
export function normalizeCategories(values: string[]): string[] {
  const categories = new Set<string>()
  for (const value of values) {
    const normalized = value.trim().toLocaleUpperCase().replace(/[\s_-]+/g, '')
    if (!normalized) continue
    if (normalized.includes('CPNI')) categories.add('CPNI')
    else if (normalized.includes('PHI') || normalized.includes('HIPAA')) categories.add('PHI')
    else if (normalized.includes('PCI')) categories.add('PCI')
    else if (normalized.includes('PII') || normalized.includes('PERSONAL')) categories.add('PII')
    else categories.add(value.trim().toLocaleUpperCase())
  }
  return [...categories].sort()
}

interface HttpCatalogConfig {
  endpoint: URL
  accessToken: string
  fetchImpl?: typeof fetch
}

const CATALOG_TIMEOUT_MS = 10_000

async function getJson(url: URL, accessToken: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`CATALOG_READ_FAILED:${response.status}`)
  return response.json()
}

/**
 * Microsoft Purview.
 *
 * Sensitivity comes from the label applied to the column; regime membership comes from the
 * classification rules Purview matched against its contents.
 */
export class PurviewClassificationSource implements CatalogClassificationSource {
  readonly catalog = 'purview' as const

  constructor(private readonly config: HttpCatalogConfig) {}

  async classify(columns: CatalogColumnRef[]): Promise<Map<string, ClassificationAssertion>> {
    const assertions = new Map<string, ClassificationAssertion>()
    const fetchImpl = this.config.fetchImpl ?? fetch

    for (const column of columns) {
      const url = new URL('/datamap/api/atlas/v2/entity/uniqueAttribute/type/column', this.config.endpoint)
      url.searchParams.set('attr:qualifiedName', column.qualifiedName)

      const payload = await getJson(url, this.config.accessToken, fetchImpl) as {
        entity?: { classifications?: Array<{ typeName?: string }>; attributes?: { sensitivityLabel?: string } }
      }
      const label = payload.entity?.attributes?.sensitivityLabel
      const classifications = (payload.entity?.classifications ?? []).map((item) => item.typeName ?? '').filter(Boolean)
      if (!label && classifications.length === 0) continue

      assertions.set(column.qualifiedName, {
        sensitivity: label ? sensitivityFromLabel(label) : 'CONFIDENTIAL',
        ...(classifications.length > 0 ? { categories: normalizeCategories(classifications) } : {}),
        source: 'CATALOG',
        catalog: this.catalog,
        locator: column.qualifiedName,
        assertedAt: new Date().toISOString(),
      })
    }
    return assertions
  }
}

/**
 * Databricks Unity Catalog.
 *
 * Unity Catalog expresses both sensitivity and regime membership as tags, so a reserved tag key
 * names the sensitivity and the rest are treated as regimes.
 */
export class UnityCatalogClassificationSource implements CatalogClassificationSource {
  readonly catalog = 'unity-catalog' as const

  constructor(
    private readonly config: HttpCatalogConfig,
    private readonly sensitivityTagKey = 'sensitivity',
  ) {}

  async classify(columns: CatalogColumnRef[]): Promise<Map<string, ClassificationAssertion>> {
    const assertions = new Map<string, ClassificationAssertion>()
    const fetchImpl = this.config.fetchImpl ?? fetch

    for (const column of columns) {
      const url = new URL('/api/2.1/unity-catalog/column-tags', this.config.endpoint)
      url.searchParams.set('full_name', column.qualifiedName)

      const payload = await getJson(url, this.config.accessToken, fetchImpl) as {
        tag_assignments?: Array<{ tag_key?: string; tag_value?: string }>
      }
      const tags = payload.tag_assignments ?? []
      if (tags.length === 0) continue

      const sensitivityTag = tags.find((tag) => tag.tag_key?.toLocaleLowerCase() === this.sensitivityTagKey)
      const regimes = tags
        .filter((tag) => tag.tag_key?.toLocaleLowerCase() !== this.sensitivityTagKey)
        .map((tag) => tag.tag_value?.trim() || tag.tag_key?.trim() || '')
        .filter(Boolean)

      assertions.set(column.qualifiedName, {
        sensitivity: sensitivityTag?.tag_value ? sensitivityFromLabel(sensitivityTag.tag_value) : 'CONFIDENTIAL',
        ...(regimes.length > 0 ? { categories: normalizeCategories(regimes) } : {}),
        source: 'CATALOG',
        catalog: this.catalog,
        locator: column.qualifiedName,
        assertedAt: new Date().toISOString(),
      })
    }
    return assertions
  }
}

/**
 * Collibra.
 *
 * Collibra models this as attributes on an asset, so the classification and any regime tags are
 * read from the asset matching the column's qualified name.
 */
export class CollibraClassificationSource implements CatalogClassificationSource {
  readonly catalog = 'collibra' as const

  constructor(private readonly config: HttpCatalogConfig) {}

  async classify(columns: CatalogColumnRef[]): Promise<Map<string, ClassificationAssertion>> {
    const assertions = new Map<string, ClassificationAssertion>()
    const fetchImpl = this.config.fetchImpl ?? fetch

    for (const column of columns) {
      const url = new URL('/rest/2.0/assets', this.config.endpoint)
      url.searchParams.set('name', column.qualifiedName)
      url.searchParams.set('nameMatchMode', 'EXACT')

      const payload = await getJson(url, this.config.accessToken, fetchImpl) as {
        results?: Array<{ id?: string; attributes?: Array<{ type?: { name?: string }; value?: string }> }>
      }
      const asset = payload.results?.[0]
      if (!asset) continue

      const attributes = asset.attributes ?? []
      const label = attributes.find((attribute) => /classification|sensitivity/i.test(attribute.type?.name ?? ''))?.value
      const regimes = attributes
        .filter((attribute) => /privacy|regulation|regime|category/i.test(attribute.type?.name ?? ''))
        .map((attribute) => attribute.value?.trim() ?? '')
        .filter(Boolean)
      if (!label && regimes.length === 0) continue

      assertions.set(column.qualifiedName, {
        sensitivity: label ? sensitivityFromLabel(label) : 'CONFIDENTIAL',
        ...(regimes.length > 0 ? { categories: normalizeCategories(regimes) } : {}),
        source: 'CATALOG',
        catalog: this.catalog,
        locator: asset.id ?? column.qualifiedName,
        assertedAt: new Date().toISOString(),
      })
    }
    return assertions
  }
}

export function catalogSourceFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): CatalogClassificationSource | undefined {
  const catalog = environment.LATTICE_CATALOG_PROVIDER?.trim().toLocaleLowerCase()
  if (!catalog) return undefined

  const endpoint = environment.LATTICE_CATALOG_ENDPOINT?.trim()
  const accessToken = environment.LATTICE_CATALOG_TOKEN?.trim()
  if (!endpoint || !accessToken) {
    throw new Error('Catalog federation requires LATTICE_CATALOG_ENDPOINT and LATTICE_CATALOG_TOKEN.')
  }
  const config: HttpCatalogConfig = { endpoint: secureCatalogUrl(endpoint), accessToken, fetchImpl }

  if (catalog === 'purview') return new PurviewClassificationSource(config)
  if (catalog === 'unity-catalog') return new UnityCatalogClassificationSource(config, environment.LATTICE_CATALOG_SENSITIVITY_TAG?.trim() || 'sensitivity')
  if (catalog === 'collibra') return new CollibraClassificationSource(config)
  throw new Error('LATTICE_CATALOG_PROVIDER must be purview, unity-catalog, or collibra.')
}

function secureCatalogUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('LATTICE_CATALOG_ENDPOINT is not a valid URL.')
  }
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname)
  if (url.protocol !== 'https:' && !loopback) throw new Error('LATTICE_CATALOG_ENDPOINT must use HTTPS.')
  if (url.username || url.password) throw new Error('LATTICE_CATALOG_ENDPOINT must not embed credentials.')
  return url
}
