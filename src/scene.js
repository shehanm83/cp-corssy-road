import {
  Mesh3D,
  Light,
  LightType,
  LightingEnvironment,
  Camera,
  Color,
  StandardMaterial,
  StandardMaterialAlphaMode,
  Container3D,
  Fog,
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
// Frame-rate-independent exponential ease: every second the camera covers
// 1 - exp(-CAM_FOLLOW_RATE) ≈ 86% of the remaining distance.
const CAM_FOLLOW_RATE = 6;

export function flatMaterial(hex) {
  const m = new StandardMaterial();
  m.baseColor = Color.fromHex(hex);
  m.unlit = true;
  return m;
}

// Soft circular shadow material (translucent black). Shared across all
// entities — pass the same material to every blob to avoid alpha sorting
// artifacts and keep draw calls cheap.
const _blobMat = (() => {
  const m = new StandardMaterial();
  m.baseColor = new Color(0, 0, 0, 0.35);
  m.unlit = true;
  m.alphaMode = StandardMaterialAlphaMode.blend;
  return m;
})();

export function makeBlobShadow(width = 0.6, depth = 0.6) {
  const plane = Mesh3D.createPlane();
  plane.material = _blobMat;
  plane.scale.set(width * 0.5, 1, depth * 0.5);
  plane.position.y = 0.012;       // hair above the ground, no z-fighting
  return plane;
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

    // Distance fog — colour matches the sky so far rows fade into the horizon.
    LightingEnvironment.main.fog = new Fog(10, 32, Color.fromHex('#7ec0ee'));
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

  // Called every tick by Game. shakeOffset comes from the Effects system.
  update(deltaMS, shakeOffset) {
    if (this._followTarget) {
      const p = this._followTarget.container.position;
      this._cameraTargetX = p.x + CAM_OFFSET.x;
      this._cameraTargetZ = p.z + CAM_OFFSET.z;
    }
    const cam = Camera.main;
    // Exponential ease-out, frame-rate-independent. Replaces the old
    // `pos += (target - pos) * 0.12` which jittered at high refresh rates.
    const dt = Math.min(0.1, deltaMS / 1000);   // clamp huge frame gaps
    const k = 1 - Math.exp(-CAM_FOLLOW_RATE * dt);
    cam.position.x += (this._cameraTargetX - cam.position.x) * k;
    cam.position.z += (this._cameraTargetZ - cam.position.z) * k;
    cam.position.y = CAM_OFFSET.y;
    if (shakeOffset) {
      cam.position.x += shakeOffset.x;
      cam.position.y += shakeOffset.y;
    }
  }

  clear() {
    while (this.root.children.length > 0) {
      this.root.removeChildAt(0);
    }
  }
}
