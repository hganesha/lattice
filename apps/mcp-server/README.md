# Lattice MCP server

Exposes the governed compile → clarify → verify → execute loop as MCP tools, so any MCP-capable
agent runtime — Claude Desktop, Bedrock AgentCore, Azure AI Foundry, Vertex Agent Builder,
LangGraph — can consume Lattice without hand-rolling a client.

## What it is for

An agent asks a question in the user's words. It never gets a free-text answer back. It gets one
of four governed outcomes, each of which it can act on:

| Outcome | What the agent does next |
|---|---|
| `RESOLVED` | Execute the short-lived signed plan with `lattice_execute_plan`. |
| `CLARIFICATION_REQUIRED` | Ask the user to choose, then call `lattice_resolve_clarification`. |
| `APPROVAL_REQUIRED` | Tell the user a person must approve. The agent cannot self-approve. |
| `INSUFFICIENT_EVIDENCE` / `STALE_CONTEXT` / `UNSUPPORTED` / `DENIED` | Report the reasoned refusal. Do not guess. |

## Identity

The server acts as **one governed service identity**, configured from the environment:

```bash
export LATTICE_API_URL=https://lattice.internal.example.com   # HTTPS, or HTTP on loopback for local dev
export LATTICE_API_TOKEN=<access token for the agent's service principal>
export LATTICE_ORGANIZATION_ID=<organization uuid>            # when membership resolves through Supabase
```

No tool accepts a token, and none ever will: a credential that can be passed in through model
context is a credential the model can leak. Consequences worth understanding before you deploy:

- Signed plans are issued **to this identity**. No other principal can verify or execute them.
- What the agent may execute is decided by **this token's scopes**, not by anything it asks for.
- Every decision and execution is attributed to this principal in the audit trail. Give each agent
  its own service principal if you want to tell them apart.

## Running it

```bash
pnpm --filter @lattice/mcp-server build
```

**stdio** (default — local integrations, desktop clients, subprocess launch):

```bash
node apps/mcp-server/dist/index.js
```

**Streamable HTTP** (remote, multi-client):

```bash
TRANSPORT=http PORT=8788 LATTICE_MCP_ALLOWED_ORIGINS=https://agents.example.com \
  node apps/mcp-server/dist/index.js
```

The HTTP transport binds to `127.0.0.1` and rejects any request carrying an `Origin` header not
in `LATTICE_MCP_ALLOWED_ORIGINS`, so a browser page cannot drive it. Put a reverse proxy in front
of it for anything beyond the local host.

Registering it with a client that launches MCP servers as subprocesses:

```json
{
  "mcpServers": {
    "lattice": {
      "command": "node",
      "args": ["/srv/lattice/apps/mcp-server/dist/index.js"],
      "env": {
        "LATTICE_API_URL": "https://lattice.internal.example.com",
        "LATTICE_API_TOKEN": "..."
      }
    }
  }
}
```

## Tools

| Tool | Read-only | What it does |
|---|---|---|
| `lattice_list_contracts` | yes | Lists contracts this identity can compile against. Start here. |
| `lattice_describe_operations` | yes | Projects a contract's operations as tool definitions, with risk tier, permissions, and approval requirements. |
| `lattice_compile_question` | no | Compiles a question into one of the four governed outcomes. The main entry point. |
| `lattice_resolve_clarification` | no | Continues a paused resolution with a chosen entity or operation. |
| `lattice_verify_plan` | yes | Checks a plan's signature, expiry, key, and contract digest. |
| `lattice_execute_plan` | no | Executes a signed plan and returns a digest-backed receipt. Single-use. |

Every tool takes `response_format` (`markdown` for a readable summary, `json` for the raw Context
API payload) and returns `structuredContent` alongside the text.

### Two behaviours worth knowing

**Sample data is labelled.** Reference contracts resolve their context from documented sample
payloads rather than live source reads. Those responses carry `grounding: SIMULATED` and a
prominent warning. An agent must never present a simulated resolution as a live answer.

**A plan is single-use, but only a real attempt spends it.** A successful or failed execution
consumes the plan and the question must be compiled again. An attempt rejected for missing
permissions does not consume it.

## Development

```bash
pnpm --filter @lattice/mcp-server test        # unit tests, including tool calls over an in-memory transport
npx @modelcontextprotocol/inspector node apps/mcp-server/dist/index.js
```

## Known limits

- **Plans cannot be verified offline.** The Context API's signing key is currently ephemeral and
  per-process, so `lattice_verify_plan` only verifies against the instance that issued the plan.
  A standalone verification library lands with managed KMS signing.
- **One service identity per server process.** There is no per-user delegation, so the data
  platform sees the service principal rather than the asking user. See the identity propagation
  item in `enterprise-gaps.md`.
