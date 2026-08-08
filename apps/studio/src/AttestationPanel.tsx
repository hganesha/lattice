import { useState } from 'react'
import type { Attestation, AttestationCheckId, AttestationSubjectKind, AttestationVerification } from '@lattice/contracts'
import { apiFetch } from './api'
import { useResource } from './useResource'
import { EmptyState, ErrorState, LoadingState } from './SurfaceState'
import { shortDigest } from './formatters'
import { useDispositionMessages, type DispositionMessageKey } from './i18n/messages.disposition'
import { IconAlertTriangle, IconBan, IconCheck, IconGitBranch, IconShieldCheck, IconX } from './icons'
import './disposition-trail.css'

/**
 * E16 — the honest replacement for the prototype's trust theatre (§4.2).
 *
 * Nothing on this panel asserts tamper-evidence. It renders the attestation's own fields
 * (digest, named serialization, predicate, signer + role held at signing, freshness,
 * revocation, log inclusion) and reports whatever `POST /v1/attestations/:id/verify`
 * actually returns — including `UNAVAILABLE`, said plainly.
 */

interface AttestationPanelProps {
  subjectKind: AttestationSubjectKind
  subjectId: string
}

const checkKeys: Readonly<Record<AttestationCheckId, DispositionMessageKey>> = {
  KEY_KNOWN: 'attestationCheckKeyKnown',
  SIGNATURE: 'attestationCheckSignature',
  PAYLOAD_DIGEST: 'attestationCheckPayloadDigest',
  FRESHNESS: 'attestationCheckFreshness',
  REVOCATION: 'attestationCheckRevocation',
  LOG_INCLUSION: 'attestationCheckLogInclusion',
}

export function AttestationPanel({ subjectKind, subjectId }: AttestationPanelProps) {
  const { t, formatDate } = useDispositionMessages()
  const attestations = useResource<Attestation[]>(subjectId ? `/v1/attestations?subjectId=${encodeURIComponent(subjectId)}&subjectKind=${encodeURIComponent(subjectKind)}` : undefined)
  const [verifications, setVerifications] = useState<Record<string, AttestationVerification>>({})
  const [verifyingId, setVerifyingId] = useState('')
  const [verifyError, setVerifyError] = useState<Record<string, string>>({})

  async function verify(attestationId: string) {
    setVerifyingId(attestationId)
    setVerifyError((current) => ({ ...current, [attestationId]: '' }))
    try {
      const result = await apiFetch<AttestationVerification>(`/v1/attestations/${encodeURIComponent(attestationId)}/verify`, { method: 'POST' })
      setVerifications((current) => ({ ...current, [attestationId]: result }))
    } catch (caught) {
      setVerifyError((current) => ({ ...current, [attestationId]: caught instanceof Error ? caught.message : 'Request failed' }))
    } finally {
      setVerifyingId('')
    }
  }

  if (attestations.status === 'LOADING' || attestations.status === 'IDLE') return <div className="attestation-panel"><LoadingState label={t('attestationLoading')} /></div>
  if (attestations.status === 'ERROR') return <div className="attestation-panel"><ErrorState title={t('attestationError')} detail={attestations.error} retryLabel={t('dispositionRetry')} onRetry={attestations.reload} /></div>
  const records = attestations.data ?? []
  if (records.length === 0) return <div className="attestation-panel"><EmptyState title={t('attestationEmptyTitle')} description={t('attestationEmptyDescription')} icon={<IconShieldCheck />} /></div>

  return <div className="attestation-panel">
    <h4 className="attestation-heading">{t('attestationHeading')}</h4>
    {records.map((attestation) => {
      const verification = verifications[attestation.id]
      const failure = verifyError[attestation.id]
      const expired = Boolean(attestation.expiresAt && new Date(attestation.expiresAt).getTime() < Date.now())
      return <article className="attestation-card" key={attestation.id}>
        <header><div><span className="attestation-predicate">{attestation.predicateType}</span><code>{attestation.id}</code></div><div className="attestation-flags">{attestation.revocation ? <span className="disposition-chip red"><IconBan /> {t('attestationRevoked')}</span> : <span className="disposition-chip muted">{t('attestationNotRevoked')}</span>}{expired ? <span className="disposition-chip amber"><IconAlertTriangle /> {t('attestationExpired')}</span> : <span className="disposition-chip muted">{t('attestationCurrent')}</span>}</div></header>
        <dl className="attestation-fields">
          <div><dt>{t('attestationPayloadDigest')}</dt><dd><code title={attestation.payloadDigest}>{attestation.payloadDigest}</code></dd></div>
          <div><dt>{t('attestationCanonicalization')}</dt><dd><code>{attestation.canonicalization}</code></dd></div>
          <div><dt>{t('attestationSigner')}</dt><dd>{attestation.signerId}</dd></div>
          <div><dt>{t('attestationSignerRole')}</dt><dd>{attestation.signerRoleAtSigning}</dd></div>
          <div><dt>{t('attestationKey')}</dt><dd><code>{attestation.keyId}</code></dd></div>
          <div><dt>{t('attestationAlgorithm')}</dt><dd><code>{attestation.signatureAlgorithm}</code></dd></div>
          <div><dt>{t('attestationIssued')}</dt><dd>{formatDate(attestation.issuedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
          <div><dt>{t('attestationExpires')}</dt><dd>{attestation.expiresAt ? formatDate(attestation.expiresAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('attestationNoExpiry')}</dd></div>
          <div><dt>{t('attestationLogInclusion')}</dt><dd><span className="attestation-log"><IconGitBranch /> {t('attestationLogIndex', { index: attestation.logIndex })} · {t('attestationLogRoot')} <code title={attestation.logRoot}>{shortDigest(attestation.logRoot)}</code></span></dd></div>
        </dl>
        {attestation.revocation && <p className="attestation-revocation">{t('attestationRevokedDetail', { date: formatDate(attestation.revocation.revokedAt, { dateStyle: 'medium', timeStyle: 'short' }), reason: attestation.revocation.reason })}</p>}
        <div className="attestation-actions"><button className="release" onClick={() => void verify(attestation.id)} disabled={verifyingId === attestation.id}>{verifyingId === attestation.id ? t('attestationVerifying') : verification ? t('attestationReverify') : t('attestationVerify')}</button>{!verification && !failure && <span className="attestation-caveat">{t('attestationNotVerified')}</span>}</div>
        <div className="attestation-result" role="status" aria-live="polite">
          {failure && <p className="attestation-verify-error">{t('attestationVerifyFailed', { detail: failure })}</p>}
          {verification && <>
            <p className={`attestation-verdict ${verification.verified ? 'pass' : 'fail'}`}>{verification.verified ? <IconCheck /> : <IconX />} <b>{verification.verified ? t('attestationVerifiedTrue') : t('attestationVerifiedFalse')}</b> <small>{t('attestationVerifiedAt', { date: formatDate(verification.verifiedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}</small></p>
            <ul className="attestation-checks" aria-label={t('attestationChecksLabel')}>{verification.checks.map((check) => <li className={check.status.toLocaleLowerCase()} key={check.id}><span className="attestation-check-name">{t(checkKeys[check.id])}</span><span className={`disposition-chip ${check.status === 'PASS' ? 'green' : check.status === 'FAIL' ? 'red' : 'amber'}`}>{check.status === 'PASS' ? t('attestationStatusPass') : check.status === 'FAIL' ? t('attestationStatusFail') : t('attestationStatusUnavailable')}</span><span className="attestation-check-message">{check.message}</span></li>)}</ul>
          </>}
        </div>
      </article>
    })}
  </div>
}
