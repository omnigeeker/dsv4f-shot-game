/* ============================================================
 * ENEMIES — 恐怖分子机器人 AI + 波次系统
 * 追击(射线避障)/视线开火/受击反馈/死亡动画
 * ============================================================ */
window.ENEMIES = (function () {

  const raycaster = new THREE.Raycaster();
  const hitMeshes = [];           // 子弹可命中的机器人网格
  const _v = new THREE.Vector3();

  /* ---------- 基础材质（每机器人克隆） ---------- */
  const baseMats = {
    cloth: new THREE.MeshStandardMaterial({ color: 0x57624c, roughness: 0.9, metalness: 0, emissive: 0x1a2434, emissiveIntensity: 0.35 }),
    pants: new THREE.MeshStandardMaterial({ color: 0x4c4638, roughness: 0.95, metalness: 0, emissive: 0x141c28, emissiveIntensity: 0.3 }),
    skin: new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.85, metalness: 0, emissive: 0x221408, emissiveIntensity: 0.25 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.6 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x3a3f32, roughness: 0.8, metalness: 0, emissive: 0x1a2434, emissiveIntensity: 0.3 })
  };

  function buildModel() {
    const g = new THREE.Group();
    const mats = {};
    for (const k in baseMats) mats[k] = baseMats[k].clone();
    const parts = { mats };
    const add = (w, h, d, x, y, z, mat, parent) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
      m.position.set(x, y, z);
      (parent || g).add(m);
      return m;
    };
    // 腿
    parts.legL = add(0.18, 0.62, 0.22, -0.15, 0.31, 0, 'pants');
    parts.legR = add(0.18, 0.62, 0.22, 0.15, 0.31, 0, 'pants');
    // 躯干
    parts.torso = add(0.56, 0.62, 0.32, 0, 0.95, 0, 'cloth');
    parts.belt = add(0.58, 0.1, 0.34, 0, 0.66, 0, 'cap');
    // 头
    parts.head = add(0.3, 0.3, 0.3, 0, 1.44, 0, 'skin');
    parts.cap = add(0.34, 0.09, 0.34, 0, 1.59, 0, 'cap');
    parts.head.userData.isHead = true;
    // 手臂（持枪朝 -z）
    parts.armL = add(0.13, 0.5, 0.15, -0.38, 1.0, 0.02, 'cloth');
    parts.armR = add(0.13, 0.5, 0.15, 0.38, 1.0, 0.02, 'cloth');
    parts.gun = add(0.09, 0.11, 0.6, 0.4, 0.9, -0.42, 'gun');
    parts.gunTip = add(0.05, 0.05, 0.05, 0.4, 0.9, -0.75, 'gun');
    // 命中注册
    const reg = (m) => { m.userData.enemy = null; m.userData.isHead = m.userData.isHead || false; m.castShadow = true; hitMeshes.push(m); return m; };
    reg(parts.torso); reg(parts.head); reg(parts.legL); reg(parts.legR); reg(parts.armL); reg(parts.armR);
    // 枪口火光（加法平面 + 点光）
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe0a0, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    parts.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.25), flashMat);
    parts.flash.position.set(0.4, 0.9, -0.78);
    g.add(parts.flash);
    parts.flashLight = new THREE.PointLight(0xffb060, 0, 7, 2);
    parts.flashLight.position.copy(parts.flash.position);
    g.add(parts.flashLight);

    for (const k in mats) { mats[k].castShadow = true; }
    return { group: g, parts };
  }

  /* ---------- 视线检测 ---------- */
  function hasLOS(bot, player) {
    const from = bot.pos.clone().add(_v.set(0, 1.35, 0));
    const to = player.pos.clone().add(_v.set(0, 1.0, 0));
    const dir = to.sub(from);
    const dist = dir.length();
    dir.normalize();
    raycaster.set(from, dir);
    raycaster.far = dist - 0.3;
    const hits = raycaster.intersectObjects(WORLD.hitTargets, false);
    return hits.length === 0;
  }

  /* ---------- 避障方向 ---------- */
  function steerDir(bot, player) {
    const d = new THREE.Vector3(player.pos.x - bot.pos.x, 0, player.pos.z - bot.pos.z);
    d.normalize();
    const blocked = (dir) => {
      raycaster.set(_v.set(bot.pos.x, 1.0, bot.pos.z), dir);
      raycaster.far = 3;
      if (raycaster.intersectObjects(WORLD.hitTargets, false).length) return true;
      raycaster.set(_v.set(bot.pos.x, 0.9, bot.pos.z), dir);
      raycaster.far = 3;
      return raycaster.intersectObjects(WORLD.hitTargets, false).length > 0;
    };
    if (!blocked(d)) return d;
    for (const a of [0.55, -0.55, 1.0, -1.0, 1.4, -1.4, 1.9, -1.9]) {
      const alt = d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      if (!blocked(alt)) return alt;
    }
    return d; // 走投无路就硬穿
  }

  function create(scene, deps) {
    const { player, onKill, onWaveStart } = deps;
    const bots = [];
    const tracers = [];
    const stats = { wave: 0, alive: 0, kills: 0, between: true, timer: 3 };
    let spawnQueue = 0, spawnTimer = 0;

    /* ---------- 生成机器人 ---------- */
    function spawnBot() {
      const wave = stats.wave;
      const hp = 60 + (wave - 1) * 22;
      const model = buildModel();
      const pt = WORLD.enemySpawnPoints[(Math.random() * WORLD.enemySpawnPoints.length) | 0];
      const bot = {
        model, pos: pt.clone(),
        hp, maxHp: hp,
        speed: Math.min(4.8, 2.6 + wave * 0.18),
        dmg: Math.min(22, 7 + (wave - 1) * 1.6),
        fireInterval: Math.max(0.5, 1.05 - wave * 0.05),
        fireTimer: 0.5 + Math.random() * 1,
        dead: false, deathT: 0, flashT: 0,
        walkPhase: 0, stepAcc: 0,
        shootAnim: 0
      };
      bot.damage = (d) => damage(bot, d);
      for (const m of hitMeshes) if (m.userData.enemy === null && m.parent === model.group) m.userData.enemy = bot;
      bot.parts = model.parts;
      bot.eye = _v.set(0, 1.35, 0).clone();
      bot.group = model.group;
      bot.group.position.copy(bot.pos);
      scene.add(bot.group);
      bots.push(bot);
      stats.alive++;
    }

    /* ---------- 受伤 / 死亡 ---------- */
    function damage(bot, dmg) {
      if (bot.dead) return false;
      bot.hp -= dmg;
      bot.flashT = 0.09;
      if (window.AUDIO) AUDIO.enemyHurt();
      if (bot.hp <= 0) {
        bot.dead = true;
        stats.kills++;
        if (window.AUDIO) AUDIO.enemyDeath();
        if (window.WEAPONS && WEAPONS.instance) WEAPONS.instance.spawnBurst(bot.pos.clone().setY(1), 0x8a1a1a, 16, 3.4, 0.5, 0.8, 1);
        if (onKill) onKill(bot);
        return true;
      }
      return false;
    }

    /* ---------- 开火 ---------- */
    function fire(bot) {
      const dist = bot.pos.distanceTo(player.pos);
      // 玩家蹲下时：目标更小 → 敌人更难命中，且受伤更少
      const crouchMul = player.crouching ? 1.6 : 1;
      const aimErr = (0.02 + dist * 0.0008) * crouchMul;
      const hitRoll = Math.random();
      bot.shootAnim = 0.12;
      bot.parts.flash.material.opacity = 0.9;
      bot.parts.flashLight.intensity = 8;
      if (window.AUDIO) AUDIO.enemyFire();
      // 曳光
      const from = bot.pos.clone().setY(0.9);
      const to = player.pos.clone().setY(1.0 + (Math.random() - 0.5) * 2);
      to.x += (Math.random() - 0.5) * aimErr * 120;
      to.z += (Math.random() - 0.5) * aimErr * 120;
      if (hitRoll > 0.12) {
        to.x += (Math.random() - 0.5) * aimErr * 40;
        to.z += (Math.random() - 0.5) * aimErr * 40;
        const dmgMul = (player.crouching ? 0.55 : 1) * (0.7 + Math.random() * 0.6);
        player.damage(bot.dmg * dmgMul, bot.pos);
      }
      const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xffc98a, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      scene.add(line);
      tracers.push({ line, life: 0.07 });
    }

    /* ---------- 单机器人更新 ---------- */
    function updateBot(bot, dt) {
      bot.flashT -= dt; bot.shootAnim -= dt;
      if (bot.flashT > 0) {
        bot.parts.flash.material.opacity = Math.max(0, bot.flashT / 0.09);
      } else {
        bot.parts.flash.material.opacity = 0;
        bot.parts.flashLight.intensity = 0;
      }
      // 受击白闪
      const em = bot.flashT > 0 ? 0x88ff88 : 0;
      for (const k in bot.parts.mats) bot.parts.mats[k].emissive.setHex(em);

      if (bot.dead) {
        bot.deathT += dt;
        // 倒地动画
        const k = Math.min(1, bot.deathT / 0.6);
        bot.group.rotation.z = k * 1.5;
        bot.group.rotation.x = k * 0.15;
        bot.group.position.y = -k * 0.4;
        // 淡出
        if (bot.deathT > 1.6) {
          const o = Math.max(0, 1 - (bot.deathT - 1.6) / 1.2);
          for (const m of hitMeshes) if (m.userData.enemy === bot) { m.material.transparent = true; m.material.opacity = o; }
          if (bot.deathT > 2.8) {
            scene.remove(bot.group);
            for (const m of hitMeshes) if (m.userData.enemy === bot) m.userData.enemy = null;
            const idx = bots.indexOf(bot);
            if (idx >= 0) bots.splice(idx, 1);
            stats.alive--;
          }
        }
        return;
      }

      if (!player.alive) return;

      bot.fireTimer -= dt;
      const toP = new THREE.Vector3(player.pos.x - bot.pos.x, 0, player.pos.z - bot.pos.z);
      const dist = toP.length();
      const los = hasLOS(bot, player);

      // 朝向玩家（yaw=0 面向 -z，故取 -dx/-dz）
      if (dist > 0.001) {
        bot.group.rotation.y = Math.atan2(-toP.x, -toP.z);
      }

      let moving = false;
      if (los && dist < 52) {
        if (dist > 15) { const d = steerDir(bot, player); moveBot(bot, d, dt); moving = true; }
        else if (dist < 6) { const d = steerDir(bot, player).multiplyScalar(-1); moveBot(bot, d, dt * 0.7); moving = true; }
        if (bot.fireTimer <= 0) { fire(bot); bot.fireTimer = bot.fireInterval; }
      } else {
        // 失去视线：继续逼近
        const d = steerDir(bot, player);
        moveBot(bot, d, dt);
        moving = true;
      }

      // 行走动画
      if (moving) {
        bot.walkPhase += dt * 9;
        bot.parts.legL.rotation.x = Math.sin(bot.walkPhase) * 0.55;
        bot.parts.legR.rotation.x = -Math.sin(bot.walkPhase) * 0.55;
        bot.parts.armL.rotation.x = -Math.sin(bot.walkPhase) * 0.4;
        bot.parts.armR.rotation.x = Math.sin(bot.walkPhase) * 0.4;
        bot.parts.torso.position.y = 0.95 + Math.abs(Math.sin(bot.walkPhase)) * 0.04;
        bot.stepAcc += dt * bot.speed;
        if (bot.stepAcc > 2.2) { bot.stepAcc = 0; if (window.AUDIO) AUDIO.enemyStep(); }
      } else {
        bot.parts.legL.rotation.x *= 0.8; bot.parts.legR.rotation.x *= 0.8;
        bot.parts.armL.rotation.x *= 0.8; bot.parts.armR.rotation.x *= 0.8;
      }
      // 持枪瞄准角
      const aimPitch = Math.min(0.5, Math.max(-0.2, (player.pos.y - 0.9) / Math.max(1, dist) * 0.5));
      bot.parts.armL.rotation.x += 0.25 + aimPitch;
      bot.parts.armR.rotation.x += 0.25 + aimPitch;

      bot.group.position.copy(bot.pos);
    }

    function moveBot(bot, dir, dt) {
      const step = dir.clone().multiplyScalar(bot.speed * dt);
      bot.pos.add(step);
      // 与碰撞体分离（简单推回）
      const r = 0.4;
      const box = { minX: bot.pos.x - r, minY: 0, minZ: bot.pos.z - r, maxX: bot.pos.x + r, maxY: 1.7, maxZ: bot.pos.z + r };
      for (const col of WORLD.colliders) {
        // 脚下地面不阻挡水平移动
        if (col.maxY <= bot.pos.y + 0.1) continue;
        if (box.minX < col.maxX && box.maxX > col.minX && box.minY < col.maxY && box.maxY > col.minY && box.minZ < col.maxZ && box.maxZ > col.minZ) {
          bot.pos.sub(step);
          break;
        }
      }
      // 与玩家分离
      const pd = bot.pos.distanceTo(player.pos);
      if (pd < 1.1) {
        const push = new THREE.Vector3(bot.pos.x - player.pos.x, 0, bot.pos.z - player.pos.z).normalize().multiplyScalar((1.1 - pd));
        bot.pos.add(push);
      }
    }

    /* ---------- 波次管理 ---------- */
    function startWave() {
      stats.wave++;
      stats.between = false;
      spawnQueue = Math.min(10, 3 + stats.wave);
      spawnTimer = 0;
      if (onWaveStart) onWaveStart(stats.wave);
    }

    /* ---------- 主更新 ---------- */
    function update(dt) {
      if (stats.between) {
        stats.timer -= dt;
        if (stats.timer <= 0) startWave();
      } else {
        // 逐步刷怪
        if (spawnQueue > 0) {
          spawnTimer -= dt;
          if (spawnTimer <= 0) { spawnBot(); spawnQueue--; spawnTimer = 0.45; }
        } else if (stats.alive === 0) {
          stats.between = true;
          stats.timer = 14;
        }
      }

      for (const bot of bots.slice()) updateBot(bot, dt);

      for (let i = tracers.length - 1; i >= 0; i--) {
        const tr = tracers[i];
        tr.life -= dt;
        tr.line.material.opacity = (tr.life / 0.07) * 0.6;
        if (tr.life <= 0) {
          scene.remove(tr.line); tr.line.geometry.dispose(); tr.line.material.dispose();
          tracers.splice(i, 1);
        }
      }
    }

    function resolveHit(mesh) {
      const e = mesh.userData.enemy;
      if (!e) return null;
      return { enemy: e, isHead: !!mesh.userData.isHead };
    }

    function reset() {
      for (const bot of bots.slice()) { scene.remove(bot.group); }
      for (const m of hitMeshes) m.userData.enemy = null;
      bots.length = 0;
      stats.wave = 0; stats.kills = 0; stats.alive = 0; stats.between = true; stats.timer = 3;
      spawnQueue = 0;
    }

    return {
      update, startWave, reset, resolveHit, damage,
      getEnemies: () => hitMeshes,
      getStats: () => stats,
      getBotAt: (i) => bots[i]
    };
  }

  return { create };
})();
