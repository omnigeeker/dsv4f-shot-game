/* ============================================================
 * MISSION — 剧情模式
 * 10 个线性关卡（击杀 / 守波 / 首领），难度选择，checkpoint 续玩，
 * 进度与解锁用 localStorage 持久化
 * ============================================================ */

const KEY = 'dsv4f_campaign_v1';

/* ---------- 10 关定义 ---------- */
export const LEVELS = [
  { id: 1, title: '潜入基地', subtitle: '肃清基地外围的巡逻队', map: 0, type: 'kill', target: 10, checkpoints: [{ x: 0, z: -20 }] },
  { id: 2, title: '探照灯下', subtitle: '在探照灯扫射下守住阵地', map: 0, type: 'waves', target: 2, checkpoints: [{ x: 0, z: -20 }, { x: 0, z: -38 }] },
  { id: 3, title: '小镇清剿', subtitle: '清除沙漠小镇的武装分子', map: 1, type: 'kill', target: 15, checkpoints: [{ x: 0, z: 0 }] },
  { id: 4, title: '沙尘封锁', subtitle: '击退小镇外围的封锁线', map: 1, type: 'kill', target: 18, checkpoints: [{ x: 0, z: 0 }] },
  { id: 5, title: '实验室渗透', subtitle: '潜入霓虹实验室消灭守军', map: 2, type: 'kill', target: 12, checkpoints: [{ x: 0, z: 20 }] },
  { id: 6, title: '霓虹突围', subtitle: '在实验室走廊中生存突围', map: 2, type: 'waves', target: 3, checkpoints: [{ x: 0, z: 20 }] },
  { id: 7, title: '双线作战', subtitle: '基地腹地遭遇大规模进攻', map: 0, type: 'kill', target: 22, checkpoints: [{ x: 0, z: -20 }, { x: 0, z: -38 }] },
  { id: 8, title: '弹尽粮绝', subtitle: '物资匮乏的沙漠绝地反击', map: 1, type: 'kill', target: 18, checkpoints: [{ x: 0, z: 0 }] },
  { id: 9, title: '最终防线', subtitle: '实验室核心区域绝境求生', map: 2, type: 'waves', target: 5, checkpoints: [{ x: 0, z: 20 }, { x: 0, z: -20 }] },
  { id: 10, title: '首脑', subtitle: '击败恐怖分子首领', map: 0, type: 'boss', target: 1, checkpoints: [{ x: 0, z: -20 }] }
];

