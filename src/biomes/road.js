import * as PIXI from 'pixi.js';
import { Mesh3D, Container3D, StandardMaterial, Color } from 'pixi3d/pixi7';
import { TILE, PALETTE, HALF_WIDTH } from '../scene.js';
import { cachedMat } from './grass.js';
import { pickDeath } from '../deaths.js';

const FLAG_CHANCE = 0.18;
const FLAG_W = 768;
const FLAG_H = 256;
const FLAG_BORDER = 14;

function paintFlag(ctx, mirror) {
  ctx.save();
  if (mirror) {
    ctx.translate(FLAG_W, 0);
    ctx.scale(-1, 1);
  }
  // Yellow background
  ctx.fillStyle = '#ffe44a';
  ctx.fillRect(0, 0, FLAG_W, FLAG_H);
  // Dark border
  ctx.fillStyle = '#3a2510';
  ctx.fillRect(0, 0, FLAG_W, FLAG_BORDER);
  ctx.fillRect(0, FLAG_H - FLAG_BORDER, FLAG_W, FLAG_BORDER);
  ctx.fillRect(0, 0, FLAG_BORDER, FLAG_H);
  ctx.fillRect(FLAG_W - FLAG_BORDER, 0, FLAG_BORDER, FLAG_H);
  // Two lines of big bold text so it's readable from a few rows away.
  ctx.fillStyle = '#3a2510';
  ctx.font = 'bold 80px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Viktor Code',  FLAG_W / 2, 84);
  ctx.fillText('is NOT easy',  FLAG_W / 2, 180);
  ctx.restore();
}

function makeFlagTexture(mirror) {
  const c = document.createElement('canvas');
  c.width = FLAG_W;
  c.height = FLAG_H;
  const ctx = c.getContext('2d');
  paintFlag(ctx, mirror);
  return PIXI.Texture.from(c);
}

const FLAG_TEXTURE = makeFlagTexture(false);
const FLAG_TEXTURE_MIRRORED = makeFlagTexture(true);

function flagMaterial(texture) {
  const m = new StandardMaterial();
  m.baseColor = new Color(1, 1, 1);
  m.unlit = true;
  m.doubleSided = true;
  m.baseColorTexture = texture;
  return m;
}

const FLAG_MAT_FRONT = flagMaterial(FLAG_TEXTURE);
const FLAG_MAT_BACK  = flagMaterial(FLAG_TEXTURE_MIRRORED);

const CAR_COLORS = ['#cc3344', '#3377cc', '#dd8822', '#22aa55', '#aa44cc', '#cc55aa'];
const CAR_HALF_LEN = 0.42;
const CAR_HALF_WIDTH = 0.30;
// Distance off-center at which we wrap a car back to the other side.
const CAR_WRAP = HALF_WIDTH + 1.8;
// Player collision half-width (a bit smaller than a tile).
const PLAYER_HALF_WIDTH = 0.30;

class Car {
  constructor(parent, speed, direction, color, withFlag = false) {
    this.speed = speed;             // world units / second
    this.direction = direction;     // +1 or -1
    this.position = 0;              // world-x position

    this.container = new Container3D();
    const body = Mesh3D.createCube();
    body.material = cachedMat(color);
    body.scale.set(CAR_HALF_LEN, 0.18, CAR_HALF_WIDTH);
    body.position.set(0, 0.18, 0);
    this.container.addChild(body);

    // Roof (slightly smaller cube on top)
    const roof = Mesh3D.createCube();
    roof.material = cachedMat(color);
    roof.scale.set(CAR_HALF_LEN * 0.6, 0.10, CAR_HALF_WIDTH * 0.9);
    roof.position.set(-CAR_HALF_LEN * 0.15, 0.45, 0);
    this.container.addChild(roof);

    // Wheels
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const w = Mesh3D.createCube();
        w.material = cachedMat('#1a1a1a');
        w.scale.set(0.12, 0.08, 0.07);
        w.position.set(sx * CAR_HALF_LEN * 0.7, 0.08, sz * CAR_HALF_WIDTH * 0.85);
        this.container.addChild(w);
      }
    }

    // Headlights (point in direction of travel)
    const lightX = direction > 0 ? CAR_HALF_LEN : -CAR_HALF_LEN;
    for (const sz of [-1, 1]) {
      const light = Mesh3D.createCube();
      light.material = cachedMat('#fff8a0');
      light.scale.set(0.02, 0.05, 0.05);
      light.position.set(lightX, 0.18, sz * CAR_HALF_WIDTH * 0.55);
      this.container.addChild(light);
    }

    if (withFlag) this._addFlag();

    parent.addChild(this.container);
    this._sync();
  }

  _addFlag() {
    // Vertical pole rising from the roof — taller so the flag clears traffic.
    const pole = Mesh3D.createCube();
    pole.material = cachedMat('#1a1a1a');
    pole.scale.set(0.03, 0.42, 0.03);
    pole.position.set(0, 0.95, 0);
    this.container.addChild(pole);

    // Big rectangular billboard. Two back-to-back planes — one with the
    // regular texture (for viewers ahead of the car), one with a
    // horizontally-mirrored texture (for the chase camera behind), so the
    // text reads correctly from both sides regardless of how pixi3d's
    // doubleSided shader treats back faces.
    const FLAG_HALF_W = 1.0;   // world units, half-width
    const FLAG_HALF_H = 0.30;  // world units, half-height
    const Y = 1.55;

    const sign1 = Mesh3D.createPlane();
    sign1.material = FLAG_MAT_FRONT;
    sign1.scale.set(FLAG_HALF_W, 1, FLAG_HALF_H);
    sign1.position.set(0, Y, 0.02);
    sign1.rotationQuaternion.setEulerAngles(90, 0, 0);
    this.container.addChild(sign1);

    const sign2 = Mesh3D.createPlane();
    sign2.material = FLAG_MAT_BACK;
    sign2.scale.set(FLAG_HALF_W, 1, FLAG_HALF_H);
    sign2.position.set(0, Y, -0.02);
    sign2.rotationQuaternion.setEulerAngles(90, 0, 0);
    this.container.addChild(sign2);
  }

  setPosition(x) {
    this.position = x;
    this._sync();
  }

  update(deltaSec) {
    this.position += this.speed * this.direction * deltaSec;
    if (this.direction > 0 && this.position > CAR_WRAP) this.position = -CAR_WRAP;
    if (this.direction < 0 && this.position < -CAR_WRAP) this.position = CAR_WRAP;
    this._sync();
  }

  _sync() {
    this.container.position.x = this.position;
  }

  destroy() {
    if (this.container.parent) this.container.parent.removeChild(this.container);
  }
}

