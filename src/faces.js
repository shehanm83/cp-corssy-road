import * as PIXI from 'pixi.js';

const FACE_TEX_SIZE = 128;
const STORAGE_SELECTED = 'cp-retro.face.selected';
const STORAGE_UNLOCKED = 'cp-retro.face.unlocked';
const STORAGE_COIN_COUNTS = 'cp-retro.face.coins';

// Draws a cartoon face onto a canvas. Recognises optional features so the
// 12 colleagues can be made visually distinct without needing real photos.
function drawPlaceholderFace(ctx, p) {
  const W = FACE_TEX_SIZE;
  const H = FACE_TEX_SIZE;
  const skin = p.skin || '#f4d9b8';
  const hair = p.hair || '#5a3a22';
  const eyes = p.eyes || '#222222';
  const mouth = p.mouth || '#aa3344';
  const beard = p.beard;                  // hex string or undefined
  const glasses = p.glasses;              // hex string or undefined
  const hairStyle = p.hairStyle || 'short'; // 'short' | 'long' | 'fluffy' | 'bald' | 'mohawk'

  const px = (frac) => Math.floor(W * frac);
  const py = (frac) => Math.floor(H * frac);

  // Skin background
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, W, H);

  // Hair
  if (hairStyle !== 'bald') {
    ctx.fillStyle = hair;
    if (hairStyle === 'mohawk') {
      ctx.fillRect(px(0.42), 0, px(0.16), py(0.32));
    } else if (hairStyle === 'fluffy') {
      ctx.fillRect(0, 0, W, py(0.36));
      ctx.fillRect(0, py(0.36), px(0.14), py(0.10));
      ctx.fillRect(px(0.86), py(0.36), px(0.14), py(0.10));
    } else if (hairStyle === 'long') {
      ctx.fillRect(0, 0, W, py(0.34));
      ctx.fillRect(0, py(0.34), px(0.12), py(0.40));
      ctx.fillRect(px(0.88), py(0.34), px(0.12), py(0.40));
    } else { // short
      ctx.fillRect(0, 0, W, py(0.28));
      ctx.fillRect(0, py(0.28), px(0.15), py(0.08));
      ctx.fillRect(px(0.85), py(0.28), px(0.15), py(0.08));
    }
  }

  // Eyes
  const eyeW = px(0.14), eyeH = py(0.11);
  const eyeY = py(0.46);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px(0.22), eyeY, eyeW, eyeH);
  ctx.fillRect(px(0.64), eyeY, eyeW, eyeH);
  ctx.fillStyle = eyes;
  ctx.fillRect(px(0.26), eyeY + 2, eyeW - 6, eyeH - 4);
  ctx.fillRect(px(0.68), eyeY + 2, eyeW - 6, eyeH - 4);

  // Glasses (optional)
  if (glasses) {
    ctx.strokeStyle = glasses;
    ctx.lineWidth = 3;
    ctx.strokeRect(px(0.20), eyeY - 3, eyeW + 6, eyeH + 6);
    ctx.strokeRect(px(0.62), eyeY - 3, eyeW + 6, eyeH + 6);
    ctx.beginPath();
    ctx.moveTo(px(0.36), eyeY + eyeH / 2);
    ctx.lineTo(px(0.62), eyeY + eyeH / 2);
    ctx.stroke();
  }

  // Nose shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(px(0.47), py(0.60), px(0.06), py(0.10));

  // Mouth
  ctx.fillStyle = mouth;
  ctx.fillRect(px(0.32), py(0.78), px(0.36), py(0.06));

  // Beard (drawn after mouth so it can frame it; redraws mouth on top)
  if (beard) {
    ctx.fillStyle = beard;
    ctx.fillRect(px(0.18), py(0.72), px(0.64), py(0.22));
    // Cut a "skin" gap for the mouth area, then redraw the mouth.
    ctx.fillStyle = skin;
    ctx.fillRect(px(0.30), py(0.76), px(0.40), py(0.04));
    ctx.fillStyle = mouth;
    ctx.fillRect(px(0.32), py(0.78), px(0.36), py(0.06));
  }
}

