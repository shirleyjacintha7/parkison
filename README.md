# PD Classifier — Parkinson's Disease Detection System

Multi-modal PD detection using handwriting images and voice audio.

## Architecture

```
pd-classifier/
├── backend/
│   ├── main.py                  # FastAPI app
│   ├── requirements.txt
│   └── models/
│       ├── handwriting_model.pkl   ← your trained model
│       └── voice_model.pkl         ← your trained model
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── App.jsx
        ├── index.css
        └── components/
            ├── HandwritingPanel.jsx
            ├── VoicePanel.jsx
            ├── ResultCard.jsx
            └── FusionPanel.jsx
```

## Models

| Model | Pipeline | Input | Output |
|-------|----------|-------|--------|
| Handwriting | StandardScaler → PCA(100) → SVC | 32×64 grayscale image | PD / Healthy |
| Voice | LGBMClassifier | 22 MFCCs (mean over time) | PD / Healthy |

## Quick Start

### 1. Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start server
uvicorn main:app --reload --port 8000
```

API available at: http://localhost:8000
Swagger docs at:  http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at: http://localhost:5173

---

## API Endpoints

### `POST /predict/handwriting`
Upload a handwriting image.

```bash
curl -X POST http://localhost:8000/predict/handwriting \
  -F "file=@sample.png"
```

Response:
```json
{
  "model": "handwriting",
  "filename": "sample.png",
  "prediction": 1,
  "label": "Parkinson's Detected",
  "confidence": 87.4,
  "pd_probability": 87.4,
  "healthy_probability": 12.6
}
```

### `POST /predict/voice`
Upload an audio file (WAV, MP3, OGG, WEBM, FLAC).

```bash
curl -X POST http://localhost:8000/predict/voice \
  -F "file=@sample.wav"
```

Response:
```json
{
  "model": "voice",
  "filename": "sample.wav",
  "prediction": 0,
  "label": "Healthy",
  "confidence": 91.2,
  "pd_probability": 8.8,
  "healthy_probability": 91.2
}
```

### `GET /health`
Check API status.

---

## Preprocessing Pipelines

### Handwriting (must match training exactly)
1. Load image → convert to **grayscale**
2. Resize to **64×32 px** (width=64, height=32)
3. Normalize pixel values: divide by **255** → range [0, 1]
4. Flatten → **2048-element** vector
5. Apply **StandardScaler** (fitted on training data)
6. Apply **PCA** (100 components)
7. Predict with **SVC** (C=10, RBF kernel, probability=True)

### Voice (must match training exactly)
1. Load audio with **librosa** at **sr=22050**
2. Extract **22 MFCCs** → shape (22, T)
3. Take **mean across time** → shape (22,)
4. Feed directly into **LGBMClassifier** (binary, no additional scaling)

---

## Fusion Adjuster

The frontend fusion panel lets you combine both model outputs with a sliding weight:

- Drag the slider to adjust how much each model contributes
- Use preset buttons for quick configurations
- Fusion uses weighted average of `pd_probability` values
- Works even if only one model has run

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ModuleNotFoundError: lightgbm` | `pip install lightgbm==4.5.0` |
| `ModuleNotFoundError: librosa` | `pip install librosa soundfile` |
| Mic not working | Allow microphone in browser → site settings |
| CORS error | Make sure backend runs on port 8000 |
| Poor prediction accuracy | Ensure audio is clear, 3–10 seconds, sustained vowel "ahhh" |
