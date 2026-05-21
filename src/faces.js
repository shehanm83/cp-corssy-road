import * as PIXI from 'pixi.js';

const FACE_TEX_SIZE = 128;
const STORAGE_SELECTED = 'cp-retro.face.selected';
const STORAGE_UNLOCKED = 'cp-retro.face.unlocked';
const STORAGE_COIN_COUNTS = 'cp-retro.face.coins';

// Draws a small cartoon face onto a canvas — used when no real PNG is supplied.
function drawPlaceholderFace(ctx, p) {
  const W = FACE_TEX_SIZE;
  const H = FACE_TEX_SIZE;
  const skin = p.skin || '#f4d9b8';
  const hair = p.hair || '#5a3a22';
  const eyes = p.eyes || '#222222';
  const mouth = p.mouth || '#aa3344';

  // Skin background
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, W, H);

  // Hair (top band + slight fringe)
  ctx.fillStyle = hair;
  ctx.fillRect(0, 0, W, Math.floor(H * 0.30));
  ctx.fillRect(0, Math.floor(H * 0.30), Math.floor(W * 0.18), Math.floor(H * 0.08));
  ctx.fillRect(Math.floor(W * 0.82), Math.floor(H * 0.30), Math.floor(W * 0.18), Math.floor(H * 0.08));

  // Eyes (square pixel-art)
  const eyeW = Math.floor(W * 0.14);
  const eyeH = Math.floor(H * 0.12);
  const eyeY = Math.floor(H * 0.45);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.floor(W * 0.22), eyeY, eyeW, eyeH);
  ctx.fillRect(Math.floor(W * 0.64), eyeY, eyeW, eyeH);
  ctx.fillStyle = eyes;
  ctx.fillRect(Math.floor(W * 0.26), eyeY + 2, eyeW - 6, eyeH - 4);
  ctx.fillRect(Math.floor(W * 0.68), eyeY + 2, eyeW - 6, eyeH - 4);

  // Nose
  ctx.fillStyle = `rgba(0,0,0,0.18)`;
  ctx.fillRect(Math.floor(W * 0.47), Math.floor(H * 0.60), Math.floor(W * 0.06), Math.floor(H * 0.10));

  // Mouth (smile)
  ctx.fillStyle = mouth;
  ctx.fillRect(Math.floor(W * 0.32), Math.floor(H * 0.78), Math.floor(W * 0.36), Math.floor(H * 0.06));
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
    const res = await fetch('/faces/manifest.json');
    this.manifest = await res.json();
    this.coinUnlockThreshold = this.manifest.coinUnlockThreshold ?? 8;

    for (const f of this.manifest.faces) {
      const tex = f.file
        ? await PIXI.Assets.load(`/faces/${f.file}`)
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
