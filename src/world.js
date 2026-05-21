import { GrassRow } from './biomes/grass.js';
import { RoadRow } from './biomes/road.js';
import { TracksRow } from './biomes/tracks.js';
import { RiverRow } from './biomes/river.js';
import { MILESTONES } from './milestones.js';

const ROWS_AHEAD = 25;
const ROWS_BEHIND = 6;

// Difficulty tiers — keyed by the row's depth (== score the player will have
// when they reach it). Earlier rows use safer biome mixes with shorter runs;
// later rows open up river/track chaos. The first tier is intentionally
// grass+road only so the player can get into the rhythm before drowning.
const BIOME_TIERS = [
  {
    minDepth: 0,
    weights: [
      { type: 'grass', weight: 55, minRun: 1, maxRun: 3 },
      { type: 'road',  weight: 45, minRun: 1, maxRun: 2 },
    ],
  },
  {
    minDepth: 15,
    weights: [
      { type: 'grass',  weight: 40, minRun: 1, maxRun: 3 },
      { type: 'road',   weight: 38, minRun: 1, maxRun: 3 },
      { type: 'tracks', weight: 8,  minRun: 1, maxRun: 1 },
      { type: 'river',  weight: 14, minRun: 1, maxRun: 2 },
    ],
  },
  {
    minDepth: 40,
    weights: [
      { type: 'grass',  weight: 30, minRun: 1, maxRun: 3 },
      { type: 'road',   weight: 32, minRun: 1, maxRun: 4 },
      { type: 'tracks', weight: 13, minRun: 1, maxRun: 2 },
      { type: 'river',  weight: 25, minRun: 1, maxRun: 3 },
    ],
  },
  {
    minDepth: 80,
    weights: [
      { type: 'grass',  weight: 24, minRun: 1, maxRun: 2 },
      { type: 'road',   weight: 32, minRun: 1, maxRun: 4 },
      { type: 'tracks', weight: 16, minRun: 1, maxRun: 2 },
      { type: 'river',  weight: 28, minRun: 1, maxRun: 5 },
    ],
  },
];

function tierForDepth(depth) {
  let chosen = BIOME_TIERS[0];
  for (const t of BIOME_TIERS) {
    if (depth >= t.minDepth) chosen = t;
  }
  return chosen.weights;
}

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
    this.onPowerup = null;       // (defId) => void
    this.onShieldConsumed = null;// () => void — fired when PR APPROVED absorbs a death
    this.onMilestone = null;     // (milestoneDef) => void
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
    // Pick a new biome by weight from the tier matching the upcoming row's depth.
    // Forbid back-to-back runs of the same type so you don't get road, road,
    // road forever — at worst the second road run rolls again next time.
    const tier = tierForDepth(this._nextRowToSpawn);
    const lastType = this._currentRun?.type;
    let eligible = lastType ? tier.filter((b) => b.type !== lastType) : tier;
    if (eligible.length === 0) eligible = tier;

    const total = eligible.reduce((s, b) => s + b.weight, 0);
    let r = this._rand() * total;
    let chosen = eligible[0];
    for (const b of eligible) {
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
      const prev = this._farthestPlayerRow;
      this._farthestPlayerRow = newRow;
      this.score = newRow;
      this._updateScoreHUD();
      while (this._nextRowToSpawn < newRow + ROWS_AHEAD) this._spawnNext();
      this._recycleBehind(newRow);
      // Career milestones crossed this hop — fires once per milestone per run.
      if (this.onMilestone) {
        for (const m of MILESTONES) {
          if (prev < m.row && m.row <= newRow) this.onMilestone(m);
        }
      }
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

  _sweepCollisions(player) {
    const pz = Math.round(player.container.position.z);
    for (const idx of [pz - 1, pz, pz + 1]) {
      const row = this.rows.get(idx);
      if (!row) continue;
      const result = row.checkCollision(player);
      if (!result) continue;
      if (typeof result === 'string') return { death: result };
      if (result._coin) return { coin: result._coin };
      if (result._powerup) return { powerup: result._powerup };
    }
    return null;
  }

  update(deltaMS, player) {
    for (const row of this.rows.values()) row.update(deltaMS, player);
    if (!player) return;
    const r = this._sweepCollisions(player);
    if (!r) return;
    if (r.death) {
      // OUT OF OFFICE → pass through.
      if (player.invincible) return;
      // PR APPROVED → consume the shield, no death.
      if (player.hasShield) {
        player.hasShield = false;
        if (this.onShieldConsumed) this.onShieldConsumed();
        return;
      }
      if (this.onDeath) this.onDeath(r.death);
    } else if (r.coin) {
      this.runCoins += 1;
      this._updateCoinHUD();
      const justUnlocked = this.faces ? this.faces.collectCoin(r.coin.faceId) : false;
      if (this.onCoin) this.onCoin(r.coin.faceId, justUnlocked);
    } else if (r.powerup) {
      if (this.onPowerup) this.onPowerup(r.powerup.defId);
    }
  }
}
