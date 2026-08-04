import type { IncomingMessage, ServerResponse } from 'node:http'

/** Carries the caller's real path across the rewrite. See `restoreRequestedPath`. */
const PATH_PARAMETER = '__lattice_path'

/**
 * The Context API, served from the Studio's own origin.
 *
 * `vercel.json` rewrites `/health`, `/openapi.json`, and `/v1/*` here, so the browser only ever
 * talks to one host. That is not tidiness: a Studio calling an API on another origin depends on
 * CORS being right at both ends, and when it is not, the failure is invisible to the page — the
 * browser rejects every response and the Studio reports the runtime offline with nothing in the
 * console to explain it.
 *
 * This is a single statically-named function rather than a `[...path]` catch-all. Outside Next.js,
 * Vercel resolved that filename as one dynamic segment: `/api/health` reached the function and
 * `/api/v1/contracts` returned a platform 404, so every route that mattered was unreachable. The
 * path is therefore carried in a query parameter, which routes identically however many segments
 * it contains.
 *
 * The handler is the same function the standalone server runs, so the deployed API and a local one
 * cannot drift apart.
 */
export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  // The API module starts listening when it loads, which is right for a standalone process and
  // wrong here: this runtime owns the socket. Set before the import, because module
  // initialisation reads it.
  process.env.LATTICE_DISABLE_LISTEN = 'true'
  const { handleRequest } = await import('@lattice/api/server')
  await handleRequest(restoreRequestedPath(request), response)
}

/**
 * Rebuilds the URL the caller actually asked for.
 *
 * A rewrite hands the function its own path, not the caller's, so the API would see
 * `/api/lattice` for every request. The rewrite puts the real path in a query parameter and
 * Vercel merges the caller's own query on top of it, so the original is recoverable: take the
 * path back out, drop the marker, and keep everything else. Several routes filter by query, so
 * preserving the rest is not optional.
 *
 * Rewriting the API's routes to match the deployment would have been the alternative, and would
 * have made the paths its OpenAPI document publishes depend on where it happens to be hosted.
 */
function restoreRequestedPath(request: IncomingMessage): IncomingMessage {
  const requested = new URL(request.url ?? '/', 'http://lattice.invalid')
  const path = requested.searchParams.get(PATH_PARAMETER)
  if (!path) return request

  requested.searchParams.delete(PATH_PARAMETER)
  const query = requested.searchParams.toString()
  request.url = query ? `${path}?${query}` : path
  return request
}
