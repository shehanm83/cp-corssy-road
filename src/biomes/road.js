import { Mesh3D, Container3D } from 'pixi3d/pixi7';
import { TILE, PALETTE, HALF_WIDTH } from '../scene.js';
import { cachedMat } from './grass.js';

const CAR_COLORS = ['#cc3344', '#3377cc', '#dd8822', '#22aa55', '#aa44cc', '#cc55aa'];
const CAR_HALF_LEN = 0.42;
const CAR_HALF_WIDTH = 0.30;
// Distance off-center at which we wrap a car back to the other side.
const CAR_WRAP = HALF_WIDTH + 1.8;
// Player collision half-width (a bit smaller than a tile).
const PLAYER_HALF_WIDTH = 0.30;

class Car {
  constructor(parent, speed, direction, color) {
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

    parent.addChild(this.container);
    this._sync();
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
    for (let i = 0; i < numCars; i++) {
      const color = CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)];
      const car = new Car(this.container, speed, direction, color);
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
        return 'squashed by a car';
      }
    }
    return null;
  }

  destroy() {
    for (const car of this.cars) car.destroy();
    if (this.container.parent) this.container.parent.removeChild(this.container);
  }
}
