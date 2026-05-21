import {
  Mesh3D,
  StandardMaterial,
  Color,
  Container3D,
} from 'pixi3d/pixi7';

import { TILE, flatMaterial } from './scene.js';

const HOP_DURATION_MS = 240;
const HOP_HEIGHT = 0.55;

const flatMat = (hex) => flatMaterial(hex);

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.container = new Container3D();
    scene.root.addChild(this.container);

    this.col = 0;
    this.row = 0;
    this.facing = 0; // degrees around Y

    this._build();
    this._snapTo(0, 0);

    this.hopping = false;
    this._hopT = 0;
    this._from = null;
    this._to = null;

    // callback (newRow) => void when player lands on a row further ahead
    this.onAdvance = null;
    // callback (newRow, dx, dz) => void on every successful hop landing
    this.onLand = null;
    // callback () => boolean — return true if hop should be blocked (e.g. fence)
    this.canHop = null;
  }

  _build() {
    // Voxel body (torso)
    const body = Mesh3D.createCube();
    body.material = flatMat('#3e7ed8');
    body.scale.set(0.30, 0.26, 0.26);
    body.position.set(0, 0.28, 0);
    this.container.addChild(body);

    // Voxel head (skin-tone)
    const head = Mesh3D.createCube();
    head.material = flatMat('#f4d9b8');
    head.scale.set(0.28, 0.28, 0.28);
    head.position.set(0, 0.85, 0);
    this.container.addChild(head);
    this.head = head;

    // Face planes textured with a person's face. The chase camera sits BEHIND
    // the player so the back-of-head plane is the one the player actually sees
    // while running; the front-of-head plane is there so the character looks
    // right from any angle (e.g. if we ever add a front-cam preview). Both
    // planes share one material so the texture swap propagates automatically.
    const faceMat = new StandardMaterial();
    faceMat.baseColor = new Color(1, 1, 1);   // white so texture passes through unmultiplied
    faceMat.unlit = true;
    faceMat.doubleSided = true;

    // Face planes — pixi3d's createPlane() puts UV V=0 at the +Z edge in local
    // space, so rotating X=+90 (which lifts the +Z edge to the top) keeps the
    // texture right-side-up. doubleSided makes the back of each plane visible
    // too, so the camera (behind player) sees the back-of-head plane fine.
    const back = Mesh3D.createPlane();
    back.material = faceMat;
    back.scale.set(0.27, 1, 0.27);
    back.position.set(0, 0.85, -0.291);
    back.rotationQuaternion.setEulerAngles(90, 0, 0);
    this.container.addChild(back);

    const front = Mesh3D.createPlane();
    front.material = faceMat;
    front.scale.set(0.27, 1, 0.27);
    front.position.set(0, 0.85, 0.291);
    front.rotationQuaternion.setEulerAngles(90, 0, 0);
    this.container.addChild(front);

    this.facePlane = front;        // kept for legacy refs
    this.faceMaterial = faceMat;

    // Legs (two small cubes)
    for (const sign of [-1, 1]) {
      const leg = Mesh3D.createCube();
      leg.material = flatMat('#222222');
      leg.scale.set(0.08, 0.08, 0.08);
      leg.position.set(sign * 0.13, 0.07, 0);
      this.container.addChild(leg);
    }
  }

  _snapTo(col, row) {
    this.col = col;
    this.row = row;
    this.container.position.set(col * TILE, 0, row * TILE);
  }

  setFaceTexture(texture) {
    // Wire up later when face system is built. For now, baseColor stays as placeholder skin tone.
    this.faceMaterial.baseColorTexture = texture;
  }

  tryHop(dx, dz) {
    if (this.hopping) return false;
    // Re-sync col from the visual position so log-drift doesn't desync the grid.
    this.col = Math.round(this.container.position.x / TILE);
    if (this.canHop && !this.canHop(this.col + dx, this.row + dz)) return false;
    this.hopping = true;
    this._hopT = 0;
    this._from = { col: this.col, row: this.row };
    this._to = { col: this.col + dx, row: this.row + dz };

    // Rotate to face direction (snap rotation instantly; cute visual cue).
    // World +X is screen-LEFT under this camera, so positive dx faces screen-LEFT.
    if (dz > 0) this.facing = 0;
    else if (dz < 0) this.facing = 180;
    else if (dx > 0) this.facing = 90;
    else if (dx < 0) this.facing = -90;
    this.container.rotationQuaternion.setEulerAngles(0, this.facing, 0);

    return true;
  }

  update(deltaMS) {
    if (!this.hopping) return;
    this._hopT += deltaMS / HOP_DURATION_MS;
    if (this._hopT >= 1) {
      this._snapTo(this._to.col, this._to.row);
      this.container.position.y = 0;
      this.hopping = false;
      const dz = this._to.row - this._from.row;
      const dx = this._to.col - this._from.col;
      if (this.onLand) this.onLand(this.row, dx, dz);
      if (dz > 0 && this.onAdvance) this.onAdvance(this.row);
      return;
    }
    const t = this._hopT;
    const x = this._from.col + (this._to.col - this._from.col) * t;
    const z = this._from.row + (this._to.row - this._from.row) * t;
    const y = Math.sin(t * Math.PI) * HOP_HEIGHT;
    this.container.position.set(x * TILE, y, z * TILE);
  }
}
