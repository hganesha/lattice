import type { ExecutionReceipt } from '@lattice/contracts'

interface ExecutionReceiptCardProps {
  receipt: ExecutionReceipt
}

export function ExecutionReceiptCard({ receipt }: ExecutionReceiptCardProps) {
  return <article className="execution-receipt-card">
    <div className="approval-card-heading">
      <div><span className="panel-kicker">IMMUTABLE EXECUTION RECEIPT</span><h3>{receipt.operationId}</h3></div>
      <span className={`runtime-status-pill ${receipt.status.toLocaleLowerCase()}`}>{receipt.status}</span>
    </div>
    <div className="receipt-metadata">
      <span><b>Plan</b><code>{receipt.planId}</code></span>
      <span><b>Principal</b><code>{receipt.principalId}</code></span>
      <span><b>Completed</b><time>{new Date(receipt.completedAt).toLocaleString()}</time></span>
    </div>
    {receipt.bindingResults.map((result) => <div className="adapter-result" key={result.bindingId}>
      <div><b>{result.sourceSystem}</b><span>{result.mode} adapter · {result.durationMs} ms</span></div>
      <span className={result.status === 'SUCCESS' ? 'receipt-success' : 'receipt-failed'}>{result.status}</span>
      <small>{result.status === 'SUCCESS' ? `${result.mappedValues.length} governed fields · ${result.responseDigest}` : result.error}</small>
    </div>)}
    <div className="artifact-digest">{receipt.artifactDigest}</div>
  </article>
}
