/* ============================================================
 * WORLD — 夜晚废弃军事基地地图
 * 建筑：围墙/岗亭/机库/集装箱/木箱/油桶/沙袋/探照灯/废墟/星空
 * 输出：colliders(AABB碰撞盒) / hitTargets(子弹可命中网格) / enemySpawnPoints
 * ============================================================ */
window.WORLD = (function () {

  const T = GameTextures;
  const group = new THREE.Group();
  const colliders = [];      // {minX,minY,minZ,maxX,maxY,maxZ}
  const hitTargets = [];     // 子弹射线可命中网格
  const enemySpawnPoints = [];
  const movingLights = [];

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.3, 12);

  // ---- 材质 ----
  const mConcrete = new THREE.MeshStandardMaterial({ map: T.concrete(), roughness: 0.92, metalness: 0.05 });
  const mRust = new THREE.MeshStandardMaterial({ map: T.rustedMetal(), roughness: 0.7, metalness: 0.55 });
  const mCorrugated = new THREE.MeshStandardMaterial({ map: T.corrugated(), roughness: 0.75, metalness: 0.45 });
  const mCrate = new THREE.MeshStandardMaterial({ map: T.crateWood(), roughness: 0.85, metalness: 0.02 });
  const mSand = new THREE.MeshStandardMaterial({ map: T.sandbag(), roughness: 0.95, metalness: 0 });
  const mDirt = new THREE.MeshStandardMaterial({ map: T.dirt(), roughness: 1, metalness: 0 });
  const mBarrel = new THREE.MeshStandardMaterial({ map: T.barrel(), roughness: 0.6, metalness: 0.5 });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.95, metalness: 0.1 });
  const mLightFixture = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });

  /* ---------- 基础体 ---------- */
  function addBox(cx, cy, cz, w, h, d, mat, collide) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(cx, cy, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    if (collide !== false) colliders.push({
      minX: cx - w / 2, minY: cy - h / 2, minZ: cz - d / 2,
      maxX: cx + w / 2, maxY: cy + h / 2, maxZ: cz + d / 2
    });
    hitTargets.push(m);
    return m;
  }
  function addCyl(cx, cy, cz, r, h, mat, collide) {
    const m = new THREE.Mesh(cylGeo, mat);
    m.scale.set(r / 0.6, h / 1.3, r / 0.6);
    m.position.set(cx, cy, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    if (collide !== false) {
      const w = r * 2;
      colliders.push({ minX: cx - w / 2, minY: cy - h / 2, minZ: cz - w / 2, maxX: cx + w / 2, maxY: cy + h / 2, maxZ: cz + w / 2 });
    }
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

  /* ---------- 探照灯 ---------- */
  function addFloodlight(px, pz, tx, tz, color, intensity, angle, sway) {
    const light = new THREE.SpotLight(color, intensity, 70, angle, 0.55, 1.2);
    light.position.set(px, 6.6, pz);
    light.target.position.set(tx, 0, tz);
    group.add(light);
    group.add(light.target);

    // 灯架
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 6.6, 8), mDark);
    pole.position.set(px, 3.3, pz);
    group.add(pole);
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), mLightFixture);
    fixture.position.set(px, 6.7, pz);
    group.add(fixture);
    colliders.push({ minX: px - 0.14, minY: 0, minZ: pz - 0.14, maxX: px + 0.14, maxY: 6.6, maxZ: pz + 0.14 });

    // 体积光锥（加法混合）
    const dir = new THREE.Vector3(tx - px, 0 - 6.6, tz - pz);
    const len = dir.length();
    const cone = new THREE.ConeGeometry(2.6, len, 12, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const coneMesh = new THREE.Mesh(cone, coneMat);
    coneMesh.position.copy(light.position).add(dir.clone().multiplyScalar(0.5));
    coneMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    group.add(coneMesh);

    // 地面光池
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(tx, 0.12, tz);
    group.add(pool);

    if (sway) movingLights.push({ target: light.target, base: new THREE.Vector3(tx, 0, tz), speed: sway, time: Math.random() * 7 });
    return light;
  }

  /* ---------- 墙体建造 ---------- */
  function addWall(cx, cz, w, h, d) { addBox(cx, h / 2, cz, w, h, d, mConcrete); }

  /* ---------- 主建图 ---------- */
  function build(scene) {
    scene.add(group);
    scene.fog = new THREE.Fog(0x0a0e18, 22, 150);

    // ===== 天空（渐变 + 星 + 月亮） =====
    const sky = document.createElement('canvas'); sky.width = 64; sky.height = 512;
    const sctx = sky.getContext('2d');
    const grad = sctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#050810');
    grad.addColorStop(0.42, '#0b1224');
    grad.addColorStop(0.66, '#1a2238');
    grad.addColorStop(0.82, '#463a28');
    grad.addColorStop(1.0, '#6a4f2c');
    sctx.fillStyle = grad; sctx.fillRect(0, 0, 64, 512);
    const skyTex = new THREE.CanvasTexture(sky);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), skyMat);
    skyMesh.rotation.y = Math.PI / 2;
    group.add(skyMesh);

    // 星星
    const starGeo = new THREE.BufferGeometry();
    const scount = 700, spos = new Float32Array(scount * 3), scol = new Float32Array(scount * 3);
    for (let i = 0; i < scount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.55 + 0.28); // 上半球 + 稍过地平线
      const r = 400;
      spos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      spos[i * 3 + 1] = r * Math.cos(phi);
      spos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const b = 0.5 + Math.random() * 0.5;
      scol[i * 3] = b; scol[i * 3 + 1] = b; scol[i * 3 + 2] = b + 0.08;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 1.4, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: false, fog: false
    }));
    group.add(stars);

    // 月亮
    const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 16), new THREE.MeshBasicMaterial({ color: 0xd8e2ff, fog: false }));
    moon.position.set(320, 190, -260);
    group.add(moon);
    const moonGlow = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshBasicMaterial({
      color: 0x9fb4e8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    moonGlow.position.copy(moon.position);
    group.add(moonGlow);

    // ===== 灯光 =====
    scene.add(new THREE.AmbientLight(0x24304a, 0.55));
    scene.add(new THREE.HemisphereLight(0x3a4a66, 0x161210, 0.55));
    const moonLight = new THREE.DirectionalLight(0x8fa6d6, 0.8);
    moonLight.position.set(45, 70, 25);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    moonLight.shadow.camera.left = -75; moonLight.shadow.camera.right = 75;
    moonLight.shadow.camera.top = 75; moonLight.shadow.camera.bottom = -75;
    moonLight.shadow.camera.near = 1; moonLight.shadow.camera.far = 180;
    moonLight.shadow.bias = -0.0004;
    moonLight.target.position.set(0, 0, 0);
    scene.add(moonLight); scene.add(moonLight.target);

    // 探照灯 ×4（暖色光池）
    addFloodlight(-32, 24, -18, 8, 0xffc27a, 3.0, 0.5, 0.25);
    addFloodlight(34, -6, 18, 0, 0xffb86a, 3.0, 0.55, 0.2);
    addFloodlight(0, -44, 0, -18, 0xffd08a, 2.6, 0.6, 0.15);
    addFloodlight(-44, -40, -28, -22, 0xffcf8f, 2.2, 0.45, 0.3);

    // ===== 地面 =====
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), mDirt);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);
    hitTargets.push(ground);

    // ===== 围墙（外围，南侧留门） =====
    addWall(0, -55, 110, 7, 1);    // 北墙
    addWall(-55, 0, 1, 7, 110);    // 西墙
    addWall(55, 0, 1, 7, 110);     // 东墙
    addWall(-28, 55, 44, 7, 1);    // 南墙左段
    addWall(28, 55, 44, 7, 1);     // 南墙右段
    addWall(-6, 55, 2, 7, 2);      // 门柱
    addWall(6, 55, 2, 7, 2);
    // 门前混凝土引道
    addBox(0, 0.12, 51, 18, 0.24, 9, mConcrete, false);

    // ===== 机库（中央） =====
    const hangX = 0, hangZ = -12, hangW = 36, hangH = 6, hangD = 24;
    addBox(hangX, 0.15, hangZ, hangW + 2, 0.3, hangD + 2, mConcrete, false); // 混凝土地板
    addWall(-10, hangZ - hangD / 2, 16, hangH, 1);   // 北墙左（留门）
    addWall(10, hangZ - hangD / 2, 16, hangH, 1);    // 北墙右
    addWall(hangX, hangZ + hangD / 2, hangW, hangH, 1); // 南墙
    addWall(hangX - hangW / 2, hangZ, 1, hangH, hangD); // 西墙
    addWall(hangX + hangW / 2, hangZ, 1, hangH, hangD); // 东墙
    addBox(hangX, hangH, hangZ, hangW, 0.4, hangD, mRust, false); // 屋顶(锈蚀板)
    // 机库内暖光
    const hangLight = new THREE.PointLight(0xffb060, 1.4, 26, 1.6);
    hangLight.position.set(0, 4.6, hangZ);
    group.add(hangLight);

    // ===== 集装箱 =====
    addBox(20, 1.8, -24, 10, 3.6, 3, mCorrugated);
    addBox(-20, 1.8, -30, 3, 3.6, 10, mCorrugated);
    addBox(24, 1.8, 12, 10, 3.6, 3, mCorrugated);
    addBox(24, 5.4, 12, 10, 3.6, 3, mCorrugated);   // 叠放
    addBox(-24, 1.8, 16, 3, 3.6, 10, mCorrugated);
    addBox(-8, 1.8, 33, 10, 3.6, 3, mCorrugated);

    // ===== 木箱 =====
    function crate(cx, cz, h) { addBox(cx, h ? 3.3 : 1.1, cz, 2.2, 2.2, 2.2, mCrate); }
    crate(2.5, 2.5); crate(2.5, 2.5, true); crate(-4, 5); crate(10, 18); crate(8, 20.5); crate(12, 20.5);
    crate(-14, -8); crate(-16, -8); crate(-15, -8, true); crate(33, -20); crate(36, -18);

    // ===== 油桶 =====
    function barrels(cx, cz, n) {
      for (let i = 0; i < n; i++) {
        const ox = cx + (i % 2 === 0 ? 0 : 1.1), oz = cz + Math.floor(i / 2) * 1.1;
        addCyl(ox, 0.65, oz, 0.6, 1.3, mBarrel);
      }
    }
    barrels(6, 49, 4); barrels(-17, -5, 4); barrels(35, 36, 3); barrels(-6, 40, 3); barrels(18, -40, 2);

    // ===== 沙袋掩体 =====
    function sandLine(x0, z, n) {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(boxGeo, mSand);
        m.scale.set(1.15, 1.05, 1.15);
        m.position.set(x0 + i * 1.2, 0.55, z);
        m.castShadow = true; m.receiveShadow = true;
        group.add(m);
        colliders.push({ minX: x0 + i * 1.2 - 0.6, minY: 0, minZ: z - 0.6, maxX: x0 + i * 1.2 + 0.6, maxY: 1.1, maxZ: z + 0.6 });
        hitTargets.push(m);
      }
    }
    sandLine(-8, 40, 14);
    sandLine(-26, 6, 9);
    sandLine(30, -8, 10);

    // ===== 岗亭（西北角） =====
    const tx = -40, tz = -40;
    const legGeo = new THREE.CylinderGeometry(0.22, 0.3, 5.6, 8);
    for (const [lx, lz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) {
      addCylRaw(tx + lx, 2.8, tz + lz, legGeo, mDark);
    }
    addBox(tx, 5.7, tz, 6.4, 0.35, 6.4, mRust);       // 平台
    addBox(tx, 6.4, tz, 6.4, 0.12, 6.4, mDark, false); // 地面护栏
    for (const [lx, lz] of [[-3.1, -3.1], [3.1, -3.1], [-3.1, 3.1], [3.1, 3.1]]) {
      addCylRaw(tx + lx, 6.2, tz + lz, new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), mDark, false);
    }
    addBox(tx, 8.1, tz, 7.6, 0.25, 7.6, mDark, false); // 顶棚

    // ===== 废墟残骸 =====
    addBox(6, 0.5, 30, 3.4, 1.0, 2.2, mConcrete);
    addBox(-6, 0.75, 26, 2.2, 1.5, 2.2, mConcrete);
    addBox(18, 0.5, -36, 4.2, 1.0, 2.0, mRust);
    addBox(-33, 0.45, 34, 3.0, 0.9, 2.4, mConcrete);
    addBox(46, 0.5, 20, 3.0, 1.0, 2.6, mRust);

    // ===== 敌人出生点 =====
    enemySpawnPoints.push(
      new THREE.Vector3(-44, 0, -44), new THREE.Vector3(44, 0, -44),
      new THREE.Vector3(44, 0, -30), new THREE.Vector3(-44, 0, 30),
      new THREE.Vector3(0, 0, -46), new THREE.Vector3(-28, 0, 44),
      new THREE.Vector3(30, 0, 44), new THREE.Vector3(0, 0, 48)
    );
  }

  /* ---------- 更新（探照灯扫描） ---------- */
  let t = 0;
  function update(dt) {
    t += dt;
    for (const ml of movingLights) {
      ml.target.x = ml.base.x + Math.sin(t * ml.speed + ml.time) * 5;
      ml.target.z = ml.base.z + Math.cos(t * ml.speed * 0.8 + ml.time) * 5;
    }
  }

  return {
    build, update,
    get colliders() { return colliders; },
    get hitTargets() { return hitTargets; },
    get enemySpawnPoints() { return enemySpawnPoints; },
    playerSpawn: { pos: new THREE.Vector3(0, 0, 42), yaw: Math.PI }
  };
})();
