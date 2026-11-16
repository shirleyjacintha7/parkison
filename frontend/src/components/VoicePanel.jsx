import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import ResultCard from './ResultCard'

export default function VoicePanel({ onResult }) {
  // File upload state
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [drag, setDrag] = useState(false)
  const fileInputRef = useRef()

  // Mic recording state
  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  useEffect(() => () => clearInterval(timerRef.current), [])

  /* ── Mic recording ─────────────────────────────────────────── */
  const startRecording = async () => {
    setError(null)
    setResult(null)
    setAudioBlob(null)
    setAudioUrl(null)
    setFile(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }

      mr.start(100)
      setRecording(true)
      setRecSeconds(0)
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch (e) {
      setError('Microphone access denied. Please allow mic access or upload a file.')
    }
  }

  const stopRecording = () => {
    clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  /* ── File upload ───────────────────────────────────────────── */
  const handleFile = (f) => {
    const allowed = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/x-wav']
    if (!f) return
    if (!f.type.startsWith('audio/') && !allowed.includes(f.type)) {
      setError('Please upload an audio file (WAV, MP3, OGG, FLAC)')
      return
    }
    setFile(f)
    setAudioBlob(null)
    setAudioUrl(null)
    setResult(null)
    setError(null)
  }

  /* ── Predict ───────────────────────────────────────────────── */
  const predict = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    const form = new FormData()
    if (audioBlob) {
      form.append('file', new File([audioBlob], 'recording.webm', { type: 'audio/webm' }))
    } else {
      form.append('file', file)
    }

    try {
      const { data } = await axios.post('/predict/voice', form)
      setResult(data)
      onResult?.(data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const hasAudio = audioBlob || file
  const reset = () => {
    setFile(null)
    setAudioBlob(null)
    setAudioUrl(null)
    setResult(null)
    setError(null)
    setRecSeconds(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>🎙️ Voice Analysis</h3>
          <p>Record or upload audio for PD detection</p>
        </div>
        <span className="panel-badge">LightGBM · 22 MFCCs</span>
      </div>

      <div className="panel-body">
        {/* Mic recorder */}
        <div className="recorder">
          {!recording ? (
            <button className="mic-btn" onClick={startRecording} title="Start recording">
              🎙️
            </button>
          ) : (
            <button className="mic-btn recording" onClick={stopRecording} title="Stop recording">
              ⏹️
            </button>
          )}

          {recording && <div className="rec-timer">{fmt(recSeconds)}</div>}
          {!recording && !audioUrl && <div className="rec-hint">Click mic to record voice sample</div>}

          {audioUrl && !recording && (
            <div style={{ width: '100%' }}>
              <audio controls src={audioUrl} style={{ width: '100%', height: 36, marginBottom: 8 }} />
              <div className="file-badge">
                <span className="file-badge-icon">🎙️</span>
                <span className="file-badge-name">Recording ({fmt(recSeconds)})</span>
                <button className="btn btn-sm btn-danger" style={{ width: 'auto' }} onClick={reset}>✕</button>
              </div>
            </div>
          )}
        </div>

        <div className="or-divider">or upload file</div>

        {/* File upload */}
        {!file ? (
          <div
            className={`dropzone ${drag ? 'active' : ''}`}
            style={{ minHeight: 100, padding: '20px' }}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
            <div className="dz-icon">📂</div>
            <div className="dz-main">Drop audio or click to browse</div>
            <div className="dz-sub">WAV · MP3 · OGG · FLAC · WEBM</div>
          </div>
        ) : (
          <div className="file-badge">
            <span className="file-badge-icon">🎵</span>
            <span className="file-badge-name">{file.name}</span>
            <button className="btn btn-sm btn-danger" style={{ width: 'auto' }} onClick={reset}>✕</button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="error-box">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Predict button */}
        <button
          className="btn btn-primary"
          onClick={predict}
          disabled={!hasAudio || loading || recording}
        >
          {loading ? <><div className="spinner" /> Analyzing...</> : '🔬 Analyze Voice'}
        </button>

        {/* Result */}
        {result && <ResultCard result={result} />}
      </div>
    </div>
  )
}
