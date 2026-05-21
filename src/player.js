import {
  Mesh3D,
  StandardMaterial,
  Color,
  Container3D,
} from 'pixi3d/pixi7';

import { TILE, flatMaterial, makeBlobShadow } from './scene.js';

const HOP_DURATION_MS = 240;
const HOP_HEIGHT = 0.55;
const FACING_LERP_DEG_PER_SEC = 720;   // 90° turn in ~125ms
const IDLE_BOB_HZ = 1.4;
const IDLE_BOB_AMP = 0.03;

const flatMat = (hex) => flatMaterial(hex);

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.container = new Container3D();
    scene.root.addChild(this.container);

    this.col = 0;
    this.row = 0;
    this.facing = 0;          // current rotation around Y (lerped toward _targetFacing)
    this._targetFacing = 0;
    this._idleT = 0;

    this._build();
    this._snapTo(0, 0);

    this.hopping = false;
    this._hopT = 0;
    this._from = null;
    this._to = null;

    // Powerup-driven state flags.
    this.frozen = false;        // STANDUP! bell — input ignored
    this.invincible = false;    // OUT OF OFFICE — collisions ignored
    this.hasShield = false;     // PR APPROVED — next death is consumed
    this.hopDurationMul = 1;    // ESPRESSO — multiplier on HOP_DURATION_MS

    // Blob shadow lives in the scene (not parented to the player) so it stays
    // on the ground while the player arcs through a hop.
    this.shadow = makeBlobShadow(0.55, 0.55);
    scene.root.addChild(this.shadow);

    // Squash animation state — set by squash() on death.
    this._squashT = 0;
    this._squashing = false;

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
    this._syncShadow();
  }

  _syncShadow() {
    if (!this.shadow) return;
    // Shadow tracks the player on X/Z but stays glued to the ground in Y, so
    // it doesn't lift with the hop arc. Shrinks slightly when hopping higher.
    const px = this.container.position.x;
    const pz = this.container.position.z;
    const py = this.container.position.y;
    this.shadow.position.x = px;
    this.shadow.position.z = pz;
    const lift = Math.min(1, py / 0.55);
    const s = 0.28 * (1 - lift * 0.45);
    this.shadow.scale.set(s, 1, s);
  }

  squash() {
    this._squashing = true;
    this._squashT = 0;
  }

  resetTransform() {
    this._squashing = false;
    this._squashT = 0;
    this.container.scale.set(1, 1, 1);
    this.shadow.visible = true;
    // Face forward again on respawn so the lerp doesn't catch leftover state.
    this.facing = 0;
    this._targetFacing = 0;
    this._idleT = 0;
    this.container.rotationQuaternion.setEulerAngles(0, 0, 0);
    // Clear any leftover buff state from a previous run.
    this.frozen = false;
    this.invincible = false;
    this.hasShield = false;
    this.hopDurationMul = 1;
  }

  setFaceTexture(texture) {
    // Wire up later when face system is built. For now, baseColor stays as placeholder skin tone.
    this.faceMaterial.baseColorTexture = texture;
  }

  tryHop(dx, dz) {
    if (this.hopping || this.frozen) return false;
    // Re-sync col from the visual position so log-drift doesn't desync the grid.
    this.col = Math.round(this.container.position.x / TILE);
    if (this.canHop && !this.canHop(this.col + dx, this.row + dz)) return false;
    this.hopping = true;
    this._hopT = 0;
    this._from = { col: this.col, row: this.row };
    this._to = { col: this.col + dx, row: this.row + dz };

    // Target a new facing direction; rotation lerps toward it each frame.
    // World +X is screen-LEFT under this camera, so positive dx faces screen-LEFT.
    if (dz > 0) this._targetFacing = 0;
    else if (dz < 0) this._targetFacing = 180;
    else if (dx > 0) this._targetFacing = 90;
    else if (dx < 0) this._targetFacing = -90;

    return true;
  }

  _stepFacing(deltaMS) {
    // Lerp this.facing toward this._targetFacing via shortest-path angle delta.
    let delta = this._targetFacing - this.facing;
    while (delta > 180)  delta -= 360;
    while (delta < -180) delta += 360;
    if (Math.abs(delta) < 0.5) {
      this.facing = this._targetFacing;
    } else {
      const step = FACING_LERP_DEG_PER_SEC * (deltaMS / 1000);
      this.facing += Math.sign(delta) * Math.min(step, Math.abs(delta));
    }
    this.container.rotationQuaternion.setEulerAngles(0, this.facing, 0);
  }

  update(deltaMS) {
    // Smooth turns even when the player isn't hopping.
    this._stepFacing(deltaMS);

    if (this._squashing) {
      this._squashT += deltaMS;
      const t = Math.min(1, this._squashT / 280);
      // Quick splat: scale X+Z up, Y down.
      const yScale = 1 - 0.75 * t;
      const xzScale = 1 + 0.4 * t;
      this.container.scale.set(xzScale, yScale, xzScale);
      this.container.position.y = 0;
      if (this.shadow) this.shadow.visible = false;
      this._syncShadow();
      return;
    }

    if (!this.hopping) {
      // Subtle idle bob — a little breath so the player doesn't look frozen.
      this._idleT += deltaMS;
      const bobY = Math.sin((this._idleT / 1000) * IDLE_BOB_HZ * Math.PI * 2) * IDLE_BOB_AMP;
      this.container.position.y = bobY;
      this._syncShadow();
      return;
    }
    // Reset the idle phase whenever we leave the standing pose so the next
    // idle starts cleanly at y=0.
    this._idleT = 0;

    this._hopT += deltaMS / (HOP_DURATION_MS * this.hopDurationMul);
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
    this._syncShadow();
  }
}
