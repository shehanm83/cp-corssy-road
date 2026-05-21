import * as PIXI from 'pixi.js';
import {
  Mesh3D,
  Container3D,
  StandardMaterial,
  StandardMaterialAlphaMode,
  Color,
} from 'pixi3d/pixi7';

// ---------- Definitions ----------

export const POWERUP_DEFS = {
  espresso: {
    id: 'espresso',
    icon: '☕',
    color: '#7a4a22',
    label: 'ESPRESSO SHOT',
    barColor: '#d49a4a',
    duration: 4000,
    good: true,
  },
  pr: {
    id: 'pr',
    icon: '✓',
    color: '#22aa55',
    label: 'PR APPROVED',
    barColor: '#86e699',
    duration: 0, // 0 = until consumed
    good: true,
  },
  ooo: {
    id: 'ooo',
    icon: '🌴',
    color: '#ffbb44',
    label: 'OUT OF OFFICE',
    barColor: '#ffe44a',
    duration: 3000,
    good: true,
  },
  bell: {
    id: 'bell',
    icon: '🔔',
    color: '#cc3344',
    label: 'STANDUP! (frozen)',
    barColor: '#ff7788',
    duration: 2000,
    bad: true,
  },
};

const POWERUP_WEIGHTS = [
  { id: 'espresso', weight: 32 },
  { id: 'pr',       weight: 18 },
  { id: 'ooo',      weight: 18 },
  { id: 'bell',     weight: 32 },
];

export function pickPowerupDef(rand) {
  const total = POWERUP_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let r = rand() * total;
  for (const w of POWERUP_WEIGHTS) {
    r -= w.weight;
    if (r <= 0) return POWERUP_DEFS[w.id];
  }
  return POWERUP_DEFS.espresso;
}

// ---------- Icon texture cache ----------

const ICON_TEX_SIZE = 128;
const _iconTexCache = new Map();

function makeIconTexture(symbol) {
  if (_iconTexCache.has(symbol)) return _iconTexCache.get(symbol);
  const c = document.createElement('canvas');
  c.width = ICON_TEX_SIZE;
  c.height = ICON_TEX_SIZE;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, ICON_TEX_SIZE, ICON_TEX_SIZE);
  // Big emoji centred in the canvas; rely on the host OS emoji font.
  ctx.font = `${Math.floor(ICON_TEX_SIZE * 0.78)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // White halo so dark icons stay legible against any backdrop.
  ctx.fillStyle = '#ffffff';
  ctx.fillText(symbol, ICON_TEX_SIZE / 2 + 1, ICON_TEX_SIZE / 2 + 6);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(symbol, ICON_TEX_SIZE / 2, ICON_TEX_SIZE / 2 + 5);
  const tex = PIXI.Texture.from(c);
  _iconTexCache.set(symbol, tex);
  return tex;
}

// ---------- Pickup entity ----------

const BOB_HEIGHT = 0.10;
const SPIN_DEG_PER_SEC = 120;

export class PowerUp {
  constructor(parent, def, col) {
    this.def = def;
    this.col = col;
    this.collected = false;
    this._t = 0;

    this.container = new Container3D();
    this.container.position.set(col, 0.55, 0);

    // Coloured base cube — colour conveys good/bad/type at a glance.
    const base = Mesh3D.createCube();
    const baseMat = new StandardMaterial();
    baseMat.baseColor = Color.fromHex(def.color);
    baseMat.unlit = true;
    base.material = baseMat;
    base.scale.set(0.18, 0.18, 0.18);
    this.container.addChild(base);

    // Icon plane mounted vertically above the cube, doubleSided for both views.
    const icon = Mesh3D.createPlane();
    const iconMat = new StandardMaterial();
    iconMat.baseColor = new Color(1, 1, 1, 1);
    iconMat.unlit = true;
    iconMat.alphaMode = StandardMaterialAlphaMode.blend;
    iconMat.doubleSided = true;
    iconMat.baseColorTexture = makeIconTexture(def.icon);
    icon.material = iconMat;
    icon.scale.set(0.17, 1, 0.17);
    icon.position.set(0, 0.32, 0);
    icon.rotationQuaternion.setEulerAngles(90, 0, 0);
    this.container.addChild(icon);

    parent.addChild(this.container);
  }

  update(deltaMS) {
    if (this.collected) return;
    this._t += deltaMS;
    const sec = this._t / 1000;
    this.container.position.y = 0.55 + Math.sin(sec * 3) * BOB_HEIGHT;
    this.container.rotationQuaternion.setEulerAngles(0, sec * SPIN_DEG_PER_SEC, 0);
  }

  checkPickup(player) {
    if (this.collected) return false;
    const px = player.container.position.x;
    if (Math.abs(px - this.col) > 0.45) return false;
    this.collected = true;
    this.container.visible = false;
    return true;
  }

  destroy() {
    if (this.container.parent) this.container.parent.removeChild(this.container);
  }
}
