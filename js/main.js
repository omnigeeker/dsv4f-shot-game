/* ============================================================
 * MAIN — 游戏编排：渲染器/相机/状态机/主循环/回调接线
 * ============================================================ */
import * as THREE from 'three';
import { WORLD } from './world.js';
import { PLAYER } from './player.js';
import { WEAPONS } from './weapons.js';
import { ENEMIES } from './enemies.js';
import { MEDKITS } from './medkits.js';
import { UI } from './ui.js';
import { AUDIO } from './audio.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadPBR } from './pbr.js';
import { MISSION } from './mission.js';
import { VEHICLE } from './vehicle.js';

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

// ---------- 后期处理（环境光遮蔽 + 辉光 + 输出色调） ----------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
gtaoPass.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.0, thickness: 1.0, scale: 0.5, samples: 14, screenSpaceRadius: false });
composer.addPass(gtaoPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.5, 1.0);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ---------- PBR 环境反射（供金属/粗糙度产生环境光反射） ----------
(function setupEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0a0e18);
  const panel = (x, y, z, color, s) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    envScene.add(m);
  };
  panel(2, 1, 0, 0x8fa6d6, 6);   // 冷月光
  panel(-2, 1, 0, 0xffc27a, 5);  // 暖泛光
  panel(0, 1, 2, 0x2fe9ff, 4);   // 冷青
  panel(0, 0.5, -2, 0xff9a2e, 4);// 暖橙
  panel(0, 3, 0, 0xffffff, 3);   // 顶部
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
})();
// 后台加载 CC0 PBR 贴图，就绪后热更新所有材质
loadPBR().then((t) => { if (t) WORLD.applyPBR(t); });

// ---------- 世界（默认加载第一张图做菜单背景） ----------
let selectedMap = 0;
WORLD.loadMap(scene, selectedMap);
applyLightingProfile();

function applyLightingProfile() {
  const p = WORLD.getLightingProfile();
  renderer.toneMappingExposure = p.exposure;
  if (bloomPass) {
    bloomPass.strength = p.bloom.strength;
    bloomPass.radius = p.bloom.radius;
    bloomPass.threshold = p.bloom.threshold;
  }
}

// ---------- 玩家 / 敌人 / 武器 ----------
const player = PLAYER.create(camera, renderer.domElement);
player.attach();
const enemies = ENEMIES.create(scene, {
  player,
  spawnBurst: (...a) => weapons.spawnBurst(...a),
  onWaveStart: (n) => {
    UI.waveBanner(n);
    player.protectT = Math.max(player.protectT, 3); // 每波开局 3 秒免伤
  },
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
    AUDIO.pickup();
    weapons.spawnBurst(new THREE.Vector3(point.x, 1, point.z), 0x3aff7a, 10, 2.0, 0.5, 0.5, 1);
    UI.healLabel('+30 HP');
  }
});

// ---------- 状态机 ----------
const state = { mode: 'menu', time: 0, shake: 0 };

// ---------- 玩家回调 ----------
player.onFootstep = (land) => {
  if (land) AUDIO.land();
  else { AUDIO.footstep(player.sprinting); enemies.alertNearby(player.pos, 7); } // 脚步声惊动附近敌人
};
weapons.onFire = (pos) => enemies.alertNearby(pos, 18); // 枪声惊动更大范围
player.onDamage = (fromPos) => {
  UI.damage(fromPos, player.pos, player.yaw);
  state.shake = 0.16;
};
let gameMode = 'arena'; // 'arena' | 'campaign'

player.onDeath = () => {
  weapons.setActive(false);
  if (gameMode === 'campaign') {
    const cp = MISSION.onDeath({ enemies });
    if (cp) { respawnAtCheckpoint(cp); return; } // 有 checkpoint：不退出锁定，直接满血重生续玩
    UI.death({ wave: enemies.getStats().wave, kills: enemies.getStats().kills, time: Math.round(state.time), retry: true });
    UI.setScreen('death');
    document.exitPointerLock();
    return;
  }
  UI.death({ wave: enemies.getStats().wave, kills: enemies.getStats().kills, time: Math.round(state.time) });
  UI.setScreen('death');
  document.exitPointerLock();
};
player.onProtectEnd = () => AUDIO.protect();

