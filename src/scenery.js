// Decorative grass-row scenery: trees (impassable obstacles) and dogs
// (passable, tail-wagging extras). Voxel/cube-only meshes keep the retro
// look and run on the same unlit StandardMaterial pipeline.

import { Mesh3D, Container3D } from 'pixi3d/pixi7';
import { flatMaterial } from './scene.js';

const TRUNK_COLORS = ['#5a3a22', '#4a2a12', '#6a4a32'];
const CROWN_COLORS = ['#3a8a30', '#4a9a30', '#2a7020', '#5aa040', '#358030'];

const DOG_FUR_COLORS = ['#c8a070', '#8a6840', '#3a2510', '#e8d8c0', '#a07840', '#785030'];

// --- Tree ---------------------------------------------------------------

export class Tree {
  constructor(rand) {
    this.container = new Container3D();
    const matCache = (hex) => flatMaterial(hex);

    // Trunk
    const trunkColor = TRUNK_COLORS[Math.floor(rand() * TRUNK_COLORS.length)];
    const trunk = Mesh3D.createCube();
    trunk.material = matCache(trunkColor);
    const trunkH = 0.20 + rand() * 0.10;
    trunk.scale.set(0.07, trunkH, 0.07);
    trunk.position.set(0, trunkH, 0);
    this.container.addChild(trunk);

    // Crown: 1-3 stacked cubes, decreasing in size.
    const crownColor = CROWN_COLORS[Math.floor(rand() * CROWN_COLORS.length)];
    const crownMat = matCache(crownColor);
    const numCrowns = 1 + Math.floor(rand() * 3);
    let yBase = trunkH * 2;
    let size = 0.30 + rand() * 0.10;
    for (let i = 0; i < numCrowns; i++) {
      const c = Mesh3D.createCube();
      c.material = crownMat;
      c.scale.set(size, size, size);
      c.position.set(0, yBase + size, 0);
      this.container.addChild(c);
      yBase += size * 1.4;
      size *= 0.75;
    }

    // Tiny y-axis rotation so they don't all look identical.
    this.container.rotationQuaternion.setEulerAngles(0, rand() * 360, 0);
  }

  update(_deltaMS) {}
}

// --- Dog ----------------------------------------------------------------

export class Dog {
  constructor(rand) {
    this.container = new Container3D();
    this._t = rand() * 1000;  // randomise tail phase so dogs aren't in sync

    const fur = DOG_FUR_COLORS[Math.floor(rand() * DOG_FUR_COLORS.length)];
    const furMat = flatMaterial(fur);
    const darkMat = flatMaterial('#1a1410');

    // Body
    const body = Mesh3D.createCube();
    body.material = furMat;
    body.scale.set(0.14, 0.07, 0.08);
    body.position.set(0, 0.13, 0);
    this.container.addChild(body);

    // Head
    const head = Mesh3D.createCube();
    head.material = furMat;
    head.scale.set(0.08, 0.08, 0.07);
    head.position.set(0.16, 0.21, 0);
    this.container.addChild(head);

    // Snout
    const snout = Mesh3D.createCube();
    snout.material = furMat;
    snout.scale.set(0.04, 0.04, 0.04);
    snout.position.set(0.26, 0.18, 0);
    this.container.addChild(snout);

    // Nose
    const nose = Mesh3D.createCube();
    nose.material = darkMat;
    nose.scale.set(0.015, 0.015, 0.015);
    nose.position.set(0.31, 0.18, 0);
    this.container.addChild(nose);

    // Ears
    for (const sz of [-1, 1]) {
      const ear = Mesh3D.createCube();
      ear.material = furMat;
      ear.scale.set(0.025, 0.045, 0.02);
      ear.position.set(0.13, 0.31, sz * 0.06);
      this.container.addChild(ear);
    }

    // Eyes
    for (const sz of [-1, 1]) {
      const eye = Mesh3D.createCube();
      eye.material = darkMat;
      eye.scale.set(0.012, 0.012, 0.012);
      eye.position.set(0.21, 0.24, sz * 0.05);
      this.container.addChild(eye);
    }

    // Legs
    for (const dx of [-0.10, 0.10]) {
      for (const dz of [-0.06, 0.06]) {
        const leg = Mesh3D.createCube();
        leg.material = furMat;
        leg.scale.set(0.022, 0.06, 0.022);
        leg.position.set(dx, 0.06, dz);
        this.container.addChild(leg);
      }
    }

    // Tail — held as a member so we can wag it in update().
    this.tail = new Container3D();
    this.tail.position.set(-0.16, 0.18, 0);
    const tailMesh = Mesh3D.createCube();
    tailMesh.material = furMat;
    tailMesh.scale.set(0.04, 0.025, 0.025);
    tailMesh.position.set(-0.04, 0.0, 0);  // offset so rotation pivot is at base
    this.tail.addChild(tailMesh);
    this.container.addChild(this.tail);

    // Random facing
    this.container.rotationQuaternion.setEulerAngles(0, rand() * 360, 0);
  }

  update(deltaMS) {
    this._t += deltaMS;
    const sec = this._t / 1000;
    // Wag the tail side-to-side.
    this.tail.rotationQuaternion.setEulerAngles(0, Math.sin(sec * 7) * 35, 0);
  }
}
