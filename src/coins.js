import {
  Mesh3D,
  StandardMaterial,
  Color,
  Container3D,
} from 'pixi3d/pixi7';

const COIN_VALUE = 10;
const COIN_BOB_HEIGHT = 0.08;
const COIN_SPIN_DEG_PER_SEC = 180;

const RIM_HEX = '#ffd86b';
const RIM_DARK = '#aa7e22';

export class FaceCoin {
  constructor(parent, faceEntry, col) {
    this.faceEntry = faceEntry;       // { id, name, texture, ... }
    this.col = col;
    this.collected = false;
    this._t = 0;

    this.container = new Container3D();
    this.container.position.set(col, 0.55, 0);

    // Disc body (a flattened cube, edge-on visible)
    const disc = Mesh3D.createCube();
    const rimMat = new StandardMaterial();
    rimMat.baseColor = Color.fromHex(RIM_HEX);
    rimMat.unlit = true;
    disc.material = rimMat;
    disc.scale.set(0.20, 0.20, 0.04);
    this.container.addChild(disc);

    // Darker inner ring (slight inset)
    const inner = Mesh3D.createCube();
    const innerMat = new StandardMaterial();
    innerMat.baseColor = Color.fromHex(RIM_DARK);
    innerMat.unlit = true;
    inner.material = innerMat;
    inner.scale.set(0.16, 0.16, 0.045);
    this.container.addChild(inner);

    // Face plane on front of the disc — uses the person's face texture.
    const facePlane = Mesh3D.createPlane();
    const faceMat = new StandardMaterial();
    faceMat.baseColor = new Color(1, 1, 1);
    faceMat.unlit = true;
    if (faceEntry?.texture) faceMat.baseColorTexture = faceEntry.texture;
    facePlane.material = faceMat;
    facePlane.scale.set(0.16, 1, 0.16);
    facePlane.position.set(0, 0, 0.05);
    // Rotate plane to face +Z, plus an additional flip so it isn't mirrored.
    facePlane.rotationQuaternion.setEulerAngles(-90, 0, 0);
    this.container.addChild(facePlane);

    parent.addChild(this.container);
  }

  update(deltaMS) {
    if (this.collected) return;
    this._t += deltaMS;
    const sec = this._t / 1000;
    this.container.position.y = 0.55 + Math.sin(sec * 3) * COIN_BOB_HEIGHT;
    this.container.rotationQuaternion.setEulerAngles(0, sec * COIN_SPIN_DEG_PER_SEC, 0);
  }

  checkPickup(player) {
    if (this.collected) return false;
    const px = player.container.position.x;
    if (Math.abs(px - this.col) > 0.45) return false;
    this.collected = true;
    this.container.visible = false;
    return true;
  }

  destroy() {
    if (this.container.parent) this.container.parent.removeChild(this.container);
  }

  get value() { return COIN_VALUE; }
}