// ---------- 重置（可指定出生点） ----------
function resetGame(spawnPos) {
  const sp = spawnPos || WORLD.getPlayerSpawn().pos;
  player.setSpawn(sp.x, sp.z, spawnPos ? Math.atan2(-(0 - sp.x), -(0 - sp.z)) : WORLD.getPlayerSpawn().yaw);
  weapons.mag = { rifle: 30, smg: 32, shotgun: 8, sniper: 5, pistol: 12 };
  weapons.reserve = { rifle: 90, smg: 128, shotgun: 32, sniper: 20, pistol: 48 };
  weapons.current = 'rifle';
  weapons.reloading = false;
  weapons.reloadT = 0;
  weapons.recoil = 0;
  weapons.zoomed = false;
  enemies.reset();
  state.time = 0;
  state.shake = 0;
}

// ---------- 场景模式 ----------
function startGame() {
  gameMode = 'arena';
  AUDIO.ensure();
  WORLD.loadMap(scene, selectedMap);
  applyLightingProfile();
  UI.rebuildMinimap();
  resetGame();
  enemies.configure({ autoWave: true, diff: 1 });
  medkits.reset();
  enemies.startWave();
  beginPlay();
}
function setSelectedMap(idx) {
  selectedMap = Math.max(0, Math.min(WORLD.MAPS.length - 1, idx));
  if (state.mode === 'menu') { WORLD.loadMap(scene, selectedMap); applyLightingProfile(); UI.rebuildMinimap(); } // 菜单内实时预览
}
function resumeGame() {
  if (!player.alive) {
    // 阵亡后从暂停返回：优先 checkpoint 重生，否则重开本关
    if (gameMode === 'campaign' && MISSION.isActive()) {
      const cp = MISSION.onDeath({ enemies });
      if (cp) { respawnAtCheckpoint(cp); return; }
      const h = MISSION.getHUD(); const c = MISSION.currentLevel();
      if (h && c) { startCampaign(c.id - 1, h.diff); return; }
    }
    startGame();
    return;
  }
  weapons.setActive(true);
  player.active = true;
  UI.setScreen('hud');
  state.mode = 'playing';
  lockPointer();
}

// ---------- 剧情模式 ----------
let vehicle = null;
const vehInput = { forward: false, back: false, left: false, right: false, fire: false, aimYaw: 0, aimPitch: 0 };
let rescueMarkers = [];

function isVehicleLevel(def) { return def.type === 'tank' || def.type === 'boat'; }

function createVehicle(def) {
  disposeVehicle();
  const _origDamage = player.damage.bind(player);
  const opts = {
    getEnemies: () => enemies.getEnemies(),
    damageEnemy: (e, d) => e.damage(d),
    shellDmg: def.type === 'tank' ? 40 : 18,
    spawnBurst: (...a) => weapons.spawnBurst(...a),
    explode: (p) => { state.shake = 0.4; if (p) enemies.alertNearby(p, 14); }
  };
  vehicle = def.type === 'tank' ? VEHICLE.createTank(scene, opts) : VEHICLE.createBoat(scene, opts);
  const sp = WORLD.getPlayerSpawn().pos;
  vehicle.pos.set(sp.x, vehicle.type === 'tank' ? 0.9 : 0.5, sp.z);
  // 载具模式下：玩家受伤 → 载具承受
  player.damage = (amount, fromPos) => {
    if (vehicle && !vehicle.destroyed) { vehicle.damage(amount); if (vehicle.destroyed) _origDamage(999, fromPos); return; }
    _origDamage(amount, fromPos);
  };
}
function disposeVehicle() {
  if (vehicle) { vehicle.dispose(); vehicle = null; }
  for (const m of rescueMarkers) scene.remove(m);
  rescueMarkers = [];
}

function placeRescueMarkers() {
  for (const p of MISSION.getRescueAt()) {
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    beacon.position.set(p.x, 0.15, p.z);
    scene.add(beacon);
    rescueMarkers.push(beacon);
  }
}

function buildCampaignMap(def) {
  if (def.linear) WORLD.buildLinear({ scene, theme: def.theme, length: def.length, boat: def.type === 'boat', width: def.type === 'boat' ? 16 : 14, ceiling: def.theme !== 'desert', pattern: def.pattern });
  else WORLD.loadMap(scene, def.map);
}

