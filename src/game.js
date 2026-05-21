import * as PIXI from 'pixi.js';

import { Scene } from './scene.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { World } from './world.js';
import { FaceRegistry } from './faces.js';
import { Audio } from './audio.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.app = new PIXI.Application({
      view: canvas,
      resizeTo: window,
      backgroundColor: 0x7ec0ee,
      antialias: true,
    });

    this.scene = new Scene(this.app);
    this.faces = new FaceRegistry();
    this.world = new World(this.scene, this.faces);
    this.player = new Player(this.scene);
    this.audio = new Audio();

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

    this.player.onLand = () => { /* hop sfx is on tryHop; landing kept as a hook */ };
    this.world.onCoin = (faceId, justUnlocked) => {
      this.audio.coin();
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

    this.state = 'menu';
    this._idleMS = 0;          // ms since last forward advance
    this._idleEagleSpawn = null; // animation state for the eagle dive
    this.app.ticker.add(this._tick, this);
  }

  _resetIdle() {
    this._idleMS = 0;
    this._idleEagleSpawn = null;
  }

  async init() {
    await this.faces.load();
  }

  applyCurrentFace() {
    const f = this.faces.current();
    if (f?.texture) this.player.setFaceTexture(f.texture);
  }

  start() {
    this.state = 'playing';
    this._resetIdle();
    this.world.reset();
    this.scene.root.addChild(this.player.container);
    this.player._snapTo(0, 0);
    this.applyCurrentFace();
    this.input.enable();
    this.audio.ensureContext();
    this.audio.startMusic();
  }

  gameOver(cause = 'squashed') {
    if (this.state === 'gameOver') return;
    this.state = 'gameOver';
    this.input.disable();
    this.audio.death();
    this.audio.stopMusic();
    const isNewBest = this.world.finalize();
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('death-cause').textContent = cause;
    const finalScoreEl = document.getElementById('final-score');
    finalScoreEl.textContent = String(this.world.score);
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
    }
    this.scene.update(deltaMS);
  }

  _tickIdle(deltaMS) {
    // After ~10s without advancing forward, an eagle takes you.
    const IDLE_LIMIT_MS = 10000;
    this._idleMS += deltaMS;
    if (this._idleMS > IDLE_LIMIT_MS) {
      this.gameOver('the eagle got you');
    }
  }
}
