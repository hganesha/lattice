import type { ContextContract, EvidenceStrength, OperationDefinition, RiskTier } from './types.js'

/**
 * Projects a published contract's governed operations as agent tool definitions.
 *
 * These are descriptors, not a bypass. Selecting one of these tools does not execute the
 * operation — it names the operation the agent believes it wants, which the caller passes to
 * `/v1/compile` as `selectedOperationId`. The compiler still resolves entities, applies the
 * evidence, freshness, and approval gates, and decides between a signed plan, a clarification,
 * an approval requirement, or an abstention.
 *
 * That routing is deliberate: a model choosing a tool is exactly the explicit operation
 * confirmation the compiler already wants before it will accept a planning or operational
 * action that only semantic similarity proposed.
 */
export interface GovernedToolDefinition {
  /** Provider-safe tool name derived from the operation identifier. */
  name: string
  description: string
  inputSchema: GovernedToolInputSchema
  /** Everything a caller needs to compile this operation under the right release and controls. */
  governance: GovernedToolGovernance
}

export interface GovernedToolInputSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required: string[]
  additionalProperties: false
}

export interface JsonSchemaProperty {
  type: 'string' | 'object'
  description: string
  properties?: Record<string, JsonSchemaProperty>
  additionalProperties?: false
}

export interface GovernedToolGovernance {
  contractId: string
  contractVersion: string
  contractDigest: string
  operationId: string
  riskTier: RiskTier
  requiredEntityTypes: string[]
  requiredPermissions: string[]
  expectedResultSchema: string
  /** True when the governing policy escalates this operation to a human before execution. */
  approvalRequired: boolean
  /** Weakest evidence the governing policy will accept for the resolved context. */
  minimumEvidenceStrength?: EvidenceStrength
}

export interface GovernedToolProjectionOptions {
  /** Restrict the projection to operations at or below a risk tier. */
  maximumRiskTier?: RiskTier
}

const riskOrder: Record<RiskTier, number> = {
  INFORMATIONAL: 0,
  ANALYTICAL: 1,
  PLANNING_DECISION: 2,
  OPERATIONAL_ACTION: 3,
}

export function projectGovernedTools(
  contract: ContextContract,
  options: GovernedToolProjectionOptions = {},
): GovernedToolDefinition[] {
  const ceiling = options.maximumRiskTier ? riskOrder[options.maximumRiskTier] : riskOrder.OPERATIONAL_ACTION
  const taken = new Set<string>()
  return contract.operations
    .filter((operation) => riskOrder[operation.riskTier] <= ceiling)
    .map((operation) => {
      const policy = contract.policies.find((candidate) => candidate.riskTier === operation.riskTier)
      return {
        name: uniqueToolName(operation.id, taken),
        description: describeOperation(operation, contract),
        inputSchema: inputSchemaFor(operation, contract),
        governance: {
          contractId: contract.id,
          contractVersion: contract.version,
          contractDigest: contract.digest,
          operationId: operation.id,
          riskTier: operation.riskTier,
          requiredEntityTypes: [...operation.requiredEntityTypes],
          requiredPermissions: [...operation.requiredPermissions],
          expectedResultSchema: operation.expectedResultSchema,
          approvalRequired: policy?.approvalRequired ?? false,
          ...(policy ? { minimumEvidenceStrength: policy.minimumEvidenceStrength } : {}),
        },
      }
    })
}

/** Anthropic Messages API tool shape. */
export function toAnthropicTool(definition: GovernedToolDefinition): {
  name: string
  description: string
  input_schema: GovernedToolInputSchema
} {
  return { name: definition.name, description: definition.description, input_schema: definition.inputSchema }
}

/** OpenAI Chat Completions / Responses function-tool shape. */
export function toOpenAIFunctionTool(definition: GovernedToolDefinition): {
  type: 'function'
  function: { name: string; description: string; parameters: GovernedToolInputSchema }
} {
  return {
    type: 'function',
    function: { name: definition.name, description: definition.description, parameters: definition.inputSchema },
  }
}

function describeOperation(operation: OperationDefinition, contract: ContextContract): string {
  const questions = contract.competencyQuestions
    .filter((question) => question.operationId === operation.id)
    .map((question) => question.question)
  const policy = contract.policies.find((candidate) => candidate.riskTier === operation.riskTier)
  const readableRisk = operation.riskTier.replaceAll('_', ' ').toLocaleLowerCase()

  return [
    operation.description,
    '',
    `Governed by ${contract.name} (${contract.versions.contract}) at ${readableRisk} risk.`,
    ...(questions.length > 0 ? [`Answers questions such as: ${questions.join(' | ')}`] : []),
    `Returns: ${operation.expectedResultSchema}`,
    ...(operation.requiredEntityTypes.length > 0
      ? [`Needs governed context for: ${operation.requiredEntityTypes.join(', ')}. Name them in the question, or pass entity identifiers in "selections".`]
      : []),
    ...(policy?.approvalRequired
      ? ['Selecting this tool cannot execute it: the governing policy requires a human approval first.']
      : ['Selecting this tool compiles a governed plan; it does not execute the operation.']),
    'The compiler may still answer with a clarification request or an evidence-backed abstention.',
  ].join('\n')
}

function inputSchemaFor(operation: OperationDefinition, contract: ContextContract): GovernedToolInputSchema {
  const selections: Record<string, JsonSchemaProperty> = {}
  for (const typeId of operation.requiredEntityTypes) {
    const entityType = contract.entityTypes.find((candidate) => candidate.id === typeId)
    selections[typeId] = {
      type: 'string',
      description: `Identifier of the governed ${entityType?.label ?? typeId.replaceAll('_', ' ')} to use. Omit to let the compiler resolve it from the question.`,
    }
  }

  return {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The natural-language question to compile against this contract, in the user\'s own words.',
      },
      purpose: {
        type: 'string',
        description: 'Why the answer is needed. Recorded with the decision for audit.',
      },
      ...(operation.requiredEntityTypes.length > 0
        ? {
            selections: {
              type: 'object' as const,
              description: 'Optional governed entity identifiers, keyed by entity type, to skip disambiguation.',
              properties: selections,
              additionalProperties: false as const,
            },
          }
        : {}),
    },
    required: ['question'],
    additionalProperties: false,
  }
}

/**
 * Operation identifiers are dotted and unconstrained; tool names must match
 * `^[a-zA-Z0-9_-]{1,64}$` for the major providers. Collisions after sanitizing are suffixed
 * so a projection never emits two tools the model cannot tell apart.
 */
function uniqueToolName(operationId: string, taken: Set<string>): string {
  const base = operationId.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'operation'
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base.slice(0, 64 - String(suffix).length - 1)}_${suffix}`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
  }
}