function startCampaign(levelIdx, difficulty) {
  gameMode = 'campaign';
  AUDIO.ensure();
  UI.setScreenHidden('victory', true); // 修复：进入下一关时先隐藏胜利界面
  const def = MISSION.LEVELS[levelIdx];
  buildCampaignMap(def);
  applyLightingProfile();
  UI.rebuildMinimap();
  MISSION.start(levelIdx, difficulty);
  resetGame();
  player.protectT = 8; // 开局 8 秒护盾，确保开局不被攻击
  MISSION.setupEnemies(enemies);
  MISSION.preplaceEnemies(enemies);
  medkits.reset();
  if (isVehicleLevel(def)) createVehicle(def);
  if (def.type === 'rescue') placeRescueMarkers();
  UI.setMissionHUD(MISSION.getHUD());
  UI.showBriefing('第 ' + def.id + ' 关 · ' + def.title, def.subtitle + '。\n敌人分布在通道各处巡逻——进入视野或发出枪声才会被发现。开局有护盾，检查点处阵亡将满血重生。', () => beginPlay());
}
function resumeCampaign() {
  const g = MISSION.getSavedGame();
  if (!g) return;
  gameMode = 'campaign';
  AUDIO.ensure();
  const def = MISSION.LEVELS[g.level];
  buildCampaignMap(def);
  applyLightingProfile();
  UI.rebuildMinimap();
  MISSION.start(g.level, g.difficulty);
  resetGame();
  player.protectT = 8;
  MISSION.setupEnemies(enemies);
  MISSION.preplaceEnemies(enemies);
  medkits.reset();
  if (isVehicleLevel(def)) createVehicle(def);
  if (def.type === 'rescue') placeRescueMarkers();
  const cps = WORLD.getCheckpoints();
  const cp = g.checkpoint >= 0 && cps[g.checkpoint] ? cps[g.checkpoint] : null;
  if (cp) player.setSpawn(cp.x, cp.z, Math.atan2(-(0 - cp.x), -(0 - cp.z)));
  player.health = 100; player.armor = 100;
  UI.setMissionHUD(MISSION.getHUD());
  beginPlay();
}
function nextCampaignLevel() {
  const h = MISSION.getHUD();
  const cur = MISSION.currentLevel();
  if (!h || !cur) return;
  const diff = h.diff || 1;
  const nextIdx = cur.id;
  if (nextIdx < MISSION.LEVELS.length) startCampaign(nextIdx, diff);
  else toMenu();
}
function toMenu() {
  disposeVehicle();
  MISSION.reset();
  gameMode = 'arena';
  state.mode = 'menu';
  UI.setScreen('menu');
  WORLD.loadMap(scene, 0);
  applyLightingProfile();
  UI.rebuildMinimap();
  UI.buildLevelGrid();
}
function beginPlay() {
  weapons.setActive(!vehicle);
  player.active = true;
  UI.setScreen('hud');
  state.mode = 'playing';
  lockPointer();
}
function respawnAtCheckpoint(cp) {
  enemies.reset();
  MISSION.setupEnemies(enemies);
  MISSION.restoreAfterRespawn(enemies);
  medkits.reset();
  if (vehicle) { vehicle.pos.set(cp.x, vehicle.type === 'tank' ? 0.9 : 0.5, cp.z); vehicle.hp = vehicle.maxHp; vehicle.destroyed = false; vehicle.speed = 0; vehicle.projs.length = 0; }
  else player.setSpawn(cp.x, cp.z, Math.atan2(-(0 - cp.x), -(0 - cp.z)));
  player.health = 100; player.armor = 100; player.protectT = 5;
  weapons.mag = { rifle: 30, smg: 32, shotgun: 8, sniper: 5, pistol: 12 };
  weapons.reserve = { rifle: 90, smg: 128, shotgun: 32, sniper: 20, pistol: 48 };
  weapons.current = 'rifle';
  weapons.reloading = false;
  UI.checkpointToast('已从检查点重生');
  beginPlay();
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
  restart: () => {
    if (gameMode === 'campaign' && MISSION.isActive()) {
      const h = MISSION.getHUD();
      const cur = MISSION.currentLevel();
      if (h && cur) startCampaign(cur.id - 1, h.diff);
      else startGame();
    } else startGame();
  },
  selectMap: setSelectedMap,
  startLevel: (idx, diff) => startCampaign(idx, diff),
  resumeCampaign,
  nextLevel: nextCampaignLevel,
  toMenu,
  hasSavedGame: () => !!MISSION.getSavedGame()
});
UI.init();
UI.buildWeaponSlots(weapons.getList());
window.MISSION = MISSION;

