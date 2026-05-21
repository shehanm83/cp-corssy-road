import { GrassRow } from './biomes/grass.js';
import { RoadRow } from './biomes/road.js';
import { TracksRow } from './biomes/tracks.js';
import { RiverRow } from './biomes/river.js';

const ROWS_AHEAD = 25;
const ROWS_BEHIND = 6;

// Biome weights for the row picker.
const BIOME_WEIGHTS = [
  { type: 'grass',  weight: 28, minRun: 1, maxRun: 3 },
  { type: 'road',   weight: 30, minRun: 1, maxRun: 4 },
  { type: 'tracks', weight: 12, minRun: 1, maxRun: 2 },
  { type: 'river',  weight: 25, minRun: 1, maxRun: 5 },
];

// mulberry32
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRow(scene, type, rowIndex, rand, opts) {
  switch (type) {
    case 'grass':  return new GrassRow(scene, rowIndex, rand, opts);
    case 'road':   return new RoadRow(scene, rowIndex, rand);
    case 'tracks': return new TracksRow(scene, rowIndex, rand);
    case 'river':  return new RiverRow(scene, rowIndex, rand);
    default:       return new GrassRow(scene, rowIndex, rand, opts);
  }
}

const STORAGE_BEST = 'cp-retro.bestScore';

export class World {
  constructor(scene, faces) {
    this.scene = scene;
    this.faces = faces;          // FaceRegistry for coin spawning + unlocking
    this.rows = new Map();
    this.score = 0;
    this.runCoins = 0;
    this.bestScore = Number(localStorage.getItem(STORAGE_BEST) || 0);
    this._rand = rng(Date.now() & 0xffffffff);
    this._nextRowToSpawn = 0;
    this._farthestPlayerRow = 0;
    this._currentRun = null;     // { type, remaining } — biome streak state
    this.onDeath = null;
    this.onCoin = null;          // (faceId, justUnlocked) => void
    this._updateBestHUD();
  }

  // Returns true if score is a new personal best.
  finalize() {
    const isNewBest = this.score > this.bestScore;
    if (isNewBest) {
      this.bestScore = this.score;
      localStorage.setItem(STORAGE_BEST, String(this.bestScore));
      this._updateBestHUD();
    }
    return isNewBest;
  }

  _updateBestHUD() {
    const el = document.getElementById('high-score');
    if (el) el.textContent = `BEST ${this.bestScore}`;
  }

  reset(seed) {
    for (const r of this.rows.values()) r.destroy();
    this.rows.clear();
    this.score = 0;
    this.runCoins = 0;
    this._farthestPlayerRow = 0;
    this._nextRowToSpawn = -ROWS_BEHIND;
    this._currentRun = null;
    this._rand = rng((seed ?? Date.now()) & 0xffffffff);
    this._updateScoreHUD();
    this._updateCoinHUD();

    // Always make the first few rows safe grass so the player has spawn room.
    for (let i = 0; i < ROWS_BEHIND + 4; i++) this._spawnGrass();
    for (let i = 0; i < ROWS_AHEAD - 4; i++) this._spawnNext();
  }

  _spawnGrass() {
    const idx = this._nextRowToSpawn++;
    const row = new GrassRow(this.scene, idx, this._rand, { faces: this.faces });
    this.rows.set(idx, row);
  }

  _pickBiome() {
    // Continue an existing biome run?
    if (this._currentRun && this._currentRun.remaining > 0) {
      this._currentRun.remaining--;
      return this._currentRun.type;
    }
    // Pick a new biome by weight.
    const total = BIOME_WEIGHTS.reduce((s, b) => s + b.weight, 0);
    let r = this._rand() * total;
    let chosen = BIOME_WEIGHTS[0];
    for (const b of BIOME_WEIGHTS) {
      r -= b.weight;
      if (r <= 0) { chosen = b; break; }
    }
    const runLen = chosen.minRun + Math.floor(this._rand() * (chosen.maxRun - chosen.minRun + 1));
    this._currentRun = { type: chosen.type, remaining: runLen - 1 };
    return chosen.type;
  }

  _spawnNext() {
    const idx = this._nextRowToSpawn++;
    const type = this._pickBiome();
    const row = makeRow(this.scene, type, idx, this._rand, {
      faces: this.faces,
      score: this._farthestPlayerRow,
    });
    this.rows.set(idx, row);
  }

  _recycleBehind(playerRow) {
    const cutoff = playerRow - ROWS_BEHIND;
    for (const [idx, row] of this.rows) {
      if (idx < cutoff) {
        row.destroy();
        this.rows.delete(idx);
      }
    }
  }

  canPlayerEnter(col, row) {
    const r = this.rows.get(row);
    if (!r) return false;
    return r.canEnter(col);
  }

  onPlayerAdvance(newRow) {
    if (newRow > this._farthestPlayerRow) {
      this._farthestPlayerRow = newRow;
      this.score = newRow;
      this._updateScoreHUD();
      while (this._nextRowToSpawn < newRow + ROWS_AHEAD) this._spawnNext();
      this._recycleBehind(newRow);
    }
  }

  _updateScoreHUD() {
    const el = document.getElementById('score');
    if (el) el.textContent = String(this.score);
  }

  _updateCoinHUD() {
    const el = document.getElementById('coins');
    if (el) el.textContent = `★ ${this.runCoins}`;
  }

  // Returns either a death-cause string, a coin-pickup object, or null.
  _sweepCollisions(player) {
    const pz = Math.round(player.container.position.z);
    for (const idx of [pz - 1, pz, pz + 1]) {
      const row = this.rows.get(idx);
      if (!row) continue;
      const result = row.checkCollision(player);
      if (!result) continue;
      if (typeof result === 'string') return { death: result };
      if (result._coin) return { coin: result._coin };
    }
    return null;
  }

  update(deltaMS, player) {
    for (const row of this.rows.values()) row.update(deltaMS, player);
    if (!player) return;
    const r = this._sweepCollisions(player);
    if (!r) return;
    if (r.death && this.onDeath) {
      this.onDeath(r.death);
    } else if (r.coin) {
      this.runCoins += 1;
      this._updateCoinHUD();
      const justUnlocked = this.faces ? this.faces.collectCoin(r.coin.faceId) : false;
      if (this.onCoin) this.onCoin(r.coin.faceId, justUnlocked);
    }
  }
}
