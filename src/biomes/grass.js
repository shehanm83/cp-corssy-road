import { Mesh3D, Container3D } from 'pixi3d/pixi7';
import { TILE, PALETTE, HALF_WIDTH, flatMaterial } from '../scene.js';
import { FaceCoin } from '../coins.js';
import { PowerUp, pickPowerupDef } from '../powerups.js';
import { Tree, Dog } from '../scenery.js';

// Shared material cache — flat colors used across many rows.
const matCache = new Map();
export function cachedMat(hex) {
  if (!matCache.has(hex)) matCache.set(hex, flatMaterial(hex));
  return matCache.get(hex);
}

const COIN_SPAWN_CHANCE = 0.15;
const POWERUP_SPAWN_CHANCE = 0.07;
const TREE_PROB_PER_TILE = 0.07;   // each playable col has this chance to grow a tree
const MAX_TREES_PER_ROW = 2;       // never block more than 2 cols out of 11
const DOG_SPAWN_CHANCE = 0.10;

export class GrassRow {
  constructor(scene, rowIndex, rand, opts = {}) {
    this.scene = scene;
    this.rowIndex = rowIndex;
    this.type = 'grass';
    this.container = new Container3D();
    this.container.position.set(0, 0, rowIndex * TILE);
    scene.root.addChild(this.container);

    const m = cachedMat(rowIndex % 2 === 0 ? PALETTE.grassA : PALETTE.grassB);
    for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x++) {
      const tile = Mesh3D.createCube();
      tile.material = m;
      tile.scale.set(TILE * 0.5, 0.1, TILE * 0.5);
      tile.position.set(x * TILE, -0.1, 0);
      this.container.addChild(tile);
    }

    // Maybe spawn a collectible (coin OR powerup). Skip the first few rows.
    this.coin = null;
    this.powerup = null;
    this._blockedCols = new Set();
    this._scenery = [];

    if (rowIndex > 3) {
      const r = rand();
      const faces = opts.faces;
      if (faces && r < COIN_SPAWN_CHANCE) {
        const lockedFaces = faces.faces.filter((f) => !faces.isUnlocked(f.id));
        const pool = lockedFaces.length > 0 ? lockedFaces : faces.faces;
        const face = pool[Math.floor(rand() * pool.length)];
        const col = Math.floor(rand() * (HALF_WIDTH * 2 + 1)) - HALF_WIDTH;
        this.coin = new FaceCoin(this.container, face, col);
      } else if (r < COIN_SPAWN_CHANCE + POWERUP_SPAWN_CHANCE) {
        const def = pickPowerupDef(rand);
        const col = Math.floor(rand() * (HALF_WIDTH * 2 + 1)) - HALF_WIDTH;
        this.powerup = new PowerUp(this.container, def, col);
      }

      // Trees on a random subset of columns. Never plant on the col holding a
      // coin/powerup, and cap the total so the row can still be crossed.
      const occupiedCol = this.coin?.col ?? this.powerup?.col ?? null;
      let plantedCount = 0;
      for (let col = -HALF_WIDTH; col <= HALF_WIDTH && plantedCount < MAX_TREES_PER_ROW; col++) {
        if (col === occupiedCol) continue;
        if (rand() >= TREE_PROB_PER_TILE) continue;
        this._blockedCols.add(col);
        const tree = new Tree(rand);
        tree.container.position.set(col * TILE, 0, (rand() - 0.5) * 0.25);
        this.container.addChild(tree.container);
        this._scenery.push(tree);
        plantedCount++;
      }

      // Maybe drop a dog on this grass row — passable, just decorative.
      if (rand() < DOG_SPAWN_CHANCE) {
        const dog = new Dog(rand);
        const xOff = (rand() - 0.5) * (HALF_WIDTH * 2 + 0.6);
        const zOff = (rand() - 0.5) * 0.4;
        dog.container.position.set(xOff, 0, zOff);
        this.container.addChild(dog.container);
        this._scenery.push(dog);
      }
    }
  }

  update(deltaMS) {
    if (this.coin) this.coin.update(deltaMS);
    if (this.powerup) this.powerup.update(deltaMS);
    for (const s of this._scenery) s.update(deltaMS);
  }

  canEnter(col) {
    if (col < -HALF_WIDTH || col > HALF_WIDTH) return false;
    if (this._blockedCols.has(col)) return false;   // tree in the way
    return true;
  }

  checkCollision(player) {
    const pz = player.container.position.z;
    const onThisRow = Math.abs(pz - this.rowIndex) < 0.5;
    if (!onThisRow) return null;
    if (this.coin && !this.coin.collected && this.coin.checkPickup(player)) {
      return { _coin: { faceId: this.coin.faceEntry.id, value: this.coin.value } };
    }
    if (this.powerup && !this.powerup.collected && this.powerup.checkPickup(player)) {
      return { _powerup: { defId: this.powerup.def.id } };
    }
    return null;
  }

  destroy() {
    if (this.coin) this.coin.destroy();
    if (this.powerup) this.powerup.destroy();
    if (this.container.parent) this.container.parent.removeChild(this.container);
  }
}
