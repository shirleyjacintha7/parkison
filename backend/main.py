"""
Parkinson's Disease Classifier — FastAPI Backend v5
=====================================================
Handwriting : 10 brightness-invariant ratio features → StandardScaler → SVC (RBF)
              Uses Otsu threshold + pure ratios → works on any real-world image
Voice       : 22 MFCCs → LightGBM
"""

import io, os, pickle, tempfile, warnings
import numpy as np
from pathlib import Path
from PIL import Image

warnings.filterwarnings("ignore")

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

MODELS_DIR = Path(__file__).parent / "models"

def _load(name):
    p = MODELS_DIR / name
    if not p.exists():
        raise RuntimeError(f"Model not found: {p}")
    with open(p, "rb") as f:
        return pickle.load(f)

hw_pipeline = _load("handwriting_model.pkl")
voice_model = _load("voice_model.pkl")

app = FastAPI(title="PD Classifier API", version="5.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"], allow_headers=["*"],
)

LABELS = {0: "Healthy", 1: "Parkinson's Detected"}

# ══════════════════════════════════════════════════════════════════════════════
# HANDWRITING FEATURE EXTRACTION
# 10 fully brightness-invariant features using Otsu auto-threshold + ratios only.
# Works correctly regardless of image brightness, contrast, or screenshot quality.
# ══════════════════════════════════════════════════════════════════════════════
def extract_handwriting_features(image_bytes: bytes) -> np.ndarray:
    from scipy import ndimage
    from scipy.ndimage import distance_transform_edt, label as ndlabel

    img  = Image.open(io.BytesIO(image_bytes)).convert("L").resize((256, 256))
    gray = np.array(img, dtype=np.float32)

    # ── Otsu threshold: auto-adapts to any brightness level ──────────────────
    hist, bin_edges = np.histogram(gray.flatten(), bins=256)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
    total = hist.sum()
    best_thresh, best_var = 128.0, 0.0
    w0, sum0 = 0, 0
    for t in range(5, 251):
        w0   += hist[t - 1]
        sum0 += hist[t - 1] * bin_centers[t - 1]
        w1    = total - w0
        if w0 == 0 or w1 == 0:
            continue
        mu0 = sum0 / w0
        mu1 = np.sum(hist[t:] * bin_centers[t:]) / w1
        var = w0 * w1 * (mu0 - mu1) ** 2
        if var > best_var:
            best_var = var
            best_thresh = bin_centers[t]

    # Dark pixels = ink strokes
    stroke_mask = gray < best_thresh
    if stroke_mask.sum() > 0.6 * gray.size:       # if inverted, flip
        stroke_mask = ~stroke_mask
    if stroke_mask.sum() < 200:                     # fallback: darkest 30%
        stroke_mask = gray < np.percentile(gray, 30)

    stroke_px = int(stroke_mask.sum())
    if stroke_px < 50:
        return np.zeros(10, dtype=np.float32)

    # Binary canvas for gradient computation
    inv = np.where(stroke_mask, 255.0, 0.0).astype(np.float32)

    gx = ndimage.sobel(inv, axis=1)
    gy = ndimage.sobel(inv, axis=0)

    # 1. Angular variation CV (direction instability)
    angle     = np.arctan2(gy, gx)
    a_diff    = np.diff(angle[stroke_mask])
    angle_cv  = float(np.abs(a_diff).std() / (np.abs(a_diff).mean() + 1e-8))

    # 2. Stroke density
    density = float(stroke_px) / (256 * 256)

    # 3-4. Stroke width mean & CV (via distance transform)
    dt         = distance_transform_edt(stroke_mask)
    sw         = dt[stroke_mask]
    width_mean = sw.mean()
    width_cv   = float(sw.std() / (width_mean + 1e-8))
    width_norm = float(width_mean / np.sqrt(256 ** 2 + 256 ** 2))

    # 5-6. Zero crossing rates
    zcr_x = float(np.sum(np.diff(np.sign(gx[stroke_mask])) != 0)) / max(len(gx[stroke_mask]), 1)
    zcr_y = float(np.sum(np.diff(np.sign(gy[stroke_mask])) != 0)) / max(len(gy[stroke_mask]), 1)

    # 7-8. Laplacian-to-gradient ratio & gradient CV
    gxx      = ndimage.sobel(gx, axis=1)
    gyy      = ndimage.sobel(gy, axis=0)
    lap      = np.abs(gxx + gyy)[stroke_mask]
    grad_mag = np.sqrt(gx ** 2 + gy ** 2)[stroke_mask]
    lap_to_grad = float(lap.mean()  / (grad_mag.mean() + 1e-8))
    grad_cv     = float(grad_mag.std() / (grad_mag.mean() + 1e-8))

    # 9-10. Interaction terms
    return np.array([
        angle_cv, density, width_cv, width_norm,
        zcr_x, zcr_y, lap_to_grad, grad_cv,
        angle_cv * width_cv,    # directional instability × width variation
        grad_cv  * width_norm,  # shakiness × stroke thickness
    ], dtype=np.float32)


