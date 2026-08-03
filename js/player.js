/* ============================================================
 * PLAYER — 第一人称角色：移动 / 碰撞 / 指针锁定 / 受伤
 * ============================================================ */
window.PLAYER = (function () {

  const EYE_STAND = 1.72, EYE_CROUCH = 1.15;
  const RADIUS = 0.34;

  function create(camera, canvas) {
    const p = {
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      yaw: 0, pitch: 0,
      eye: EYE_STAND, eyeTarget: EYE_STAND,
      onGround: true,
      crouching: false, sprinting: false,
      health: 100, armor: 50,
      alive: true,
      active: false,
      bobPhase: 0,
      landTime: 0,
      // 回调（由 main 注入）
      onFootstep: null, onDamage: null, onDeath: null,
      camera, canvas,
      _keys: {},
      _mouseDX: 0, _mouseDY: 0
    };

    /* ---------- 输入 ---------- */
    const onKeyDown = (e) => {
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      p._keys[e.code] = true;
      if (e.code === 'Space' && p.active) p._jumpQueued = true;
      if (e.code === 'KeyC') p._crouchHeld = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') p._sprintHeld = true;
    };
    const onKeyUp = (e) => {
      p._keys[e.code] = false;
      if (e.code === 'KeyC') p._crouchHeld = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') p._sprintHeld = false;
    };
    const onMouseMove = (e) => {
      if (document.pointerLockElement !== canvas) return;
      p._mouseDX += e.movementX;
      p._mouseDY += e.movementY;
    };

    p.attach = () => {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      document.addEventListener('mousemove', onMouseMove);
    };
    p.detach = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
    };

    /* ---------- 重置 ---------- */
    p.setSpawn = (x, z, yaw) => {
      p.pos.set(x, 0, z);
      p.vel.set(0, 0, 0);
      p.yaw = yaw; p.pitch = 0;
      p.health = 100; p.armor = 50;
      p.alive = true;
      p.eye = p.eyeTarget = EYE_STAND;
      p.onGround = true;
      camera.rotation.order = 'YXZ';
    };

    p.lookDir = () => {
      return new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    };

    /* ---------- 受伤 ---------- */
    p.damage = (amount, fromPos) => {
      if (!p.alive) return;
      let dmg = amount;
      if (p.armor > 0) {
        const absorbed = Math.min(p.armor, dmg * 0.5);
        p.armor -= absorbed;
        dmg -= absorbed;
      }
      p.health = Math.max(0, p.health - dmg);
      if (p.onDamage) p.onDamage(fromPos);
      if (p.health <= 0 && p.alive) {
        p.alive = false;
        if (p.onDeath) p.onDeath();
      }
    };

    /* ---------- 碰撞 ---------- */
    function overlap(a, b) {
      return a.minX < b.maxX && a.maxX > b.minX &&
        a.minY < b.maxY && a.maxY > b.minY &&
        a.minZ < b.maxZ && a.maxZ > b.minZ;
    }
    function playerBox() {
      const c = p.pos;
      return {
        minX: c.x - RADIUS, minY: c.y, minZ: c.z - RADIUS,
        maxX: c.x + RADIUS, maxY: c.y + p.eye, maxZ: c.z + RADIUS
      };
    }
    function resolveAxis(axis, delta) {
      if (delta === 0) return;
      p.pos[axis] += delta;
      const box = playerBox();
      for (const col of WORLD.colliders) {
        if (overlap(box, col)) {
          p.pos[axis] -= delta;
          return;
        }
      }
    }
    function grounded() {
      p.pos.y -= 0.02;
      const box = playerBox();
      let on = false;
      for (const col of WORLD.colliders) {
        if (overlap(box, col)) { on = true; break; }
      }
      p.pos.y += 0.02;
      return on;
    }

    /* ---------- 主更新 ---------- */
    p.update = (dt) => {
      if (!p.alive || !p.active) return;

      // 视角
      const sens = 0.0021;
      p.yaw -= p._mouseDX * sens;
      p.pitch -= p._mouseDY * sens;
      p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch));
      p._mouseDX = p._mouseDY = 0;

      // 下蹲
      p.crouching = !!p._crouchHeld;
      p.sprinting = !!p._sprintHeld && !p.crouching &&
        (p._keys['KeyW'] || p._keys['ArrowUp']) &&
        (p._keys['ShiftLeft'] || p._keys['ShiftRight']);
      p.eyeTarget = p.crouching ? EYE_CROUCH : EYE_STAND;
      p.eye += (p.eyeTarget - p.eye) * Math.min(1, dt * 12);

      // 移动方向
      let f = 0, s = 0;
      if (p._keys['KeyW'] || p._keys['ArrowUp']) f += 1;
      if (p._keys['KeyS'] || p._keys['ArrowDown']) f -= 1;
      if (p._keys['KeyD'] || p._keys['ArrowRight']) s += 1;
      if (p._keys['KeyA'] || p._keys['ArrowLeft']) s -= 1;

      const speed = p.crouching ? 2.4 : (p.sprinting ? 8.2 : 5.4);
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      // 相对视角的移动方向
      let wx = (f * -sin + s * cos);
      let wz = (f * -cos + s * -sin);
      const wl = Math.hypot(wx, wz);
      if (wl > 0) { wx /= wl; wz /= wl; }

      // 水平速度平滑逼近目标
      const accel = p.onGround ? 14 : 5;
      const k = 1 - Math.exp(-accel * dt);
      const tvx = wx * speed, tvz = wz * speed;
      p.vel.x += (tvx - p.vel.x) * k;
      p.vel.z += (tvz - p.vel.z) * k;

      // 跳跃 / 重力
      if (p._jumpQueued && p.onGround && !p.crouching) {
        p.vel.y = 6.4;
        p.onGround = false;
      }
      p._jumpQueued = false;
      p.vel.y -= 20 * dt;
      if (p.vel.y < -14) p.vel.y = -14;

      // 分轴移动 + 碰撞
      resolveAxis('x', p.vel.x * dt);
      resolveAxis('z', p.vel.z * dt);
      const wasGrounded = p.onGround;
      const beforeY = p.pos.y;
      resolveAxis('y', p.vel.y * dt);
      p.onGround = grounded();
      if (p.onGround && p.vel.y < 0) {
        p.vel.y = 0;
        if (!wasGrounded && beforeY - p.pos.y > 0.6 && p.landTime <= 0) {
          p.landTime = 0.2;
          if (p.onFootstep) p.onFootstep(1);
        }
      }
      p.landTime -= dt;

      // 防掉落兜底
      if (p.pos.y < -20) { p.pos.y = 0; p.vel.y = 0; p.onGround = true; }

      // 镜头晃动（脚步声节奏）
      const hSpeed = Math.hypot(p.vel.x, p.vel.z);
      if (p.onGround && hSpeed > 0.8) {
        p.bobPhase += dt * (p.sprinting ? 13 : 10) * (1 + hSpeed * 0.06);
      }
      const bob = Math.sin(p.bobPhase) * Math.min(0.045, hSpeed * 0.012);
      const bobSway = Math.cos(p.bobPhase * 0.5) * Math.min(0.03, hSpeed * 0.008);

      // 走路音
      p._stepAcc = (p._stepAcc || 0) + dt * hSpeed;
      if (p.onGround && p._stepAcc > 2.6) {
        p._stepAcc = 0;
        if (p.onFootstep) p.onFootstep(0);
      }

      // 相机更新
      camera.rotation.order = 'YXZ';
      camera.rotation.y = p.yaw + bobSway * 0.3;
      camera.rotation.x = p.pitch + bob * 0.4;
      camera.position.set(p.pos.x, p.pos.y + p.eye, p.pos.z);
    };

    return p;
  }

  return { create };
})();
