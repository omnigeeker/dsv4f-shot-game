/* ============================================================
 * WEAPONS — 手枪/步枪武器系统
 * 开火/后坐力/散布/曳光/命中特效/换弹/切枪 + 第一人称枪模 + 粒子FX
 * ============================================================ */
window.WEAPONS = (function () {

  /* ---------- 粒子 FX（供武器与敌人共用） ---------- */
  const FX = (function () {
    const MAX = 700;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX * 3);
    const col = new Float32Array(MAX * 3);
    const vel = new Float32Array(MAX * 3);
    const life = new Float32Array(MAX);
    const maxLife = new Float32Array(MAX);
    const gravA = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.09, vertexColors: true, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    pts.frustumCulled = false;

    function spawnBurst(center, color, count, speed, lifeT, grav, spread) {
      let n = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) {
          life[i] = maxLife[i] = lifeT * (0.7 + Math.random() * 0.6);
          const s = (spread !== undefined ? spread : 1);
          vel[i * 3] = (Math.random() - 0.5) * speed * s;
          vel[i * 3 + 1] = (Math.random() - 0.5) * speed * s + (grav ? 1.5 : 0);
          vel[i * 3 + 2] = (Math.random() - 0.5) * speed * s;
          gravA[i] = (grav !== undefined ? grav : 0.5);
          pos[i * 3] = center.x; pos[i * 3 + 1] = center.y; pos[i * 3 + 2] = center.z;
          const cc = new THREE.Color(color);
          const v = 0.6 + Math.random() * 0.4;
          col[i * 3] = cc.r * v; col[i * 3 + 1] = cc.g * v; col[i * 3 + 2] = cc.b * v;
          if (++n >= count) break;
        }
      }
    }
    function update(dt) {
      let any = false;
      for (let i = 0; i < MAX; i++) {
        if (life[i] > 0) {
          any = true;
          life[i] -= dt;
          vel[i * 3 + 1] -= 14 * dt * gravA[i];
          pos[i * 3] += vel[i * 3] * dt;
          pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
          pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        }
      }
      if (any) {
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      }
    }
    return { pts, spawnBurst, update };
  })();

  /* ---------- 武器数据 ---------- */
  const SPECS = {
    rifle: {
      name: 'AK-47', auto: true, magSize: 30, reserve: 90,
      dmg: 34, headDmg: 128, fireRate: 0.105,
      spread: 0.006, moveSpread: 0.028, recoilPitch: 0.014,
      kick: 0.05, reloadTime: 2.2, switchTime: 0.35,
      muzzleOffset: [0, 0.015, -0.66], tracerColor: 0xffe0a0
    },
    smg: {
      name: 'SMG-11', auto: true, magSize: 32, reserve: 128,
      dmg: 22, headDmg: 84, fireRate: 0.075,
      spread: 0.008, moveSpread: 0.034, recoilPitch: 0.008,
      kick: 0.035, reloadTime: 1.9, switchTime: 0.3,
      muzzleOffset: [0, 0.015, -0.55], tracerColor: 0xffe8c0
    },
    shotgun: {
      name: 'SG-870', auto: false, magSize: 8, reserve: 32,
      dmg: 12, headDmg: 26, fireRate: 0.85, pellets: 8,
      spread: 0.055, moveSpread: 0.02, recoilPitch: 0.035,
      kick: 0.13, reloadTime: 2.8, switchTime: 0.4,
      muzzleOffset: [0, 0.025, -0.72], tracerColor: 0xffd090
    },
    pistol: {
      name: 'P-18', auto: false, magSize: 12, reserve: 48,
      dmg: 26, headDmg: 104, fireRate: 0.22,
      spread: 0.004, moveSpread: 0.02, recoilPitch: 0.011,
      kick: 0.04, reloadTime: 1.6, switchTime: 0.3,
      muzzleOffset: [0, 0.02, -0.2], tracerColor: 0xfff0c0
    }
  };
  const ORDER = ['rifle', 'smg', 'shotgun', 'pistol'];

  /* ---------- 枪口火光贴图 ---------- */
  function starTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,240,1)');
    g.addColorStop(0.25, 'rgba(255,200,110,0.9)');
    g.addColorStop(0.55, 'rgba(255,140,40,0.35)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    // 星芒
    x.strokeStyle = 'rgba(255,220,160,0.8)'; x.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(32, 32); x.lineTo(32 + Math.cos(i * 1.57) * 30, 32 + Math.sin(i * 1.57) * 30);
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ---------- 枪模材料 ---------- */
  const mDark = new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.4, metalness: 0.75 });
  const mBlack = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.5, metalness: 0.5 });
  const mWood = new THREE.MeshStandardMaterial({ color: 0x6b4f2e, roughness: 0.7, metalness: 0.05 });
  const mGlove = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.9, metalness: 0 });

  function buildRifle() {
    const g = new THREE.Group();
    const box = (w, h, d, x, y, z, m, rx) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      if (rx) b.rotation.x = rx;
      g.add(b); return b;
    };
    const cyl = (r, len, x, y, z, m) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
      c.rotation.x = Math.PI / 2;
      c.position.set(x, y, z);
      g.add(c); return c;
    };
    box(0.06, 0.09, 0.34, 0, 0, -0.05, mDark);          // 机匣
    box(0.055, 0.06, 0.24, 0, 0.01, -0.28, mWood);       // 护木
    cyl(0.014, 0.42, 0, 0.025, -0.5, mDark);             // 枪管
    cyl(0.02, 0.05, 0, 0.015, -0.66, mBlack);            // 枪口
    box(0.05, 0.17, 0.11, 0, -0.12, -0.04, mDark, 0.18); // 弹匣
    box(0.05, 0.13, 0.07, 0, -0.1, 0.12, mDark, 0.25);   // 握把
    box(0.055, 0.09, 0.17, 0, 0.015, 0.17, mWood);       // 枪托
    // 手
    box(0.05, 0.09, 0.06, -0.015, -0.12, 0.06, mGlove, 0.1);  // 握把手
    box(0.05, 0.09, 0.09, -0.015, -0.06, -0.3, mGlove);       // 护木手
    return g;
  }
  function buildPistol() {
    const g = new THREE.Group();
    const box = (w, h, d, x, y, z, m, rx) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      if (rx) b.rotation.x = rx;
      g.add(b); return b;
    };
    box(0.035, 0.045, 0.2, 0, 0, -0.03, mDark);        // 套筒
    box(0.03, 0.05, 0.05, 0, 0.01, -0.16, mBlack);     // 枪口
    box(0.03, 0.1, 0.06, 0, -0.07, 0.05, mDark, 0.3);  // 握把
    box(0.03, 0.09, 0.05, -0.02, -0.09, -0.03, mGlove); // 手
    return g;
  }
  function buildSmg() {
    const g = new THREE.Group();
    const box = (w, h, d, x, y, z, m, rx) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      if (rx) b.rotation.x = rx;
      g.add(b); return b;
    };
    const cyl = (r, len, x, y, z, m) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
      c.rotation.x = Math.PI / 2;
      c.position.set(x, y, z);
      g.add(c); return c;
    };
    box(0.05, 0.08, 0.3, 0, 0, -0.05, mDark);           // 机匣
    box(0.045, 0.05, 0.18, 0, 0.01, -0.26, mBlack);      // 护木
    cyl(0.012, 0.3, 0, 0.02, -0.42, mDark);              // 枪管
    cyl(0.02, 0.05, 0, 0.01, -0.55, mBlack);             // 枪口
    box(0.045, 0.13, 0.09, 0, -0.1, -0.05, mDark, 0.22); // 弹匣
    box(0.04, 0.1, 0.06, 0, -0.08, 0.1, mDark, 0.25);    // 握把
    box(0.05, 0.07, 0.12, 0, 0.01, 0.14, mDark);         // 枪托
    box(0.05, 0.08, 0.07, -0.01, -0.05, -0.28, mGlove);       // 护木手
    box(0.05, 0.08, 0.05, -0.01, -0.1, 0.05, mGlove, 0.1);    // 握把手
    return g;
  }
  function buildShotgun() {
    const g = new THREE.Group();
    const box = (w, h, d, x, y, z, m, rx) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      if (rx) b.rotation.x = rx;
      g.add(b); return b;
    };
    const cyl = (r, len, x, y, z, m) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
      c.rotation.x = Math.PI / 2;
      c.position.set(x, y, z);
      g.add(c); return c;
    };
    box(0.055, 0.09, 0.34, 0, 0, -0.05, mDark);       // 机匣
    cyl(0.016, 0.55, 0, 0.03, -0.5, mDark);            // 长枪管
    cyl(0.02, 0.05, 0, 0.025, -0.74, mBlack);          // 枪口
    box(0.07, 0.09, 0.3, 0, 0.02, -0.42, mWood);       // 木质护木
    box(0.05, 0.12, 0.07, 0, -0.09, 0.1, mWood, 0.22); // 握把
    box(0.055, 0.1, 0.18, 0, 0.015, 0.18, mWood);      // 枪托
    box(0.05, 0.08, 0.1, -0.02, -0.05, -0.42, mGlove);       // 护木手
    box(0.05, 0.08, 0.05, -0.02, -0.11, 0.05, mGlove, 0.1);  // 握把手
    return g;
  }

  /* ---------- 创建 ---------- */
  function create(camera, scene, deps) {
    const { player, getEnemies, resolveHit, onEnemyDamaged } = deps;
    const raycaster = new THREE.Raycaster();
    const _v = new THREE.Vector3();
    const state = {
      current: 'rifle',
      mag: {}, reserve: {},
      reloading: false, reloadT: 0, switchT: 0,
      fireTimer: 0, fireHeld: false, semiFired: false,
      recoil: 0, kick: 0,
      active: false, flashT: 0
    };
    for (const k of ORDER) { state.mag[k] = SPECS[k].magSize; state.reserve[k] = SPECS[k].reserve; }

    // 第一人称枪模
    const view = new THREE.Group();
    const models = {
      rifle: buildRifle(),
      smg: buildSmg(),
      shotgun: buildShotgun(),
      pistol: buildPistol()
    };
    for (const k in models) view.add(models[k]);
    view.position.set(0.3, -0.26, -0.45);
    camera.add(view);
    scene.add(camera);

    // 枪口火光
    const flashMat = new THREE.MeshBasicMaterial({
      map: starTexture(), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const flashPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
    view.add(flashPlane);
    const flashLight = new THREE.PointLight(0xffc98a, 0, 9, 2);
    view.add(flashLight);

    function muzzleWorld(out) {
      const w = SPECS[state.current];
      flashPlane.position.set(w.muzzleOffset[0], w.muzzleOffset[1], w.muzzleOffset[2]);
      flashPlane.getWorldPosition(out);
      return out;
    }

    /* ---------- 输入 ---------- */
    const KEY_TO_WEAPON = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'pistol' };
    const onKey = (e) => {
      if (KEY_TO_WEAPON[e.code]) switchTo(KEY_TO_WEAPON[e.code]);
      if (e.code === 'KeyR') reload();
    };
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      const idx = ORDER.indexOf(state.current);
      const next = e.deltaY > 0 ? (idx + 1) % ORDER.length : (idx - 1 + ORDER.length) % ORDER.length;
      switchTo(ORDER[next]);
    };
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      state.fireHeld = true;
      tryFire();
    };
    const onMouseUp = (e) => {
      if (e.button !== 0) return;
      state.fireHeld = false;
      state.semiFired = false;
    };

    function switchTo(name) {
      if (name === state.current) return;
      if (state.reloading) state.reloading = false;
      state.current = name;
      state.switchT = SPECS[name].switchTime;
      if (window.AUDIO) AUDIO.switchgun();
    }

    function reload() {
      const w = SPECS[state.current];
      if (state.reloading) return;
      if (state.mag[state.current] >= w.magSize) return;
      if (state.reserve[state.current] <= 0) return;
      state.reloading = true;
      state.reloadT = w.reloadTime;
      if (window.AUDIO) AUDIO.reload();
    }

    /* ---------- 开火 ---------- */
    function tryFire() {
      if (!state.active || state.reloading || state.switchT > 0) return;
      const w = SPECS[state.current];
      if (state.fireTimer > 0) return;
      if (!w.auto && state.semiFired) return;
      if (state.mag[state.current] <= 0) {
        reload();
        return;
      }
      state.fireTimer = w.fireRate;
      state.semiFired = !w.auto;
      state.mag[state.current]--;
      state.recoil = Math.min(3.5, state.recoil + 1);
      state.kick = w.kick;
      // 后坐力抬枪口
      camera.rotation.x += w.recoilPitch * (0.8 + Math.random() * 0.4);
      camera.rotation.z += (Math.random() - 0.5) * 0.008;

      // 声音
      if (window.AUDIO) AUDIO.gunshot(state.current);

      // 火光
      state.flashT = 0.05;
      flashPlane.rotation.z = Math.random() * Math.PI;
      flashPlane.position.set(w.muzzleOffset[0], w.muzzleOffset[1], w.muzzleOffset[2]);
      muzzleWorld(_v);
      if (window.AUDIO === undefined) { }
      FX.spawnBurst(_v, 0xffb060, 3, 1.6, 0.2, 0, 0.5);

      shootRay();
    }

    function shootRay() {
      const w = SPECS[state.current];
      const hSpeed = Math.hypot(player.vel.x, player.vel.z);
      const moveF = player.crouching ? 0.2 : Math.min(1, hSpeed / 8);
      const pellets = w.pellets || 1;

      const origin = camera.getWorldPosition(new THREE.Vector3());
      const muzzle = muzzleWorld(_v);
      const targets = WORLD.hitTargets.concat(getEnemies());

      let hitEnemy = false, killedAny = false, headAny = false;
      let nearest = null, nearestDist = Infinity;

      for (let p = 0; p < pellets; p++) {
        const spread = w.spread + w.moveSpread * moveF + state.recoil * 0.004;
        const dir = camera.getWorldDirection(new THREE.Vector3());
        dir.x += (Math.random() - 0.5) * 2 * spread;
        dir.y += (Math.random() - 0.5) * 2 * spread;
        dir.z += (Math.random() - 0.5) * 2 * spread;
        dir.normalize();

        raycaster.set(origin, dir);
        raycaster.far = 200;
        const hits = raycaster.intersectObjects(targets, false);

        if (hits.length > 0) {
          const h = hits[0];
          if (h.distance < nearestDist) { nearestDist = h.distance; nearest = h; }
          const e = resolveHit(h.object);
          if (e) {
            const isHead = e.isHead;
            const dmg = isHead ? w.headDmg : w.dmg;
            const killed = e.enemy.damage(dmg);
            hitEnemy = true;
            if (killed) killedAny = true;
            if (isHead) headAny = true;
            FX.spawnBurst(h.point, isHead ? 0xff5a4d : 0xb2262e, isHead ? 14 : 9, 3.2, 0.4, 0.7, 1);
          } else {
            // 墙面火花
            FX.spawnBurst(h.point, 0xffd27a, pellets > 1 ? 4 : 7, 2.6, 0.3, 0.7, 1);
            if (window.AUDIO) AUDIO.impact(h.point.distanceTo(origin));
          }
        }
      }

      if (hitEnemy) {
        onEnemyDamaged(null, headAny, killedAny);
        if (window.AUDIO) AUDIO.hit(headAny);
      }
      const end = nearest ? nearest.point : origin.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(200));
      spawnTracer(muzzle, end, w.tracerColor);
    }

    /* ---------- 曳光 ---------- */
    const tracers = [];
    function spawnTracer(from, to, color) {
      const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
      const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      tracers.push({ line, life: 0.08 });
    }

    /* ---------- 每帧更新 ---------- */
    function update(dt) {
      // 自动武器连发
      if (state.active && state.fireHeld && SPECS[state.current].auto) tryFire();
      state.fireTimer = Math.max(0, state.fireTimer - dt);
      state.switchT = Math.max(0, state.switchT - dt);
      state.recoil *= Math.exp(-dt * 5);
      state.kick *= Math.exp(-dt * 9);

      // 换弹
      if (state.reloading) {
        state.reloadT -= dt;
        if (state.reloadT <= 0) {
          const w = SPECS[state.current];
          const need = w.magSize - state.mag[state.current];
          const take = Math.min(need, state.reserve[state.current]);
          state.mag[state.current] += take;
          state.reserve[state.current] -= take;
          state.reloading = false;
        }
      }

      // 枪模动画（后坐踢 + 行走晃动）
      const hSpeed = Math.hypot(player.vel.x, player.vel.z);
      const bobY = Math.sin(player.bobPhase) * Math.min(0.02, hSpeed * 0.004);
      const bobX = Math.cos(player.bobPhase * 0.5) * Math.min(0.016, hSpeed * 0.003);
      const walkIn = player.onGround ? 1 : 0.4;
      view.position.y = -0.26 + bobY * walkIn - state.kick * 0.4;
      view.position.x = 0.3 + bobX * walkIn;
      view.position.z = -0.45 + state.kick;
      view.rotation.x = state.kick * 1.2 - bobY * 2.5;
      view.rotation.z = state.kick * 0.6 + bobX * 2;

      // 显示当前武器
      for (const k in models) models[k].visible = (k === state.current);
      flashPlane.visible = true;
      // 火光衰减
      if (state.flashT > 0) {
        state.flashT -= dt;
        flashMat.opacity = (state.flashT / 0.05);
        flashLight.intensity = 16 * (state.flashT / 0.05);
      } else {
        flashMat.opacity = 0;
        flashLight.intensity = 0;
      }

      // 曳光
      for (let i = tracers.length - 1; i >= 0; i--) {
        const tr = tracers[i];
        tr.life -= dt;
        tr.line.material.opacity = tr.life / 0.08;
        if (tr.life <= 0) {
          scene.remove(tr.line);
          tr.line.geometry.dispose();
          tr.line.material.dispose();
          tracers.splice(i, 1);
        }
      }

      FX.update(dt);
    }

    state.getHUD = () => ({
      mag: state.mag[state.current],
      reserve: state.reserve[state.current],
      name: SPECS[state.current].name,
      reloading: state.reloading,
      crosshairGap: 6 + SPECS[state.current].spread * 900 + state.recoil * 5 + Math.min(14, Math.hypot(player.vel.x, player.vel.z) * 1.6)
    });
    state.setActive = (a) => { state.active = a; if (!a) { state.fireHeld = false; state.semiFired = false; } };
    state.spawnBurst = FX.spawnBurst;
    state.fxPoints = FX.pts;
    state.update = update;
    window.WEAPONS.instance = state;

    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);

    scene.add(FX.pts);

    return state;
  }

  return { create };
})();
