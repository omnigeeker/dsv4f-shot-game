/* ============================================================
 * MAIN — 游戏编排：渲染器/相机/状态机/主循环/回调接线
 * ============================================================ */
(function () {

  // ---------- 渲染器 / 场景 / 相机 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.9;
  document.getElementById('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 700);
  camera.rotation.order = 'YXZ';

  // ---------- 世界（默认加载第一张图做菜单背景） ----------
  let selectedMap = 0;
  WORLD.loadMap(scene, selectedMap);

  // ---------- 玩家 / 敌人 / 武器 ----------
  const player = PLAYER.create(camera, renderer.domElement);
  player.attach();
  const enemies = ENEMIES.create(scene, {
    player,
    onWaveStart: (n) => UI.waveBanner(n),
    onKill: () => UI.killfeed('<span class="kf-kill">击毙</span> 恐怖分子')
  });
  const weapons = WEAPONS.create(camera, scene, {
    player,
    getEnemies: () => enemies.getEnemies(),
    resolveHit: (m) => enemies.resolveHit(m),
    onEnemyDamaged: (enemy, isHead, killed) => {
      UI.hitmarker(killed);
      if (isHead) UI.hitLabel('爆头');
      if (killed) UI.killfeed('<span class="kf-kill">+击杀</span> 恐怖分子');
    }
  });
  const medkits = MEDKITS.create(scene, {
    player,
    onPickup: (point) => {
      player.heal(30);
      if (window.AUDIO) AUDIO.pickup();
      if (window.WEAPONS && WEAPONS.instance) WEAPONS.instance.spawnBurst(new THREE.Vector3(point.x, 1, point.z), 0x3aff7a, 10, 2.0, 0.5, 0.5, 1);
      UI.healLabel('+30 HP');
    }
  });

  // ---------- 状态机 ----------
  const state = { mode: 'menu', time: 0, shake: 0 };

  // ---------- 玩家回调 ----------
  player.onFootstep = (land) => { if (window.AUDIO) land ? AUDIO.land() : AUDIO.footstep(player.sprinting); };
  player.onDamage = (fromPos) => {
    UI.damage(fromPos, player.pos, player.yaw);
    state.shake = 0.16;
  };
  player.onDeath = () => {
    weapons.setActive(false);
    UI.death({ wave: enemies.getStats().wave, kills: enemies.getStats().kills, time: Math.round(state.time) });
    UI.setScreen('death');
    document.exitPointerLock();
  };
  player.onProtectEnd = () => { if (window.AUDIO) AUDIO.protect(); };

  // ---------- 开始 / 重启 ----------
  function resetGame() {
    const sp = WORLD.getPlayerSpawn();
    player.setSpawn(sp.pos.x, sp.pos.z, sp.yaw);
    weapons.mag = { rifle: 30, smg: 32, shotgun: 8, pistol: 12 };
    weapons.reserve = { rifle: 90, smg: 128, shotgun: 32, pistol: 48 };
    weapons.current = 'rifle';
    weapons.reloading = false;
    weapons.reloadT = 0;
    weapons.recoil = 0;
    enemies.reset();
    state.time = 0;
    state.shake = 0;
  }
  function startGame() {
    if (window.AUDIO) AUDIO.ensure();
    WORLD.loadMap(scene, selectedMap);
    UI.rebuildMinimap();
    resetGame();
    medkits.reset();
    enemies.startWave();
    weapons.setActive(true);
    player.active = true;
    UI.setScreen('hud');
    state.mode = 'playing';
    lockPointer();
  }
  function setSelectedMap(idx) {
    selectedMap = Math.max(0, Math.min(WORLD.MAPS.length - 1, idx));
    if (state.mode === 'menu') { WORLD.loadMap(scene, selectedMap); UI.rebuildMinimap(); } // 菜单内实时预览
  }
  function resumeGame() {
    weapons.setActive(true);
    player.active = true;
    UI.setScreen('hud');
    state.mode = 'playing';
    lockPointer();
  }
  function lockPointer() {
    try {
      const p = renderer.domElement.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => { });
    } catch (e) { /* 无头/无焦点环境忽略 */ }
  }

  // ---------- UI 处理器 ----------
  UI.setHandlers({
    start: startGame,
    resume: resumeGame,
    restart: startGame,
    selectMap: setSelectedMap
  });
  UI.init();

  // ---------- 指针锁定丢失（Esc）→ 暂停 ----------
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== renderer.domElement) {
      if (state.mode === 'playing') {
        weapons.setActive(false);
        player.active = false;
        UI.setScreen('pause');
        state.mode = 'paused';
      }
    }
  });

  // ---------- 窗口缩放 ----------
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- 主循环 ----------
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (state.mode === 'playing') {
      state.time += dt;
      player.update(dt);
      // 屏震
      if (state.shake > 0) {
        state.shake = Math.max(0, state.shake - dt * 3);
        camera.position.x += (Math.random() - 0.5) * state.shake * 0.25;
        camera.position.y += (Math.random() - 0.5) * state.shake * 0.2;
      }
      enemies.update(dt);
      medkits.update(dt);
    }

    weapons.update(dt);
    WORLD.update(dt);

    if (state.mode === 'playing' || state.mode === 'paused') {
      UI.updateHUD(dt, {
        hp: player.health, armor: player.armor,
        protect: player.protectT,
        weapons: weapons.getHUD(),
        kills: enemies.getStats().kills,
        wave: enemies.getStats().wave,
        alive: enemies.getStats().alive,
        between: enemies.getStats().between,
        timer: enemies.getStats().timer
      });
      UI.updateMinimap(player.pos, player.yaw, enemies.getEnemies().map(m => m.userData.enemy).filter(Boolean));
    }

    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);

  // 调试句柄
  window.__game = { player, weapons, enemies, medkits, scene, camera, renderer, setSelectedMap, get state() { return state; } };
})();
