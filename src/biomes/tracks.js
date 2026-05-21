import { Mesh3D, Container3D } from 'pixi3d/pixi7';
import { TILE, PALETTE, HALF_WIDTH } from '../scene.js';
import { cachedMat } from './grass.js';

const TRAIN_HALF_LEN = 4.5;
const TRAIN_HALF_WIDTH = 0.40;
const PLAYER_HALF_WIDTH = 0.30;
const TRAIN_SPEED = 9.5;             // fast — telegraphed via warning lamp
const TRAIN_WRAP = HALF_WIDTH + TRAIN_HALF_LEN + 2;
const WARNING_LEAD_MS = 1500;        // lamp blink time before train arrives
const MIN_GAP_MS = 4500;
const MAX_GAP_MS = 9500;

const PHASE_IDLE = 'idle';
const PHASE_WARN = 'warn';
const PHASE_RUNNING = 'running';

export class TracksRow {
  constructor(scene, rowIndex, rand) {
    this.scene = scene;
    this.rowIndex = rowIndex;
    this.type = 'tracks';
    this.container = new Container3D();
    this.container.position.set(0, 0, rowIndex * TILE);
    scene.root.addChild(this.container);
    this._rand = rand;

    this._buildTracks();
    this._buildWarningLight();
    this._buildTrain();

    this._phase = PHASE_IDLE;
    this._phaseTimer = MIN_GAP_MS + rand() * (MAX_GAP_MS - MIN_GAP_MS);
    this._nextDirection = rand() > 0.5 ? 1 : -1;
    this._trainPos = 0;
  }