export class RoadRow {
  constructor(scene, rowIndex, rand, opts = {}) {
    this.scene = scene;
    this.rowIndex = rowIndex;
    this.type = 'road';
    this.container = new Container3D();
    this.container.position.set(0, 0, rowIndex * TILE);
    scene.root.addChild(this.container);

    // Asphalt floor
    const asphalt = cachedMat(PALETTE.road);
    for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x++) {
      const tile = Mesh3D.createCube();
      tile.material = asphalt;
      tile.scale.set(TILE * 0.5, 0.08, TILE * 0.5);
      tile.position.set(x * TILE, -0.08, 0);
      this.container.addChild(tile);
    }
    // Dashed yellow center line
    const line = cachedMat(PALETTE.roadLine);
    for (let x = -HALF_WIDTH; x <= HALF_WIDTH; x += 2) {
      const dash = Mesh3D.createCube();
      dash.material = line;
      dash.scale.set(0.18, 0.005, 0.04);
      dash.position.set(x, 0.001, 0);
      this.container.addChild(dash);
    }

    // Difficulty ramp: faster cars + denser traffic as the player gets further.
    const score = opts?.score ?? 0;
    const speedBoost = Math.min(3, score / 60);     // up to +3 units of speed
    const densityBoost = score > 80 ? 1 : 0;        // one extra car after row 80

    const direction = rand() > 0.5 ? 1 : -1;
    const speed = 1.6 + speedBoost + rand() * 2.8;
    const numCars = 1 + densityBoost + Math.floor(rand() * 3);
    this.cars = [];
    const span = 2 * CAR_WRAP;
    // Ensure at most ONE flag car per row so the tagline doesn't get spammy.
    const flagIndex = rand() < FLAG_CHANCE ? Math.floor(rand() * numCars) : -1;
    for (let i = 0; i < numCars; i++) {
      const color = CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)];
      const car = new Car(this.container, speed, direction, color, i === flagIndex);
      // distribute initial positions evenly so they don't all overlap
      const startX = -CAR_WRAP + (i + rand() * 0.5) * (span / numCars);
      car.setPosition(startX);
      this.cars.push(car);
    }
  }

  update(deltaMS) {
    const dt = deltaMS / 1000;
    for (const car of this.cars) car.update(dt);
  }

  canEnter(col) {
    return col >= -HALF_WIDTH && col <= HALF_WIDTH;
  }

  checkCollision(player) {
    const pz = player.container.position.z;
    if (Math.abs(pz - this.rowIndex) > 0.5) return null;
    const px = player.container.position.x;
    for (const car of this.cars) {
      if (Math.abs(px - car.position) < CAR_HALF_LEN + PLAYER_HALF_WIDTH) {
        return pickDeath('road');
      }
    }
    return null;
  }

  destroy() {
    for (const car of this.cars) car.destroy();
    if (this.container.parent) this.container.parent.removeChild(this.container);
  }
}
