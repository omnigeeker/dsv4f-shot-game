/* ============================================================
 * GameTextures — 程序化 Canvas 贴图（零外部资源）
 * 提供：混凝土 / 锈蚀金属 / 集装箱波纹板 / 木箱 / 沙袋 / 泥土 / 油桶
 * ============================================================ */
window.GameTextures = (function () {

  /* ---------- 工具 ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y, seed) {
    let h = (seed * 374761393 + x * 668265263 + y * 2246822519) | 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function valueNoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    const u = smooth(xf), v = smooth(yf);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y, seed, oct) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * valueNoise(x * freq, y * freq, seed + i * 101);
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  }

  /** 逐像素生成纹理图像，返回 canvas */
  function buildImage(size, seed, compute) {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = compute(x / size, y / size, x, y);
        const i = (y * size + x) * 4;
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3] !== undefined ? c[3] : 255;
      }
    }
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.putImageData(new ImageData(data, size), 0, 0);
    return cv;
  }

  /** canvas → THREE.Texture，设好颜色空间与重复 */
  function toTexture(cv, repeat, wrapping) {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = wrapping !== undefined ? wrapping : THREE.RepeatWrapping;
    if (repeat) { tex.repeat.set(repeat, repeat); }
    tex.anisotropy = 4;
    return tex;
  }

  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  /* ---------- 混凝土 ---------- */
  function concrete() {
    const cv = buildImage(256, 1337, (u, v, x, y) => {
      const coarse = fbm(u * 6, v * 6, 11, 4);       // 大片斑驳
      const stain = fbm(u * 2 + 5, v * 2 + 3, 7, 3); // 污渍
      const speck = hash2(x, y, 3);                   // 颗粒
      let g = 96 + (coarse - 0.5) * 22 + (speck - 0.5) * 16;
      // 深色油污
      if (stain > 0.62) g -= (stain - 0.62) * 220;
      g = clamp01(g / 255);
      let r = g * 0.98, b = g * 1.02;
      // 微弱的锈色
      if (stain > 0.55 && stain < 0.62) { r += (stain - 0.55) * 0.5; }
      return [r * 255, g * 255, b * 255];
    });
    // 叠加裂缝
    const ctx = cv.getContext('2d');
    const rng = mulberry32(99);
    ctx.strokeStyle = 'rgba(20,20,24,0.7)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      let px = rng() * 256, py = rng() * 256;
      ctx.beginPath(); ctx.moveTo(px, py);
      let ang = rng() * Math.PI * 2, len = 6 + rng() * 26;
      for (let s = 0; s < len; s++) {
        ang += (rng() - 0.5) * 0.9;
        px += Math.cos(ang) * 2; py += Math.sin(ang) * 2;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    return toTexture(cv);
  }

  /* ---------- 锈蚀金属板 ---------- */
  function rustedMetal() {
    const cv = buildImage(256, 2021, (u, v, x, y) => {
      const rust = fbm(u * 8, v * 8, 4, 4);
      const grain = hash2(x, y, 8);
      let m = 66 + (grain - 0.5) * 20 - (rust - 0.5) * 30; // 金属底
      m = clamp01(m / 255);
      let r = m * 0.62, g = m * 0.66, b = m * 0.72;         // 冷钢色
      if (rust > 0.58) {                                    // 锈斑
        const k = clamp01((rust - 0.58) * 3);
        r = m * 0.62 * (1 - k) + k * 0.72;
        g = m * 0.66 * (1 - k) + k * 0.38;
        b = m * 0.72 * (1 - k) + k * 0.18;
      }
      return [r * 255, g * 255, b * 255];
    });
    return toTexture(cv);
  }

  /* ---------- 集装箱波纹板 ---------- */
  function corrugated() {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
    const ctx = cv.getContext('2d');
    const rng = mulberry32(777);
    // 底色
    ctx.fillStyle = '#5a4436';
    ctx.fillRect(0, 0, 128, 256);
    // 竖向波纹
    for (let x = 0; x < 128; x += 16) {
      const light = rng() > 0.5;
      ctx.fillStyle = light ? 'rgba(255,210,150,0.16)' : 'rgba(0,0,0,0.28)';
      ctx.fillRect(x, 0, 8, 256);
    }
    // 锈迹
    for (let i = 0; i < 260; i++) {
      const rx = rng() * 128, ry = rng() * 256, rr = 2 + rng() * 14;
      const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr);
      g.addColorStop(0, 'rgba(150,80,30,' + (0.08 + rng() * 0.2) + ')');
      g.addColorStop(1, 'rgba(150,80,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill();
    }
    // 颗粒
    const img = ctx.getImageData(0, 0, 128, 256);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng() - 0.5) * 14;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    // 框架焊缝
    ctx.fillStyle = 'rgba(10,10,12,0.5)';
    ctx.fillRect(0, 0, 128, 3);
    return toTexture(cv);
  }

  /* ---------- 木箱 ---------- */
  function crateWood() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const ctx = cv.getContext('2d');
    const rng = mulberry32(55);
    ctx.fillStyle = '#6d553a';
    ctx.fillRect(0, 0, 256, 256);
    // 板条
    const boards = 5;
    for (let b = 0; b < boards; b++) {
      const y0 = (256 / boards) * b + 4, y1 = (256 / boards) * (b + 1) - 4;
      ctx.fillStyle = '#5d4a33';
      ctx.fillRect(0, y0, 256, y1 - y0);
      // 木纹
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = 'rgba(0,0,0,' + (0.03 + rng() * 0.1) + ')';
        ctx.fillRect(rng() * 256, y0 + rng() * (y1 - y0), 1, 1);
      }
      // 木结
      const kx = rng() * 256, ky = y0 + rng() * (y1 - y0);
      ctx.fillStyle = 'rgba(30,20,12,0.55)';
      ctx.beginPath(); ctx.ellipse(kx, ky, 3 + rng() * 4, 2 + rng() * 3, 0, 0, Math.PI * 2); ctx.fill();
      // 板缝
      ctx.fillStyle = 'rgba(15,10,6,0.85)';
      ctx.fillRect(0, y0 - 3, 256, 3);
      ctx.fillRect(0, y1, 256, 3);
    }
    // 边框加强筋
    ctx.strokeStyle = 'rgba(20,14,8,0.9)';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 248, 248);
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 256, 256);
    return toTexture(cv);
  }

  /* ---------- 沙袋 ---------- */
  function sandbag() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const ctx = cv.getContext('2d');
    const rng = mulberry32(808);
    ctx.fillStyle = '#8a7a52';
    ctx.fillRect(0, 0, 256, 128);
    // 每个麻袋
    const cols = 4, rows = 2, bw = 256 / cols, bh = 128 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = c * bw, y0 = r * bh;
        const g = ctx.createRadialGradient(x0 + bw / 2, y0 + bh / 2, 4, x0 + bw / 2, y0 + bh / 2, bw * 0.7);
        g.addColorStop(0, 'rgba(176,158,110,0.9)');
        g.addColorStop(1, 'rgba(88,74,48,0.9)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x0 + bw / 2, y0 + bh / 2, bw / 2 - 6, bh / 2 - 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // 颗粒
        for (let i = 0; i < 90; i++) {
          ctx.fillStyle = 'rgba(40,32,20,' + (0.1 + rng() * 0.3) + ')';
          ctx.fillRect(x0 + rng() * bw, y0 + rng() * bh, 1, 1);
        }
        // 缝合线
        ctx.strokeStyle = 'rgba(40,32,18,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const sy = y0 + bh * 0.5;
        for (let sx = x0 + 6; sx < x0 + bw - 6; sx += 6) { ctx.moveTo(sx, sy); ctx.lineTo(sx + 3, sy + 1); }
        ctx.stroke();
      }
    }
    return toTexture(cv);
  }

  /* ---------- 地面泥土 ---------- */
  function dirt() {
    const cv = buildImage(256, 4041, (u, v, x, y) => {
      const coarse = fbm(u * 10, v * 10, 13, 4);
      const detail = hash2(x, y, 21);
      const pebble = fbm(u * 40, v * 40, 5, 2);
      let g = 66 + (coarse - 0.5) * 26 + (detail - 0.5) * 10;
      // 石头亮点
      if (pebble > 0.62) g += (pebble - 0.62) * 120;
      g = clamp01(g / 255);
      const r = g * 1.1, b = g * 0.9;
      return [r * 255, g * 255, b * 255];
    });
    return toTexture(cv);
  }

  /* ---------- 沙漠沙地 ---------- */
  function sand() {
    const cv = buildImage(256, 7171, (u, v, x, y) => {
      const coarse = fbm(u * 8, v * 8, 31, 4);
      const ripple = fbm(u * 18 + 3, v * 18, 17, 2);
      let g = 176 + (coarse - 0.5) * 30 + (ripple - 0.5) * 18 + (hash2(x, y, 9) - 0.5) * 10;
      g = clamp01(g / 255);
      const r = g * 1.14, b = g * 0.86;
      return [r * 255, g * 255, b * 255];
    });
    return toTexture(cv);
  }

  /* ---------- 土坯墙（沙漠建筑） ---------- */
  function plaster() {
    const cv = buildImage(256, 8888, (u, v, x, y) => {
      const coarse = fbm(u * 6, v * 6, 41, 3);
      const stain = fbm(u * 2 + 9, v * 2 + 4, 3, 3);
      let g = 148 + (coarse - 0.5) * 26 + (hash2(x, y, 2) - 0.5) * 12;
      if (stain > 0.6) g -= (stain - 0.6) * 130; // 墙根水渍
      g = clamp01(g / 255);
      const r = g * 1.18, b = g * 0.84;
      return [r * 255, g * 255, b * 255];
    });
    return toTexture(cv);
  }

  /* ---------- 霓虹实验室金属地板 ---------- */
  function floorGrid() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const ctx = cv.getContext('2d');
    // 深色金属底
    const img = ctx.createImageData(256, 256);
    const d = img.data;
    const rng = mulberry32(5150);
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng() - 0.5) * 18;
      d[i] = 22 + n; d[i + 1] = 30 + n; d[i + 2] = 34 + n; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // 网格发光线条
    ctx.strokeStyle = 'rgba(70, 200, 230, 0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
    }
    return toTexture(cv);
  }

  /* ---------- 霓虹金属墙板 ---------- */
  function panel() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#1a2026';
    ctx.fillRect(0, 0, 256, 256);
    const rng = mulberry32(6060);
    const img = ctx.getImageData(0, 0, 256, 256);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng() - 0.5) * 20;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    // 板缝
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 252, 252);
    ctx.strokeStyle = 'rgba(120,200,255,0.08)';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 240, 240);
    return toTexture(cv);
  }

  /* ---------- 油桶金属 ---------- */
  function barrel() {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
    const ctx = cv.getContext('2d');
    const rng = mulberry32(909);
    ctx.fillStyle = '#3f3a36';
    ctx.fillRect(0, 0, 128, 256);
    // 环形筋
    for (let y = 0; y < 256; y += 24) {
      ctx.fillStyle = 'rgba(20,18,16,0.6)';
      ctx.fillRect(0, y, 128, 5);
    }
    // 锈与油污
    for (let i = 0; i < 300; i++) {
      const ry = rng() * 256, rr = 3 + rng() * 18;
      const g = ctx.createRadialGradient(64, ry, 0, 64, ry, rr);
      const col = rng() > 0.4 ? '140,80,30' : '10,12,8';
      g.addColorStop(0, 'rgba(' + col + ',' + (0.08 + rng() * 0.2) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(64, ry, rr, rr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 顶部/底部描边
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, 128, 8);
    ctx.fillRect(0, 248, 128, 8);
    return toTexture(cv);
  }

  return {
    concrete, rustedMetal, corrugated, crateWood, sandbag, dirt, barrel,
    sand, plaster, floorGrid, panel,
    _utils: { buildImage, toTexture, fbm, mulberry32 }
  };
})();
