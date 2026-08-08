import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CollibraClassificationSource,
  PurviewClassificationSource,
  UnityCatalogClassificationSource,
  catalogSourceFromEnvironment,
  normalizeCategories,
  sensitivityFromLabel,
} from './catalogFederation.js'

const column = { qualifiedName: 'risk.governed.counterparty.account_number' }

function stub(body: unknown) {
  const calls: URL[] = []
  const fetchImpl = (async (input: URL | RequestInfo) => {
    calls.push(new URL(String(input)))
    return Response.json(body)
  }) as typeof fetch
  return { calls, fetchImpl }
}

test('an unrecognized label is treated as confidential rather than ordinary', () => {
  // A catalog bothered to label the column at all; assuming it is unremarkable is the wrong
  // way to be wrong.
  assert.equal(sensitivityFromLabel('Acme-Tier-4'), 'CONFIDENTIAL')
  assert.equal(sensitivityFromLabel('Public'), 'PUBLIC')
  assert.equal(sensitivityFromLabel('Internal Use Only'), 'INTERNAL')
  assert.equal(sensitivityFromLabel('Confidential'), 'CONFIDENTIAL')
  assert.equal(sensitivityFromLabel('Highly Confidential'), 'RESTRICTED')
  assert.equal(sensitivityFromLabel('RESTRICTED'), 'RESTRICTED')
})

test('regime names normalize to the same category whichever catalog said them', () => {
  assert.deepEqual(normalizeCategories(['PII', 'personally identifiable information']), ['PII'])
  assert.deepEqual(normalizeCategories(['pci-dss']), ['PCI'])
  assert.deepEqual(normalizeCategories(['HIPAA', 'phi']), ['PHI'])
  assert.deepEqual(normalizeCategories(['CPNI', 'PII']), ['CPNI', 'PII'])
  assert.deepEqual(normalizeCategories(['Trade Secret']), ['TRADE SECRET'])
})

test('Purview maps its label and classification rules onto one assertion', async () => {
  const { calls, fetchImpl } = stub({
    entity: {
      attributes: { sensitivityLabel: 'Highly Confidential' },
      classifications: [{ typeName: 'MICROSOFT.PERSONAL.US_SSN' }],
    },
  })
  const source = new PurviewClassificationSource({ endpoint: new URL('https://acct.purview.azure.com'), accessToken: 't', fetchImpl })

  const assertions = await source.classify([column])
  const assertion = assertions.get(column.qualifiedName)

  assert.equal(assertion?.sensitivity, 'RESTRICTED')
  assert.deepEqual(assertion?.categories, ['PII'])
  assert.equal(assertion?.source, 'CATALOG')
  assert.equal(assertion?.catalog, 'purview')
  assert.equal(calls[0]?.searchParams.get('attr:qualifiedName'), column.qualifiedName)
})

test('Unity Catalog reads sensitivity from a reserved tag and regimes from the rest', async () => {
  const { fetchImpl } = stub({
    tag_assignments: [
      { tag_key: 'sensitivity', tag_value: 'Restricted' },
      { tag_key: 'regime', tag_value: 'CPNI' },
      { tag_key: 'pii', tag_value: 'true' },
    ],
  })
  const source = new UnityCatalogClassificationSource({ endpoint: new URL('https://workspace.cloud.databricks.com'), accessToken: 't', fetchImpl })

  const assertion = (await source.classify([column])).get(column.qualifiedName)

  assert.equal(assertion?.sensitivity, 'RESTRICTED')
  assert.ok(assertion?.categories?.includes('CPNI'))
  assert.equal(assertion?.catalog, 'unity-catalog')
})

test('Collibra reads the classification and regime attributes of the matching asset', async () => {
  const { calls, fetchImpl } = stub({
    results: [{
      id: 'asset-1',
      attributes: [
        { type: { name: 'Data Classification' }, value: 'Confidential' },
        { type: { name: 'Privacy Category' }, value: 'PII' },
      ],
    }],
  })
  const source = new CollibraClassificationSource({ endpoint: new URL('https://acme.collibra.com'), accessToken: 't', fetchImpl })

  const assertion = (await source.classify([column])).get(column.qualifiedName)

  assert.equal(assertion?.sensitivity, 'CONFIDENTIAL')
  assert.deepEqual(assertion?.categories, ['PII'])
  assert.equal(assertion?.locator, 'asset-1')
  assert.equal(calls[0]?.searchParams.get('nameMatchMode'), 'EXACT')
})

test('an unclassified column yields no assertion rather than a permissive one', async () => {
  const purview = new PurviewClassificationSource({ endpoint: new URL('https://acct.purview.azure.com'), accessToken: 't', fetchImpl: stub({ entity: { attributes: {}, classifications: [] } }).fetchImpl })
  assert.equal((await purview.classify([column])).size, 0)

  const unity = new UnityCatalogClassificationSource({ endpoint: new URL('https://w.cloud.databricks.com'), accessToken: 't', fetchImpl: stub({ tag_assignments: [] }).fetchImpl })
  assert.equal((await unity.classify([column])).size, 0)

  const collibra = new CollibraClassificationSource({ endpoint: new URL('https://acme.collibra.com'), accessToken: 't', fetchImpl: stub({ results: [] }).fetchImpl })
  assert.equal((await collibra.classify([column])).size, 0)
})

test('a catalog that cannot be read fails rather than reporting nothing sensitive', async () => {
  const failing = (async () => new Response('nope', { status: 403 })) as typeof fetch
  const source = new PurviewClassificationSource({ endpoint: new URL('https://acct.purview.azure.com'), accessToken: 't', fetchImpl: failing })

  await assert.rejects(() => source.classify([column]), /CATALOG_READ_FAILED:403/)
})

test('the source is built from configuration, and absent configuration means none', () => {
  assert.equal(catalogSourceFromEnvironment({}), undefined)

  for (const [provider, catalog] of [['purview', 'purview'], ['unity-catalog', 'unity-catalog'], ['collibra', 'collibra']] as const) {
    const source = catalogSourceFromEnvironment({
      LATTICE_CATALOG_PROVIDER: provider,
      LATTICE_CATALOG_ENDPOINT: 'https://catalog.example.com',
      LATTICE_CATALOG_TOKEN: 'token',
    })
    assert.equal(source?.catalog, catalog)
  }
})

test('incomplete or insecure catalog configuration fails at startup', () => {
  assert.throws(
    () => catalogSourceFromEnvironment({ LATTICE_CATALOG_PROVIDER: 'purview' }),
    /LATTICE_CATALOG_ENDPOINT and LATTICE_CATALOG_TOKEN/,
  )
  assert.throws(
    () => catalogSourceFromEnvironment({ LATTICE_CATALOG_PROVIDER: 'alation', LATTICE_CATALOG_ENDPOINT: 'https://x.example.com', LATTICE_CATALOG_TOKEN: 't' }),
    /purview, unity-catalog, or collibra/,
  )
  assert.throws(
    () => catalogSourceFromEnvironment({ LATTICE_CATALOG_PROVIDER: 'purview', LATTICE_CATALOG_ENDPOINT: 'http://catalog.example.com', LATTICE_CATALOG_TOKEN: 't' }),
    /must use HTTPS/,
  )
})
