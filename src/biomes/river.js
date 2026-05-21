import { Mesh3D, Container3D } from 'pixi3d/pixi7';
import { TILE, PALETTE, HALF_WIDTH } from '../scene.js';
import { cachedMat } from './grass.js';

const LOG_HALF_WIDTH = 0.42;       // along Z (row depth)
const LOG_LENGTHS = [1, 2, 3];     // tiles long
const PLAYER_HALF_WIDTH = 0.30;
const LOG_WRAP = HALF_WIDTH + 3.5;

class Log {
  constructor(parent, lengthTiles, speed, direction) {
    this.lengthTiles = lengthTiles;
    this.speed = speed;
    this.direction = direction;
    this.position = 0;
    this.container = new Container3D();

    const body = Mesh3D.createCube();
    body.material = cachedMat('#7a4a22');
    body.scale.set(lengthTiles * 0.5, 0.15, LOG_HALF_WIDTH);
    body.position.set(0, 0.0, 0);
    this.container.addChild(body);

    // End-cap rings to make it look like a log
    for (const sx of [-1, 1]) {
      const ring = Mesh3D.createCube();
      ring.material = cachedMat('#5a3318');
      ring.scale.set(0.04, 0.14, LOG_HALF_WIDTH * 0.95);
      ring.position.set(sx * lengthTiles * 0.5, 0.0, 0);
      this.container.addChild(ring);
    }
    parent.addChild(this.container);
    this._sync();
  }

  setPosition(x) {
    this.position = x;
    this._sync();
  }

  update(deltaSec) {
    this.position += this.speed * this.direction * deltaSec;
    if (this.direction > 0 && this.position - this.lengthTiles * 0.5 > LOG_WRAP) {
      this.position = -LOG_WRAP - this.lengthTiles * 0.5;
    }
    if (this.direction < 0 && this.position + this.lengthTiles * 0.5 < -LOG_WRAP) {
      this.position = LOG_WRAP + this.lengthTiles * 0.5;
    }
    this._sync();
  }

  _sync() {
    this.container.position.x = this.position;
  }

  // Returns x position relative to log center, or null if not on this log.
  containsPlayerX(px) {
    const halfLen = this.lengthTiles * 0.5;
    if (px >= this.position - halfLen && px <= this.position + halfLen) {
      return px - this.position;
    }
    return null;
  }

  destroy() {
    if (this.container.parent) this.container.parent.removeChild(this.container);
  }
}

export class RiverRow {
  constructor(scene, rowIndex, rand) {
    this.scene = scene;
    this.rowIndex = rowIndex;
    this.type = 'river';
    this.container = new Container3D();
    this.container.position.set(0, 0, rowIndex * TILE);
    scene.root.addChild(this.container);
    this._rand = rand;

    // Water surface
    const water = cachedMat(PALETTE.water);
    for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x++) {
      const tile = Mesh3D.createCube();
      tile.material = water;
      tile.scale.set(TILE * 0.5, 0.1, TILE * 0.5);
      tile.position.set(x * TILE, -0.20, 0);
      this.container.addChild(tile);
    }

    // 1-3 logs in this row
    const direction = rand() > 0.5 ? 1 : -1;
    const speed = 1.0 + rand() * 1.8;
    const numLogs = 1 + Math.floor(rand() * 3);
    this.logs = [];
    const span = 2 * LOG_WRAP;
    for (let i = 0; i < numLogs; i++) {
      const len = LOG_LENGTHS[Math.floor(rand() * LOG_LENGTHS.length)];
      const log = new Log(this.container, len, speed, direction);
      log.setPosition(-LOG_WRAP + (i + rand() * 0.6) * (span / numLogs));
      this.logs.push(log);
    }

    // Track per-row drift state for the riding player.
    this._playerRiding = null;     // the Log instance the player is currently on
    this._playerOffsetOnLog = 0;   // x offset relative to log center when boarded
  }

  update(deltaMS, _player) {
    // Update log motion only. The player drag now lives in checkCollision so it
    // runs AFTER any hop has re-snapped the player to a new tile — otherwise we
    // would yank the player back to the old log position and ignore sideways hops.
    const dt = deltaMS / 1000;
    for (const log of this.logs) log.update(dt);
  }

  canEnter(col) {
    return col >= -HALF_WIDTH && col <= HALF_WIDTH;
  }

  checkCollision(player) {
    const pz = player.container.position.z;
    const onThisRow = Math.abs(pz - this.rowIndex) < 0.5;

    if (!onThisRow) {
      this._playerRiding = null;
      return null;
    }
    if (player.hopping) {
      // Clear the bind during hops so the next collision re-detects from
      // wherever the player actually lands.
      this._playerRiding = null;
      return null;
    }

    const px = player.container.position.x;

    // Off the playable strip while in water → drown.
    if (px < -HALF_WIDTH - 0.4 || px > HALF_WIDTH + 0.4) {
      this._playerRiding = null;
      return 'swept off the river';
    }

    // (Re-)detect which log the player is currently over.
    let onLog = null;
    let offset = 0;
    for (const log of this.logs) {
      const local = log.containsPlayerX(px);
      if (local !== null) { onLog = log; offset = local; break; }
    }
    if (!onLog) {
      this._playerRiding = null;
      return 'drowned in the river';
    }

    // If we just switched logs (or just boarded), recapture the offset so we
    // drift relative to the current log without snapping back.
    if (this._playerRiding !== onLog) {
      this._playerRiding = onLog;
      this._playerOffsetOnLog = offset;
    }

    // Drift with the log (log moved already this tick).
    const newX = this._playerRiding.position + this._playerOffsetOnLog;
    player.container.position.x = newX;
    player.col = Math.round(newX);
    return null;
  }

  destroy() {
    for (const log of this.logs) log.destroy();
    if (this.container.parent) this.container.parent.removeChild(this.container);
  }
}
