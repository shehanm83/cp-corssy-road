import * as PIXI from 'pixi.js';

import { Scene } from './scene.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { World } from './world.js';
import { FaceRegistry } from './faces.js';
import { Audio } from './audio.js';
import { Effects } from './effects.js';
import { SkyTalk } from './skytalk.js';
import { POWERUP_DEFS } from './powerups.js';
import { pickDeath } from './deaths.js';
import { pickIdleThought } from './milestones.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    // Crisp edges on hi-DPI screens, but cap on touch devices so we don't
    // chew GPU/battery rendering 3x pixels on a phone.
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const dpr = window.devicePixelRatio || 1;
    const resolution = isTouchDevice ? Math.min(dpr, 1.5) : dpr;
    this.app = new PIXI.Application({
      view: canvas,
      resizeTo: window,
      backgroundColor: 0x7ec0ee,
      antialias: true,
      resolution,
      autoDensity: true,
    });

    this.scene = new Scene(this.app);
    this.faces = new FaceRegistry();
    this.world = new World(this.scene, this.faces);
    this.player = new Player(this.scene);
    this.audio = new Audio();
    this.effects = new Effects(this.scene);
    this.skytalk = new SkyTalk(this.scene);

    this.scene.follow(this.player);

    this.player.canHop = (col, row) => this.world.canPlayerEnter(col, row);
    this.player.onAdvance = (newRow) => {
      this.world.onPlayerAdvance(newRow);
      this._resetIdle();
    };
    this.world.onDeath = (cause) => this.gameOver(cause);

    this.input = new Input((dx, dz) => {
      if (this.state !== 'playing') return;
      if (this.player.tryHop(dx, dz)) this.audio.hop();
    });

    this.player.onLand = () => {
      // Puff a little dust where the player just touched down.
      const p = this.player.container.position;
      this.effects.dust({ x: p.x, y: 0.05, z: p.z });
      // Any landed hop — forward, side, or back — proves the player is
      // alive and intentionally waiting/dodging; refresh the eagle timer.
      this._resetIdle();
    };
    this.world.onCoin = (faceId, justUnlocked) => {
      this.audio.coin();
      const p = this.player.container.position;
      this.effects.sparkle({ x: p.x, y: 0.55, z: p.z });
      if (justUnlocked) {
        this.audio.unlock();
        const el = document.getElementById('coins');
        if (el) {
          const face = this.faces.byId.get(faceId);
          el.textContent = `★ unlocked ${face?.name || faceId}!`;
          setTimeout(() => { if (el) el.textContent = `★ ${this.world.runCoins}`; }, 1800);
        }
      }
    };

    // Power-up plumbing.
    this._buffTimers = {};
    this.world.onPowerup = (defId) => this._applyPowerup(defId);
    this.world.onShieldConsumed = () => {
      this.audio.unlock();
      const p = this.player.container.position;
      this.effects.sparkle({ x: p.x, y: 0.5, z: p.z });
      this.effects.shakeCamera(0.20, 220);
      this._hideBuffHUD();
    };

    this.world.onMilestone = (m) => this._showMilestone(m);

    this.state = 'menu';
    this._idleMS = 0;          // ms since last forward advance
    this._idleEagleSpawn = null; // animation state for the eagle dive
    this.totalRuns = Number(localStorage.getItem('cp-retro.totalRuns') || 0);
    this.app.ticker.add(this._tick, this);
  }

  _resetIdle() {
    this._idleMS = 0;
    this._idleEagleSpawn = null;
    this._thoughtShown = false;
    this._hideThoughtBubble();
  }

  async init() {
    await this.faces.load();
  }

  applyCurrentFace() {
    const f = this.faces.current();
    if (f?.texture) this.player.setFaceTexture(f.texture);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.disable();
    this.audio.stopMusic();
    this.skytalk.disableToasts();
    document.getElementById('pause-overlay')?.classList.remove('hidden');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.enable();
    this.audio.startMusic();
    this.skytalk.enableToasts();
    document.getElementById('pause-overlay')?.classList.add('hidden');
  }

  start() {
    this.state = 'playing';
    this._resetIdle();
    this._clearAllBuffs();
    this.world.reset();
    this.scene.root.addChild(this.player.container);
    this.player._snapTo(0, 0);
    this.player.resetTransform();
    this.applyCurrentFace();
    this.input.enable();
    this.audio.ensureContext();
    this.audio.startMusic();
    this.skytalk.enableToasts();
  }

  _applyPowerup(defId) {
    const def = POWERUP_DEFS[defId];
    if (!def) return;
    const p = this.player.container.position;
    this.effects.sparkle({ x: p.x, y: 0.6, z: p.z });
    if (def.bad) {
      this.audio.death();   // ominous-sounding zap
      this.effects.shakeCamera(0.18, 200);
    } else {
      this.audio.coin();
    }

    switch (defId) {
      case 'espresso':
        this.player.hopDurationMul = 0.5;
        this._setBuffTimer('espresso', def.duration, () => { this.player.hopDurationMul = 1; });
        break;
      case 'pr':
        this.player.hasShield = true;
        // no timer — until consumed
        break;
      case 'ooo':
        this.player.invincible = true;
        this._setBuffTimer('ooo', def.duration, () => { this.player.invincible = false; });
        break;
      case 'bell':
        this.player.frozen = true;
        this._setBuffTimer('bell', def.duration, () => { this.player.frozen = false; });
        break;
    }
    this._showBuffHUD(def);
  }

  _setBuffTimer(id, durationMS, cleanup) {
    if (this._buffTimers[id]) clearTimeout(this._buffTimers[id]);
    this._buffTimers[id] = setTimeout(() => {
      cleanup();
      delete this._buffTimers[id];
      // Only hide HUD if the currently-displayed buff is the one that expired.
      const el = document.getElementById('buff-indicator');
      if (el && el.dataset.activeId === id) this._hideBuffHUD();
    }, durationMS);
  }

  _clearAllBuffs() {
    for (const id of Object.keys(this._buffTimers || {})) {
      clearTimeout(this._buffTimers[id]);
    }
    this._buffTimers = {};
    if (this.player) {
      this.player.frozen = false;
      this.player.invincible = false;
      this.player.hasShield = false;
      this.player.hopDurationMul = 1;
    }
    this._hideBuffHUD();
  }

  _showBuffHUD(def) {
    const el = document.getElementById('buff-indicator');
    if (!el) return;
    el.dataset.activeId = def.id;
    el.style.borderColor = def.color;
    document.getElementById('buff-icon').textContent = def.icon;
    document.getElementById('buff-label').textContent = def.label;
    el.classList.remove('hidden');
    // Animate the depletion bar — for PR (duration 0) the bar stays full.
    const bar = document.getElementById('buff-bar');
    bar.style.background = def.barColor || '#ffe44a';
    bar.style.transition = 'none';
    bar.style.width = '100%';
    // Force a layout flush then start the transition.
    void bar.offsetWidth;
    if (def.duration > 0) {
      bar.style.transition = `width ${def.duration}ms linear`;
      bar.style.width = '0%';
    }
  }

  _hideBuffHUD() {
    const el = document.getElementById('buff-indicator');
    if (el) {
      el.classList.add('hidden');
      el.dataset.activeId = '';
    }
  }

  gameOver(cause = 'squashed') {
    if (this.state === 'gameOver') return;
    this.state = 'gameOver';
    this.input.disable();
    this.audio.death();
    this.audio.stopMusic();
    this.skytalk.disableToasts();
    this._clearAllBuffs();
    // Visceral feedback: shake the camera, splat the player, puff some dust.
    this.effects.shakeCamera(0.45, 380);
    this.player.squash();
    const p = this.player.container.position;
    if (/drown|river|swept/i.test(cause)) {
      this.effects.splash({ x: p.x, y: -0.05, z: p.z });
    } else {
      this.effects.dust({ x: p.x, y: 0.1, z: p.z });
    }
    const isNewBest = this.world.finalize();
    this.totalRuns += 1;
    localStorage.setItem('cp-retro.totalRuns', String(this.totalRuns));

    document.getElementById('hud').classList.add('hidden');
    document.getElementById('death-cause').textContent = cause;
    document.getElementById('final-score').textContent = String(this.world.score);
    const bestEl = document.getElementById('gameover-best');
    if (bestEl) bestEl.textContent = String(this.world.bestScore);
    const nameEl = document.getElementById('gameover-name');
    const f = this.faces.current();
    if (nameEl) nameEl.textContent = f?.name || '—';
    const portrait = document.getElementById('gameover-portrait');
    if (portrait) this.faces.drawIntoCanvas(f, portrait);

    const overlay = document.getElementById('gameover-overlay');
    overlay.classList.toggle('newbest', isNewBest);
    const newBestEl = document.getElementById('new-best');
    if (newBestEl) newBestEl.classList.toggle('hidden', !isNewBest);
    overlay.classList.remove('hidden');
  }

  _tick() {
    const deltaMS = this.app.ticker.deltaMS;
    if (this.state === 'playing') {
      this.player.update(deltaMS);
      this.world.update(deltaMS, this.player);
      this._tickIdle(deltaMS);
      this.effects.update(deltaMS);
      this.skytalk.update(deltaMS, this.player);
    } else if (this.state === 'gameOver') {
      // Keep the squash animation + lingering particles going briefly.
      this.player.update(deltaMS);
      this.effects.update(deltaMS);
    }
    // Camera and shake render every frame so paused screens stay live.
    this.scene.update(deltaMS, this.effects.cameraShakeOffset());
  }

  _tickIdle(deltaMS) {
    // ~15s of zero input (no hops at all) → eagle. Any successful hop
    // resets this via player.onLand, so genuine dodging is safe.
    const IDLE_LIMIT_MS = 15000;
    const IDLE_THOUGHT_MS = 4500;
    this._idleMS += deltaMS;
    // Show a thought bubble once after a few seconds of standing still.
    if (!this._thoughtShown && this._idleMS > IDLE_THOUGHT_MS) {
      this._thoughtShown = true;
      this._showThoughtBubble(pickIdleThought());
    }
    if (this._idleMS > IDLE_LIMIT_MS) {
      this.gameOver(pickDeath('eagle'));
    }
  }

  _showMilestone(m) {
    this.audio.unlock();
    const el = document.getElementById('milestone-toast');
    if (!el) return;
    document.getElementById('milestone-title').textContent = m.title;
    document.getElementById('milestone-row').textContent = `row ${m.row}`;
    el.classList.remove('hidden');
    // Replay fade-in by toggling a class — animate via CSS transitions.
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, 12px) scale(0.92)';
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%, 0) scale(1)';
    });
    if (this._milestoneHideT) clearTimeout(this._milestoneHideT);
    this._milestoneHideT = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, -16px) scale(0.95)';
      setTimeout(() => el.classList.add('hidden'), 600);
    }, 2200);
  }

  _showThoughtBubble(text) {
    const el = document.getElementById('thought-bubble');
    if (!el) return;
    document.getElementById('thought-text').textContent = text;
    el.classList.remove('hidden');
    el.style.opacity = '1';
    if (this._thoughtHideT) clearTimeout(this._thoughtHideT);
    this._thoughtHideT = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.classList.add('hidden'), 500);
    }, 2500);
  }

  _hideThoughtBubble() {
    const el = document.getElementById('thought-bubble');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => el.classList.add('hidden'), 300);
  }
}
