// Ambient flavour: drifting code-comment banners in the 3D sky and
// occasional Slack-style notification toasts in the corner of the screen.

import * as PIXI from 'pixi.js';
import {
  Mesh3D,
  StandardMaterial,
  StandardMaterialAlphaMode,
  Color,
} from 'pixi3d/pixi7';

// --- Sky comment banners (3D) -------------------------------------------

const COMMENT_TEXTS = [
  '// TODO: refactor',
  '// works on my machine',
  '// why is this broken?',
  '// fix later, promise',
  '// HACK: do not touch',
  '// no time to test',
  '// magic number',
  'git push --force',
  'git commit -m "wip"',
  'merge conflict :(',
  'console.log("HERE")',
  'console.log("ok??")',
  'npm ERR! pls',
  'LGTM ship it',
  'PR #4271',
  '"it works in prod"',
  '"just a small change"',
  'standup in 5 min',
  'rollback. now.',
  'who pushed to main',
];

const COMMENT_TEX_W = 768;
const COMMENT_TEX_H = 110;

function paintComment(ctx, text, mirror) {
  ctx.clearRect(0, 0, COMMENT_TEX_W, COMMENT_TEX_H);
  ctx.save();
  if (mirror) {
    ctx.translate(COMMENT_TEX_W, 0);
    ctx.scale(-1, 1);
  }
  ctx.font = 'bold 48px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Dark outline for legibility against the sky.
  ctx.strokeStyle = 'rgba(0, 20, 40, 0.55)';
  ctx.lineWidth = 6;
  ctx.strokeText(text, COMMENT_TEX_W / 2, COMMENT_TEX_H / 2);
  // White fill.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillText(text, COMMENT_TEX_W / 2, COMMENT_TEX_H / 2);
  ctx.restore();
}

function makeCommentTexture(text, mirror) {
  const c = document.createElement('canvas');
  c.width = COMMENT_TEX_W;
  c.height = COMMENT_TEX_H;
  const ctx = c.getContext('2d');
  paintComment(ctx, text, mirror);
  return PIXI.Texture.from(c);
}

function commentMaterial(texture) {
  const m = new StandardMaterial();
  m.baseColor = new Color(1, 1, 1, 1);
  m.unlit = true;
  m.alphaMode = StandardMaterialAlphaMode.blend;
  m.doubleSided = true;
  m.baseColorTexture = texture;
  return m;
}

class FloatingBanner {
  constructor(scene, textures) {
    this._mat = commentMaterial(textures[0]);
    const plane = Mesh3D.createPlane();
    plane.material = this._mat;
    plane.scale.set(1.4, 1, 0.20);          // wide ribbon
    plane.rotationQuaternion.setEulerAngles(90, 0, 0);
    plane.position.set(0, 5, 0);
    scene.root.addChild(plane);
    this.mesh = plane;
    this.textures = textures;
    this.x = 0;
    this.y = 5;
    this.zOff = 14;                          // distance ahead of player
    this.speed = 0.6;
  }

  randomise(rng) {
    this.x = (rng() - 0.5) * 36;             // -18..+18 along the road
    this.y = 4.2 + rng() * 2.6;              // 4.2..6.8 high in the sky
    this.zOff = 11 + rng() * 9;              // 11..20 ahead of player
    this.speed = (rng() > 0.5 ? 1 : -1) * (0.45 + rng() * 1.0);
    const idx = Math.floor(rng() * this.textures.length);
    this._mat.baseColorTexture = this.textures[idx];
  }

  update(deltaMS, playerZ) {
    this.x += this.speed * (deltaMS / 1000);
    if (this.x > 22 || this.x < -22) {
      this.randomise(Math.random);
      // Push it back to the leading edge so it doesn't pop out.
      this.x = this.speed > 0 ? -22 : 22;
    }
    this.mesh.position.set(this.x, this.y, playerZ + this.zOff);
  }
}

// --- Notification toasts (DOM) ------------------------------------------

const TOASTS = [
  { icon: '📧', text: 'Slack (3 new)' },
  { icon: '📅', text: 'Standup in 5 min' },
  { icon: '🔔', text: 'PR #4271 approved' },
  { icon: '💬', text: '@here who deployed?' },
  { icon: '⚠',  text: 'production alert' },
  { icon: '📊', text: 'Sprint review @ 3pm' },
  { icon: '☕', text: 'Coffee break?' },
  { icon: '🚨', text: 'incident triggered' },
  { icon: '🏷',  text: 'JIRA mentioned you' },
  { icon: '🟢', text: 'build passed' },
  { icon: '🔴', text: 'build broke' },
  { icon: '🤝', text: 'pair programming?' },
  { icon: '📦', text: 'release v2.4.1 cut' },
  { icon: '💤', text: 'remember to log off' },
  { icon: '🎯', text: 'sprint goal updated' },
];

class ToastFeed {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'toast-feed';
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '70px',
      right: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      zIndex: '20',
      pointerEvents: 'none',
      fontFamily: '"Courier New", ui-monospace, monospace',
      fontSize: '13px',
      color: '#fff',
    });
    document.body.appendChild(this.el);
    this._enabled = false;
    this._nextMS = 4000;
    this._elapsedMS = 0;
  }

  enable()  { this._enabled = true;  this._scheduleNext(); }
  disable() { this._enabled = false; this._elapsedMS = 0; }

  _scheduleNext() {
    this._nextMS = 6000 + Math.random() * 10000;
    this._elapsedMS = 0;
  }

  _show() {
    const t = TOASTS[Math.floor(Math.random() * TOASTS.length)];
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: 'rgba(20, 30, 50, 0.85)',
      border: '2px solid #3355cc',
      padding: '6px 10px 6px 8px',
      maxWidth: '220px',
      textShadow: '1px 1px 0 #000',
      transform: 'translateX(260px)',
      transition: 'transform 320ms ease-out, opacity 600ms ease-out',
      opacity: '1',
    });
    card.innerHTML = `<span style="margin-right:6px;">${t.icon}</span>${t.text}`;
    this.el.appendChild(card);
    // slide-in
    requestAnimationFrame(() => { card.style.transform = 'translateX(0)'; });
    setTimeout(() => {
      card.style.opacity = '0';
      card.style.transform = 'translateX(260px)';
    }, 3200);
    setTimeout(() => card.remove(), 4200);
  }

  update(deltaMS) {
    if (!this._enabled) return;
    this._elapsedMS += deltaMS;
    if (this._elapsedMS >= this._nextMS) {
      this._show();
      this._scheduleNext();
    }
  }

  clear() {
    while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
  }
}

// --- Public façade -------------------------------------------------------

export class SkyTalk {
  constructor(scene) {
    this.scene = scene;
    // Pre-build all comment textures up front so we never hitch mid-game.
    this._textures = COMMENT_TEXTS.map((t) => makeCommentTexture(t, true));
    this.banners = [];
    for (let i = 0; i < 4; i++) {
      const b = new FloatingBanner(scene, this._textures);
      b.randomise(Math.random);
      b.x = (Math.random() - 0.5) * 30;
      this.banners.push(b);
    }
    this.toasts = new ToastFeed();
  }

  enableToasts()  { this.toasts.enable(); }
  disableToasts() { this.toasts.disable(); this.toasts.clear(); }

  update(deltaMS, player) {
    const pz = player?.container?.position?.z ?? 0;
    for (const b of this.banners) b.update(deltaMS, pz);
    this.toasts.update(deltaMS);
  }
}
