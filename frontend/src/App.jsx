import { useState, useEffect } from 'react'
import axios from 'axios'
import HandwritingPanel from './components/HandwritingPanel'
import VoicePanel from './components/VoicePanel'
import FusionPanel from './components/FusionPanel'

export default function App() {
  const [online, setOnline] = useState(null)
  const [hwResult, setHwResult] = useState(null)
  const [voiceResult, setVoiceResult] = useState(null)

  useEffect(() => {
    axios.get('/health')
      .then(() => setOnline(true))
      .catch(() => setOnline(false))
  }, [])

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-brand">
          <div className="brand-icon">🧠</div>
          <div className="brand-text">
            <h1>PD Classifier</h1>
            <p>Parkinson's Disease Detection System</p>
          </div>
        </div>
        <div className="header-status">
          <div className={`status-indicator ${online === false ? 'offline' : ''}`} />
          {online === null ? 'Connecting...' : online ? 'API Online' : 'API Offline — start backend'}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="main">
        <div className="page-title">
          <h2>Multi-Modal Analysis</h2>
          <p>Analyze handwriting and voice independently, then combine them with adjustable fusion weights.</p>
        </div>

        {/* Two panels side by side */}
        <div className="two-col">
          <HandwritingPanel onResult={setHwResult} />
          <VoicePanel onResult={setVoiceResult} />
        </div>

        {/* Fusion panel below */}
        <FusionPanel hwResult={hwResult} voiceResult={voiceResult} />
      </main>
    </div>
  )
}
