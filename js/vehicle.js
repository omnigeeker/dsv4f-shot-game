/* ============================================================
 * VEHICLE — 载具（坦克 / 机枪快艇）
 * 第三人称控制：WASD 驾驶、鼠标瞄准、左键开火；炮弹命中爆炸
 * ============================================================ */
import * as THREE from 'three';
import { WORLD } from './world.js';

export const VEHICLE = (function () {

  /* ---------- 炮弹 ---------- */
  function makeProjectile(scene, pos, dir, speed, color, deps) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }));
    mesh.position.copy(pos);
    scene.add(mesh);
    return { mesh, vel: dir.clone().multiplyScalar(speed), life: 4, dead: false };
  }

  function updateProjectiles(projs, dt, scene, deps) {
    for (let i = projs.length - 1; i >= 0; i--) {
      const p = projs[i];
      p.life -= dt;
      const step = p.vel.clone().multiplyScalar(dt);
      p.mesh.position.add(step);
      let hit = false;
      // 命中敌人（水平距离判定，炮弹平飞高度足够）
      const seen = new Set();
      for (const m of deps.getEnemies()) {
        const e = m.userData.enemy;
        if (!e || e.dead || seen.has(e)) continue;
        seen.add(e);
        const hdx = e.pos.x - p.mesh.position.x, hdz = e.pos.z - p.mesh.position.z;
        if (hdx * hdx + hdz * hdz < 1.4 * 1.4 && p.mesh.position.y > 0.2) {
          deps.damageEnemy(e, deps.shellDmg);
          hit = true;
          break;
        }
      }
      // 命中墙体
      if (!hit) {
        for (const c of WORLD.colliders) {
          if (p.mesh.position.x > c.minX && p.mesh.position.x < c.maxX &&
              p.mesh.position.y > c.minY && p.mesh.position.y < c.maxY &&
              p.mesh.position.z > c.minZ && p.mesh.position.z < c.maxZ) { hit = true; break; }
        }
      }
      if (hit || p.life <= 0) {
        scene.remove(p.mesh);
        if (deps.spawnBurst) deps.spawnBurst(p.mesh.position, 0xff7a2e, 16, 4, 0.5, 0.6, 1);
        if (deps.explode) deps.explode(p.mesh.position);
        projs.splice(i, 1);
      }
    }
  }

  /* ---------- 移动碰撞（AABB 推回） ---------- */
  function moveWithCollision(pos, step, radius) {
    const test = (dx, dz) => {
      const nx = pos.x + dx, nz = pos.z + dz;
      const box = { minX: nx - radius, minY: 0, minZ: nz - radius, maxX: nx + radius, maxY: 2, maxZ: nz + radius };
      for (const c of WORLD.colliders) {
        if (c.maxY <= 0.1) continue; // 地面
        if (box.minX < c.maxX && box.maxX > c.minX && box.minY < c.maxY && box.maxY > c.minY && box.minZ < c.maxZ && box.maxZ > c.minZ) return false;
      }
      return true;
    };
    if (test(step.x, 0)) pos.x += step.x;
    if (test(0, step.z)) pos.z += step.z;
  }

  /* ---------- 坦克 ---------- */
  function createTank(scene, deps) {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 4.2), new THREE.MeshStandardMaterial({ color: 0x3a4038, roughness: 0.6, metalness: 0.5 }));
    hull.position.y = 0.6;
    const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 4.6), new THREE.MeshStandardMaterial({ color: 0x1a1c1a, roughness: 0.9 }));
    trackL.position.set(-1.35, 0.35, 0);
    const trackR = trackL.clone(); trackR.position.x = 1.35;
    const turret = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 2.2), new THREE.MeshStandardMaterial({ color: 0x4a5248, roughness: 0.5, metalness: 0.5 }));
    turret.position.y = 1.35;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.0, 10), new THREE.MeshStandardMaterial({ color: 0x2a2e28, roughness: 0.5, metalness: 0.6 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.1, -1.8);
    turret.add(barrel);
    group.add(hull, trackL, trackR, turret);
    group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(group);

    const v = {
      type: 'tank', group, turret, barrel,
      pos: new THREE.Vector3(0, 0.9, 42), hullYaw: 0,
      hp: 500, maxHp: 500, destroyed: false,
      aimYaw: 0, aimPitch: 0.06,
      speed: 0, projs: [], fireCd: 0
    };

    v.update = (dt, input) => {
      if (v.destroyed) return;
      // 驾驶
      const accel = 14, maxS = 7, steer = 1.3;
      if (input.forward) v.speed = Math.min(maxS, v.speed + accel * dt);
      else if (input.back) v.speed = Math.max(-maxS * 0.5, v.speed - accel * dt);
      else v.speed *= Math.exp(-dt * 3);
      if (input.left) v.hullYaw += steer * dt * (v.speed > 0 ? 1 : -1);
      if (input.right) v.hullYaw -= steer * dt * (v.speed > 0 ? 1 : -1);
      const step = new THREE.Vector3(-Math.sin(v.hullYaw) * v.speed * dt, 0, -Math.cos(v.hullYaw) * v.speed * dt);
      moveWithCollision(v.pos, step, 1.6);
      // 炮塔瞄准（用摄像机朝向）
      v.aimYaw = input.aimYaw; v.aimPitch = input.aimPitch;
      group.position.set(v.pos.x, 0.9, v.pos.z);
      group.rotation.y = v.hullYaw;
      turret.rotation.y = v.aimYaw - v.hullYaw;
      barrel.rotation.x = Math.PI / 2 + Math.max(-0.2, Math.min(0.5, v.aimPitch));
      // 开火
      v.fireCd -= dt;
      if (input.fire && v.fireCd <= 0) {
        v.fireCd = 1.1;
        const dir = new THREE.Vector3(-Math.sin(v.aimYaw), Math.tan(v.aimPitch), -Math.cos(v.aimYaw)).normalize();
        const muzzle = new THREE.Vector3(v.pos.x, 1.6, v.pos.z).add(dir.clone().multiplyScalar(2.6));
        v.projs.push(makeProjectile(scene, muzzle, dir, 26, 0xffc86a, deps));
      }
      updateProjectiles(v.projs, dt, scene, deps);
    };

    v.damage = (d) => { v.hp = Math.max(0, v.hp - d); if (v.hp <= 0) v.destroyed = true; };
    v.dispose = () => { for (const p of v.projs) scene.remove(p.mesh); scene.remove(group); };
    return v;
  }

  /* ---------- 机枪快艇 ---------- */
  function createBoat(scene, deps) {
    const group = new THREE.Group();
    const hullM = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 5.0), new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.5, metalness: 0.4 }));
    hullM.position.y = 0.5;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 4), new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.5, metalness: 0.4 }));
    bow.rotation.x = Math.PI / 2; bow.position.set(0, 0.5, -3.3);
    const gunGroup = new THREE.Group(); gunGroup.position.set(0, 1.4, -0.6);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.2), new THREE.MeshStandardMaterial({ color: 0x1a1c1a, roughness: 0.6, metalness: 0.6 }));
    const barrelB = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.4, metalness: 0.7 }));
    barrelB.rotation.x = Math.PI / 2; barrelB.position.set(0, 0, -0.8);
    gunGroup.add(gun, barrelB);
    group.add(hullM, bow, gunGroup);
    group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(group);

    const v = {
      type: 'boat', group, barrelB, gunGroup,
      pos: new THREE.Vector3(0, 0.5, 42), aimYaw: 0, aimPitch: 0,
      hp: 260, maxHp: 260, destroyed: false,
      projs: [], fireCd: 0, steer: 0
    };

    v.update = (dt, input) => {
      if (v.destroyed) return;
      const speed = 8;
      v.steer += (input.left ? -1 : 0) + (input.right ? 1 : 0);
      v.steer = Math.max(-1, Math.min(1, v.steer));
      v.pos.x += v.steer * 4 * dt;
      v.pos.z -= speed * dt; // 自动前进
      v.pos.x = Math.max(-6, Math.min(6, v.pos.x)); // 河宽约束
      if (v.pos.z < -(70)) { /* 到终点由 mission 判定 */ }
      group.position.set(v.pos.x, 0.5, v.pos.z);
      group.rotation.y = -v.steer * 0.25;
      // 机枪瞄准（炮塔随视角旋转）
      v.aimYaw = input.aimYaw; v.aimPitch = input.aimPitch;
      gunGroup.rotation.y = v.aimYaw;
      barrelB.rotation.x = Math.PI / 2 + Math.max(-0.3, Math.min(0.4, v.aimPitch));
      v.fireCd -= dt;
      if (input.fire && v.fireCd <= 0) {
        v.fireCd = 0.16;
        const dir = new THREE.Vector3(-Math.sin(v.aimYaw), Math.tan(v.aimPitch), -Math.cos(v.aimYaw)).normalize();
        const muzzle = new THREE.Vector3(v.pos.x, 1.5, v.pos.z - 1.4).add(dir.clone().multiplyScalar(1.2));
        v.projs.push(makeProjectile(scene, muzzle, dir, 40, 0xffd090, deps));
      }
      updateProjectiles(v.projs, dt, scene, deps);
    };

    v.damage = (d) => { v.hp = Math.max(0, v.hp - d); if (v.hp <= 0) v.destroyed = true; };
    v.dispose = () => { for (const p of v.projs) scene.remove(p.mesh); scene.remove(group); };
    return v;
  }

  return { createTank, createBoat };
})();