function makePlaceholderTexture(placeholder) {
  const c = document.createElement('canvas');
  c.width = FACE_TEX_SIZE;
  c.height = FACE_TEX_SIZE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawPlaceholderFace(ctx, placeholder || {});
  return PIXI.Texture.from(c);
}

export class FaceRegistry {
  constructor() {
    this.manifest = null;
    this.faces = [];
    this.byId = new Map();
    this.unlocked = new Set();
    this.coinCounts = new Map();
    this.currentId = null;
    this.coinUnlockThreshold = 8;
  }

  async load() {
    const base = (import.meta.env && import.meta.env.BASE_URL) || './';
    const facesURL = (file) => `${base}faces/${file}`;
    this._facesURL = facesURL;

    const res = await fetch(facesURL('manifest.json'));
    this.manifest = await res.json();
    this.coinUnlockThreshold = this.manifest.coinUnlockThreshold ?? 8;

    for (const f of this.manifest.faces) {
      const tex = f.file
        ? await PIXI.Assets.load(facesURL(f.file))
        : makePlaceholderTexture(f.placeholder);
      const entry = { ...f, texture: tex };
      this.faces.push(entry);
      this.byId.set(f.id, entry);
    }

    // Unlocks: from manifest + persisted
    for (const id of this.manifest.defaultUnlocked || []) this.unlocked.add(id);
    const storedUnlocked = JSON.parse(localStorage.getItem(STORAGE_UNLOCKED) || '[]');
    for (const id of storedUnlocked) if (this.byId.has(id)) this.unlocked.add(id);

    const storedCoins = JSON.parse(localStorage.getItem(STORAGE_COIN_COUNTS) || '{}');
    for (const [id, n] of Object.entries(storedCoins)) {
      if (this.byId.has(id)) this.coinCounts.set(id, n);
    }

    // Current selection
    const stored = localStorage.getItem(STORAGE_SELECTED);
    this.currentId = stored && this.unlocked.has(stored)
      ? stored
      : [...this.unlocked][0] || this.faces[0]?.id;
  }

  current() {
    return this.byId.get(this.currentId) || null;
  }

  select(id) {
    if (!this.unlocked.has(id)) return false;
    this.currentId = id;
    localStorage.setItem(STORAGE_SELECTED, id);
    return true;
  }

  isUnlocked(id) {
    return this.unlocked.has(id);
  }

  coinsFor(id) {
    return this.coinCounts.get(id) || 0;
  }

  // Lifetime sum of every coin ever collected (across all colleagues).
  totalCoins() {
    let n = 0;
    for (const v of this.coinCounts.values()) n += v;
    return n;
  }

  // Helper for the home-screen portrait: returns an HTMLImageElement (loading
  // a fresh one from disk for file-backed faces, or a cloned canvas for
  // procedural placeholders).
  drawIntoCanvas(face, canvas) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!face) {
      ctx.fillStyle = '#1a1a3a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (face.file) {
      // File-backed: load the original via a fresh <img> to avoid CORS/canvas issues.
      const img = new Image();
      img.onload = () => {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = this._facesURL ? this._facesURL(face.file) : `./faces/${face.file}`;
      // Show a placeholder until the image loads.
      ctx.fillStyle = '#1a1a3a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    // Procedural placeholder: source is the canvas baked in faces.js — copy it.
    const src = face.texture?.baseTexture?.resource?.source;
    if (src instanceof HTMLCanvasElement) {
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#888';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Returns true if this collect just unlocked the face.
  collectCoin(id) {
    const count = (this.coinCounts.get(id) || 0) + 1;
    this.coinCounts.set(id, count);
    this._persistCoins();
    if (!this.unlocked.has(id) && count >= this.coinUnlockThreshold) {
      this.unlocked.add(id);
      this._persistUnlocked();
      return true;
    }
    return false;
  }

  pickRandomFaceId(rand) {
    if (this.faces.length === 0) return null;
    return this.faces[Math.floor(rand() * this.faces.length)].id;
  }

  _persistUnlocked() {
    localStorage.setItem(STORAGE_UNLOCKED, JSON.stringify([...this.unlocked]));
  }

  _persistCoins() {
    localStorage.setItem(STORAGE_COIN_COUNTS, JSON.stringify(Object.fromEntries(this.coinCounts)));
  }
}
