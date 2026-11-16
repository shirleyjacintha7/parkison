export default function ResultCard({ result, compact = false }) {
  const isPD = result.prediction === 1
  const cls = isPD ? 'pd' : 'healthy'

  return (
    <div className={`result-card ${cls}`}>
      <div className="result-head">
        <div className="result-verdict">
          <span className="verdict-icon">{isPD ? '🔴' : '🟢'}</span>
          <span className={`verdict-label ${cls}`}>{result.label}</span>
        </div>
        <span className="verdict-conf" style={{ color: isPD ? 'var(--pd)' : 'var(--healthy)' }}>
          {result.confidence.toFixed(1)}%
        </span>
      </div>

      {!compact && (
        <div className="result-body">
          <ProbBar label="Parkinson's" value={result.pd_probability} cls="pd" />
          <ProbBar label="Healthy" value={result.healthy_probability} cls="healthy" />
        </div>
      )}
    </div>
  )
}

export function ProbBar({ label, value, cls }) {
  const color = cls === 'pd' ? 'var(--pd)' : 'var(--healthy)'
  return (
    <div className="prob-row">
      <div className="prob-labels">
        <span className="prob-name">{label}</span>
        <span className="prob-val">{value.toFixed(1)}%</span>
      </div>
      <div className="prob-bar">
        <div className="prob-fill" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}
