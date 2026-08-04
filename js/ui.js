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
      weaponSlots: document.getElementById('weapon-slots')
    };
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

    window.addEventListener('pointerlockchange', onLockChange);
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
  function updateMinimap(playerPos, playerYaw, enemies) {
    const ctx = els.minimap.getContext('2d');
    ctx.clearRect(0, 0, 180, 180);
    ctx.drawImage(mapCanvas, 0, 0);
    const px = (playerPos.x + MAP_OFF) * MAP_SCALE;
    const py = (playerPos.z + MAP_OFF) * MAP_SCALE;
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

  return { init, setHandlers, setScreen, updateHUD, damage, hitmarker, hitLabel, healLabel, waveBanner, killfeed, death, updateMinimap, rebuildMinimap, showScope, buildWeaponSlots };
})();
