import { createHash } from 'node:crypto'
import { compareContracts, suggestReleaseBump, type ContractRelease, type ReleaseDiffArtifact } from '@lattice/contracts'

export function buildReleaseDiffArtifact(contractId: string, from: ContractRelease, to: ContractRelease): ReleaseDiffArtifact {
  const changes = compareContracts(from.contract, to.contract)
  const unsigned = {
    contractId,
    fromRelease: { version: from.version, digest: from.digest },
    toRelease: { version: to.version, digest: to.digest },
    changes,
    suggestedBump: suggestReleaseBump(changes),
    generatedAt: to.publishedAt,
  }
  const artifactDigest = `sha256:${createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')}`
  return { id: `release_diff_${artifactDigest.slice(7, 23)}`, ...unsigned, artifactDigest }
}
