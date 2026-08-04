/* ============================================================
 * MEDKITS — 加血包
 * 浮动旋转的医疗箱，走近拾取 +30 血（上限100），定时重生
 * ============================================================ */
window.MEDKITS = (function () {

  function buildKit(scene, point, list) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xf0f4f8, roughness: 0.45, metalness: 0.1, emissive: 0x204030, emissiveIntensity: 0.3 })
    );
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xe03030, roughness: 0.4, metalness: 0.1, emissive: 0x8a1010, emissiveIntensity: 0.8 });
    const cv = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.13), crossMat);
    cv.position.y = 0.14;
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.32), crossMat);
    ch.position.y = 0.14;
    g.add(body, cv, ch);
    // 地面辉光 + 光点
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({
      color: 0x3aff7a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.04;
    g.add(glow);
    const light = new THREE.PointLight(0x3aff7a, 1.4, 7, 2);
    light.position.y = 0.6;
    g.add(light);
    g.position.set(point.x, 0.5, point.z);
    scene.add(g);
    list.push({ group: g, point, t: Math.random() * 6, light });
    return g;
  }

  function create(scene, deps) {
    const { player, onPickup } = deps;
    const medkits = [];
    const respawnQueue = [];

    function reset() {
      for (const m of medkits) scene.remove(m.group);
      medkits.length = 0;
      respawnQueue.length = 0;
      for (const p of WORLD.medkitPoints) buildKit(scene, p, medkits);
    }

    function update(dt) {
      for (let i = medkits.length - 1; i >= 0; i--) {
        const m = medkits[i];
        m.t += dt;
        m.group.position.y = 0.5 + Math.sin(m.t * 2) * 0.12;
        m.group.rotation.y += dt * 1.2;
        m.light.intensity = 1.4 + Math.sin(m.t * 3) * 0.5;
        // 拾取检测
        if (!player.alive) continue;
        const dx = player.pos.x - m.group.position.x;
        const dz = player.pos.z - m.group.position.z;
        if (dx * dx + dz * dz < 2.2) {
          scene.remove(m.group);
          medkits.splice(i, 1);
          if (onPickup) onPickup(m.point);
          respawnQueue.push({ point: m.point, t: 20 });
        }
      }
      // 重生
      for (let i = respawnQueue.length - 1; i >= 0; i--) {
        const q = respawnQueue[i];
        q.t -= dt;
        if (q.t <= 0) { respawnQueue.splice(i, 1); buildKit(scene, q.point, medkits); }
      }
    }

    return { update, reset };
  }

  return { create };
})();
