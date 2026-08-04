/* ============================================================
 * WORLD — 多地图系统
 *   MAPS[0] 废弃军事基地(夜晚)  MAPS[1] 沙漠小镇(白昼)  MAPS[2] 霓虹实验室(赛博)
 * 输出：colliders / hitTargets / enemySpawnPoints / medkitPoints / getPlayerSpawn
 * ============================================================ */
import * as THREE from 'three';
import { GameTextures } from './textures.js';

export const WORLD = (function () {

  const T = GameTextures;
  const colliders = [];
  const hitTargets = [];
  const enemySpawnPoints = [];
  const medkitPoints = [];
  const movingLights = [];
  let group = null, scene = null, t = 0;
  let currentPlayerSpawn = null;
  let currentExposure = 1.9;
  let currentBloom = { strength: 0.4, radius: 0.5, threshold: 1.0 };

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.3, 12);

  /* ---------- 共享材质 ---------- */
  const mConcrete = new THREE.MeshStandardMaterial({ map: T.concrete(), roughness: 0.92, metalness: 0.05 });
  const mRust = new THREE.MeshStandardMaterial({ map: T.rustedMetal(), roughness: 0.7, metalness: 0.55 });
  const mCorrugated = new THREE.MeshStandardMaterial({ map: T.corrugated(), roughness: 0.75, metalness: 0.45 });
  const mCrate = new THREE.MeshStandardMaterial({ map: T.crateWood(), roughness: 0.85, metalness: 0.02 });
  const mSandBag = new THREE.MeshStandardMaterial({ map: T.sandbag(), roughness: 0.95, metalness: 0 });
  const mDirt = new THREE.MeshStandardMaterial({ map: T.dirt(), roughness: 1, metalness: 0 });
  const mBarrel = new THREE.MeshStandardMaterial({ map: T.barrel(), roughness: 0.6, metalness: 0.5 });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.95, metalness: 0.1 });
  const mLightFixture = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  // 沙漠
  const mSand = new THREE.MeshStandardMaterial({ map: T.sand(), roughness: 1, metalness: 0 });
  const mPlaster = new THREE.MeshStandardMaterial({ map: T.plaster(), roughness: 0.95, metalness: 0 });
  const mWoodLight = new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 1, metalness: 0 });
  const mLeaf = new THREE.MeshStandardMaterial({ color: 0x5a9a42, roughness: 0.9, metalness: 0 });
  const mStone = new THREE.MeshStandardMaterial({ color: 0x9a9288, roughness: 0.9, metalness: 0.1 });
  // 霓虹
  const mFloorGrid = new THREE.MeshStandardMaterial({ map: T.floorGrid(), roughness: 0.5, metalness: 0.6, emissive: 0x0a2638, emissiveIntensity: 0.5 });
  const mPanel = new THREE.MeshStandardMaterial({ map: T.panel(), roughness: 0.6, metalness: 0.5, emissive: 0x0c1c30, emissiveIntensity: 0.4 });
  const mNeonCyan = new THREE.MeshBasicMaterial({ color: 0x2fe9ff });
  const mNeonMagenta = new THREE.MeshBasicMaterial({ color: 0xff4fd8 });
  const mNeonOrange = new THREE.MeshBasicMaterial({ color: 0xff9a2e });
  const mWhite = new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.4, metalness: 0.3 });

  /* ---------- 基础体（挂到当前 group） ---------- */
  function addBox(cx, cy, cz, w, h, d, mat, collide) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(cx, cy, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    if (collide !== false) colliders.push({ minX: cx - w / 2, minY: cy - h / 2, minZ: cz - d / 2, maxX: cx + w / 2, maxY: cy + h / 2, maxZ: cz + d / 2 });
    hitTargets.push(m);
    return m;
  }
  function addBoxNoCollide(cx, cy, cz, w, h, d, mat) { return addBox(cx, cy, cz, w, h, d, mat, false); }
  function addCyl(cx, cy, cz, r, h, mat, collide) {
    const m = new THREE.Mesh(cylGeo, mat);
    m.scale.set(r / 0.6, h / 1.3, r / 0.6);
    m.position.set(cx, cy, cz);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    if (collide !== false) { const w = r * 2; colliders.push({ minX: cx - w / 2, minY: cy - h / 2, minZ: cz - w / 2, maxX: cx + w / 2, maxY: cy + h / 2, maxZ: cz + w / 2 }); }
    hitTargets.push(m);
    return m;
  }
  function addCylRaw(cx, cy, cz, geo, mat, collide) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, cy, cz);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    if (collide !== false) {
      const w = 0.5, h = geo.parameters.height || 2;
      colliders.push({ minX: cx - w, minY: cy - h / 2, minZ: cz - w, maxX: cx + w, maxY: cy + h / 2, maxZ: cz + w });
    }
    return m;
  }
  function addWall(cx, cz, w, h, d, mat) { addBox(cx, h / 2, cz, w, h, d, mat || mConcrete); }
  function addGround(cx, cz, size, mat, color) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    g.rotation.x = -Math.PI / 2;
    g.position.set(cx, 0, cz);
    g.receiveShadow = true;
    group.add(g);
    hitTargets.push(g);
    const h = size / 2;
    colliders.push({ minX: cx - h, minY: 0, minZ: cz - h, maxX: cx + h, maxY: 0.02, maxZ: cz + h });
  }

  /* ---------- 探照灯 ---------- */
  function addFloodlight(px, pz, tx, tz, color, intensity, angle, sway, castShadow) {
    const light = new THREE.SpotLight(color, intensity, 70, angle, 0.55, 1.2);
    light.position.set(px, 6.6, pz);
    light.target.position.set(tx, 0, tz);
    if (castShadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.002;
    }
    group.add(light); group.add(light.target);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 6.6, 8), mDark);
    pole.position.set(px, 3.3, pz);
    group.add(pole);
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), mLightFixture);
    fixture.position.set(px, 6.7, pz);
    group.add(fixture);
    colliders.push({ minX: px - 0.14, minY: 0, minZ: pz - 0.14, maxX: px + 0.14, maxY: 6.6, maxZ: pz + 0.14 });
    const dir = new THREE.Vector3(tx - px, 0 - 6.6, tz - pz);
    const len = dir.length();
    const cone = new THREE.ConeGeometry(2.6, len, 12, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const coneMesh = new THREE.Mesh(cone, coneMat);
    coneMesh.position.copy(light.position).add(dir.clone().multiplyScalar(0.5));
    coneMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    group.add(coneMesh);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(4.6, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(tx, 0.12, tz);
    group.add(pool);
    if (sway) movingLights.push({ target: light.target, base: new THREE.Vector3(tx, 0, tz), speed: sway, time: Math.random() * 7 });
    return light;
  }
  function addLight(light) { group.add(light); if (light.target) group.add(light.target); return light; }

  /* ---------- 沙漠棕榈 ---------- */
  function palm(cx, cz) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 4.5, 6), mWoodLight);
    trunk.position.set(cx, 2.25, cz);
    trunk.castShadow = true;
    group.add(trunk);
    colliders.push({ minX: cx - 0.2, minY: 0, minZ: cz - 0.2, maxX: cx + 0.2, maxY: 4.5, maxZ: cz + 0.2 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 4), mLeaf);
      leaf.position.set(cx + Math.cos(a) * 1.1, 4.4 + Math.sin(i * 3) * 0.3, cz + Math.sin(a) * 1.1);
      leaf.rotation.x = Math.cos(a) * 0.9;
      leaf.rotation.z = Math.sin(a) * 0.9;
      group.add(leaf);
    }
  }

  /* ---------- 云朵（白天） ---------- */
  function addClouds() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const px = 30 + Math.random() * 196, py = 40 + Math.random() * 48, pr = 18 + Math.random() * 34;
      const gg = x.createRadialGradient(px, py, pr * 0.15, px, py, pr);
      gg.addColorStop(0, 'rgba(255,255,255,0.9)');
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gg; x.beginPath(); x.arc(px, py, pr, 0, Math.PI * 2); x.fill();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(45 + Math.random() * 35, 13 + Math.random() * 8),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, depthWrite: false, fog: false })
      );
      const a = Math.random() * Math.PI * 2, r = 140 + Math.random() * 90;
      m.position.set(Math.cos(a) * r, 65 + Math.random() * 45, Math.sin(a) * r);
      m.rotation.x = -Math.PI / 2;
      group.add(m);
    }
  }

  /* ---------- 地面碎石（纯视觉） ---------- */
  function scatterRocks(n, spread, mat) {
    const rocks = new THREE.InstancedMesh(boxGeo, mat || mDark, n);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = 0.18 + Math.random() * 0.45;
      pos.set((Math.random() * 2 - 1) * spread, s * 0.28, (Math.random() * 2 - 1) * spread);
      q.setFromEuler(new THREE.Euler(Math.random(), Math.random() * 3, Math.random()));
      mtx.compose(pos, q, new THREE.Vector3(s, s * 0.6, s));
      rocks.setMatrixAt(i, mtx);
    }
    rocks.instanceMatrix.needsUpdate = true;
    rocks.receiveShadow = true;
    group.add(rocks);
  }

  /* ---------- 夜空 ---------- */
  function skyNight() {
    const sky = document.createElement('canvas'); sky.width = 64; sky.height = 512;
    const sctx = sky.getContext('2d');
    const grad = sctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#101a30');
    grad.addColorStop(0.42, '#1a2540');
    grad.addColorStop(0.66, '#2c3c5e');
    grad.addColorStop(0.82, '#6a5230');
    grad.addColorStop(1.0, '#a5823e');
    sctx.fillStyle = grad; sctx.fillRect(0, 0, 64, 512);
    const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), skyMat);
    skyMesh.rotation.y = Math.PI / 2;
    group.add(skyMesh);
    // 星星
    const starGeo = new THREE.BufferGeometry();
    const scount = 700, spos = new Float32Array(scount * 3), scol = new Float32Array(scount * 3);
    for (let i = 0; i < scount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.55 + 0.28);
      const r = 400;
      spos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      spos[i * 3 + 1] = r * Math.cos(phi);
      spos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const b = 0.5 + Math.random() * 0.5;
      scol[i * 3] = b; scol[i * 3 + 1] = b; scol[i * 3 + 2] = b + 0.08;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.4, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: false, fog: false }));
    group.add(stars);
    // 月亮
    const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 16), new THREE.MeshBasicMaterial({ color: 0xd8e2ff, fog: false }));
    moon.position.set(320, 190, -260);
    group.add(moon);
    const moonGlow = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshBasicMaterial({ color: 0x9fb4e8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    moonGlow.position.copy(moon.position);
    group.add(moonGlow);
  }
  /* ---------- 白天天空 ---------- */
  function skyDay() {
    const sky = document.createElement('canvas'); sky.width = 64; sky.height = 512;
    const sctx = sky.getContext('2d');
    const grad = sctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#3a6fd0');
    grad.addColorStop(0.55, '#6f9de0');
    grad.addColorStop(0.8, '#a8c4e8');
    grad.addColorStop(1.0, '#d9cfa8');
    sctx.fillStyle = grad; sctx.fillRect(0, 0, 64, 512);
    const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), skyMat);
    skyMesh.rotation.y = Math.PI / 2;
    group.add(skyMesh);
    // 太阳
    const sun = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
    sun.position.set(300, 200, -260);
    group.add(sun);
    const sunGlow = new THREE.Mesh(new THREE.CircleGeometry(34, 24), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sunGlow.position.copy(sun.position);
    group.add(sunGlow);
  }
  /* ---------- 天空盒通用 ---------- */
  function skybox(canvas) {
    const skyTex = new THREE.CanvasTexture(canvas); skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), skyMat);
    skyMesh.rotation.y = Math.PI / 2;
    group.add(skyMesh);
    return skyMesh;
  }

  /* ============================================================
   * 地图 0：废弃军事基地（夜晚）
   * ============================================================ */
  function buildBase() {
    scene.fog = new THREE.Fog(0x0d1520, 22, 150);
    skyNight();
    addLight(new THREE.AmbientLight(0x31405e, 1.1));
    addLight(new THREE.HemisphereLight(0x5566a0, 0x241f12, 1.0));
    const moonLight = new THREE.DirectionalLight(0xaabcf0, 1.5);
    moonLight.position.set(45, 70, 25);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(4096, 4096);
    moonLight.shadow.camera.left = -75; moonLight.shadow.camera.right = 75;
    moonLight.shadow.camera.top = 75; moonLight.shadow.camera.bottom = -75;
    moonLight.shadow.camera.near = 1; moonLight.shadow.camera.far = 180;
    moonLight.shadow.bias = -0.0004;
    moonLight.target.position.set(0, 0, 0);
    addLight(moonLight);

    addFloodlight(-32, 24, -18, 8, 0xffc27a, 9.0, 0.5, 0.25);
    addFloodlight(34, -6, 18, 0, 0xffb86a, 9.0, 0.55, 0.2);
    addFloodlight(0, -44, 0, -18, 0xffd08a, 8.0, 0.6, 0.15);
    addFloodlight(-44, -40, -28, -22, 0xffcf8f, 7.0, 0.45, 0.3);
    addFloodlight(-12, 48, -10, 28, 0xffd9a0, 8.0, 0.42, 0.18, true);
    addFloodlight(14, 48, 12, 28, 0xffc98a, 8.0, 0.42, 0.18, true);
    currentExposure = 1.9;
    currentBloom = { strength: 0.35, radius: 0.5, threshold: 1.0 };

    addGround(0, 0, 130, mDirt);
    // 围墙
    addWall(0, -55, 110, 7, 1); addWall(-55, 0, 1, 7, 110); addWall(55, 0, 1, 7, 110);
    addWall(-28, 55, 44, 7, 1); addWall(28, 55, 44, 7, 1);
    addWall(-6, 55, 2, 7, 2); addWall(6, 55, 2, 7, 2);
    addBoxNoCollide(0, 0.12, 51, 18, 0.24, 9, mConcrete);
    // 机库
    const hz = -12;
    addBoxNoCollide(0, 0.15, hz, 38, 0.3, 26, mConcrete);
    addWall(-10, hz - 12, 16, 6, 1); addWall(10, hz - 12, 16, 6, 1);
    addWall(0, hz + 12, 36, 6, 1); addWall(-18, hz, 1, 6, 24); addWall(18, hz, 1, 6, 24);
    addBoxNoCollide(0, 6, hz, 36, 0.4, 24, mRust);
    const hangLight = new THREE.PointLight(0xffb060, 1.6, 26, 1.6);
    hangLight.position.set(0, 4.6, hz); group.add(hangLight);
    // 集装箱
    addBox(20, 1.8, -24, 10, 3.6, 3, mCorrugated);
    addBox(-20, 1.8, -30, 3, 3.6, 10, mCorrugated);
    addBox(24, 1.8, 12, 10, 3.6, 3, mCorrugated);
    addBox(24, 5.4, 12, 10, 3.6, 3, mCorrugated);
    addBox(-24, 1.8, 16, 3, 3.6, 10, mCorrugated);
    addBox(-8, 1.8, 33, 10, 3.6, 3, mCorrugated);
    // 木箱
    addBox(2.5, 1.1, 2.5, 2.2, 2.2, 2.2, mCrate); addBox(2.5, 3.3, 2.5, 2.2, 2.2, 2.2, mCrate);
    addBox(-4, 1.1, 5, 2.2, 2.2, 2.2, mCrate);
    addBox(10, 1.1, 18, 2.2, 2.2, 2.2, mCrate); addBox(8, 1.1, 20.5, 2.2, 2.2, 2.2, mCrate); addBox(12, 1.1, 20.5, 2.2, 2.2, 2.2, mCrate);
    addBox(-14, 1.1, -8, 2.2, 2.2, 2.2, mCrate); addBox(-16, 1.1, -8, 2.2, 2.2, 2.2, mCrate); addBox(-15, 3.3, -8, 2.2, 2.2, 2.2, mCrate);
    addBox(33, 1.1, -20, 2.2, 2.2, 2.2, mCrate); addBox(36, 1.1, -18, 2.2, 2.2, 2.2, mCrate);
    // 油桶
    function barrels(cx, cz, n) {
      for (let i = 0; i < n; i++) addCyl(cx + (i % 2 === 0 ? 0 : 1.1), 0.65, cz + Math.floor(i / 2) * 1.1, 0.6, 1.3, mBarrel);
    }
    barrels(6, 49, 4); barrels(-17, -5, 4); barrels(35, 36, 3); barrels(-6, 40, 3); barrels(18, -40, 2);
    // 沙袋
    function sandLine(x0, z, n) {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(boxGeo, mSandBag);
        m.scale.set(1.15, 1.05, 1.15);
        m.position.set(x0 + i * 1.2, 0.55, z);
        m.castShadow = true; m.receiveShadow = true;
        group.add(m);
        colliders.push({ minX: x0 + i * 1.2 - 0.6, minY: 0, minZ: z - 0.6, maxX: x0 + i * 1.2 + 0.6, maxY: 1.1, maxZ: z + 0.6 });
        hitTargets.push(m);
      }
    }
    sandLine(-8, 40, 14); sandLine(-26, 6, 9); sandLine(30, -8, 10);
    // 岗亭
    const tx = -40, tz = -40;
    const legGeo = new THREE.CylinderGeometry(0.22, 0.3, 5.6, 8);
    for (const [lx, lz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) addCylRaw(tx + lx, 2.8, tz + lz, legGeo, mDark);
    addBox(tx, 5.7, tz, 6.4, 0.35, 6.4, mRust);
    addBoxNoCollide(tx, 6.4, tz, 6.4, 0.12, 6.4, mDark);
    for (const [lx, lz] of [[-3.1, -3.1], [3.1, -3.1], [-3.1, 3.1], [3.1, 3.1]]) addCylRaw(tx + lx, 6.2, tz + lz, new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), mDark, false);
    addBoxNoCollide(tx, 8.1, tz, 7.6, 0.25, 7.6, mDark);
    // 废墟
    addBox(6, 0.5, 30, 3.4, 1.0, 2.2, mConcrete);
    addBox(-6, 0.75, 26, 2.2, 1.5, 2.2, mConcrete);
    addBox(18, 0.5, -36, 4.2, 1.0, 2.0, mRust);
    addBox(-33, 0.45, 34, 3.0, 0.9, 2.4, mConcrete);
    addBox(46, 0.5, 20, 3.0, 1.0, 2.6, mRust);
    scatterRocks(50, 45);

    enemySpawnPoints.push(
      new THREE.Vector3(-44, 0, -44), new THREE.Vector3(44, 0, -44),
      new THREE.Vector3(44, 0, -30), new THREE.Vector3(-44, 0, 30),
      new THREE.Vector3(0, 0, -46), new THREE.Vector3(-28, 0, 44),
      new THREE.Vector3(30, 0, 44), new THREE.Vector3(44, 0, 40)
    );
    medkitPoints.push({ x: -6, z: 34 }, { x: 14, z: -8 }, { x: -16, z: 12 }, { x: 30, z: 26 }, { x: 0, z: -38 });
    currentPlayerSpawn = { pos: new THREE.Vector3(0, 0, 37), yaw: 0 };
  }

  /* ============================================================
   * 地图 1：沙漠小镇（白昼）
   * ============================================================ */
  function buildDesert() {
    scene.fog = new THREE.Fog(0xd6cab0, 45, 240);
    skyDay();
    addLight(new THREE.AmbientLight(0xfff2dc, 1.05));
    addLight(new THREE.HemisphereLight(0xbfd4ff, 0x9a8a6a, 1.0));
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.9);
    sun.position.set(60, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
    sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.0004;
    sun.target.position.set(0, 0, 0);
    addLight(sun);

    addGround(0, 0, 130, mSand);

    // 土坯建筑
    addWall(0, -30, 30, 6, 12, mPlaster);
    addWall(18, -18, 8, 5, 14, mPlaster);
    addWall(-22, -12, 12, 5, 10, mPlaster);
    addWall(13, 18, 13, 5, 9, mPlaster);
    addWall(-15, 24, 11, 5, 9, mPlaster);
    addWall(-34, 40, 3, 5, 14, mPlaster);
    addWall(38, -34, 3, 5, 14, mPlaster);
    // 低矮土墙掩体
    addWall(-24, -34, 12, 2, 1.2, mPlaster);
    addWall(26, -6, 10, 2, 1.2, mPlaster);
    addWall(-28, 14, 8, 2, 1.2, mPlaster);
    addWall(28, 30, 12, 2, 1.2, mPlaster);
    addWall(0, 42, 16, 2, 1.2, mPlaster);
    // 中央水井 + 遮阳棚
    addCyl(0, 0.6, 0, 1.9, 1.2, mStone);
    const wellTop = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 6), mStone);
    wellTop.position.set(0, 2.4, 0);
    wellTop.castShadow = true;
    group.add(wellTop);
    colliders.push({ minX: -2.6, minY: 0, minZ: -2.6, maxX: 2.6, maxY: 3.2, maxZ: 2.6 });
    hitTargets.push(wellTop);
    // 木台 + 摊位
    addBox(12, 1.0, -10, 6, 0.4, 3, mWoodLight);
    addBox(12, 1.0, -10, 6, 0.2, 3, mPlaster, false); // 台面篷布
    addBox(-10, 1.0, 8, 4, 0.35, 2.5, mWoodLight);
    // 棕榈树
    palm(6, -18); palm(-8, 24); palm(22, 6); palm(-20, -26); palm(26, 36); palm(-30, -6);
    addClouds();
    scatterRocks(60, 46, mStone);
    // 木箱 / 油桶 / 沙袋
    addBox(4, 1.1, -6, 2.2, 2.2, 2.2, mCrate); addBox(6, 1.1, -7, 2.2, 2.2, 2.2, mCrate);
    addBox(-5, 1.1, -2, 2.2, 2.2, 2.2, mCrate); addBox(-7, 1.1, -3, 2.2, 2.2, 2.2, mCrate);
    addBox(18, 1.1, 30, 2.2, 2.2, 2.2, mCrate); addBox(-18, 1.1, 32, 2.2, 2.2, 2.2, mCrate);
    addCyl(20, 0.65, -24, 0.6, 1.3, mBarrel); addCyl(21.1, 0.65, -24, 0.6, 1.3, mBarrel);
    addCyl(-20, 0.65, 34, 0.6, 1.3, mBarrel); addCyl(-21.1, 0.65, 34, 0.6, 1.3, mBarrel);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(boxGeo, mSandBag);
      m.scale.set(1.15, 1.05, 1.15);
      m.position.set(-12 + i * 1.2, 0.55, -16);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
      colliders.push({ minX: -12 + i * 1.2 - 0.6, minY: 0, minZ: -16.6, maxX: -12 + i * 1.2 + 0.6, maxY: 1.1, maxZ: -15.4 });
      hitTargets.push(m);
    }

    enemySpawnPoints.push(
      new THREE.Vector3(-44, 0, -44), new THREE.Vector3(44, 0, -44),
      new THREE.Vector3(44, 0, 44), new THREE.Vector3(-44, 0, 44),
      new THREE.Vector3(0, 0, -48), new THREE.Vector3(0, 0, 48),
      new THREE.Vector3(-40, 0, 0), new THREE.Vector3(40, 0, 0)
    );
    medkitPoints.push({ x: 8, z: 8 }, { x: -12, z: 18 }, { x: 24, z: -6 }, { x: -24, z: -18 }, { x: 0, z: 32 });
    currentExposure = 1.3;
    currentBloom = { strength: 0.28, radius: 0.4, threshold: 1.0 };
    currentPlayerSpawn = { pos: new THREE.Vector3(-42, 0, -40), yaw: Math.atan2(-42, -40) };
  }

  /* ============================================================
   * 地图 2：霓虹实验室（赛博）
   * ============================================================ */
  function buildLab() {
    scene.fog = new THREE.Fog(0x0a0e16, 18, 130);
    scene.background = new THREE.Color(0x060810);
    addLight(new THREE.AmbientLight(0x2a3e6a, 1.2));
    addLight(new THREE.HemisphereLight(0x46629a, 0x12141c, 0.9));
    // 主冷光
    const key = new THREE.DirectionalLight(0x8ab4ff, 1.2);
    key.position.set(-40, 60, 20);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    key.shadow.camera.left = -70; key.shadow.camera.right = 70;
    key.shadow.camera.top = 70; key.shadow.camera.bottom = -70;
    key.shadow.camera.near = 1; key.shadow.camera.far = 180;
    key.shadow.bias = -0.0004;
    addLight(key);
    // 霓虹点光
    const pl = (x, z, color, i) => {
      const l = new THREE.PointLight(color, i, 22, 1.8);
      l.position.set(x, 4.5, z);
      group.add(l);
    };
    pl(-30, -20, 0x2fe9ff, 1.4); pl(30, -20, 0xff4fd8, 1.3); pl(-30, 24, 0xff9a2e, 1.4); pl(30, 24, 0x2fe9ff, 1.4);
    pl(0, -40, 0xff4fd8, 1.2); pl(0, 40, 0x2fe9ff, 1.2);

    addGround(0, 0, 120, mFloorGrid);
    // 四周金属墙
    addWall(0, -55, 110, 9, 1, mPanel); addWall(0, 55, 110, 9, 1, mPanel);
    addWall(-55, 0, 1, 9, 110, mPanel); addWall(55, 0, 1, 9, 110, mPanel);
    // 霓虹灯带
    const trim = (cx, cz, w, d, mat) => {
      const b = new THREE.Mesh(boxGeo, mat);
      b.scale.set(w, 0.08, d);
      b.position.set(cx, 8.6, cz);
      group.add(b);
    };
    trim(0, -55, 110, 0.4, mNeonCyan); trim(0, 55, 110, 0.4, mNeonMagenta);
    trim(-55, 0, 0.4, 110, mNeonOrange); trim(55, 0, 0.4, 110, mNeonCyan);
    // 内部隔墙 + 立柱
    addWall(0, -30, 20, 6, 1, mPanel); addWall(0, 30, 20, 6, 1, mPanel);
    addWall(-30, 0, 1, 6, 20, mPanel); addWall(30, 0, 1, 6, 20, mPanel);
    const pillar = (x, z) => {
      addBox(x, 4, z, 2, 8, 2, mPanel);
      const strip = new THREE.Mesh(boxGeo, mNeonCyan);
      strip.scale.set(0.08, 7.6, 0.08);
      strip.position.set(x, 4, z);
      group.add(strip);
    };
    pillar(-20, -20); pillar(20, -20); pillar(-20, 20); pillar(20, 20);
    // 中央悬浮平台
    addBox(0, 1.2, 0, 8, 0.5, 8, mWhite);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 12), mNeonMagenta);
    core.position.set(0, 2.7, 0);
    group.add(core);
    hitTargets.push(core);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 1.6, 0);
    group.add(glow);
    const coreLight = new THREE.PointLight(0xff4fd8, 2.2, 24, 1.8);
    coreLight.position.set(0, 3.2, 0);
    group.add(coreLight);
    // 掩体：发光的箱体 / 低墙
    addBox(14, 1.1, -18, 3.4, 2.2, 3.4, mWhite); addBox(-14, 1.1, 18, 3.4, 2.2, 3.4, mWhite);
    addBox(-14, 1.1, -18, 3.4, 2.2, 3.4, mPanel); addBox(14, 1.1, 18, 3.4, 2.2, 3.4, mPanel);
    addWall(-40, -30, 12, 1.6, 1, mPanel); addWall(40, 30, 12, 1.6, 1, mPanel);
    addWall(-40, 30, 12, 1.6, 1, mPanel); addWall(40, -30, 12, 1.6, 1, mPanel);
    // 霓虹地标
    const icon = (x, z, mat) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 8), mat);
      b.position.set(x, 1.2, z);
      group.add(b);
    };
    icon(-30, -40, mNeonCyan); icon(30, -40, mNeonOrange); icon(-30, 40, mNeonMagenta); icon(30, 40, mNeonCyan);

    enemySpawnPoints.push(
      new THREE.Vector3(-46, 0, -46), new THREE.Vector3(46, 0, -46),
      new THREE.Vector3(46, 0, 46), new THREE.Vector3(-46, 0, 46),
      new THREE.Vector3(0, 0, -50), new THREE.Vector3(0, 0, 50),
      new THREE.Vector3(-48, 0, 0), new THREE.Vector3(48, 0, 0)
    );
    medkitPoints.push({ x: 0, z: 20 }, { x: -18, z: -14 }, { x: 20, z: -18 }, { x: 0, z: -30 }, { x: 14, z: 24 });
    currentExposure = 1.6;
    currentBloom = { strength: 0.9, radius: 0.6, threshold: 0.85 };
    currentPlayerSpawn = { pos: new THREE.Vector3(-42, 0, -42), yaw: Math.atan2(42, 42) };
  }

  /* ---------- 地图表 ---------- */
  const MAPS = [
    { id: 'base', name: '废弃军事基地', desc: '夜晚 · 探照灯 · 夜雾', build: buildBase },
    { id: 'desert', name: '沙漠小镇', desc: '白昼 · 阳光 · 土坯房', build: buildDesert },
    { id: 'lab', name: '霓虹实验室', desc: '赛博 · 冷色霓虹管线', build: buildLab }
  ];

  /* ---------- 加载地图 ---------- */
  function loadMap(sceneRef, index) {
    scene = sceneRef;
    if (group) scene.remove(group);
    colliders.length = 0;
    hitTargets.length = 0;
    enemySpawnPoints.length = 0;
    medkitPoints.length = 0;
    movingLights.length = 0;
    group = new THREE.Group();
    scene.add(group);
    scene.fog = null;
    scene.background = null;
    currentPlayerSpawn = null;
    (MAPS[index] || MAPS[0]).build();
  }

  /* ---------- 更新（探照灯扫描） ---------- */
  function update(dt) {
    t += dt;
    for (const ml of movingLights) {
      ml.target.x = ml.base.x + Math.sin(t * ml.speed + ml.time) * 5;
      ml.target.z = ml.base.z + Math.cos(t * ml.speed * 0.8 + ml.time) * 5;
    }
  }

  /* ---------- 应用 CC0 PBR 贴图（热更新，无需重建） ---------- */
  function applyPBR(t) {
    const apply = (mat, set, env = 0.5) => {
      if (!set || !set.color) return;
      mat.map = set.color;
      mat.normalMap = set.normal || null;
      mat.roughnessMap = set.roughness || null;
      mat.envMapIntensity = env;
      mat.needsUpdate = true;
    };
    apply(mConcrete, t.concrete, 0.35);
    apply(mDirt, t.dirt, 0.3);
    apply(mSand, t.sand, 0.3);
    apply(mRust, t.rust, 0.7);
    apply(mCrate, t.crate, 0.4);
    apply(mBarrel, t.rust, 0.6);
  }

  return {
    MAPS, loadMap, update, applyPBR,
    getLightingProfile: () => ({ exposure: currentExposure, bloom: currentBloom }),
    get colliders() { return colliders; },
    get hitTargets() { return hitTargets; },
    get enemySpawnPoints() { return enemySpawnPoints; },
    get medkitPoints() { return medkitPoints; },
    getPlayerSpawn() { return currentPlayerSpawn; }
  };
})();
