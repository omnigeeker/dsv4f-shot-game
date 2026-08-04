/* ============================================================
 * AUDIO — WebAudio 程序合成音效（零外部资源）
 * 枪声 / 换弹 / 命中 / 脚步 / 机器人 / 环境风声
 * ============================================================ */
export const AUDIO = (function () {

  let ctx = null, master = null, noiseBuf = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return; }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // 噪声缓冲
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    startWind();
  }
  function ensure() { if (!ctx) init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  /* ---------- 基础发声 ---------- */
  function playNoise({ dur = 0.1, gain = 0.3, filterType = 'lowpass', filterFreq = 1200, filterQ = 1, attack = 0.002, when = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = filterFreq; f.Q.value = filterQ;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }
  function playTone({ type = 'sine', f0 = 200, f1 = 100, dur = 0.15, gain = 0.3, attack = 0.004, when = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /* ---------- 环境风声 ---------- */
  function startWind() {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.value = 0.045;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.03;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(); lfo.start();
  }

  /* ---------- 音效 API ---------- */
  const api = {
    init, ensure,

    gunshot(type = 'rifle') {
      if (!ctx) return;
      if (type === 'sniper') {
        playNoise({ dur: 0.4, gain: 1.0, filterType: 'lowpass', filterFreq: 1400 });
        playNoise({ dur: 0.05, gain: 0.5, filterType: 'bandpass', filterFreq: 3000, filterQ: 2 });
        playTone({ type: 'sine', f0: 110, f1: 35, dur: 0.35, gain: 0.95 });
      } else if (type === 'shotgun') {
        playNoise({ dur: 0.34, gain: 1.0, filterType: 'lowpass', filterFreq: 1600 });
        playNoise({ dur: 0.08, gain: 0.5, filterType: 'bandpass', filterFreq: 900, filterQ: 1.5 });
        playTone({ type: 'sine', f0: 120, f1: 40, dur: 0.3, gain: 0.9 });
      } else if (type === 'smg') {
        playNoise({ dur: 0.13, gain: 0.6, filterType: 'lowpass', filterFreq: 3200 });
        playNoise({ dur: 0.03, gain: 0.3, filterType: 'bandpass', filterFreq: 1800, filterQ: 2 });
        playTone({ type: 'sine', f0: 220, f1: 110, dur: 0.1, gain: 0.45 });
      } else if (type === 'rifle') {
        playNoise({ dur: 0.24, gain: 0.9, filterType: 'lowpass', filterFreq: 2500 });
        playNoise({ dur: 0.05, gain: 0.45, filterType: 'bandpass', filterFreq: 1500, filterQ: 2 });
        playTone({ type: 'sine', f0: 150, f1: 55, dur: 0.22, gain: 0.7 });
      } else {
        playNoise({ dur: 0.11, gain: 0.6, filterType: 'lowpass', filterFreq: 3600 });
        playNoise({ dur: 0.035, gain: 0.3, filterType: 'bandpass', filterFreq: 1700, filterQ: 2 });
        playTone({ type: 'sine', f0: 195, f1: 90, dur: 0.1, gain: 0.5 });
      }
    },
    pickup() {
      playTone({ type: 'sine', f0: 660, f1: 990, dur: 0.18, gain: 0.3 });
      playTone({ type: 'sine', f0: 990, f1: 1320, dur: 0.22, gain: 0.25, when: 0.12 });
    },
    protect() {
      playTone({ type: 'triangle', f0: 420, f1: 520, dur: 0.3, gain: 0.2 });
    },

    reload() {
      playNoise({ dur: 0.04, gain: 0.25, filterType: 'highpass', filterFreq: 2500, when: 0 });
      playNoise({ dur: 0.03, gain: 0.2, filterType: 'highpass', filterFreq: 2000, when: 0.15 });
      playNoise({ dur: 0.05, gain: 0.3, filterType: 'bandpass', filterFreq: 900, filterQ: 1.5, when: 0.4 });
      playNoise({ dur: 0.03, gain: 0.25, filterType: 'highpass', filterFreq: 3000, when: 0.55 });
    },
    switchgun() {
      playNoise({ dur: 0.04, gain: 0.22, filterType: 'bandpass', filterFreq: 1200, filterQ: 2 });
      playNoise({ dur: 0.025, gain: 0.18, filterType: 'highpass', filterFreq: 2600, when: 0.06 });
    },

    hit(head) {
      if (head) {
        playTone({ type: 'sine', f0: 1600, f1: 1300, dur: 0.07, gain: 0.35 });
        playTone({ type: 'square', f0: 2200, f1: 1800, dur: 0.04, gain: 0.12 });
      } else {
        playNoise({ dur: 0.07, gain: 0.35, filterType: 'lowpass', filterFreq: 700 });
        playTone({ type: 'sine', f0: 320, f1: 150, dur: 0.06, gain: 0.18 });
      }
    },
    impact(dist) {
      const g = Math.max(0.05, 0.4 / (1 + dist * 0.04));
      playNoise({ dur: 0.05, gain: g, filterType: 'bandpass', filterFreq: 1600 + Math.random() * 800, filterQ: 1.4 });
      playTone({ type: 'triangle', f0: 500, f1: 200, dur: 0.04, gain: g * 0.5 });
    },

    footstep(walk) {
      const g = walk ? 0.12 : 0.22;
      playNoise({ dur: 0.07, gain: g, filterType: 'lowpass', filterFreq: 420 + Math.random() * 200 });
      playTone({ type: 'sine', f0: 150, f1: 70, dur: 0.05, gain: g * 0.6 });
    },
    land() {
      playNoise({ dur: 0.14, gain: 0.5, filterType: 'lowpass', filterFreq: 300 });
      playTone({ type: 'sine', f0: 130, f1: 50, dur: 0.12, gain: 0.45 });
    },

    enemyFire() {
      playNoise({ dur: 0.14, gain: 0.3, filterType: 'lowpass', filterFreq: 2000 });
      playTone({ type: 'sine', f0: 130, f1: 60, dur: 0.12, gain: 0.22 });
    },
    enemyHurt() {
      playTone({ type: 'sawtooth', f0: 190 + Math.random() * 60, f1: 120, dur: 0.16, gain: 0.22 });
    },
    enemyDeath() {
      playTone({ type: 'sawtooth', f0: 210, f1: 80, dur: 0.5, gain: 0.26 });
      playNoise({ dur: 0.3, gain: 0.2, filterType: 'lowpass', filterFreq: 500 });
    },
    enemyStep() {
      playNoise({ dur: 0.06, gain: 0.06, filterType: 'lowpass', filterFreq: 350 });
    }
  };
  return api;
})();
