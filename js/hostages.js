/* ============================================================
 * HOSTAGES — 人质 NPC
 * 平民外观（与歹徒不同），被解救后自己跑向出口，全部安全到达才通关
 * ============================================================ */
import * as THREE from 'three';
import { WORLD } from './world.js';

export const HOSTAGES = (function () {

  /* 平民模型：便装、无头盔/面罩/武器 */
  function buildModel() {
    const g = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: 0xcfc4ae, roughness: 0.9, metalness: 0 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.95, metalness: 0 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7a58, roughness: 0.85, metalness: 0 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9, metalness: 0 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.4, 4, 10), shirt); torso.position.y = 1.05;
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.45, 4, 8), pants); legL.position.set(-0.13, 0.3, 0);
    const legR = legL.clone(); legR.position.x = 0.13;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin); head.position.y = 1.58;
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); hairM.position.y = 1.68;
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), shirt); armL.position.set(-0.28, 1.1, 0);
    const armR = armL.clone(); armR.position.x = 0.28;
    g.add(torso, legL, legR, head, hairM, armL, armR);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  function create(scene, deps) {
    const list = [];
    const raycaster = new THREE.Raycaster();
    const _v = new THREE.Vector3();

    function place(points) {
      reset();
      for (let i = 0; i < points.length; i++) {
        const g = buildModel();
        g.position.set(points[i].x, 0, points[i].z);
        scene.add(g);
        list.push({ group: g, pos: new THREE.Vector3(points[i].x, 0, points[i].z), freed: false, safe: false, runPhase: Math.random() * 6 });
      }
    }
    function free(i) { if (list[i]) { list[i].freed = true; } }

    function blocked(bot, dir) {
      raycaster.set(_v.set(bot.pos.x, 1.0, bot.pos.z), dir); raycaster.far = 2.5;
      if (raycaster.intersectObjects(WORLD.hitTargets, false).length) return true;
      raycaster.set(_v.set(bot.pos.x, 0.8, bot.pos.z), dir); raycaster.far = 2.5;
      return raycaster.intersectObjects(WORLD.hitTargets, false).length > 0;
    }

    function update(dt) {
      const end = deps.getExit();
      if (!end) return;
      for (const h of list) {
        if (!h.freed || h.safe) continue;
        const to = new THREE.Vector3(end.x - h.pos.x, 0, end.z - h.pos.z);
        const dist = to.length();
        if (dist < 3) { h.safe = true; continue; }
        let dir = to.normalize();
        if (blocked(h, dir)) {
          for (const a of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
            const alt = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
            if (!blocked(h, alt)) { dir = alt; break; }
          }
        }
        const step = dir.multiplyScalar(4.5 * dt);
        const r = 0.35;
        const box = { minX: h.pos.x + step.x - r, minY: 0, minZ: h.pos.z + step.z - r, maxX: h.pos.x + step.x + r, maxY: 1.6, maxZ: h.pos.z + step.z + r };
        let hit = false;
        for (const c of WORLD.colliders) {
          if (c.maxY <= 0.1) continue;
          if (box.minX < c.maxX && box.maxX > c.minX && box.minY < c.maxY && box.maxY > c.minY && box.minZ < c.maxZ && box.maxZ > c.minZ) { hit = true; break; }
        }
        if (!hit) h.pos.add(step);
        h.group.position.set(h.pos.x, 0, h.pos.z);
        h.group.rotation.y = Math.atan2(-dir.x, -dir.z);
        h.runPhase += dt * 12;
        h.group.position.y = Math.abs(Math.sin(h.runPhase)) * 0.15; // 跑步起伏
      }
    }

    function getSafeCount() { return list.filter(h => h.safe).length; }
    function reset() { for (const h of list) scene.remove(h.group); list.length = 0; }

    return { place, free, update, getSafeCount, reset, get list() { return list; } };
  }

  return { create };
})();