export const MISSION = (function () {

  let active = false;
  let cur = null; // 当前关卡状态
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
  function start(levelIdx, difficulty, opts = {}) {
    const def = LEVELS[levelIdx];
    active = true;
    cur = {
      def, diff: difficulty || 1,
      killsBase: 0, waveBase: 1, boss: null, bossSpawned: false,
      spawnTimer: 0.5, addTimer: 3,
      checkpointIdx: -1, reached: [],
      status: 'playing', time: 0,
      respawnPoint: null,
      killsAtCheckpoint: 0, waveAtCheckpoint: 1
    };
    if (opts.checkpoint != null) cur.checkpointIdx = opts.checkpoint;
    // 记录解锁与当前进度
    saved.unlocked = Math.max(saved.unlocked || 1, 1);
    saved.current = { level: levelIdx, difficulty, checkpoint: -1 };
    persist();
    return def;
  }

  /* ---------- 开始时的敌人配置（由 main 调用） ---------- */
  function setupEnemies(enemies) {
    const type = cur.def.type;
    if (type === 'waves') {
      enemies.configure({ autoWave: true, diff: cur.diff });
    } else {
      enemies.configure({ autoWave: false, diff: cur.diff, maxAlive: 6 });
    }
  }

  /* ---------- 每帧更新 ---------- */
  function update(dt, ctx) {
    if (!active || cur.status !== 'playing') return;
    cur.time += dt;
    const { enemies, player } = ctx;
    const st = enemies.getStats();
    const type = cur.def.type;
    const kills = st.kills - cur.killsBase;

    if (type === 'kill') {
      // 持续补怪直到达成击杀目标
      if (st.alive < 6 && kills < cur.def.target) {
        cur.spawnTimer -= dt;
        if (cur.spawnTimer <= 0) { enemies.spawnEnemy(); cur.spawnTimer = 0.8; }
      }
      if (kills >= cur.def.target && st.alive === 0) win(ctx);
    } else if (type === 'waves') {
      if (st.wave > cur.waveBase + cur.def.target - 1 && st.alive === 0) win(ctx);
    } else if (type === 'boss') {
      if (!cur.bossSpawned) {
        cur.boss = enemies.spawnBoss();
        cur.bossSpawned = true;
      }
      cur.addTimer -= dt;
      if (cur.addTimer <= 0 && st.alive < 5) { enemies.spawnEnemy(); cur.addTimer = 4; }
      if (cur.boss && cur.boss.dead && st.alive === 0) win(ctx);
    }

    // checkpoint 检测
    const cps = cur.def.checkpoints;
    for (let i = 0; i < cps.length; i++) {
      if (cur.reached[i]) continue;
      const c = cps[i];
      const dx = player.pos.x - c.x, dz = player.pos.z - c.z;
      if (dx * dx + dz * dz < 36) { // 半径 6
        cur.reached[i] = true;
        cur.checkpointIdx = Math.max(cur.checkpointIdx, i);
        cur.killsAtCheckpoint = ctx.enemies.getStats().kills;
        cur.waveAtCheckpoint = ctx.enemies.getStats().wave;
        saved.current = { level: cur.def.id - 1, difficulty: cur.diff, checkpoint: cur.checkpointIdx };
        persist();
        if (ctx.onCheckpoint) ctx.onCheckpoint(i + 1, cps.length);
      }
    }
  }

  /* ---------- 胜利 ---------- */
  function win(ctx) {
    cur.status = 'won';
    saved.unlocked = Math.max(saved.unlocked || 1, cur.def.id + 1);
    saved.current = null;
    persist();
    if (ctx.onWin) ctx.onWin(cur.def, cur.diff);
  }

  /* ---------- 玩家死亡：返回重生点（null = 关卡重开） ---------- */
  function onDeath(ctx) {
    if (!active) return null;
    const cps = cur.def.checkpoints;
    const cp = cur.checkpointIdx >= 0 ? cps[cur.checkpointIdx] : null;
    cur.respawnPoint = cp;
    // 存档重生点
    if (cp) saved.current = { level: cur.def.id - 1, difficulty: cur.diff, checkpoint: cur.checkpointIdx };
    else saved.current = { level: cur.def.id - 1, difficulty: cur.diff, checkpoint: -1 };
    persist();
    return cp;
  }

  /* ---------- 从 checkpoint 重生恢复 ---------- */
  function restoreAfterRespawn(enemies) {
    const st = enemies.getStats();
    if (cur.def.type === 'waves') {
      st.wave = Math.max(1, cur.waveAtCheckpoint - 1); // 下一波回到 checkpoint 所在波
    } else {
      st.kills = cur.killsAtCheckpoint; // 保留到 checkpoint 时的击杀进度
    }
    enemies.configure({ autoWave: cur.def.type === 'waves', diff: cur.diff, maxAlive: 6 });
  }

  /* ---------- 供 HUD 显示 ---------- */
  function getHUD() {
    if (!cur) return null;
    const type = cur.def.type;
    let objective = '', progress = 0, max = 1;
    if (type === 'kill' || type === 'boss') {
      objective = (type === 'boss' ? '击败首领' : '击杀敌人');
      max = cur.def.target;
    } else if (type === 'waves') {
      objective = '守住 ' + cur.def.target + ' 波';
      max = cur.def.target;
    }
    return {
      title: cur.def.title, subtitle: cur.def.subtitle,
      type, objective, max, progress,
      checkpoint: cur.checkpointIdx + 1, totalCheckpoints: cur.def.checkpoints.length,
      status: cur.status, diff: cur.diff
    };
  }

  function reset() { active = false; cur = null; }
  function getLevels() { return LEVELS; }
  function setKillsBase(n) { if (cur) cur.killsBase = n; }
  function setWaveBase(n) { if (cur) cur.waveBase = n; }

  return {
    LEVELS, start, update, setupEnemies, onDeath, restoreAfterRespawn,
    getHUD, isActive, status, reset, getUnlocked, getSavedGame,
    getLevels, setKillsBase, setWaveBase, currentLevel
  };
})();
