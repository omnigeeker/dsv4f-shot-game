/* ============================================================
 * UI — HUD 渲染 / 菜单 / 击杀播报 / 小地图
 * ============================================================ */
import { WORLD } from './world.js';

export const UI = (function () {

  let els = null;
  let damageFlash = 0, damageDir = 0, damageVisible = false;
  let mapCanvas = null, mapCtx = null;

  /* ---------- 初始化 ---------- */
  function init() {
    els = {
      hud: document.getElementById('hud'),
      menu: document.getElementById('menu'),
      pause: document.getElementById('pause'),
      death: document.getElementById('death'),
      crosshair: document.getElementById('crosshair'),
      hitmarker: document.getElementById('hitmarker'),
      damageVig: document.getElementById('damage-vignette'),
      damageDir: document.getElementById('damage-dir'),
      lowhp: document.getElementById('lowhp'),
      hpFill: document.getElementById('hp-fill'),
      hpNum: document.getElementById('hp-num'),
      armorFill: document.getElementById('armor-fill'),
      armorNum: document.getElementById('armor-num'),
      ammoMag: document.getElementById('ammo-mag'),
      ammoReserve: document.getElementById('ammo-reserve'),
      weaponName: document.getElementById('weapon-name'),
      waveBanner: document.getElementById('wave-banner'),
      waveTimer: document.getElementById('wave-timer'),
      killfeed: document.getElementById('killfeed'),
      killsNum: document.getElementById('kills-num'),
      waveNum: document.getElementById('wave-num'),
      deathStats: document.getElementById('death-stats'),
      minimap: document.getElementById('minimap-canvas'),
      scope: document.getElementById('scope'),
      weaponSlots: document.getElementById('weapon-slots'),
      modeTabs: document.querySelectorAll('.mode-tab'),
      arenaPanel: document.getElementById('arena-panel'),
      campaignPanel: document.getElementById('campaign-panel'),
      diffBtns: document.querySelectorAll('.diff-btn'),
      levelGrid: document.getElementById('level-grid'),
      continueBtn: document.getElementById('continue-btn'),
      missionHud: document.getElementById('mission-hud'),
      missionTitle: document.getElementById('mission-title'),
      missionFill: document.getElementById('mission-fill'),
      missionProgress: document.getElementById('mission-progress'),
      checkpointToast: document.getElementById('checkpoint-toast'),
      victory: document.getElementById('victory'),
      victoryInfo: document.getElementById('victory-info'),
      briefing: document.getElementById('briefing'),
      briefingTitle: document.getElementById('briefing-title'),
      briefingText: document.getElementById('briefing-text')
    };
    els.selectedDiff = 1;
    // 换弹提示（动态创建）
    const rm = document.createElement('div');
    rm.id = 'reload-msg';
    rm.className = 'hidden';
    document.getElementById('ammo').appendChild(rm);
    els.reloadMsg = rm;

    // 武器槽位（由 main 在武器创建后调用 buildWeaponSlots 填充）

    // 出生护盾提示（动态创建）
    const sb = document.createElement('div');
    sb.id = 'shield-badge';
    sb.className = 'hidden';
    sb.textContent = '护盾';
    els.hud.appendChild(sb);
    els.shieldBadge = sb;
    const sv = document.createElement('div');
    sv.id = 'shield-vignette';
    sv.style.opacity = 0;
    els.hud.appendChild(sv);
    els.shieldVignette = sv;

    // 小地图：预先绘制静态地图
    const cv = document.createElement('canvas');
    cv.width = cv.height = 180;
    mapCanvas = cv; mapCtx = cv.getContext('2d');
    drawMapStatic();
    els.rebuildMinimap = rebuildMinimap;

    // 按钮
    document.getElementById('start-btn').addEventListener('click', onStart);
    document.getElementById('resume-btn').addEventListener('click', onResume);
    document.getElementById('restart-btn').addEventListener('click', onRestart);
    document.getElementById('restart-btn-pause').addEventListener('click', onRestart);

    // 地图选择卡片
    const mapSel = document.getElementById('map-select');
    if (mapSel && WORLD) {
      WORLD.MAPS.forEach((m, i) => {
        const card = document.createElement('div');
        card.className = 'map-card' + (i === 0 ? ' selected' : '');
        card.dataset.idx = i;
        card.innerHTML = '<span class="mc-name">' + m.name + '</span><span class="mc-desc">' + m.desc + '</span>';
        card.addEventListener('click', () => {
          for (const c of mapSel.children) c.classList.remove('selected');
          card.classList.add('selected');
          if (handlers.selectMap) handlers.selectMap(i);
        });
        mapSel.appendChild(card);
      });
    }

    // 模式切换
    els.modeTabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
    // 难度
    els.diffBtns.forEach(b => b.addEventListener('click', () => {
      els.diffBtns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      els.selectedDiff = parseFloat(b.dataset.diff);
    }));
    // 关卡点击 → 由 main 处理
    document.getElementById('continue-btn').addEventListener('click', () => { if (handlers.resumeCampaign) handlers.resumeCampaign(); });
    document.getElementById('campaign-back').addEventListener('click', () => { if (handlers.toMenu) handlers.toMenu(); });
    document.getElementById('next-level-btn').addEventListener('click', () => { if (handlers.nextLevel) handlers.nextLevel(); });
    document.getElementById('victory-menu-btn').addEventListener('click', () => { if (handlers.toMenu) handlers.toMenu(); });
    document.getElementById('briefing-start').addEventListener('click', () => {
      els.briefing.classList.add('hidden');
      if (handlers.briefingStart) handlers.briefingStart();
    });

    window.addEventListener('pointerlockchange', onLockChange);
  }

  function setMode(mode) {
    const campaign = mode === 'campaign';
    els.arenaPanel.classList.toggle('hidden', campaign);
    els.campaignPanel.classList.toggle('hidden', !campaign);
    els.modeTabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    // 剧情：刷新关卡列表与“继续”按钮
    if (campaign) {
      buildLevelGrid();
      els.continueBtn.classList.toggle('hidden', !(handlers.hasSavedGame && handlers.hasSavedGame()));
    }
  }

  function buildLevelGrid() {
    if (!els.levelGrid || !window.MISSION) return;
    const unlocked = window.MISSION.getUnlocked();
    const saved = window.MISSION.getSavedGame();
    els.levelGrid.innerHTML = '';
    window.MISSION.getLevels().forEach((lv, i) => {
      const idx = i;
      const b = document.createElement('button');
      b.className = 'level-btn';
      b.textContent = lv.id;
      b.title = lv.title + ' — ' + lv.subtitle;
      if (lv.id < unlocked) b.classList.add('completed');
      else if (lv.id === unlocked) b.classList.add('current');
      else b.classList.add('locked');
      if (lv.id <= unlocked) {
        b.addEventListener('click', () => { if (handlers.startLevel) handlers.startLevel(idx, els.selectedDiff); });
      }
      els.levelGrid.appendChild(b);
    });
  }

  function setMissionHUD(m) {
    if (!els.missionHud || !m) return;
    els.missionHud.classList.remove('hidden');
    els.missionTitle.textContent = m.title + ' · ' + m.objective;
  }
  function updateMissionHUD(m) {
    if (!m || m.status !== 'playing') { if (els.missionHud) els.missionHud.classList.add('hidden'); return; }
    els.missionHud.classList.remove('hidden');
    els.missionTitle.textContent = m.title + ' · ' + m.objective;
    els.missionProgress.textContent = '难度 ' + (m.diff >= 1.4 ? '困难' : '普通');
    // 进度：kill/boss 用击杀进度，waves 用波次进度（通过占位）
    if (els.missionFill) {
      let pct = 0;
      if (m.max > 1) pct = 20; // 占位；实际进度由 main 提供
      els.missionFill.style.width = pct + '%';
    }
  }
  function hideMissionHUD() { if (els.missionHud) els.missionHud.classList.add('hidden'); }

  function checkpointToast(text) {
    els.checkpointToast.textContent = text || '检查点已激活';
    els.checkpointToast.classList.remove('show');
    void els.checkpointToast.offsetWidth;
    els.checkpointToast.classList.add('show');
  }

  function showBriefing(title, text, cb) {
    els.briefingTitle.textContent = title;
    els.briefingText.textContent = text;
    handlers.briefingStart = cb || null;
    els.briefing.classList.remove('hidden');
  }

  function victory(info, hasNext) {
    els.victoryInfo.innerHTML = info || '';
    document.getElementById('next-level-btn').classList.toggle('hidden', !hasNext);
    els.victory.classList.remove('hidden');
  }

  /* ---------- 按钮（由 main 注入处理器） ---------- */
  let handlers = {};
  function setHandlers(h) { handlers = h; }
  function onStart() { if (handlers.start) handlers.start(); }
  function onResume() { if (handlers.resume) handlers.resume(); }
  function onRestart() { if (handlers.restart) handlers.restart(); }
  function onLockChange() {
    const locked = document.pointerLockElement !== null;
    if (!locked && handlers.lockLost) handlers.lockLost();
  }

  /* ---------- 界面切换 ---------- */
  function setScreen(s) {
    els.hud.classList.toggle('hidden', s !== 'hud');
    els.menu.classList.toggle('hidden', s !== 'menu');
    els.pause.classList.toggle('hidden', s !== 'pause');
    els.death.classList.toggle('hidden', s !== 'death');
    if (els.victory) els.victory.classList.toggle('hidden', s !== 'victory');
    if (s !== 'hud') { damageFlash = 0; damageVisible = false; els.damageVig.style.opacity = 0; els.damageDir.style.opacity = 0; }
  }

  /* ---------- 每帧 HUD 更新 ---------- */
  function updateHUD(dt, st) {
    // 血/甲
    const hp = Math.max(0, Math.round(st.hp));
    const armor = Math.max(0, Math.round(st.armor));
    els.hpFill.style.width = hp + '%';
    els.hpFill.classList.toggle('low', hp < 30);
    els.hpNum.textContent = hp;
    els.armorFill.style.width = armor + '%';
    els.armorNum.textContent = armor;
    els.lowhp.classList.toggle('hidden', hp >= 30);

    // 弹药
    const hud = st.weapons;
    els.ammoMag.textContent = hud.reloading ? '--' : hud.mag;
    els.ammoReserve.textContent = hud.reloading ? '装弹中' : '/ ' + hud.reserve;
    els.ammoMag.classList.toggle('low', !hud.reloading && hud.mag <= Math.max(2, Math.floor(hud.reserve * 0.2)) && hud.mag > 0);
    els.ammoMag.classList.toggle('empty', !hud.reloading && hud.mag === 0 && hud.reserve > 0);
    els.reloadMsg.classList.toggle('hidden', !hud.reloading);
    els.weaponName.textContent = hud.name + (hud.reloading ? ' · 换弹中' : '');

    // 武器槽位高亮
    if (els.weaponSlots) {
      for (const s of els.weaponSlots.children) s.classList.toggle('current', s.dataset.name === hud.name);
    }

    // 准星（开镜/换弹时隐藏）
    els.crosshair.style.setProperty('--gap', hud.crosshairGap + 'px');
    els.crosshair.classList.toggle('hidden', hud.reloading || hud.zoomed);

    // 出生护盾
    if (st.protect > 0) {
      els.shieldBadge.textContent = '护盾 ' + Math.ceil(st.protect) + 's';
      els.shieldBadge.classList.remove('hidden');
      els.shieldVignette.style.opacity = 1;
    } else {
      els.shieldBadge.classList.add('hidden');
      els.shieldVignette.style.opacity = 0;
    }

    // 战绩/波次
    els.killsNum.textContent = st.kills;
    els.waveNum.textContent = st.wave;
    els.waveTimer.textContent = st.between ? ('下一波：' + Math.ceil(st.timer) + 's') : ('敌人：' + st.alive);

    // 受伤红晕衰减
    if (damageFlash > 0) {
      damageFlash -= dt;
      els.damageVig.style.opacity = Math.max(0, Math.min(1, damageFlash * 2.2));
      if (damageDir) els.damageDir.style.setProperty('--deg', damageDir + 'deg');
      els.damageDir.style.opacity = damageFlash > 0.3 ? 1 : 0;
      if (damageFlash <= 0) damageVisible = false;
    } else if (!damageVisible) {
      els.damageVig.style.opacity = 0;
      els.damageDir.style.opacity = 0;
    }
  }

  /* ---------- 受伤反馈 ---------- */
  function damage(fromPos, playerPos, playerYaw) {
    damageFlash = 0.7;
    damageVisible = true;
    const dx = fromPos.x - playerPos.x, dz = fromPos.z - playerPos.z;
    const worldAng = Math.atan2(dx, dz) * 180 / Math.PI; // 0=北
    const viewDeg = (playerYaw * 180 / Math.PI + 180);   // 视角朝向
    damageDir = Math.round(worldAng - viewDeg);
  }

  /* ---------- 命中标记 ---------- */
  function hitmarker(kill) {
    els.hitmarker.classList.remove('show', 'kill');
    els.hitmarker.classList.add('kill');
    if (kill) els.hitmarker.classList.add('kill');
    void els.hitmarker.offsetWidth;
    els.hitmarker.classList.add('show');
  }

  /* ---------- 命中标签（爆头） ---------- */
  function hitLabel(text) {
    let el = document.getElementById('hit-label');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hit-label';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  /* ---------- 加血提示 ---------- */
  function healLabel(text) {
    let el = document.getElementById('heal-label');
    if (!el) {
      el = document.createElement('div');
      el.id = 'heal-label';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /* ---------- 波次横幅 ---------- */
  function waveBanner(n) {
    els.waveBanner.textContent = 'WAVE ' + n;
    els.waveBanner.classList.remove('show');
    void els.waveBanner.offsetWidth;
    els.waveBanner.classList.add('show');
  }

  /* ---------- 击杀播报 ---------- */
  function killfeed(text) {
    const item = document.createElement('div');
    item.className = 'kf-item';
    item.innerHTML = text;
    els.killfeed.appendChild(item);
    while (els.killfeed.children.length > 5) els.killfeed.removeChild(els.killfeed.firstChild);
    setTimeout(() => { if (item.parentNode) item.parentNode.removeChild(item); }, 4000);
  }

  /* ---------- 死亡结算 ---------- */
  function death(stats) {
    els.deathStats.innerHTML =
      '存活至 <span class="ds-val">' + stats.wave + '</span> 波<br>' +
      '击杀 <span class="ds-val">' + stats.kills + '</span> 名敌人<br>' +
      '坚持 <span class="ds-val">' + stats.time + '</span> 秒';
  }

  /* ---------- 小地图 ---------- */
  const MAP_SCALE = 180 / 110, MAP_OFF = 55;
  function drawMapStatic() {
    const ctx = mapCtx;
    ctx.clearRect(0, 0, 180, 180);
    ctx.fillStyle = 'rgba(20,26,16,0.9)';
    ctx.fillRect(0, 0, 180, 180);
    ctx.strokeStyle = 'rgba(150,180,110,0.35)';
    ctx.lineWidth = 1;
    for (const c of WORLD.colliders) {
      const w = c.maxX - c.minX, d = c.maxZ - c.minZ;
      if (w < 1.4 && d < 1.4) continue; // 跳过小道具
      if (c.maxY > 1.6 && (w > 4 || d > 4)) continue; // 跳过墙/大建筑(太密)
      const x = (c.minX + MAP_OFF) * MAP_SCALE;
      const y = (c.minZ + MAP_OFF) * MAP_SCALE;
      const rw = w * MAP_SCALE, rh = d * MAP_SCALE;
      ctx.fillStyle = 'rgba(60,72,44,0.95)';
      ctx.fillRect(x, y, rw, rh);
      ctx.strokeRect(x, y, rw, rh);
    }
    // 围墙边框
    ctx.strokeStyle = 'rgba(150,180,110,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 176, 176);
  }
  function updateMinimap(playerPos, playerYaw, enemies, hostagePositions, endZone) {
    const ctx = els.minimap.getContext('2d');
    ctx.clearRect(0, 0, 180, 180);
    ctx.drawImage(mapCanvas, 0, 0);
    const px = (playerPos.x + MAP_OFF) * MAP_SCALE;
    const py = (playerPos.z + MAP_OFF) * MAP_SCALE;
    // 出口（绿色目标环）
    if (endZone) {
      const ex = (endZone.x + MAP_OFF) * MAP_SCALE;
      const ey = (endZone.z + MAP_OFF) * MAP_SCALE;
      ctx.strokeStyle = '#3aff7a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#3aff7a';
      ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fill();
    }
    // 人质（青色点）
    if (hostagePositions) {
      ctx.fillStyle = '#4fd8ff';
      for (const hp of hostagePositions) {
        const hx = (hp.x + MAP_OFF) * MAP_SCALE;
        const hy = (hp.z + MAP_OFF) * MAP_SCALE;
        ctx.beginPath(); ctx.arc(hx, hy, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // 视野线
    ctx.strokeStyle = 'rgba(120,255,160,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(playerYaw) * 12, py + Math.cos(playerYaw) * 12);
    ctx.stroke();
    // 玩家
    ctx.fillStyle = '#9dff4d';
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    // 敌人
    ctx.fillStyle = '#ff4d4d';
    for (const e of enemies) {
      if (e.dead) continue;
      const ex = (e.pos.x + MAP_OFF) * MAP_SCALE;
      const ey = (e.pos.z + MAP_OFF) * MAP_SCALE;
      ctx.fillRect(ex - 2, ey - 2, 4, 4);
    }
  }

  function rebuildMinimap() { if (mapCtx) drawMapStatic(); }

  function setMissionProgress(pct, text) {
    if (els.missionFill) els.missionFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (text && els.missionProgress) els.missionProgress.textContent = text;
  }

  /* ---------- 狙击镜 ---------- */
  function showScope(show) { if (els.scope) els.scope.classList.toggle('hidden', !show); }

  /* ---------- 武器槽位 ---------- */
  function buildWeaponSlots(list) {
    if (!els.weaponSlots) return;
    els.weaponSlots.innerHTML = '';
    for (const w of list) {
      const d = document.createElement('div');
      d.className = 'wslot';
      d.dataset.name = w.name;
      d.innerHTML = '<span class="wk">' + w.num + '</span>' + (w.zoom ? '🔍' : '') + w.name;
      els.weaponSlots.appendChild(d);
    }
  }

  return { init, setHandlers, setScreen, updateHUD, damage, hitmarker, hitLabel, healLabel, waveBanner, killfeed, death, updateMinimap, rebuildMinimap, showScope, buildWeaponSlots,
    setMode, buildLevelGrid, setMissionHUD, updateMissionHUD, hideMissionHUD, setMissionProgress, checkpointToast, victory, showBriefing, setScreenHidden: (id, hidden) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', hidden); } };
})();