def predict_handwriting(image_bytes: bytes) -> dict:
    features = extract_handwriting_features(image_bytes).reshape(1, -1)
    X     = hw_pipeline["scaler"].transform(features)
    model = hw_pipeline["model"]
    proba = model.predict_proba(X)[0]
    pred  = int(model.predict(X)[0])
    return {
        "prediction": pred,
        "label":      LABELS[pred],
        "confidence":         round(float(proba[pred]) * 100, 2),
        "pd_probability":     round(float(proba[1])    * 100, 2),
        "healthy_probability":round(float(proba[0])    * 100, 2),
    }


# ══════════════════════════════════════════════════════════════════════════════
# VOICE PREDICTION
# ══════════════════════════════════════════════════════════════════════════════
SUPPORTED_AUDIO = {".wav", ".mp3", ".ogg", ".flac", ".webm", ".m4a", ".aac"}

def extract_mfcc(audio_bytes: bytes, suffix: str = ".wav") -> np.ndarray:
    import librosa
    if suffix not in SUPPORTED_AUDIO:
        suffix = ".wav"
    fd, tmp = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(audio_bytes)
        y, sr = librosa.load(tmp, sr=22050, mono=True)
        if len(y) == 0:
            raise ValueError("Audio file is empty.")
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=22)
        return np.mean(mfcc.T, axis=0).reshape(1, -1)
    finally:
        try: os.unlink(tmp)
        except: pass


def predict_voice(features: np.ndarray) -> dict:
    pred  = int(voice_model.predict(features)[0])
    proba = voice_model.predict_proba(features)[0]
    return {
        "prediction": pred,
        "label":      LABELS[pred],
        "confidence":         round(float(proba[pred]) * 100, 2),
        "pd_probability":     round(float(proba[1])    * 100, 2),
        "healthy_probability":round(float(proba[0])    * 100, 2),
    }


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "models": {
        "handwriting": "SVC v5 — brightness-invariant ratio features",
        "voice":       "LGBMClassifier — 22 MFCCs",
    }}


@app.post("/predict/handwriting")
async def predict_hw(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Upload an image file (PNG, JPG, BMP, etc.)")
    data = await file.read()
    if not data:
        raise HTTPException(400, "File is empty.")
    try:
        return {"model": "handwriting", "filename": file.filename, **predict_handwriting(data)}
    except Exception as e:
        raise HTTPException(500, f"Handwriting prediction failed: {e}")


@app.post("/predict/voice")
async def predict_v(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "File is empty.")
    suffix = ".wav"
    if file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext in SUPPORTED_AUDIO:
            suffix = ext
    try:
        return {"model": "voice", "filename": file.filename,
                **predict_voice(extract_mfcc(data, suffix))}
    except ImportError:
        raise HTTPException(500, "librosa not installed. Run: pip install librosa soundfile")
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"Voice prediction failed: {e}")


@app.post("/predict/fusion")
async def predict_fusion(
    handwriting_file: UploadFile = File(...),
    voice_file:       UploadFile = File(...),
):
    hw_data    = await handwriting_file.read()
    voice_data = await voice_file.read()
    suffix = ".wav"
    if voice_file.filename:
        ext = Path(voice_file.filename).suffix.lower()
        if ext in SUPPORTED_AUDIO:
            suffix = ext
    try:
        return {
            "handwriting": predict_handwriting(hw_data),
            "voice":       predict_voice(extract_mfcc(voice_data, suffix)),
        }
    except Exception as e:
        raise HTTPException(500, str(e))