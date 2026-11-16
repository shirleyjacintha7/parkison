import { useState, useRef } from 'react'
import axios from 'axios'
import ResultCard from './ResultCard'

export default function HandwritingPanel({ onResult }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef()

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, BMP, etc.)')
      return
    }
    setFile(f)
    setResult(null)
    setError(null)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(f)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDrag(false)
    handleFile(e.dataTransfer.files[0])
  }

  const predict = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const { data } = await axios.post('/predict/handwriting', form)
      setResult(data)
      onResult?.(data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>✍️ Handwriting Analysis</h3>
          <p>Upload a handwriting image for PD detection</p>
        </div>
        <span className="panel-badge">SVC · PCA(100)</span>
      </div>

      <div className="panel-body">
        {/* Upload zone */}
        {!preview ? (
          <div
            className={`dropzone ${drag ? 'active' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
            <div className="dz-icon">🖼️</div>
            <div className="dz-main">Drop image or click to browse</div>
            <div className="dz-sub">PNG · JPG · BMP · TIFF</div>
          </div>
        ) : (
          <div>
            <img src={preview} alt="preview" className="img-preview" />
            <div className="file-badge" style={{ marginBottom: 12 }}>
              <span className="file-badge-icon">📄</span>
              <span className="file-badge-name">{file.name}</span>
              <button className="btn btn-sm btn-danger" style={{ width: 'auto' }} onClick={reset}>✕</button>
            </div>
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
          disabled={!file || loading}
        >
          {loading ? <><div className="spinner" /> Analyzing...</> : '🔬 Analyze Handwriting'}
        </button>

        {/* Result */}
        {result && <ResultCard result={result} />}
      </div>
    </div>
  )
}
