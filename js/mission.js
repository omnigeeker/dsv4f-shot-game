/* ============================================================
 * MISSION — 剧情模式（单线关卡版）
 * 目标类型：reach 抵达终点 / rescue 拯救人质 / kill 清剿 /
 *           waves 守波 / tank·boat 载具 / boss 首领
 * 线性地图自带 checkpoint，存档续玩
 * ============================================================ */
import { WORLD } from './world.js';

const KEY = 'dsv4f_campaign_v1';

export const LEVELS = [
  { id: 1, title: '潜入基地', subtitle: '穿过基地通道，抵达撤离点', theme: 'base', linear: true, type: 'reach', length: 70 },
  { id: 2, title: '拯救人质', subtitle: '救出被困人质，护送撤离', theme: 'base', linear: true, type: 'rescue', length: 80, target: 2 },
  { id: 3, title: '沙漠公路', subtitle: '驾驶坦克突破公路防线', theme: 'desert', linear: true, type: 'tank', length: 90 },
  { id: 4, title: '小镇突击', subtitle: '单线清剿小镇武装分子', theme: 'desert', linear: true, type: 'kill', length: 70, target: 12 },
  { id: 5, title: '河流强袭', subtitle: '乘机枪快艇沿河扫射', theme: 'desert', linear: true, type: 'boat', length: 90 },
  { id: 6, title: '实验室渗透', subtitle: '穿过霓虹实验室核心', theme: 'lab', linear: true, type: 'reach', length: 80 },
  { id: 7, title: '霓虹突围', subtitle: '救出研究员并完成撤离', theme: 'lab', linear: true, type: 'rescue', length: 90, target: 2 },
  { id: 8, title: '钢铁反攻', subtitle: '重装坦克全面反攻', theme: 'base', linear: true, type: 'tank', length: 110 },
  { id: 9, title: '最终防线', subtitle: '推进至核心，坚守 3 波', theme: 'lab', linear: true, type: 'waves', length: 90, target: 3 },
  { id: 10, title: '首脑', subtitle: '深入基地，击败恐怖分子首领', theme: 'base', linear: true, type: 'boss', length: 100 }
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
      rescueAt: def.type === 'rescue' ? makeRescuePoints(def) : []
    };
    saved.unlocked = Math.max(saved.unlocked || 1, 1);
    saved.current = { level: levelIdx, difficulty, checkpoint: -1 };
    persist();
    return def;
  }

  function makeRescuePoints(def) {
    // 沿单线地图均匀放置人质点（避开首尾）
    const n = def.target || 2;
    const pts = [];
    const start = 44, end = -(def.length - 48);
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      pts.push({ x: 0, z: start + (end - start) * t });
    }
    return pts;
  }

  function setupEnemies(enemies) {
    if (cur.def.type === 'waves') enemies.configure({ autoWave: true, diff: cur.diff });
    else enemies.configure({ autoWave: false, diff: cur.diff, maxAlive: 5 });
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
      spawnWhile(enemies, dt, 4, kills, 999);
      if (inEnd) win(ctx);
    } else if (type === 'rescue') {
      // 阶段1：拯救人质
      for (let i = 0; i < cur.rescueAt.length; i++) {
        if (cur.rescueAt[i].freed) continue;
        const p = cur.rescueAt[i];
        const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
        if (dx * dx + dz * dz < 20) { cur.rescueAt[i].freed = true; cur.freed++; if (ctx.onRescue) ctx.onRescue(cur.freed, cur.rescueAt.length); }
      }
      spawnWhile(enemies, dt, 5, kills, 999);
      if (cur.freed >= def.target && inEnd) win(ctx);
    } else if (type === 'kill') {
      spawnWhile(enemies, dt, 6, kills, def.target);
      if (kills >= def.target && st.alive === 0) win(ctx);
    } else if (type === 'waves') {
      if (st.wave > cur.waveBase + def.target - 1 && st.alive === 0) win(ctx);
    } else if (type === 'boss') {
      if (!cur.bossSpawned) { cur.boss = enemies.spawnBoss(); cur.bossSpawned = true; }
      cur.addTimer -= dt;
      if (cur.addTimer <= 0 && st.alive < 5) { enemies.spawnEnemy(); cur.addTimer = 4; }
      if (cur.boss && cur.boss.dead && st.alive === 0) win(ctx);
    } else if (type === 'tank' || type === 'boat') {
      spawnWhile(enemies, dt, 5, kills, 999);
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

  function spawnWhile(enemies, dt, maxAlive, kills, killTarget) {
    const st = enemies.getStats();
    if (st.alive < maxAlive && kills < killTarget) {
      cur.spawnTimer -= dt;
      if (cur.spawnTimer <= 0) { enemies.spawnEnemy(); cur.spawnTimer = 0.8; }
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

  function restoreAfterRespawn(enemies) {
    const st = enemies.getStats();
    if (cur.def.type === 'waves') st.wave = Math.max(1, cur.waveAtCheckpoint - 1);
    else st.kills = cur.killsAtCheckpoint;
    enemies.configure({ autoWave: cur.def.type === 'waves', diff: cur.diff, maxAlive: 5 });
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
    return { title: def.title, subtitle: def.subtitle, type: def.type, objective, max, status: cur.status, diff: cur.diff, freed: cur.freed };
  }

  function reset() { active = false; cur = null; }
  function getLevels() { return LEVELS; }
  function getRescueAt() { return cur ? cur.rescueAt : []; }

  return {
    LEVELS, start, update, setupEnemies, onDeath, restoreAfterRespawn,
    getHUD, isActive, status, reset, getUnlocked, getSavedGame,
    getLevels, getRescueAt, currentLevel
  };
})();
