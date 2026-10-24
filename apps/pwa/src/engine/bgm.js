/* ============================================================
   bgm.js · 8bit 背景音乐
   ------------------------------------------------------------
   纯合成，不带任何音频文件：方波主旋律 + 三角波贝斯 + 噪声鼓。
   这样 BGM 不占包体、不需要额外解码，也不好意思跟演奏音色抢素材。

   为什么单独开一个 AudioContext：
   sfx.js 的总输出会被「音效」开关整体静音（S.out.gain = 0），而且节奏模式
   暂停时会 suspend 整个上下文。BGM 是独立的开关、在首页和结算页要一直响，
   挂在 SFX 的总线上迟早互相干扰，索性自己一条链路。

   对外接口：
     BGM.play()      想放（浏览器没解锁时会等第一次手势，不会抛错）
     BGM.stop()      淡出并停表
     BGM.play/stop 幂等，可以按 React 状态反复调
   ============================================================ */
(function (global) {
  'use strict';

  const BPM = 132;
  const STEP = 60 / BPM / 4; // 十六分音符时长，整个编曲的时间单位
  const LOOKAHEAD = 0.15; // 提前排期的秒数
  const TICK = 40; // 排期时钟的间隔（ms）
  const VOL = 0.62; // 总音量：只在首页和结算页响，不用给击打音让位

  /* 和弦进行：Am Am F F C C G G，一小节一个和弦。
     八小节一循环，正好是「安静—推进—回落—再推」的一条弧线。 */
  const CHORDS = [
    { root: 45, tones: [57, 60, 64] }, // Am
    { root: 41, tones: [53, 57, 60] }, // F
    { root: 48, tones: [60, 64, 67] }, // C
    { root: 43, tones: [55, 59, 62] }, // G
  ];
  const PROG = [0, 0, 1, 1, 2, 2, 3, 3];

  /* 主旋律：每小节 16 个十六分位，null = 留白。
     留白比音符多，一是好循环，二是不跟玩家的击打抢注意力。 */
  const MEL = [
    [76, null, 76, null, 79, null, 76, null, 74, null, 72, null, null, null, null, null],
    [72, null, 72, null, 74, null, 72, null, 71, null, 69, null, null, null, null, null],
    [69, null, 72, null, 77, null, 76, null, 72, null, 69, null, null, null, null, null],
    [71, null, 74, null, 79, null, 77, null, 74, null, 71, null, null, null, null, null],
    [76, null, 76, null, 81, null, 79, null, 76, null, 74, null, null, null, null, null],
    [72, null, 74, null, 76, null, 77, null, 76, null, 72, null, null, null, null, null],
    [74, null, 71, null, 74, null, 77, null, 79, null, 77, null, null, null, null, null],
    [76, null, null, null, 72, null, null, null, 69, null, null, null, null, null, null, null],
  ];

  // 贝斯每小节的八个八分位：根音、五度、高八度，撑住低频又不抢旋律
  const BASS_OCT = [0, 0, 7, 0, 0, 7, 0, 12];
  // 琶音在奇数十六分位上跑，和旋律的偶数位错开
  const ARP_ORDER = [0, 1, 2, 1];

  const TOTAL = PROG.length * 16;

  const S = {
    ctx: null,
    master: null,
    noise: null,
    timer: 0,
    step: 0,
    nextAt: 0,
    want: false, // 上层希望它响
    running: false, // 排期时钟真的在跑
    bound: false,
  };

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------------- 上下文 ---------------- */

  function ensureCtx() {
    if (S.ctx) return S.ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    const c = new AC({ latencyHint: 'playback' });

    // 8bit 的方波很扎手，挂个低通把 8k 以上磨掉，长时间听才不累
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 8200;
    lp.Q.value = 0.4;

    const master = c.createGain();
    master.gain.value = 0;
    master.connect(lp);
    lp.connect(c.destination);

    // 噪声源（鼓）一次生成，反复切片使用
    const len = Math.floor(c.sampleRate * 0.4);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    S.ctx = c;
    S.master = master;
    S.noise = buf;

    // 切到后台就把表停了：定时器被节流后，回到前台会一口气补排一串音符
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) silence(0.12);
        else if (S.want) begin();
      });
    }
    return c;
  }

  /* 自动播放策略：context 必须由用户手势唤醒。
     页面挂载时就会调 play()，那会儿还没有手势，所以先挂监听等第一次点按。 */
  const GESTURES = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];

  function bindGestures() {
    if (S.bound) return;
    S.bound = true;
    const wake = () => {
      const c = S.ctx;
      if (!c || c.state === 'running') return;
      c.resume().then(() => {
        if (S.want) begin();
      }).catch(() => {
        /* 还没解锁成功，等下一次手势 */
      });
    };
    GESTURES.forEach((e) => global.addEventListener(e, wake, { passive: true, capture: true }));
  }

  /* ---------------- 发声 ---------------- */

  function tone(type, freq, t, dur, gain, pan) {
    const c = S.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;

    const g = c.createGain();
    /* 必须是「起音 → 保持 → 快速释放」。
       早先写成一路上升到 dur 的指数衰减，等于一发声就开始掉电平，
       结果整段音乐又轻又碎，像只有鼓在响。 */
    const atk = 0.004;
    const rel = Math.min(0.04, dur * 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + atk);
    g.gain.setValueAtTime(gain, t + Math.max(atk + 0.002, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(g);
    let tail = g;
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(S.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function kick(t) {
    const c = S.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.085);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);
    o.connect(g);
    g.connect(S.master);
    o.start(t);
    o.stop(t + 0.23);
  }

  function noiseHit(t, dur, gain, type, freq, q) {
    const c = S.ctx;
    const n = c.createBufferSource();
    n.buffer = S.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f);
    f.connect(g);
    g.connect(S.master);
    n.start(t, Math.random() * 0.2);
    n.stop(t + dur + 0.02);
  }

  /* 一个十六分位上该响什么 */
  function schedule(i, t) {
    const bar = (i / 16) | 0;
    const s = i % 16;
    const chord = CHORDS[PROG[bar]];

    // 贝斯：八分位，根音 / 五度 / 高八度
    if (s % 2 === 0) {
      const semi = BASS_OCT[s / 2];
      tone('triangle', mtof(chord.root + semi), t, STEP * 1.7, 0.22);
    }

    // 主旋律
    const m = MEL[bar][s];
    if (m) tone('square', mtof(m), t, STEP * 1.45, 0.16, -0.14);

    // 琶音：奇数位填空，音量压到刚能听见「有和声」的程度
    if (s % 2 === 1) {
      const toneIdx = ARP_ORDER[((s - 1) / 2) % ARP_ORDER.length];
      tone('square', mtof(chord.tones[toneIdx] + 12), t, STEP * 0.85, 0.052, 0.18);
    }

    // 鼓：底鼓一三、军鼓二四、踩镲八分位
    if (s === 0 || s === 6 || s === 8) kick(t);
    if (s === 4 || s === 12) noiseHit(t, 0.085, 0.12, 'bandpass', 1750, 0.9);
    if (s % 2 === 0) noiseHit(t, 0.028, s === 0 ? 0.04 : 0.028, 'highpass', 6800, 0.7);
  }

  /* ---------------- 时钟 ---------------- */

  function tick() {
    const c = S.ctx;
    if (!c || !S.running) return;
    while (S.nextAt < c.currentTime + LOOKAHEAD) {
      schedule(S.step, S.nextAt);
      S.nextAt += STEP;
      S.step = (S.step + 1) % TOTAL;
    }
  }

  function begin() {
    const c = S.ctx;
    if (!c || S.running || c.state !== 'running') return;
    S.running = true;
    S.step = 0;
    S.nextAt = c.currentTime + 0.08;

    S.master.gain.cancelScheduledValues(c.currentTime);
    S.master.gain.setValueAtTime(S.master.gain.value, c.currentTime);
    S.master.gain.linearRampToValueAtTime(VOL, c.currentTime + 0.5);

    S.timer = setInterval(tick, TICK);
    tick();
  }

  /** 停止排期并淡出。不动 S.want —— 给「切后台」复用。 */
  function silence(fade) {
    const was = S.running;
    S.running = false;
    if (S.timer) {
      clearInterval(S.timer);
      S.timer = 0;
    }
    const c = S.ctx;
    if (!c || !S.master) return;
    if (!was) return;
    const f = fade == null ? 0.2 : fade;
    const now = c.currentTime;
    S.master.gain.cancelScheduledValues(now);
    S.master.gain.setValueAtTime(S.master.gain.value, now);
    S.master.gain.linearRampToValueAtTime(0, now + f);
  }

  /* ---------------- 对外 ---------------- */

  function play() {
    S.want = true;
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'running') {
      begin();
      return;
    }
    // 已经有过手势的页面上 resume 会直接成功；没有就等 bindGestures 那次
    c.resume().then(() => {
      if (S.want) begin();
    }).catch(() => {});
    bindGestures();
  }

  function stop() {
    S.want = false;
    silence();
  }

  /* 调试用：从总线上取电平，用来校准 BGM 该压多低（不影响发声） */
  let tap = null;
  function level() {
    const c = S.ctx;
    if (!c || !S.master) return null;
    if (!tap) {
      tap = c.createAnalyser();
      tap.fftSize = 2048;
      S.master.connect(tap);
    }
    const d = new Float32Array(tap.fftSize);
    tap.getFloatTimeDomainData(d);
    let sum = 0, peak = 0;
    for (let i = 0; i < d.length; i++) {
      sum += d[i] * d[i];
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
    return { rms: Math.sqrt(sum / d.length), peak };
  }

  global.BGM = {
    play,
    stop,
    level,
    /* 编曲数据对外只读。曲目「街机脉冲」直接拿这份谱安排伴奏与谱面，
       两边共用一份定义 —— 否则改一处忘另一处，首页和曲目很快就不是同一首曲子了。 */
    get score() {
      return {
        bpm: BPM, div: 16, bars: PROG.length,
        chords: CHORDS, prog: PROG,
        mel: MEL, bassOct: BASS_OCT, arpOrder: ARP_ORDER,
      };
    },
    get running() { return S.running; },
    get ctx() { return S.ctx; },
  };
})(window);
