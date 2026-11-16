import { useState, useMemo } from 'react'
import { ProbBar } from './ResultCard'

const PRESETS = [
  { label: 'Equal (50/50)', hw: 0.5, voice: 0.5 },
  { label: 'Handwriting ↑', hw: 0.7, voice: 0.3 },
  { label: 'Voice ↑', hw: 0.3, voice: 0.7 },
  { label: 'HW only', hw: 1.0, voice: 0.0 },
  { label: 'Voice only', hw: 0.0, voice: 1.0 },
]

export default function FusionPanel({ hwResult, voiceResult }) {
  const [hwWeight, setHwWeight] = useState(0.5)
  const voiceWeight = 1 - hwWeight

  // Weighted fusion of pd_probability
  const fusion = useMemo(() => {
    if (!hwResult && !voiceResult) return null

    const hwPd    = hwResult    ? hwResult.pd_probability / 100    : 0
    const voicePd = voiceResult ? voiceResult.pd_probability / 100 : 0

    // Effective weights (handle missing modality)
    let effHw = hwResult    ? hwWeight    : 0
    let effV  = voiceResult ? voiceWeight : 0
    const total = effHw + effV
    if (total === 0) return null
    effHw /= total
    effV  /= total

    const fusedPd = effHw * hwPd + effV * voicePd
    const fusedHealthy = 1 - fusedPd
    const prediction = fusedPd >= 0.5 ? 1 : 0
    const confidence  = prediction === 1 ? fusedPd * 100 : fusedHealthy * 100

    return {
      prediction,
      label:              prediction === 1 ? "Parkinson's Detected" : 'Healthy',
      confidence:         Math.round(confidence * 10) / 10,
      pd_probability:     Math.round(fusedPd * 1000) / 10,
      healthy_probability:Math.round(fusedHealthy * 1000) / 10,
      hw_contribution:    Math.round(effHw * hwPd * 1000) / 10,
      voice_contribution: Math.round(effV  * voicePd * 1000) / 10,
    }
  }, [hwResult, voiceResult, hwWeight, voiceWeight])

  const isPD = fusion?.prediction === 1
  const pct  = `${hwWeight * 100}%`

  return (
    <div className="fusion-panel">
      <div className="fusion-head">
        <div className="fusion-title">
          <div>
            <h3>⚡ Fusion Analysis</h3>
            <p>Combine both models with adjustable weights</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map(p => (
            <button
              key={p.label}
              className="weight-reset"
              onClick={() => setHwWeight(p.hw)}
              style={{
                border: `1px solid ${Math.abs(hwWeight - p.hw) < 0.01 ? 'var(--accent)' : 'var(--border-hi)'}`,
                color:  Math.abs(hwWeight - p.hw) < 0.01 ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fusion-body">
        {/* ── Weight adjuster ── */}
        <div className="weight-adjuster">
          <div className="weight-header">
            <span>Fusion Weight Adjuster</span>
            <button className="weight-reset" onClick={() => setHwWeight(0.5)}>Reset 50/50</button>
          </div>

          <div className="weight-labels">
            <span>✍️ Handwriting</span>
            <span>🎙️ Voice</span>
          </div>

          <input
            type="range"
            min={0} max={100} step={1}
            value={Math.round(hwWeight * 100)}
            onChange={e => setHwWeight(Number(e.target.value) / 100)}
            className="weight-slider"
            style={{ '--pct': pct }}
          />

          <div className="weight-chips">
            <span className="weight-chip hw">HW {Math.round(hwWeight * 100)}%</span>
            <span className="weight-chip voice">Voice {Math.round(voiceWeight * 100)}%</span>
          </div>
        </div>

        {/* ── Results grid ── */}
        {(!hwResult && !voiceResult) ? (
          <div className="empty-state">
            <div className="empty-icon">🔬</div>
            <p>Run at least one analysis above to see fusion results.</p>
          </div>
        ) : (
          <div className="fusion-result-grid">
            {/* Handwriting source */}
            <div className="fusion-source-card">
              <div className="fusion-source-title">✍️ Handwriting</div>
              {hwResult ? (
                <>
                  <div className={`fusion-source-label ${hwResult.prediction === 1 ? 'pd' : 'healthy'}`}>
                    {hwResult.label}
                  </div>
                  <div className="fusion-source-conf">
                    PD: {hwResult.pd_probability.toFixed(1)}%
                  </div>
                  <div className="fusion-source-conf" style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--text-3)' }}>
                    Weight: {Math.round(hwWeight * 100)}%
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>No result yet</div>
              )}
            </div>

            {/* Fusion main */}
            {fusion && (
              <div className={`fusion-main-card ${isPD ? 'pd' : 'healthy'}`}>
                <div className="fusion-main-tag">Combined Result</div>
                <div className={`fusion-main-verdict ${isPD ? 'pd' : 'healthy'}`}>
                  {isPD ? '🔴' : '🟢'} {fusion.label}
                </div>
                <div className="fusion-main-conf" style={{ color: isPD ? 'var(--pd)' : 'var(--healthy)' }}>
                  {fusion.confidence.toFixed(1)}%
                </div>
                <div className="fusion-bars">
                  <ProbBar label="Parkinson's" value={fusion.pd_probability} cls="pd" />
                  <ProbBar label="Healthy"     value={fusion.healthy_probability} cls="healthy" />
                </div>
              </div>
            )}

            {/* Voice source */}
            <div className="fusion-source-card">
              <div className="fusion-source-title">🎙️ Voice</div>
              {voiceResult ? (
                <>
                  <div className={`fusion-source-label ${voiceResult.prediction === 1 ? 'pd' : 'healthy'}`}>
                    {voiceResult.label}
                  </div>
                  <div className="fusion-source-conf">
                    PD: {voiceResult.pd_probability.toFixed(1)}%
                  </div>
                  <div className="fusion-source-conf" style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--text-3)' }}>
                    Weight: {Math.round(voiceWeight * 100)}%
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>No result yet</div>
              )}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{
          marginTop: 20,
          padding: '10px 14px',
          background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.2)',
          borderRadius: 6,
          fontSize: '0.75rem',
          color: 'var(--warn)',
        }}>
          ⚠️ This tool is for research purposes only. Results are not a clinical diagnosis. Always consult a qualified neurologist.
        </div>
      </div>
    </div>
  )
}