// ---------- 载具开火输入 ----------
window.addEventListener('mousedown', (e) => { if (e.button === 0) vehInput.fire = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) vehInput.fire = false; });

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
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- 主循环 ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state.mode === 'playing') {
    state.time += dt;
    if (vehicle && !vehicle.destroyed) {
      // 载具输入 + 第三人称相机
      vehInput.forward = !!(player._keys['KeyW'] || player._keys['ArrowUp']);
      vehInput.back = !!(player._keys['KeyS'] || player._keys['ArrowDown']);
      vehInput.left = !!(player._keys['KeyA'] || player._keys['ArrowLeft']);
      vehInput.right = !!(player._keys['KeyD'] || player._keys['ArrowRight']);
      vehInput.aimYaw -= player._mouseDX * 0.0021;
      vehInput.aimPitch -= player._mouseDY * 0.0021;
      vehInput.aimPitch = Math.max(-0.5, Math.min(0.5, vehInput.aimPitch));
      player._mouseDX = player._mouseDY = 0;
      vehicle.update(dt, vehInput);
      player.pos.copy(vehicle.pos);
      player.health = vehicle.hp;
      player.armor = 0;
      const dir = new THREE.Vector3(-Math.sin(vehInput.aimYaw), Math.sin(vehInput.aimPitch), -Math.cos(vehInput.aimYaw)).normalize();
      const dist = vehicle.type === 'tank' ? 7 : 5;
      const hgt = vehicle.type === 'tank' ? 4.5 : 2.8;
      camera.position.copy(vehicle.pos).add(dir.clone().multiplyScalar(-dist)).add(new THREE.Vector3(0, hgt, 0));
      camera.lookAt(vehicle.pos.clone().add(dir.clone().multiplyScalar(20)).setY(vehicle.pos.y + 1));
    } else {
      player.update(dt);
    }
    // 屏震
    if (state.shake > 0) {
      state.shake = Math.max(0, state.shake - dt * 3);
      camera.position.x += (Math.random() - 0.5) * state.shake * 0.25;
      camera.position.y += (Math.random() - 0.5) * state.shake * 0.2;
    }
    enemies.update(dt);
    medkits.update(dt);
    if (gameMode === 'campaign') {
      MISSION.update(dt, {
        enemies, player, vehicle,
        onRescue: (f, n) => UI.checkpointToast('已拯救 ' + f + '/' + n + ' 人质'),
        onCheckpoint: (i, total) => UI.checkpointToast('检查点 ' + i + '/' + total + ' 已激活'),
        onWin: (def, diff) => {
          weapons.setActive(false);
          const hasNext = def.id < MISSION.LEVELS.length;
          UI.victory('第 ' + def.id + ' 关 任务完成<br>' + (hasNext ? '解锁：第 ' + (def.id + 1) + ' 关' : '🎉 全部关卡通关！'), hasNext);
          UI.setScreen('victory');
          UI.hideMissionHUD();
          document.exitPointerLock();
          state.mode = 'victory';
        }
      });
      const mh = MISSION.getHUD();
      if (mh && mh.status === 'playing') {
        const st = enemies.getStats();
        let pct = 0, txt = '';
        if (mh.type === 'kill' || mh.type === 'boss') {
          const k = Math.min(st.kills, mh.max);
          pct = mh.max ? k / mh.max * 100 : 0;
          txt = '击杀 ' + k + ' / ' + mh.max;
        } else if (mh.type === 'waves') {
          const w = Math.min(st.wave, mh.max);
          pct = mh.max ? w / mh.max * 100 : 0;
          txt = '波次 ' + w + ' / ' + mh.max;
        } else if (mh.type === 'rescue') {
          pct = mh.max ? mh.freed / mh.max * 100 : 0;
          txt = '拯救 ' + mh.freed + ' / ' + mh.max + (mh.freed >= mh.max ? ' · 前往撤离点' : '');
        } else if (mh.type === 'reach' || mh.type === 'tank' || mh.type === 'boat') {
          const end = WORLD.getEndZone();
          if (end) {
            const d = Math.hypot((vehicle ? vehicle.pos.x : player.pos.x) - end.x, (vehicle ? vehicle.pos.z : player.pos.z) - end.z);
            pct = Math.max(0, Math.min(100, 100 - d / 100 * 100));
            txt = '距终点 ' + Math.round(d) + 'm';
          }
        }
        // 剩余敌人数
        const remaining = mh.type === 'kill' ? Math.max(0, mh.totalEnemies - st.kills) : st.alive;
        UI.setMissionProgress(pct, '难度 ' + (mh.diff >= 1.4 ? '困难' : '普通') + ' · ' + txt + ' · 剩余敌人 ' + remaining);
      }
    }
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

  composer.render();
}
requestAnimationFrame(loop);

// ---------- 调试句柄（也用于无头测试） ----------
window.__game = { player, weapons, enemies, medkits, scene, camera, renderer, setSelectedMap, get vehicle() { return vehicle; }, get vehInput() { return vehInput; }, get state() { return state; } };
window.THREE = THREE;
window.WORLD = WORLD;
window.AUDIO = AUDIO;
window.UI = UI;
window.WEAPONS = WEAPONS;
window.PLAYER = PLAYER;
window.ENEMIES = ENEMIES;
window.MEDKITS = MEDKITS;
