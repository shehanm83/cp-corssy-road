import {
  Mesh3D,
  Light,
  LightType,
  LightingEnvironment,
  Camera,
  Color,
  StandardMaterial,
  Container3D,
} from 'pixi3d/pixi7';

export const TILE = 1.0;
// World half-width: player cols range from -HALF_WIDTH to +HALF_WIDTH.
export const HALF_WIDTH = 5;

export const PALETTE = {
  grassA: '#6abe30',
  grassB: '#5fb030',
  road: '#3c3c3c',
  roadLine: '#f0d055',
  water: '#3a7ec0',
  tracks: '#6b4a2b',
  rail: '#9c9c9c',
};

const CAM_OFFSET = { x: 0, y: 5.5, z: -7.0 };
const CAM_PITCH_DEG = 32;
const CAM_LERP = 0.12;

export function flatMaterial(hex) {
  const m = new StandardMaterial();
  m.baseColor = Color.fromHex(hex);
  m.unlit = true;
  return m;
}

export class Scene {
  constructor(app) {
    this.app = app;
    this.root = new Container3D();
    app.stage.addChild(this.root);

    this._setupLighting();
    this._setupCamera();

    this._followTarget = null; // an object with .container.position (e.g. Player)
    this._cameraTargetX = CAM_OFFSET.x;
    this._cameraTargetZ = CAM_OFFSET.z;
  }

  _setupLighting() {
    // Unlit materials don't strictly need lights, but pixi3d expects at least one.
    const sun = new Light();
    sun.type = LightType.directional;
    sun.intensity = 1.0;
    sun.rotationQuaternion.setEulerAngles(45, -35, 0);
    LightingEnvironment.main.lights.push(sun);
  }

  _setupCamera() {
    const cam = Camera.main;
    cam.position.set(CAM_OFFSET.x, CAM_OFFSET.y, CAM_OFFSET.z);
    cam.rotationQuaternion.setEulerAngles(CAM_PITCH_DEG, 0, 0);
    cam.fieldOfView = 50;
  }

  follow(target) {
    this._followTarget = target;
  }

  // Called every tick by Game.
  update(deltaMS) {
    if (this._followTarget) {
      const p = this._followTarget.container.position;
      this._cameraTargetX = p.x + CAM_OFFSET.x;
      this._cameraTargetZ = p.z + CAM_OFFSET.z;
    }
    const cam = Camera.main;
    cam.position.x += (this._cameraTargetX - cam.position.x) * CAM_LERP;
    cam.position.z += (this._cameraTargetZ - cam.position.z) * CAM_LERP;
    cam.position.y = CAM_OFFSET.y;
  }

  clear() {
    while (this.root.children.length > 0) {
      this.root.removeChildAt(0);
    }
  }
}
