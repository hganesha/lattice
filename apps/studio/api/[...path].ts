import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * The Context API, served from the Studio's own origin.
 *
 * Everything under `/v1`, plus `/health` and `/openapi.json`, is routed here by `vercel.json`, so
 * the browser only ever talks to one host. That is not just tidiness: a Studio calling an API on
 * a different origin needs CORS to be right on both sides, and when it is not, the failure is
 * invisible to the page — every request is rejected by the browser and the Studio reports the
 * runtime offline with nothing in the console to explain it.
 *
 * The handler is the same function the standalone server runs, so the deployed API and a local
 * one cannot drift apart.
 */
export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  // The API module starts listening when it loads, which is right for a standalone process and
  // wrong here: this runtime owns the socket. Set before the import, because module
  // initialisation reads it.
  process.env.LATTICE_DISABLE_LISTEN = 'true'
  const { handleRequest } = await import('@lattice/api/server')
  await handleRequest(withoutFunctionPrefix(request), response)
}

/**
 * Presents the request to the API under the path the caller actually asked for.
 *
 * The rewrites land on `/api/...` because that is where the function lives, but the API's routes
 * are `/health` and `/v1/...` — the paths its OpenAPI document publishes and its clients call.
 * Rewriting the routes to match the deployment would make the API's shape depend on where it
 * happens to be hosted, so the prefix is stripped here instead. The query string is preserved:
 * several routes are filtered by it.
 */
function withoutFunctionPrefix(request: IncomingMessage): IncomingMessage {
  const url = request.url ?? '/'
  if (!url.startsWith('/api/') && url !== '/api') return request
  request.url = url.slice('/api'.length) || '/'
  return request
}
