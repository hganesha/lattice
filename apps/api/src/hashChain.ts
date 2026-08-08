import { createHash } from 'node:crypto'
import type { ArtifactChainLink } from '@lattice/contracts'

/**
 * Hash chaining for append-only governance artifacts.
 *
 * A per-artifact digest proves one record was not edited. It does not prove the ledger was not
 * edited: a record can still be removed, reordered, or inserted without trace. Chaining each
 * artifact to its predecessor makes any of those detectable, because every later link stops
 * verifying.
 *
 * This is tamper *evidence*, not tamper resistance. Someone with write access can rewrite the
 * whole chain. Making that impossible needs an external anchor — a signed head, a WORM store, or
 * a witness — which belongs with the KMS work.
 */

export const CHAIN_GENESIS = 'sha256:genesis'

export function linkArtifact(previousDigest: string, artifactDigest: string, sequence: number): ArtifactChainLink {
  return {
    sequence,
    previousDigest,
    chainDigest: `sha256:${createHash('sha256')
      .update(previousDigest)
      .update(' ')
      .update(artifactDigest)
      .update(' ')
      .update(String(sequence))
      .digest('hex')}`,
  }
}

export interface ChainedArtifact {
  id: string
  artifactDigest: string
  chain?: ArtifactChainLink
}

export function nextChainState(records: ChainedArtifact[]): { previousDigest: string; sequence: number } {
  const last = [...records].reverse().find((record) => record.chain)
  return last?.chain
    ? { previousDigest: last.chain.chainDigest, sequence: last.chain.sequence + 1 }
    : { previousDigest: CHAIN_GENESIS, sequence: 0 }
}

export interface ChainVerification {
  valid: boolean
  /** Identifier of the first record whose link does not verify. */
  brokenAt?: string
  reason?: string
}

/**
 * Recomputes an artifact's content digest, supplied by the store that knows how it was built.
 *
 * Without this the chain proves only that `artifactDigest` was not altered — editing a field and
 * leaving the stale digest in place would still verify. Passing it closes the loop from content
 * to digest to chain.
 */
export type ContentDigest<T> = (record: T) => string

/**
 * Verifies the chain over the records that carry one.
 *
 * Records written before chaining existed have no link and are tolerated, but only as an
 * unbroken prefix: once chaining starts it must be contiguous, so an attacker cannot strip
 * links to hide a deletion.
 */
export function verifyChain<T extends ChainedArtifact>(
  records: T[],
  contentDigest?: ContentDigest<T>,
): ChainVerification {
  let previousDigest = CHAIN_GENESIS
  let expectedSequence = 0
  let started = false

  for (const record of records) {
    if (!record.chain) {
      if (started) {
        return { valid: false, brokenAt: record.id, reason: 'an unchained artifact appears after chaining began' }
      }
      continue
    }
    started = true

    if (record.chain.sequence !== expectedSequence) {
      return { valid: false, brokenAt: record.id, reason: `expected sequence ${expectedSequence}, found ${record.chain.sequence}` }
    }
    if (record.chain.previousDigest !== previousDigest) {
      return { valid: false, brokenAt: record.id, reason: 'the recorded predecessor does not match the preceding artifact' }
    }
    if (contentDigest && contentDigest(record) !== record.artifactDigest) {
      return { valid: false, brokenAt: record.id, reason: 'the artifact content does not match its recorded digest' }
    }

    const recomputed = linkArtifact(previousDigest, record.artifactDigest, record.chain.sequence)
    if (recomputed.chainDigest !== record.chain.chainDigest) {
      return { valid: false, brokenAt: record.id, reason: 'the recorded digest does not match the chain digest' }
    }

    previousDigest = record.chain.chainDigest
    expectedSequence += 1
  }

  return { valid: true }
}

export class ArtifactChainBrokenError extends Error {
  constructor(store: string, verification: ChainVerification) {
    super(`${store} ledger integrity check failed at ${verification.brokenAt}: ${verification.reason}.`)
    this.name = 'ArtifactChainBrokenError'
  }
}
