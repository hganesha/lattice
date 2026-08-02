#!/usr/bin/env node
/**
 * Lattice MCP server.
 *
 * Exposes the governed compile → clarify → verify → execute loop as MCP tools, so any
 * MCP-capable agent runtime can consume Lattice without hand-rolling a client.
 *
 * The server acts as one governed service identity: signed plans are issued to it, its token
 * scopes decide what it may execute, and nothing about identity is accepted through a tool
 * parameter. Configure it with LATTICE_API_URL, LATTICE_API_TOKEN, and optionally
 * LATTICE_ORGANIZATION_ID.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ContextApiClient } from './client.js'
import { configFromEnvironment } from './config.js'
import { registerLatticeTools } from './tools.js'

const MAX_BODY_BYTES = 1_000_000

export function createLatticeMcpServer(client: ContextApiClient): McpServer {
  const server = new McpServer({ name: 'lattice-mcp-server', version: '0.1.0' })
  registerLatticeTools(server, client)
  return server
}

async function runStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stdout carries the protocol; diagnostics must go to stderr.
  process.stderr.write('lattice-mcp-server ready on stdio\n')
}

async function runHttp(server: McpServer): Promise<void> {
  const port = Number(process.env.PORT ?? 8788)
  const allowedOrigins = (process.env.LATTICE_MCP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  const http = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST' || new URL(request.url ?? '/', 'http://localhost').pathname !== '/mcp') {
      response.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'NOT_FOUND' }))
      return
    }

    // DNS rebinding protection: a browser page must not be able to drive a local MCP server.
    const origin = request.headers.origin
    if (origin && !allowedOrigins.includes(origin)) {
      response.writeHead(403, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'ORIGIN_NOT_ALLOWED', message: 'Set LATTICE_MCP_ALLOWED_ORIGINS to permit this origin.' }))
      return
    }

    let body: unknown
    try {
      body = await readJsonBody(request)
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: error instanceof Error ? error.message : 'INVALID_JSON' }))
      return
    }

    // Stateless: omitting sessionIdGenerator disables session tracking, and a transport per
    // request means concurrent clients cannot collide on request ids.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true })
    response.on('close', () => { void transport.close() })
    await server.connect(transport)
    await transport.handleRequest(request, response, body)
  })

  http.listen(port, '127.0.0.1', () => {
    process.stderr.write(`lattice-mcp-server ready on http://127.0.0.1:${port}/mcp\n`)
  })
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('PAYLOAD_TOO_LARGE')
    chunks.push(buffer)
  }
  if (size === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('INVALID_JSON')
  }
}

async function main(): Promise<void> {
  const config = configFromEnvironment()
  const server = createLatticeMcpServer(new ContextApiClient(config))
  if ((process.env.TRANSPORT ?? 'stdio') === 'http') {
    await runHttp(server)
    return
  }
  await runStdio(server)
}

// Only self-start when run as a program, so the server can also be imported by tests.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`lattice-mcp-server failed to start: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
