import { Mesh3D, Container3D } from 'pixi3d/pixi7';
import { TILE, PALETTE, HALF_WIDTH, flatMaterial } from '../scene.js';
import { FaceCoin } from '../coins.js';

// Shared material cache — flat colors used across many rows.
const matCache = new Map();
export function cachedMat(hex) {
  if (!matCache.has(hex)) matCache.set(hex, flatMaterial(hex));
  return matCache.get(hex);
}

const COIN_SPAWN_CHANCE = 0.18;

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

    // Maybe spawn a face-coin. Skip the very first rows where the player spawns.
    this.coin = null;
    const faces = opts.faces;
    if (faces && rowIndex > 3 && rand() < COIN_SPAWN_CHANCE) {
      // Bias toward a locked face so collecting helps unlock something new.
      const lockedFaces = faces.faces.filter((f) => !faces.isUnlocked(f.id));
      const pool = lockedFaces.length > 0 ? lockedFaces : faces.faces;
      const face = pool[Math.floor(rand() * pool.length)];
      const col = Math.floor(rand() * (HALF_WIDTH * 2 + 1)) - HALF_WIDTH;
      this.coin = new FaceCoin(this.container, face, col);
    }
  }

  update(deltaMS) {
    if (this.coin) this.coin.update(deltaMS);
  }

  canEnter(col) {
    return col >= -HALF_WIDTH && col <= HALF_WIDTH;
  }

  checkCollision(player) {
    if (this.coin && !this.coin.collected) {
      const pz = player.container.position.z;
      if (Math.abs(pz - this.rowIndex) < 0.5 && this.coin.checkPickup(player)) {
        // Bubble up the picked face id; world will route it.
        return { _coin: { faceId: this.coin.faceEntry.id, value: this.coin.value } };
      }
    }
    return null;
  }

  destroy() {
    if (this.coin) this.coin.destroy();
    if (this.container.parent) this.container.parent.removeChild(this.container);
  }
}
