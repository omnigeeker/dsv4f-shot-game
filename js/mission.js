/* ============================================================
 * MISSION — 剧情模式（单线关卡版，敌人预放置 + 巡逻侦测）
 * 目标：reach / rescue / kill / waves / tank·boat / boss
 * 敌人一次性布置（每处 ≤3），靠视野与声音被察觉
 * ============================================================ */
import * as THREE from 'three';
import { WORLD } from './world.js';

const KEY = 'dsv4f_campaign_v1';

export const LEVELS = [
  { id: 1, title: '潜入基地', subtitle: '穿过基地通道，抵达撤离点', theme: 'base', linear: true, type: 'reach', length: 70, enemies: 8, pattern: [12, 12, 16, 12, 12, 16] },
  { id: 2, title: '拯救人质', subtitle: '救出被困人质，护送撤离', theme: 'base', linear: true, type: 'rescue', length: 80, target: 2, enemies: 10, pattern: [14, 20, 14, 14, 20, 14] },
  { id: 3, title: '沙漠公路', subtitle: '驾驶坦克突破公路防线', theme: 'desert', linear: true, type: 'tank', length: 90, enemies: 12, pattern: [18, 18, 18, 18, 18, 18] },
  { id: 4, title: '小镇突击', subtitle: '单线清剿小镇武装分子', theme: 'desert', linear: true, type: 'kill', length: 70, enemies: 12, pattern: [11, 16, 11, 16, 11, 16, 11] },
  { id: 5, title: '河流强袭', subtitle: '乘机枪快艇沿河扫射', theme: 'desert', linear: true, type: 'boat', length: 90, enemies: 14, pattern: [16] },
  { id: 6, title: '实验室渗透', subtitle: '穿过霓虹实验室核心', theme: 'lab', linear: true, type: 'reach', length: 80, enemies: 14, pattern: [13, 13, 18, 13, 13, 18] },
  { id: 7, title: '霓虹突围', subtitle: '救出研究员并完成撤离', theme: 'lab', linear: true, type: 'rescue', length: 90, target: 2, enemies: 16, pattern: [15, 22, 15, 15, 22, 15] },
  { id: 8, title: '钢铁反攻', subtitle: '重装坦克全面反攻', theme: 'base', linear: true, type: 'tank', length: 110, enemies: 18, pattern: [20, 20, 20, 20, 20, 20] },
  { id: 9, title: '最终防线', subtitle: '推进至核心，坚守 3 波', theme: 'lab', linear: true, type: 'waves', length: 90, target: 3, enemies: 0, pattern: [14, 10, 14, 10, 14, 10, 14, 10] },
  { id: 10, title: '首脑', subtitle: '深入基地，击败恐怖分子首领', theme: 'base', linear: true, type: 'boss', length: 100, enemies: 8, pattern: [16, 16, 16, 16, 16, 26] }
];

