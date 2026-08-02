/**
 * In-memory stores for short-lived runtime state that belongs to one subject.
 *
 * Signed plans and paused clarifications are capabilities: holding the identifier must not be
 * enough to use them. Every entry records the principal and tenant it was issued to, lookups
 * fail closed when the caller differs, and entries are swept once they are past retention so
 * the maps cannot grow without bound.
 *
 * This is process-local. A multi-instance deployment needs a shared, durable store; see the
 * plan-verification and nonce items in enterprise-gaps.md.
 */

export interface Subject {
  principalId: string
  tenantId?: string
}

export function sameSubject(left: Subject, right: Subject): boolean {
  return left.principalId === right.principalId && (left.tenantId ?? '') === (right.tenantId ?? '')
}

interface StoredEntry<T> {
  subject: Subject
  value: T
  retainUntil: number
}

export class SubjectScopedStore<T> {
  private readonly entries = new Map<string, StoredEntry<T>>()

  constructor(
    private readonly defaultRetentionMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  set(key: string, subject: Subject, value: T, retainUntil?: number): void {
    this.sweep()
    this.entries.set(key, {
      subject: { principalId: subject.principalId, ...(subject.tenantId ? { tenantId: subject.tenantId } : {}) },
      value,
      retainUntil: retainUntil ?? this.now() + this.defaultRetentionMs,
    })
  }

  /** Returns the value only when the caller is the subject it was issued to. */
  get(key: string, subject: Subject): T | undefined {
    this.sweep()
    const entry = this.entries.get(key)
    if (!entry || !sameSubject(entry.subject, subject)) return undefined
    return entry.value
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  get size(): number {
    this.sweep()
    return this.entries.size
  }

  private sweep(): void {
    const now = this.now()
    for (const [key, entry] of this.entries) {
      if (entry.retainUntil <= now) this.entries.delete(key)
    }
  }
}
