// First-person walker plus a free-flying camera (F). Ground height comes straight from the
// analytic height function, and solid things register circles or boxes in `colliders`.

import * as THREE from 'three/webgpu';
import { heightAt, surfaceAt, lakeFactor, LANDMARKS, WALK_RADIUS } from '../world/Layout.js';

const groundAt = (x, z) => Math.max(heightAt(x, z), surfaceAt(x, z));

const EYE = 1.62;
const WALK = 3.4, SPRINT = 7.5, GRAVITY = 22, JUMP = 6.2;

export class Player {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    const s = LANDMARKS.spawn;
    this.pos = new THREE.Vector3(s.x, heightAt(s.x, s.z), s.z);
    this.vel = new THREE.Vector3();
    this.yaw = s.yaw;
    this.pitch = 0.04;
    this.onGround = true;
    this.fly = false;
    this.flySpeed = 12;
    this.bob = 0;
    this.colliders = []; // { x, z, r } circles and { x, z, hx, hz, rot } boxes
    this.sensitivity = 0.0021;
    camera.rotation.order = 'YXZ';
  }

  setPose(x, y, z, yaw, pitch) {
    this.pos.set(x, Number.isFinite(y) ? y : groundAt(x, z), z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.vel.set(0, 0, 0);
  }

  update(dt) {
    const inp = this.input;
    this.yaw -= inp.mouseDX * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - inp.mouseDY * this.sensitivity, -1.5, 1.5);
    if (inp.wasPressed('KeyF')) {
      this.fly = !this.fly;
      if (this.fly) this.pos.y += EYE; else this.pos.y -= EYE;
      this.vel.set(0, 0, 0);
    }

    let fx = 0, fz = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) fz -= 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) fz += 1;
    if (inp.down('KeyA') || inp.down('ArrowLeft')) fx -= 1;
    if (inp.down('KeyD') || inp.down('ArrowRight')) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);

    if (this.fly) this._fly(dt, fx, fz, sin, cos);
    else this._walk(dt, fx, fz, sin, cos);

    const cam = this.camera;
    const bobY = this.fly ? 0 : Math.sin(this.bob * 2) * 0.035;
    cam.position.set(this.pos.x, this.pos.y + (this.fly ? 0 : EYE) + bobY, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0);
  }

  _walk(dt, fx, fz, sin, cos) {
    const inp = this.input;
    const speed = inp.down('ShiftLeft') || inp.down('ShiftRight') ? SPRINT : WALK;
    // Local forward is -z; rotate the input by yaw.
    const tx = (fx * cos + fz * sin) * speed;
    const tz = (-fx * sin + fz * cos) * speed;
    const accel = this.onGround ? 12 : 2.5;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    if (this.onGround && inp.wasPressed('Space')) {
      this.vel.y = JUMP;
      this.onGround = false;
    }
    this.vel.y -= GRAVITY * dt;

    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const [cx, cz] = this._collide(nx, nz);
    this.pos.x = cx;
    this.pos.z = cz;
    this.pos.y += this.vel.y * dt;

    const ground = groundAt(this.pos.x, this.pos.z);
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.pos.y - ground < 0.35 && this.vel.y <= 0) {
      this.pos.y = ground; // stick to the ground going downhill
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround) this.bob += hs * dt * 1.25;
  }

  _collide(x, z) {
    // Keep out of the water: slide along the shore by trying each axis on its own.
    if (lakeFactor(x, z) > 0.55) {
      if (lakeFactor(x, this.pos.z) <= 0.55) z = this.pos.z;
      else if (lakeFactor(this.pos.x, z) <= 0.55) x = this.pos.x;
      else return [this.pos.x, this.pos.z];
    }
    const r = Math.hypot(x, z);
    if (r > WALK_RADIUS) { x *= WALK_RADIUS / r; z *= WALK_RADIUS / r; }
    const R = 0.35;
    for (const c of this.colliders) {
      if (c.r !== undefined) {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + R;
        if (d < m && d > 1e-4) { x = c.x + (dx / d) * m; z = c.z + (dz / d) * m; }
      } else {
        const cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0);
        let lx = (x - c.x) * cs - (z - c.z) * sn, lz = (x - c.x) * sn + (z - c.z) * cs;
        const ox = c.hx + R - Math.abs(lx), oz = c.hz + R - Math.abs(lz);
        if (ox > 0 && oz > 0) {
          if (ox < oz) lx += Math.sign(lx) * ox; else lz += Math.sign(lz) * oz;
          x = c.x + lx * cs + lz * sn;
          z = c.z - lx * sn + lz * cs;
        }
      }
    }
    return [x, z];
  }

  _fly(dt, fx, fz, sin, cos) {
    const inp = this.input;
    let fy = 0;
    if (inp.down('KeyE') || inp.down('Space')) fy += 1;
    if (inp.down('KeyQ') || inp.down('KeyC')) fy -= 1;
    const boost = inp.down('ShiftLeft') || inp.down('ShiftRight') ? 4 : 1;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // Forward follows the view, including pitch.
    const fwd = [-sin * cp, sp, -cos * cp], right = [cos, 0, -sin];
    const s = this.flySpeed * boost;
    const t = [
      (fwd[0] * -fz + right[0] * fx) * s,
      (fwd[1] * -fz + fy) * s,
      (fwd[2] * -fz + right[2] * fx) * s,
    ];
    const k = 1 - Math.exp(-5 * dt);
    this.vel.x += (t[0] - this.vel.x) * k;
    this.vel.y += (t[1] - this.vel.y) * k;
    this.vel.z += (t[2] - this.vel.z) * k;
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = Math.max(this.pos.y, heightAt(this.pos.x, this.pos.z) + 0.4);
  }
}