export const MISSION = (function () {

  let active = false;
  let cur = null;
  let saved = load();

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { } }
  function getUnlocked() { return saved.unlocked || 1; }
  function getSavedGame() { return saved.current || null; }
  function isActive() { return active; }
  function currentLevel() { return cur ? cur.def : null; }
  function status() { return cur ? cur.status : 'idle'; }

  /* ---------- 开始一关 ---------- */
  function start(levelIdx, difficulty) {
    const def = LEVELS[levelIdx];
    active = true;
    const cps = def.linear ? WORLD.getCheckpoints() : (def.checkpoints || []);
    cur = {
      def, diff: difficulty || 1,
      killsBase: 0, waveBase: 1, boss: null, bossSpawned: false,
      spawnTimer: 0.5, addTimer: 3,
      checkpointIdx: -1, reached: [],
      status: 'playing', time: 0,
      killsAtCheckpoint: 0, waveAtCheckpoint: 1,
      freed: 0,
      checkpoints: cps,
      totalEnemies: def.enemies || 0,
      rescueAt: def.type === 'rescue' ? makeRescuePoints(def) : []
    };
    saved.unlocked = Math.max(saved.unlocked || 1, 1);
    saved.current = { level: levelIdx, difficulty, checkpoint: -1 };
    persist();
    return def;
  }

  function makeRescuePoints(def) {
    const n = def.target || 2;
    const pts = [];
    const start = 44, end = -(def.length - 48);
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      pts.push({ x: 0, z: start + (end - start) * t });
    }
    return pts;
  }

  /* ---------- 预放置敌人（每处 ≤3，不持续刷怪；远离出生点） ---------- */
  function preplaceEnemies(enemies) {
    if (cur.def.type === 'waves') return; // 波次关由自动波次生成
    const spawns = WORLD.enemySpawnPoints;
    if (!spawns.length) return;
    const spawnPos = WORLD.getPlayerSpawn() ? WORLD.getPlayerSpawn().pos : null;
    // 过滤掉离玩家出生点太近的刷怪点（确保开局不被围殴）
    const far = spawns.filter(p => !spawnPos || Math.hypot(p.x - spawnPos.x, p.z - spawnPos.z) > 14);
    const pool = far.length ? far : spawns;
    const count = cur.totalEnemies;
    for (let i = 0; i < count; i++) {
      const pt = pool[i % pool.length];
      enemies.spawnAt(pt);
    }
    if (cur.def.type === 'boss') {
      const end = WORLD.getEndZone();
      const bpt = end ? new THREE.Vector3(end.x, 0, end.z + 6) : null;
      cur.boss = bpt ? enemies.spawnAt(bpt, { boss: true }) : enemies.spawnBoss();
      cur.bossSpawned = true;
      cur.totalEnemies += 1; // 首领也算一名剩余敌人
    }
  }

  function setupEnemies(enemies) {
    if (cur.def.type === 'waves') enemies.configure({ autoWave: true, diff: cur.diff });
    else enemies.configure({ autoWave: false, diff: cur.diff });
  }

  /* ---------- 每帧更新 ---------- */
  function update(dt, ctx) {
    if (!active || cur.status !== 'playing') return;
    cur.time += dt;
    const { enemies, player } = ctx;
    const st = enemies.getStats();
    const def = cur.def;
    const type = def.type;
    const kills = st.kills - cur.killsBase;
    const pos = ctx.vehicle ? ctx.vehicle.pos : player.pos;
    const end = WORLD.getEndZone();
    const inEnd = end && (pos.x - end.x) ** 2 + (pos.z - end.z) ** 2 < end.r * end.r;

    if (type === 'reach') {
      if (inEnd) win(ctx);
    } else if (type === 'rescue') {
      for (let i = 0; i < cur.rescueAt.length; i++) {
        if (cur.rescueAt[i].freed) continue;
        const p = cur.rescueAt[i];
        const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
        if (dx * dx + dz * dz < 20) { cur.rescueAt[i].freed = true; cur.freed++; if (ctx.onRescue) ctx.onRescue(cur.freed, cur.rescueAt.length); }
      }
      if (cur.freed >= def.target && inEnd) win(ctx);
    } else if (type === 'kill') {
      if (kills >= cur.totalEnemies && st.alive === 0) win(ctx);
    } else if (type === 'waves') {
      if (st.wave > cur.waveBase + def.target - 1 && st.alive === 0) win(ctx);
    } else if (type === 'boss') {
      if (!cur.bossSpawned) { cur.boss = enemies.spawnBoss(); cur.bossSpawned = true; }
      if (cur.boss && cur.boss.dead && st.alive === 0) win(ctx);
    } else if (type === 'tank' || type === 'boat') {
      if (inEnd) win(ctx);
    }

    // checkpoint（单线：沿路径）
    for (let i = 0; i < cur.checkpoints.length; i++) {
      if (cur.reached[i]) continue;
      const c = cur.checkpoints[i];
      const dx = player.pos.x - c.x, dz = player.pos.z - c.z;
      if (dx * dx + dz * dz < 36) {
        cur.reached[i] = true;
        cur.checkpointIdx = Math.max(cur.checkpointIdx, i);
        cur.killsAtCheckpoint = st.kills;
        cur.waveAtCheckpoint = st.wave;
        saved.current = { level: def.id - 1, difficulty: cur.diff, checkpoint: cur.checkpointIdx };
        persist();
        if (ctx.onCheckpoint) ctx.onCheckpoint(i + 1, cur.checkpoints.length);
      }
    }
  }

  function win(ctx) {
    cur.status = 'won';
    saved.unlocked = Math.max(saved.unlocked || 1, cur.def.id + 1);
    saved.current = null;
    persist();
    if (ctx.onWin) ctx.onWin(cur.def, cur.diff);
  }

  function onDeath(ctx) {
    if (!active) return null;
    const cp = cur.checkpointIdx >= 0 ? cur.checkpoints[cur.checkpointIdx] : null;
    if (cp) saved.current = { level: cur.def.id - 1, difficulty: cur.diff, checkpoint: cur.checkpointIdx };
    else saved.current = { level: cur.def.id - 1, difficulty: cur.diff, checkpoint: -1 };
    persist();
    return cp;
  }

  /* ---------- checkpoint 复活：恢复剩余敌人（预放置） ---------- */
  function restoreAfterRespawn(enemies) {
    const st = enemies.getStats();
    if (cur.def.type === 'waves') {
      st.wave = Math.max(1, cur.waveAtCheckpoint - 1);
    } else {
      const killed = cur.killsAtCheckpoint; // 保留到 checkpoint 的击杀进度
      enemies.reset();
      enemies.configure({ autoWave: false, diff: cur.diff });
      st.kills = killed;
      const remaining = Math.max(0, cur.totalEnemies - killed);
      const spawns = WORLD.enemySpawnPoints;
      if (spawns.length) for (let i = 0; i < remaining; i++) enemies.spawnAt(spawns[i % spawns.length]);
      if (cur.def.type === 'boss' && cur.boss && !cur.boss.dead) { cur.boss = enemies.spawnBoss(); cur.bossSpawned = true; }
    }
  }

  function getHUD() {
    if (!cur) return null;
    const def = cur.def;
    let objective = '', max = 1;
    if (def.type === 'reach') objective = '抵达撤离点';
    else if (def.type === 'rescue') objective = cur.freed >= def.target ? '护送撤离' : '拯救人质';
    else if (def.type === 'kill') objective = '清剿敌人';
    else if (def.type === 'waves') objective = '坚守 ' + def.target + ' 波';
    else if (def.type === 'tank') objective = '坦克推进 · 抵达终点';
    else if (def.type === 'boat') objective = '快艇突击 · 抵达终点';
    else if (def.type === 'boss') objective = '击败首领';
    if (def.type === 'rescue') max = def.target;
    return { title: def.title, subtitle: def.subtitle, type: def.type, objective, max, status: cur.status, diff: cur.diff, freed: cur.freed, totalEnemies: cur.totalEnemies };
  }

  function reset() { active = false; cur = null; }
  function getLevels() { return LEVELS; }
  function getRescueAt() { return cur ? cur.rescueAt : []; }

  return {
    LEVELS, start, update, setupEnemies, preplaceEnemies, onDeath, restoreAfterRespawn,
    getHUD, isActive, status, reset, getUnlocked, getSavedGame,
    getLevels, getRescueAt, currentLevel
  };
})();
