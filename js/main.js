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
gtaoPass.updateGtaoMaterial({ radius: 0.4, distanceExponent: 1.0, thickness: 1.0, scale: 0.5, samples: 10, screenSpaceRadius: false });
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
player.onFootstep = (land) => land ? AUDIO.land() : AUDIO.footstep(player.sprinting);
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
player.onProtectEnd = () => AUDIO.protect();

// ---------- 开始 / 重启 ----------
function resetGame() {
  const sp = WORLD.getPlayerSpawn();
  player.setSpawn(sp.pos.x, sp.pos.z, sp.yaw);
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
function startGame() {
  AUDIO.ensure();
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
UI.buildWeaponSlots(weapons.getList());

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

  composer.render();
}
requestAnimationFrame(loop);

// ---------- 调试句柄（也用于无头测试） ----------
window.__game = { player, weapons, enemies, medkits, scene, camera, renderer, setSelectedMap, get state() { return state; } };
window.THREE = THREE;
window.WORLD = WORLD;
window.AUDIO = AUDIO;
window.UI = UI;
window.WEAPONS = WEAPONS;
window.PLAYER = PLAYER;
window.ENEMIES = ENEMIES;
window.MEDKITS = MEDKITS;
