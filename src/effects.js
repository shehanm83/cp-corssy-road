// Tiny particle / camera-shake / squash effects layer. Designed to be cheap:
// particles are flat unlit cubes with blend-mode alpha; everything lives in a
// single ring of arrays. Each public method emits a quick burst.

import {
  Mesh3D,
  StandardMaterial,
  StandardMaterialAlphaMode,
  Color,
} from 'pixi3d/pixi7';

const MAX_PARTICLES = 160;

class Particle {
  constructor(scene) {
    this.scene = scene;
    this.mesh = Mesh3D.createCube();
    const m = new StandardMaterial();
    m.baseColor = new Color(1, 1, 1, 1);
    m.unlit = true;
    m.alphaMode = StandardMaterialAlphaMode.blend;
    this.mesh.material = m;
    this.material = m;
    this.alive = false;
    this.mesh.visible = false;
    scene.root.addChild(this.mesh);
  }

  spawn({ pos, vel, color, lifetime, scale, gravity, alphaStart }) {
    this.alive = true;
    this.age = 0;
    this.lifetime = lifetime;
    this.gravity = gravity;
    this.startScale = scale;
    this.alphaStart = alphaStart;
    this.vx = vel.x; this.vy = vel.y; this.vz = vel.z;
    this.material.baseColor = new Color(color.r, color.g, color.b, alphaStart);
    this.mesh.scale.set(scale, scale, scale);
    this.mesh.position.set(pos.x, pos.y, pos.z);
    this.mesh.visible = true;
  }

  update(deltaMS) {
    if (!this.alive) return;
    this.age += deltaMS;
    if (this.age >= this.lifetime) {
      this.alive = false;
      this.mesh.visible = false;
      return;
    }
    const dt = deltaMS / 1000;
    this.vy += this.gravity * dt;
    this.mesh.position.x += this.vx * dt;
    this.mesh.position.y += this.vy * dt;
    this.mesh.position.z += this.vz * dt;
    const t = this.age / this.lifetime;
    this.material.baseColor.a = this.alphaStart * (1 - t);
    const s = this.startScale * (1 - t * 0.55);
    this.mesh.scale.set(s, s, s);
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this._cursor = 0;
    this._cameraShake = { time: 0, duration: 0, intensity: 0 };
  }

  _take() {
    // Lazy pool growth up to MAX_PARTICLES; round-robin once full.
    if (this.pool.length < MAX_PARTICLES) {
      const p = new Particle(this.scene);
      this.pool.push(p);
      return p;
    }
    const p = this.pool[this._cursor];
    this._cursor = (this._cursor + 1) % this.pool.length;
    return p;
  }

  _burst(pos, opts) {
    const count = opts.count;
    const speed = opts.speed;
    const upBias = opts.upBias ?? 0.6;
    const colorHex = opts.color;
    const c = Color.fromHex(colorHex);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      const vx = Math.cos(angle) * r;
      const vz = Math.sin(angle) * r;
      const vy = Math.random() * speed * upBias + 0.4;
      const p = this._take();
      p.spawn({
        pos,
        vel: { x: vx, y: vy, z: vz },
        color: { r: c.r, g: c.g, b: c.b },
        lifetime: opts.lifetime,
        scale: opts.scale,
        gravity: opts.gravity ?? -5,
        alphaStart: opts.alphaStart ?? 0.85,
      });
    }
  }

  dust(pos) {
    this._burst(pos, { count: 6, speed: 1.4, color: '#d4c098', lifetime: 320, scale: 0.07, upBias: 0.4, gravity: -3 });
  }

  splash(pos) {
    this._burst(pos, { count: 10, speed: 2.0, color: '#9adfff', lifetime: 480, scale: 0.06, upBias: 1.3, gravity: -7 });
  }

  sparkle(pos) {
    this._burst(pos, { count: 12, speed: 1.6, color: '#ffe44a', lifetime: 600, scale: 0.05, upBias: 1.0, gravity: -1.5 });
  }

  // Camera shake — Scene.update polls .getCameraShakeOffset() each tick.
  shakeCamera(intensity = 0.35, durationMS = 320) {
    this._cameraShake.intensity = Math.max(this._cameraShake.intensity, intensity);
    this._cameraShake.duration  = Math.max(this._cameraShake.duration, durationMS);
    this._cameraShake.time = 0;
  }

  cameraShakeOffset() {
    const s = this._cameraShake;
    if (s.duration <= 0 || s.time >= s.duration) return { x: 0, y: 0 };
    const t = s.time / s.duration;
    const falloff = (1 - t) ** 2;
    const intensity = s.intensity * falloff;
    return {
      x: (Math.random() - 0.5) * 2 * intensity,
      y: (Math.random() - 0.5) * 2 * intensity,
    };
  }

  update(deltaMS) {
    for (const p of this.pool) p.update(deltaMS);
    if (this._cameraShake.duration > 0) {
      this._cameraShake.time += deltaMS;
      if (this._cameraShake.time >= this._cameraShake.duration) {
        this._cameraShake.duration = 0;
        this._cameraShake.time = 0;
        this._cameraShake.intensity = 0;
      }
    }
  }
}
