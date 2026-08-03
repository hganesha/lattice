import type { CompileResponse, ContractSummary, ExecutionReceipt, MappedValueRecord, SignedExecutionPlan } from '@lattice/contracts'

/** Keeps a single tool result from crowding out the rest of an agent's context. */
export const CHARACTER_LIMIT = 25_000

export const RESPONSE_FORMATS = ['markdown', 'json'] as const
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number]

export function truncate(text: string, hint: string): string {
  if (text.length <= CHARACTER_LIMIT) return text
  return `${text.slice(0, CHARACTER_LIMIT)}\n\n[Truncated at ${CHARACTER_LIMIT} characters. ${hint}]`
}

export function formatContracts(contracts: ContractSummary[], total: number, offset: number): string {
  if (contracts.length === 0) return 'No contracts matched. Nothing is published and active in this organization yet.'

  const lines = [`# Governed contracts`, '', `Showing ${contracts.length} of ${total}.`, '']
  for (const contract of contracts) {
    lines.push(`## ${contract.name}`)
    lines.push(`- **contractId**: \`${contract.contractId}\``)
    lines.push(`- **Decision workflow**: ${contract.workflow.replaceAll('_', ' ')} (${contract.domain})`)
    lines.push(`- **Runtime status**: ${contract.runtimeStatus}`)
    if (contract.latestRelease) {
      lines.push(`- **Active release**: v${contract.latestRelease.version} · \`${contract.latestRelease.digest}\``)
    }
    lines.push('')
  }
  if (offset + contracts.length < total) {
    lines.push(`More available. Call again with offset=${offset + contracts.length}.`)
  }
  return lines.join('\n')
}

export function formatCompileResponse(result: CompileResponse): string {
  const lines = [`# ${result.decision.replaceAll('_', ' ')}`, '']
  if (result.reasonCodes.length > 0) lines.push(`Reason codes: ${result.reasonCodes.map((code) => `\`${code}\``).join(', ')}`, '')
  for (const sentence of result.explanation) lines.push(sentence)
  lines.push('')

  if (result.grounding === 'SIMULATED') {
    lines.push('> **Sample data.** This resolution came from documented sample payloads, not live source reads. Do not present it as a live answer.', '')
  }

  if (result.clarification?.kind === 'ENTITY') {
    lines.push(`## Choose a ${result.clarification.entityTypeId.replaceAll('_', ' ')}`, '')
    lines.push(`Call \`lattice_resolve_clarification\` with clarificationId \`${result.clarification.id}\` and one of:`, '')
    for (const candidate of result.clarification.candidates) {
      lines.push(`- \`${candidate.entityId}\` — ${candidate.label} (${candidate.evidenceStrength} evidence). ${candidate.rationale}`)
    }
    lines.push('')
  }

  if (result.clarification?.kind === 'OPERATION') {
    lines.push('## Choose a governed operation', '')
    lines.push(`Call \`lattice_resolve_clarification\` with clarificationId \`${result.clarification.id}\` and one of:`, '')
    for (const candidate of result.clarification.candidates) {
      lines.push(`- \`${candidate.operationId}\` — ${candidate.label} (${candidate.riskTier.replaceAll('_', ' ').toLocaleLowerCase()} risk, score ${candidate.score.toFixed(3)}). Returns ${candidate.expectedAnswerShape}.`)
    }
    lines.push('')
  }

  if (result.approval) {
    lines.push('## Human approval required', '')
    lines.push(`Approval \`${result.approval.id}\` is pending for ${result.approval.operationId} at ${result.approval.riskTier.replaceAll('_', ' ').toLocaleLowerCase()} risk.`)
    lines.push('A person must decide it in the Studio; this server cannot approve on your behalf, and the approver cannot be the requester.')
    lines.push('')
  }

  const plan = result.plan
  if (plan && 'signature' in plan) {
    lines.push('## Signed plan', '')
    lines.push(formatPlan(plan))
  }

  return lines.join('\n')
}

export function formatPlan(plan: SignedExecutionPlan): string {
  return [
    `- **planId**: \`${plan.planId}\``,
    `- **Operation**: ${plan.operation} (${plan.riskTier.replaceAll('_', ' ').toLocaleLowerCase()} risk)`,
    `- **Grounding**: ${plan.grounding}`,
    `- **Issued to**: ${plan.principalId}${plan.tenantId ? ` in ${plan.tenantId}` : ''}`,
    `- **Expires**: ${plan.expiresAt}`,
    `- **Requires permissions**: ${plan.requiredPermissions.join(', ') || 'none'}`,
    `- **Evidence**: ${plan.evidenceRefs.length} record(s)`,
    '',
    'Execute it with `lattice_execute_plan` before it expires. The plan is single-use.',
  ].join('\n')
}

export function formatReceipt(receipt: ExecutionReceipt): string {
  const lines = [`# Execution ${receipt.status}`, '']
  lines.push(`- **receiptId**: \`${receipt.id}\``)
  lines.push(`- **Operation**: ${receipt.operationId}`)
  lines.push(`- **Contract**: ${receipt.contractId} v${receipt.contractVersion}`)
  lines.push(`- **Duration**: ${receipt.startedAt} → ${receipt.completedAt}`)
  lines.push('')

  const simulated = receipt.bindingResults.filter((binding) => binding.mode === 'SIMULATED')
  if (simulated.length > 0) {
    lines.push(`> **Sample data.** ${simulated.length} of ${receipt.bindingResults.length} bindings read a documented sample rather than a live source.`, '')
  }

  for (const binding of receipt.bindingResults) {
    lines.push(`## ${binding.sourceSystem} — ${binding.status} (${binding.mode})`)
    if (binding.error) lines.push(`- **Error**: ${binding.error}`)
    for (const mapping of binding.mappedValues) {
      lines.push(`- **${mapping.targetPropertyId}**: ${describeMappedValue(mapping)}`)
    }
    lines.push('')
  }

  const protectedValues = receipt.bindingResults.flatMap((binding) => binding.mappedValues).filter((mapping) => mapping.disclosure !== 'VALUE')
  if (protectedValues.length > 0) {
    lines.push(`> ${protectedValues.length} value(s) were classified above internal, so the receipt records that they were read without retaining them. Ask the source system if you need the value itself.`, '')
  }
  return lines.join('\n')
}

/**
 * A classified value must not be reconstructed for the model just because the receipt proves it
 * was read. Withheld stays withheld, and a digest is shown as a digest.
 */
function describeMappedValue(mapping: MappedValueRecord): string {
  const labels = mapping.categories?.length ? ` [${mapping.categories.join(', ')}]` : ''
  if (mapping.disclosure === 'WITHHELD') return `withheld — ${mapping.classification}${labels}`
  if (mapping.disclosure === 'DIGEST') return `${mapping.valueDigest} (digest — ${mapping.classification}${labels})`
  return JSON.stringify(mapping.value)
}