  _buildTracks() {
    const ballast = cachedMat(PALETTE.tracks);
    for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x++) {
      const tile = Mesh3D.createCube();
      tile.material = ballast;
      tile.scale.set(TILE * 0.5, 0.08, TILE * 0.5);
      tile.position.set(x * TILE, -0.08, 0);
      this.container.addChild(tile);
    }
    // Wooden cross-ties
    for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x += 1) {
      const tie = Mesh3D.createCube();
      tie.material = cachedMat('#3a2510');
      tie.scale.set(0.18, 0.02, 0.36);
      tie.position.set(x, 0.01, 0);
      this.container.addChild(tie);
    }
    // Silver rails
    const rail = cachedMat(PALETTE.rail);
    for (const sz of [-0.22, 0.22]) {
      const r = Mesh3D.createCube();
      r.material = rail;
      r.scale.set(HALF_WIDTH + 0.5, 0.03, 0.025);
      r.position.set(0, 0.04, sz);
      this.container.addChild(r);
    }
  }

  _buildWarningLight() {
    const lamp = Mesh3D.createCube();
    lamp.material = cachedMat('#330000');
    lamp.scale.set(0.10, 0.10, 0.10);
    lamp.position.set(-HALF_WIDTH - 0.6, 0.7, 0);
    this.container.addChild(lamp);
    // Lamp post
    const post = Mesh3D.createCube();
    post.material = cachedMat('#222222');
    post.scale.set(0.03, 0.35, 0.03);
    post.position.set(-HALF_WIDTH - 0.6, 0.35, 0);
    this.container.addChild(post);

    this._lamp = lamp;
    this._lampOnMat = cachedMat('#ff2222');
    this._lampOffMat = cachedMat('#330000');
  }

  _buildTrain() {
    this._train = new Container3D();

    // Locomotive (front, dark)
    const loco = Mesh3D.createCube();
    loco.material = cachedMat('#222222');
    loco.scale.set(0.7, 0.32, TRAIN_HALF_WIDTH);
    loco.position.set(TRAIN_HALF_LEN - 0.7, 0.30, 0);
    this._train.addChild(loco);

    // Cabin window
    const win = Mesh3D.createCube();
    win.material = cachedMat('#a0c8ff');
    win.scale.set(0.18, 0.10, TRAIN_HALF_WIDTH * 0.85);
    win.position.set(TRAIN_HALF_LEN - 0.85, 0.55, 0);
    this._train.addChild(win);

    // Headlight (always-on bright white at the front of locomotive)
    const headlight = Mesh3D.createCube();
    headlight.material = cachedMat('#fff8a0');
    headlight.scale.set(0.04, 0.10, 0.10);
    headlight.position.set(TRAIN_HALF_LEN, 0.30, 0);
    this._train.addChild(headlight);

    // Red passenger cars
    const carMat = cachedMat('#bb2222');
    for (let i = 1; i < 5; i++) {
      const car = Mesh3D.createCube();
      car.material = carMat;
      car.scale.set(0.8, 0.30, TRAIN_HALF_WIDTH);
      car.position.set(TRAIN_HALF_LEN - 0.8 - i * 1.8, 0.30, 0);
      this._train.addChild(car);
      // Window stripe
      const cwin = Mesh3D.createCube();
      cwin.material = cachedMat('#a0c8ff');
      cwin.scale.set(0.7, 0.06, TRAIN_HALF_WIDTH * 0.85);
      cwin.position.set(TRAIN_HALF_LEN - 0.8 - i * 1.8, 0.45, 0);
      this._train.addChild(cwin);
    }

    // Wheels
    const wheelMat = cachedMat('#000000');
    for (let i = 0; i < 5; i++) {
      for (const sz of [-1, 1]) {
        for (const sx of [-0.4, 0.4]) {
          const w = Mesh3D.createCube();
          w.material = wheelMat;
          w.scale.set(0.08, 0.08, 0.05);
          w.position.set(
            TRAIN_HALF_LEN - 0.8 - i * 1.8 + sx,
            0.08,
            sz * TRAIN_HALF_WIDTH * 0.9
          );
          this._train.addChild(w);
        }
      }
    }

    this._train.visible = false;
    this.container.addChild(this._train);
  }

  update(deltaMS) {
    this._phaseTimer -= deltaMS;

    if (this._phase === PHASE_IDLE && this._phaseTimer <= 0) {
      this._phase = PHASE_WARN;
      this._phaseTimer = WARNING_LEAD_MS;
      this._lamp.material = this._lampOnMat;
    } else if (this._phase === PHASE_WARN) {
      const blinkOn = Math.floor((-this._phaseTimer) / 150) % 2 === 0;
      this._lamp.material = blinkOn ? this._lampOnMat : this._lampOffMat;
      if (this._phaseTimer <= 0) {
        this._phase = PHASE_RUNNING;
        this._trainPos = -this._nextDirection * TRAIN_WRAP;
        this._train.visible = true;
        this._train.rotationQuaternion.setEulerAngles(
          0,
          this._nextDirection < 0 ? 180 : 0,
          0
        );
        this._train.position.x = this._trainPos;
      }
    } else if (this._phase === PHASE_RUNNING) {
      const dt = deltaMS / 1000;
      this._trainPos += TRAIN_SPEED * this._nextDirection * dt;
      this._train.position.x = this._trainPos;
      if (Math.abs(this._trainPos) > TRAIN_WRAP) {
        this._phase = PHASE_IDLE;
        this._train.visible = false;
        this._lamp.material = this._lampOffMat;
        this._phaseTimer = MIN_GAP_MS + this._rand() * (MAX_GAP_MS - MIN_GAP_MS);
        this._nextDirection = this._rand() > 0.5 ? 1 : -1;
      }
    }
  }

  canEnter(col) {
    return col >= -HALF_WIDTH && col <= HALF_WIDTH;
  }

  checkCollision(player) {
    if (this._phase !== PHASE_RUNNING) return null;
    const pz = player.container.position.z;
    if (Math.abs(pz - this.rowIndex) > 0.5) return null;
    const px = player.container.position.x;
    if (Math.abs(px - this._trainPos) < TRAIN_HALF_LEN + PLAYER_HALF_WIDTH) {
      return 'flattened by a train';
    }
    return null;
  }

  destroy() {
    if (this.container.parent) this.container.parent.removeChild(this.container);
  }
}
