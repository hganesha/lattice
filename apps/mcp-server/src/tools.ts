import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { projectGovernedTools, type CompileResponse, type ContextContract, type ContractSummary, type ExecutionReceipt, type SignedExecutionPlan } from '@lattice/contracts'
import { z } from 'zod'
import { ContextApiUnreachableError, explainFailure, type ContextApiClient, type ContextApiResult } from './client.js'
import { CHARACTER_LIMIT, formatCompileResponse, formatContracts, formatPlan, formatReceipt, truncate, RESPONSE_FORMATS } from './format.js'

const responseFormat = z.enum(RESPONSE_FORMATS).default('markdown')
  .describe("Output format: 'markdown' for a readable summary, 'json' for the raw Context API payload.")

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
  // The SDK's CallToolResult carries an open index signature for protocol extensions.
  [key: string]: unknown
}

function ok(text: string, structured?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: truncate(text, 'Request json format or narrow the query for the remainder.') }],
    ...(structured ? { structuredContent: structured } : {}),
  }
}

function failed(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true }
}

/** Every tool funnels transport failures through the same actionable message. */
async function guarded(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ContextApiUnreachableError) return failed(error.message)
    return failed(`Unexpected error talking to the Context API: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function render(format: 'markdown' | 'json', markdown: string, payload: unknown): string {
  return format === 'json' ? JSON.stringify(payload, null, 2) : markdown
}

export function registerLatticeTools(server: McpServer, client: ContextApiClient): void {
  server.registerTool(
    'lattice_list_contracts',
    {
      title: 'List governed contracts',
      description: `List the Context Contracts this identity can compile questions against.

Start here when you do not already know which contractId to use. Only contracts whose runtime status is ACTIVE can be compiled; suspended and unreleased ones are excluded unless include_inactive is set.

Args:
  - include_inactive (boolean): also list suspended and unreleased contracts (default: false)
  - limit (number): maximum contracts to return, 1-100 (default: 25)
  - offset (number): number of contracts to skip, for pagination (default: 0)
  - response_format ('markdown' | 'json'): output format (default: 'markdown')

Returns: contract identifiers, decision workflow, domain, runtime status, and the active release version and digest.

Use when: "what can you answer questions about?" or before compiling a question with an unknown contract.
Don't use when: you already have a contractId — go straight to lattice_compile_question.`,
      inputSchema: {
        include_inactive: z.boolean().default(false).describe('Include contracts that cannot currently be compiled.'),
        limit: z.number().int().min(1).max(100).default(25).describe('Maximum contracts to return.'),
        offset: z.number().int().min(0).default(0).describe('Number of contracts to skip.'),
        response_format: responseFormat,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ include_inactive, limit, offset, response_format }): Promise<ToolResult> => guarded(async () => {
      const result = await client.get<ContractSummary[] | { error?: string }>('/v1/contracts')
      if (!result.ok) return failed(explainFailure(result as ContextApiResult<{ error?: string }>))

      const all = (result.body as ContractSummary[]).filter((contract) => include_inactive || contract.runtimeStatus === 'ACTIVE')
      const page = all.slice(offset, offset + limit)
      const structured = { total: all.length, count: page.length, offset, contracts: page, has_more: offset + page.length < all.length }

      return ok(render(response_format, formatContracts(page, all.length, offset), structured), structured)
    }),
  )

  server.registerTool(
    'lattice_describe_operations',
    {
      title: 'Describe a contract\'s governed operations',
      description: `Project a published contract's operations as agent tool definitions, so you can see exactly what it can decide and what governed context each decision needs.

These definitions are descriptors, not callable endpoints. To act on one, pass its operationId to lattice_compile_question as confirm_operation_id — the compiler still applies every evidence, freshness, and approval gate.

Args:
  - contract_id (string): contract to describe
  - maximum_risk_tier ('INFORMATIONAL' | 'ANALYTICAL' | 'PLANNING_DECISION' | 'OPERATIONAL_ACTION'): withhold operations above this risk (optional)
  - response_format ('markdown' | 'json'): output format (default: 'markdown')

Returns: per operation, the tool name, description, JSON Schema input, risk tier, required permissions, required governed entity types, whether a human approval is required, and the minimum evidence strength the policy accepts.

Use when: planning which operation fits a task, or exposing a contract's capabilities to another planner.`,
      inputSchema: {
        contract_id: z.string().min(1).describe('Contract identifier, as returned by lattice_list_contracts.'),
        maximum_risk_tier: z.enum(['INFORMATIONAL', 'ANALYTICAL', 'PLANNING_DECISION', 'OPERATIONAL_ACTION']).optional()
          .describe('Withhold operations above this risk tier.'),
        response_format: responseFormat,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ contract_id, maximum_risk_tier, response_format }): Promise<ToolResult> => guarded(async () => {
      const result = await client.get<ContextContract | { error?: string }>('/v1/contracts/active', { contractId: contract_id })
      if (!result.ok) return failed(explainFailure(result as ContextApiResult<{ error?: string }>))

      const contract = result.body as ContextContract
      const tools = projectGovernedTools(contract, maximum_risk_tier ? { maximumRiskTier: maximum_risk_tier } : {})
      if (tools.length === 0) {
        return ok(`${contract.name} publishes no operations at or below ${maximum_risk_tier ?? 'any'} risk.`)
      }

      const markdown = [`# ${contract.name} — governed operations`, '', `Contract \`${contract.id}\` v${contract.version}, digest \`${contract.digest}\`.`, ''].concat(
        tools.flatMap((tool) => [
          `## ${tool.name}`,
          `- **operationId**: \`${tool.governance.operationId}\``,
          `- **Risk tier**: ${tool.governance.riskTier.replaceAll('_', ' ').toLocaleLowerCase()}`,
          `- **Human approval required**: ${tool.governance.approvalRequired ? 'yes' : 'no'}`,
          `- **Minimum evidence**: ${tool.governance.minimumEvidenceStrength ?? 'not set'}`,
          `- **Required permissions**: ${tool.governance.requiredPermissions.join(', ') || 'none'}`,
          `- **Needs governed context for**: ${tool.governance.requiredEntityTypes.join(', ') || 'none'}`,
          '',
          tool.description,
          '',
        ]),
      ).join('\n')

      const structured = { contractId: contract.id, contractVersion: contract.version, contractDigest: contract.digest, tools }
      return ok(render(response_format, markdown, structured), structured)
    }),
  )

  server.registerTool(
    'lattice_compile_question',
    {
      title: 'Compile a question into a governed decision',
      description: `Compile a natural-language question against a published Context Contract. This is the main entry point.

It never returns a free-text answer. It returns exactly one of four governed outcomes:
  - RESOLVED — a short-lived signed execution plan you can pass to lattice_execute_plan
  - CLARIFICATION_REQUIRED — an ambiguous entity or operation; continue with lattice_resolve_clarification
  - APPROVAL_REQUIRED — a person must approve before the plan is issued
  - INSUFFICIENT_EVIDENCE / STALE_CONTEXT / UNSUPPORTED / DENIED — a reasoned refusal

Args:
  - question (string): the question, in the user's own words
  - contract_id (string): contract to compile against (optional; defaults to the reference contract)
  - purpose (string): why the answer is needed, recorded with the decision (optional)
  - confirm_operation_id (string): confirm a specific governed operation, as returned by lattice_describe_operations (optional)
  - selections (object): governed entity identifiers keyed by entity type, to skip disambiguation (optional)
  - response_format ('markdown' | 'json'): output format (default: 'markdown')

Returns: the decision, its reason codes, a plain-language explanation, whether the context was LIVE or SIMULATED, and whichever of plan, clarification, or approval applies.

Use when: answering any question that must be grounded in governed enterprise data.
Don't use when: you already hold an unexpired planId — call lattice_execute_plan instead.

A SIMULATED grounding means the answer came from documented sample payloads. Never present that as a live answer.`,
      inputSchema: {
        question: z.string().min(1).max(4_000).describe("The question to compile, in the user's own words."),
        contract_id: z.string().optional().describe('Contract to compile against.'),
        purpose: z.string().max(1_000).optional().describe('Why the answer is needed. Recorded with the decision.'),
        confirm_operation_id: z.string().optional().describe('Explicitly confirm a governed operation instead of letting the resolver choose.'),
        selections: z.record(z.string()).optional().describe('Governed entity identifiers keyed by entity type.'),
        response_format: responseFormat,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ question, contract_id, purpose, confirm_operation_id, selections, response_format }): Promise<ToolResult> => guarded(async () => {
      const result = await client.post<CompileResponse & { error?: string }>('/v1/compile', {
        question,
        ...(contract_id ? { contractId: contract_id } : {}),
        ...(purpose ? { purpose } : {}),
        ...(selections ? { selections } : {}),
      })

      // A governed refusal is a successful outcome, not a tool error. Only a malformed or
      // unauthorized request is.
      if (!result.ok && !result.body?.decision) {
        return failed(explainFailure(result as ContextApiResult<{ error?: string }>))
      }

      let response = result.body as CompileResponse
      if (confirm_operation_id && response.clarification?.kind === 'OPERATION') {
        const continued = await client.post<CompileResponse & { error?: string }>(`/v1/clarifications/${encodeURIComponent(response.clarification.id)}`, {
          operationId: confirm_operation_id,
        })
        if (!continued.ok && !continued.body?.decision) return failed(explainFailure(continued as ContextApiResult<{ error?: string }>))
        response = continued.body as CompileResponse
      }

      return ok(render(response_format, formatCompileResponse(response), response), response as unknown as Record<string, unknown>)
    }),
  )

  server.registerTool(
    'lattice_resolve_clarification',
    {
      title: 'Resolve a clarification',
      description: `Continue a paused resolution by choosing one of the governed candidates it offered.

Args:
  - clarification_id (string): the clarification identifier from a CLARIFICATION_REQUIRED response
  - entity_id (string): the chosen entity, for an ENTITY clarification (optional)
  - operation_id (string): the chosen operation, for an OPERATION clarification (optional)
  - response_format ('markdown' | 'json'): output format (default: 'markdown')

Exactly one of entity_id or operation_id is required, matching the clarification kind.

Returns: the same four governed outcomes as lattice_compile_question. Resolving one clarification can raise another — an operation choice often reveals an entity ambiguity.

Use when: a compile returned CLARIFICATION_REQUIRED and the user has chosen, or the choice is unambiguous from context.
Don't use when: you are guessing. Ask the user which candidate they meant.`,
      inputSchema: {
        clarification_id: z.string().min(1).describe('Clarification identifier from a CLARIFICATION_REQUIRED response.'),
        entity_id: z.string().optional().describe('Chosen entity, for an ENTITY clarification.'),
        operation_id: z.string().optional().describe('Chosen operation, for an OPERATION clarification.'),
        response_format: responseFormat,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ clarification_id, entity_id, operation_id, response_format }): Promise<ToolResult> => guarded(async () => {
      if (!entity_id && !operation_id) {
        return failed('Provide entity_id for an ENTITY clarification, or operation_id for an OPERATION clarification.')
      }
      const result = await client.post<CompileResponse & { error?: string }>(`/v1/clarifications/${encodeURIComponent(clarification_id)}`, {
        ...(entity_id ? { entityId: entity_id } : {}),
        ...(operation_id ? { operationId: operation_id } : {}),
      })
      if (!result.ok && !result.body?.decision) return failed(explainFailure(result as ContextApiResult<{ error?: string }>))

      const response = result.body as CompileResponse
      return ok(render(response_format, formatCompileResponse(response), response), response as unknown as Record<string, unknown>)
    }),
  )

  server.registerTool(
    'lattice_verify_plan',
    {
      title: 'Verify a signed plan',
      description: `Check a plan's signature, expiry, signing key, and contract digest before acting on it.

Args:
  - plan_id (string): the plan identifier
  - response_format ('markdown' | 'json'): output format (default: 'markdown')

Returns: whether the plan is valid, whether the signature verified, whether it expired, the signing key id, and the contract digest it is pinned to.

Use when: a plan was obtained indirectly, or time has passed since it was issued.
Don't use when: you just compiled it and are executing immediately — lattice_execute_plan re-verifies anyway.

A plan issued to a different principal is reported as not found rather than forbidden, so this cannot be used to probe for plans belonging to others.`,
      inputSchema: {
        plan_id: z.string().min(1).describe('Plan identifier.'),
        response_format: responseFormat,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ plan_id, response_format }): Promise<ToolResult> => guarded(async () => {
      const result = await client.post<{ planId: string; valid: boolean; signatureValid: boolean; expired: boolean; keyId?: string; contractDigest?: string; error?: string }>(
        `/v1/plans/${encodeURIComponent(plan_id)}/verify`,
        {},
      )
      if (result.status === 404 || result.body?.valid === undefined) {
        return failed(explainFailure(result as ContextApiResult<{ error?: string }>))
      }

      const verification = result.body
      const markdown = [
        `# Plan ${verification.valid ? 'valid' : 'not valid'}`,
        '',
        `- **planId**: \`${verification.planId}\``,
        `- **Signature verified**: ${verification.signatureValid}`,
        `- **Expired**: ${verification.expired}`,
        `- **Signing key**: ${verification.keyId ?? 'unknown'}`,
        `- **Contract digest**: \`${verification.contractDigest ?? 'unknown'}\``,
      ].join('\n')

      return ok(render(response_format, markdown, verification), verification as unknown as Record<string, unknown>)
    }),
  )

  server.registerTool(
    'lattice_execute_plan',
    {
      title: 'Execute a signed plan',
      description: `Execute a signed plan against its governed source bindings and return a digest-backed receipt.

Takes no authorization input. The permissions available come from this server's own service identity, and a plan can only be executed by the principal it was issued to.

Args:
  - plan_id (string): the plan identifier from a RESOLVED compile
  - response_format ('markdown' | 'json'): output format (default: 'markdown')

Returns: the execution receipt — status, per-binding results with the governed values read, whether each binding read a live source or a documented sample, and the artifact digest.

Use when: a compile returned RESOLVED and you intend to act on the answer.
Don't use when: the compile returned APPROVAL_REQUIRED. A person must approve first; this server cannot approve on your behalf.

This is irreversible in one respect: a plan identifier is single-use. A successful or failed execution spends it and the question must be compiled again. A rejected attempt does not spend it.`,
      inputSchema: {
        plan_id: z.string().min(1).describe('Plan identifier from a RESOLVED compile.'),
        response_format: responseFormat,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ plan_id, response_format }): Promise<ToolResult> => guarded(async () => {
      const result = await client.post<ExecutionReceipt & { error?: string; receipt?: ExecutionReceipt; missingPermissions?: string[] }>(
        `/v1/plans/${encodeURIComponent(plan_id)}/execute`,
        {},
      )

      if (result.status === 403 && result.body?.missingPermissions) {
        return failed(`${explainFailure(result as ContextApiResult<{ error?: string }>)}\nMissing: ${result.body.missingPermissions.join(', ')}`)
      }
      if (!result.body?.bindingResults) {
        return failed(explainFailure(result as ContextApiResult<{ error?: string }>))
      }

      const receipt = result.body as ExecutionReceipt
      return ok(render(response_format, formatReceipt(receipt), receipt), receipt as unknown as Record<string, unknown>)
    }),
  )
}

export { CHARACTER_LIMIT, formatPlan, type SignedExecutionPlan }
