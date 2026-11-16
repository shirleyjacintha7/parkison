import pickle
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw
import io
from scipy import ndimage

MODELS_DIR = Path(__file__).parent / 'models'
hw_pipeline = pickle.load(open(MODELS_DIR / 'handwriting_model_v3.pkl', 'rb'))

print('Model loaded successfully')
print('Pipeline keys:', list(hw_pipeline.keys()))
scaler = hw_pipeline['scaler']
model = hw_pipeline['model']
print('Scaler mean shape:', scaler.mean_.shape)
print('Model classes_:', model.classes_)
print('Model n_support_:', model.n_support_)
print('---')

def extract_handwriting_features(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("L").resize((128, 128))
    gray = np.array(img, dtype=np.float32)
    inv = 255.0 - gray
    thresh = inv > 40
    stroke_px = thresh.sum()
    if stroke_px == 0:
        return np.zeros(20, dtype=np.float32)
    # Full features (copy from main.py)
    gx = ndimage.sobel(inv, axis=1)
    gy = ndimage.sobel(inv, axis=0)
    grad_mag = np.sqrt(gx**2 + gy**2)
    grad_std = float(grad_mag[thresh].std())
    grad_mean = float(grad_mag[thresh].mean())
    angle = np.arctan2(gy, gx)
    angle_diff = np.diff(angle[thresh])
    angle_std = float(angle_diff.std())
    angle_mean = float(np.abs(angle_diff).mean())
    density = float(stroke_px) / (128 * 128)
    gxx = ndimage.sobel(gx, axis=1)
    gyy = ndimage.sobel(gy, axis=0)
    lap = np.abs(gxx + gyy)
    lap_mean = float(lap[thresh].mean())
    lap_std = float(lap[thresh].std())
    zcr_x = float(np.sum(np.diff(np.sign(gx[thresh])) != 0)) / max(len(gx[thresh]), 1)
    zcr_y = float(np.sum(np.diff(np.sign(gy[thresh])) != 0)) / max(len(gy[thresh]), 1)
    sv = inv[thresh]
    px_mean = float(sv.mean())
    px_std = float(sv.std())
    dt = ndimage.distance_transform_edt(thresh)
    sw = dt[thresh]
    width_mean = float(sw.mean())
    width_std = float(sw.std())
    width_cv = float(sw.std() / (sw.mean() + 1e-8))
    _, ncomp = ndimage.label(thresh)
    fft = np.fft.fft2(inv)
    mag = np.abs(np.fft.fftshift(fft))
    h2, w2 = mag.shape
    cy, cx = h2 // 2, w2 // 2
    r = min(h2, w2) // 4
    yg, xg = np.ogrid[:h2, :w2]
    mask_hi = (yg - cy)**2 + (xg - cx)**2 > r**2
    freq_ratio = float(mag[mask_hi].mean() / (mag[~mask_hi].mean() + 1e-8))
    g2x = ndimage.sobel(gx, axis=1)
    g2y = ndimage.sobel(gy, axis=0)
    contour_rough = float(np.sqrt(g2x**2 + g2y**2)[thresh].mean())
    frag_ratio = float(ncomp) / max(stroke_px / 10.0, 1)
    return np.array([
        grad_std, grad_mean, angle_std, angle_mean,
        density, lap_mean, lap_std, zcr_x, zcr_y,
        px_mean, px_std, width_mean, width_std, width_cv,
        float(ncomp), freq_ratio, contour_rough, frag_ratio,
        grad_std / max(grad_mean, 1e-8),
        lap_mean / max(grad_mean, 1e-8),
    ], dtype=np.float32)

# Test 1: Empty image (all zero features)
empty_img = Image.new('L', (128,128), 255)  # white
empty_bytes = io.BytesIO()
empty_img.save(empty_bytes, format='PNG')
empty_features = extract_handwriting_features(empty_bytes.getvalue())
print('Empty image features min/max:', empty_features.min(), empty_features.max())
scaled_empty = scaler.transform(empty_features.reshape(1,-1))
pred_empty = model.predict(scaled_empty)[0]
proba_empty = model.predict_proba(scaled_empty)[0]
print('Empty pred:', pred_empty, proba_empty)

# Test 2: Simple stroke (black line)
stroke_img = Image.new('L', (128,128), 255)
draw = ImageDraw.Draw(stroke_img)
draw.line((10,10,100,100), fill=0, width=5)
stroke_bytes = io.BytesIO()
stroke_img.save(stroke_bytes, format='PNG')
stroke_features = extract_handwriting_features(stroke_bytes.getvalue())
print('Stroke features min/max:', stroke_features.min(), stroke_features.max())
scaled_stroke = scaler.transform(stroke_features.reshape(1,-1))
pred_stroke = model.predict(scaled_stroke)[0]
proba_stroke = model.predict_proba(scaled_stroke)[0]
print('Stroke pred:', pred_stroke, proba_stroke)

# Test 3: Random noisy image
np.random.seed(42)
noisy_img = np.random.randint(0,256,(128,128), dtype=np.uint8)
noisy_img = Image.fromarray(noisy_img)
noisy_bytes = io.BytesIO()
noisy_img.save(noisy_bytes, format='PNG')
noisy_features = extract_handwriting_features(noisy_bytes.getvalue())
print('Noisy features min/max:', noisy_features.min(), noisy_features.max())
scaled_noisy = scaler.transform(noisy_features.reshape(1,-1))
pred_noisy = model.predict(scaled_noisy)[0]
proba_noisy = model.predict_proba(scaled_noisy)[0]
print('Noisy pred:', pred_noisy, proba_noisy)

print('--- Model decision_function range test ---')
dummy_range = np.linspace(-3,3,7).reshape(-1,1)
if hasattr(model, 'decision_function'):
    df_range = model.decision_function(dummy_range)
    print('Decision function on dummy:', df_range)

