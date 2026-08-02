import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { openApiDocument } from './openapi.js'

/**
 * A hand-maintained API description rots the moment someone adds a route. These tests read the
 * routes back out of the server source and fail if the two disagree in either direction.
 *
 * Paths are compared with parameter names erased, so renaming `{id}` to `{contractId}` is not a
 * failure but adding, removing, or restructuring a route is.
 */

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'server.ts')

function erasePathParameters(path: string): string {
  return path.replace(/\{[^}]+\}/g, '{}')
}

/** `/^\/v1\/contracts\/([^/]+)\/diffs$/` -> `/v1/contracts/{}/diffs` */
function pathFromMatcher(regexSource: string): string {
  return regexSource
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/')
    .replace(/\(\[\^\/\]\+\)/g, '{}')
}

async function routesDeclaredByServer(): Promise<Set<string>> {
  const source = await readFile(sourcePath, 'utf8')
  const routes = new Set<string>()

  for (const match of source.matchAll(/request\.method === '(GET|POST|PUT|DELETE)' && url\.pathname === '([^']+)'/g)) {
    routes.add(`${match[1]!} ${match[2]!}`)
  }

  const matchers = new Map<string, string>()
  for (const match of source.matchAll(/const (\w+Match) = url\.pathname\.match\(\/(.+?)\/\)/g)) {
    matchers.set(match[1]!, pathFromMatcher(match[2]!))
  }
  for (const match of source.matchAll(/request\.method === '(GET|POST|PUT|DELETE)' && (\w+Match)\?\.\[1\]/g)) {
    const path = matchers.get(match[2]!)
    assert.ok(path, `${match[2]!} is used as a route guard but never defined by url.pathname.match`)
    routes.add(`${match[1]!} ${path}`)
  }

  return routes
}

function routesDescribedBySpec(): Set<string> {
  const routes = new Set<string>()
  for (const [path, operations] of Object.entries(openApiDocument.paths)) {
    for (const method of Object.keys(operations)) {
      if (['get', 'post', 'put', 'delete'].includes(method)) {
        routes.add(`${method.toUpperCase()} ${erasePathParameters(path)}`)
      }
    }
  }
  return routes
}

test('the server source yields the routes the extractor expects', async () => {
  const declared = await routesDeclaredByServer()
  // Guards against a silently broken extractor reporting an empty, trivially-matching set.
  assert.ok(declared.size >= 30, `expected the extractor to find the full route surface, found ${declared.size}`)
  assert.ok(declared.has('POST /v1/compile'))
  assert.ok(declared.has('POST /v1/plans/{}/execute'))
  assert.ok(declared.has('GET /v1/contracts/{}'))
})

test('every route the server serves is described in the OpenAPI document', async () => {
  const undocumented = [...await routesDeclaredByServer()].filter((route) => !routesDescribedBySpec().has(route))
  assert.deepEqual(undocumented, [], `add these routes to openapi.ts: ${undocumented.join(', ')}`)
})

test('every route the OpenAPI document describes is served', async () => {
  const declared = await routesDeclaredByServer()
  // The description itself is served outside the matcher table, so it has no source counterpart.
  const selfDescribed = new Set(['GET /openapi.json'])
  const missing = [...routesDescribedBySpec()].filter((route) => !declared.has(route) && !selfDescribed.has(route))
  assert.deepEqual(missing, [], `these routes are documented but not served: ${missing.join(', ')}`)
})

test('the document is a valid OpenAPI 3.1 skeleton', () => {
  assert.match(openApiDocument.openapi, /^3\.1\.\d+$/)
  assert.ok(openApiDocument.info.title)
  assert.ok(openApiDocument.info.version)
  assert.ok(Object.keys(openApiDocument.paths).length > 0)
})

test('every documented operation carries an operationId, a summary, and a tag', () => {
  const declaredTags = new Set(openApiDocument.tags.map((tag) => tag.name))
  const seenOperationIds = new Set<string>()

  for (const [path, operations] of Object.entries(openApiDocument.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      const described = operation as { operationId?: string; summary?: string; tags?: string[]; responses?: Record<string, unknown> }
      const where = `${method.toUpperCase()} ${path}`

      const operationId = described.operationId
      assert.ok(operationId, `${where} needs an operationId so clients can generate a method name`)
      assert.equal(seenOperationIds.has(operationId), false, `${where} reuses operationId ${operationId}`)
      seenOperationIds.add(operationId)

      assert.ok(described.summary, `${where} needs a summary`)
      assert.ok(described.tags?.length, `${where} needs a tag`)
      for (const tag of described.tags ?? []) {
        assert.ok(declaredTags.has(tag), `${where} uses undeclared tag ${tag}`)
      }
      assert.ok(described.responses?.['200'] || described.responses?.['201'], `${where} needs a success response`)
    }
  }
})

test('every internal $ref resolves to a declared component schema', () => {
  const schemas = (openApiDocument.components.schemas ?? {}) as Record<string, unknown>
  const references = [...JSON.stringify(openApiDocument).matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)].map((match) => match[1]!)

  assert.ok(references.length > 0)
  for (const reference of new Set(references)) {
    assert.ok(schemas[reference], `$ref points at #/components/schemas/${reference}, which is not declared`)
  }
})

test('protected routes inherit bearer security and the public ones opt out deliberately', () => {
  const publicRoutes = new Set(['/health', '/openapi.json', '/v1/keys/current'])
  assert.deepEqual(openApiDocument.security, [{ bearerAuth: [] }])

  for (const [path, operations] of Object.entries(openApiDocument.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      const security = (operation as { security?: unknown[] }).security
      if (publicRoutes.has(path)) {
        assert.deepEqual(security, [], `${method.toUpperCase()} ${path} is public and must opt out of bearer security explicitly`)
      } else {
        assert.equal(security, undefined, `${method.toUpperCase()} ${path} must inherit the document-level bearer requirement`)
      }
    }
  }
})
