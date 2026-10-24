/* ============================================================
   bgm.js · 每首曲子一段 8bit 循环
   ------------------------------------------------------------
   纯合成，不带任何音频文件：方波/三角波主旋律 + 低音 + 噪声鼓。
   这样 BGM 不占包体、不需要额外解码，也不好意思跟演奏音色抢素材。

   「像素心跳」是手写编曲（ARCADE_MEL），首页和谱面共用同一份；
   其余曲目由参数生成：速度跟曲目走，和弦进行用曲目自己的四个和弦，
   旋律从和弦音里挑，音色与鼓型按场景分。所以换曲目时，
   速度、调性、和声色彩、音色会一起变，而不是同一段循环换个名字。

   为什么单独开一个 AudioContext：
   sfx.js 的总输出会被「音效」开关整体静音（S.out.gain = 0），而且节奏模式
   暂停时会 suspend 整个上下文。BGM 是独立的开关、在首页和结算页要一直响，
   挂在 SFX 的总线上迟早互相干扰，索性自己一条链路。

   对外接口：
     BGM.setSong(song)  换曲目（运行中会淡出 → 换谱 → 淡入）
     BGM.play()         想放（浏览器没解锁时会等第一次手势，不会抛错）
     BGM.stop()         淡出并停表
     BGM.waveform(out)  取时域数据，给开始按钮画波形
     BGM.scoreOf(song)  取编曲数据（曲目系统的伴奏/谱面用同一份）
   ============================================================ */
(function (global) {
  'use strict';

  const LOOKAHEAD = 0.15; // 提前排期的秒数
  const TICK = 40; // 排期时钟的间隔（ms）
  const VOL = 0.62; // 总音量：只在首页和结算页响，不用给击打音让位
  const BARS = 8; // 一段循环的小节数

  const NOTE_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /* 「像素心跳」的手写旋律：每小节 16 个十六分位，null = 留白。
     留白比音符多，一是好循环，二是不跟玩家的击打抢注意力。
     这份数据同时是谱面来源，改动会同时改掉「听到的」和「要打的」。 */
  const ARCADE_MEL = [
    [76, null, 76, null, 79, null, 76, null, 74, null, 72, null, null, null, null, null],
    [72, null, 72, null, 74, null, 72, null, 71, null, 69, null, null, null, null, null],
    [69, null, 72, null, 77, null, 76, null, 72, null, 69, null, null, null, null, null],
    [71, null, 74, null, 79, null, 77, null, 74, null, 71, null, null, null, null, null],
    [76, null, 76, null, 81, null, 79, null, 76, null, 74, null, null, null, null, null],
    [72, null, 74, null, 76, null, 77, null, 76, null, 72, null, null, null, null, null],
    [74, null, 71, null, 74, null, 77, null, 79, null, 77, null, null, null, null, null],
    [76, null, null, null, 72, null, null, null, 69, null, null, null, null, null, null, null],
  ];

  /* 场景性格。lead/bass 选波形；cut 是主低通的截止频率
     （lofi 压到 2.4k 才「闷」，rock 给多一点中频）；鼓型是
     「一小节内哪几个十六分位响」。3/4 会换成圆舞曲轮廓，见 buildScore。 */
  const VOICE = {
    pixel: {
      lead: 'square', bass: 'triangle', cut: 8200,
      leadGain: 0.16, arpGain: 0.052, bassGain: 0.22,
      kickGain: 0.34, snareGain: 0.12, hatGain: 0.028,
      kick: [0, 6, 8], snare: [4, 12], hat: 'eighth',
    },
    cyber: {
      lead: 'square', bass: 'sawtooth', cut: 5200,
      leadGain: 0.125, arpGain: 0.045, bassGain: 0.19,
      kickGain: 0.36, snareGain: 0.115, hatGain: 0.022,
      kick: [0, 4, 8, 12], snare: [4, 12], hat: 'off',
    },
    classic: {
      lead: 'triangle', bass: 'sine', cut: 6000,
      leadGain: 0.24, arpGain: 0.075, bassGain: 0.26,
      kickGain: 0.24, snareGain: 0.07, hatGain: 0,
      kick: [0, 8], snare: [4, 12], hat: 'none',
    },
    lofi: {
      lead: 'triangle', bass: 'sine', cut: 2400,
      leadGain: 0.21, arpGain: 0.05, bassGain: 0.24,
      kickGain: 0.29, snareGain: 0.07, hatGain: 0.015,
      kick: [0, 10], snare: [4, 12], hat: 'off',
    },
    rock: {
      lead: 'square', bass: 'sawtooth', cut: 4600,
      leadGain: 0.095, arpGain: 0.045, bassGain: 0.25,
      kickGain: 0.36, snareGain: 0.14, hatGain: 0.03,
      kick: [0, 8, 10], snare: [4, 12], hat: 'eighth',
    },
  };

  /* 生成旋律用的动机：下标指向和弦音（0/1/2），3 表示加一个色彩音
     （大调加六度、小调加七度）。同一首曲子的种子固定，动机也固定。 */
  const MOTIFS = [
    [0, 1, 2, 1, 2, 1],
    [2, 1, 0, 1, 2, 0],
    [0, 2, 1, 0, 1, 2],
    [1, 2, 0, 2, 1, 0],
    [2, 0, 2, 1, 2, 3],
  ];
  const ONSETS = [0, 2, 4, 6, 8, 10]; // 每小节六个落点，正好是八分音符
  const PROG_SHAPE = [0, 0, 1, 1, 2, 2, 3, 3]; // 每个和弦占两小节
  const ARP_ORDER = [0, 1, 2, 1];

  const FALLBACK_SONG = {
    id: 'pixel-heart', bpm: 132, meter: 4, scene: 'pixel',
    chords: ['Am', 'F', 'C', 'G'], scale: 'min', arcade: true,
  };

  const S = {
    ctx: null,
    master: null,
    lp: null,
    noise: null,
    tap: null,
    timer: 0,
    switchTimer: 0,
    score: null,
    step: 0, // 全局十六分位序号
    nextAt: 0,
    want: false, // 上层希望它响
    running: false, // 排期时钟真的在跑
    bound: false,
  };

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function chordSemis(name) {
    const m = /^([A-G])(m?)$/.exec(name) || ['', 'C', ''];
    const root = NOTE_SEMI[m[1]] || 0;
    return m[2] === 'm' ? [root, root + 3, root + 7] : [root, root + 4, root + 7];
  }

  /* ---------------- 编曲 ---------------- */

  function melodyFor(song, chords, prog, steps, seed) {
    if (song.arcade) return ARCADE_MEL;

    const rnd = mulberry32(seed);
    const motif = MOTIFS[seed % MOTIFS.length];
    const rows = [];

    /* 和弦音在不同的调上会跨到不同八度（F 的三音就在 C 的八度上方），
       直接拿来当旋律会让音域忽高忽低。折回一个八度里，
       各首曲子的旋律就都落在 C5–G5 这一片，听感统一。 */
    const fold = (m) => {
      let x = m;
      while (x >= 80) x -= 12;
      return x;
    };

    for (let bar = 0; bar < BARS; bar++) {
      const chord = chords[prog[bar]];
      const row = new Array(steps).fill(null);

      for (let i = 0; i < ONSETS.length; i++) {
        const s = ONSETS[i];
        if (s >= steps) continue;
        /* 旋律放在和弦音上方两个八度：琶音占着 +12 那一层，
           不上去两把声音会挤在同一个音区里，听起来只剩一片琶音。
           末尾两小节每三个音抬一次八度，做出「推进—收尾」的弧度。 */
        const lift = bar >= BARS - 2 && i % 3 === 2 ? 12 : 0;
        const pick = motif[i % motif.length];
        const m = pick === 3
          ? fold(chord.tones[0] + 24 + (song.scale === 'min' ? 10 : 9))
          : fold(chord.tones[pick] + 24) + lift;
        // 每四小节收尾漏一个音，避免机械
        if (bar % 4 === 3 && i === 4 && rnd() < 0.55) continue;
        row[s] = m;
      }
      rows.push(row);
    }
    return rows;
  }

  function buildScore(song) {
    const s = song || FALLBACK_SONG;
    const bpm = s.bpm || 96;
    const meter = s.meter === 3 ? 3 : 4;
    const steps = meter * 4;
    const names = s.chords && s.chords.length ? s.chords : FALLBACK_SONG.chords;
    const voice = VOICE[s.scene] || VOICE.pixel;

    const chords = names.map((n) => {
      const semi = chordSemis(n);
      return { root: 36 + semi[0], tones: [48 + semi[0], 48 + semi[1], 48 + semi[2]] };
    });

    const prog = [];
    for (let bar = 0; bar < BARS; bar++) prog.push(PROG_SHAPE[bar] % chords.length);

    // 三拍子走圆舞曲轮廓：强拍落在第一拍，二、三拍轻打
    const kick = meter === 3 ? [0] : voice.kick;
    const snare = meter === 3 ? [4, 8] : voice.snare;

    return {
      id: s.id,
      bpm,
      meter,
      steps,
      bars: BARS,
      step: 60 / bpm / 4,
      prog,
      chords,
      mel: melodyFor(s, chords, prog, steps, hashStr(s.id || 'x')),
      bassOct: meter === 3 ? [0, 0, 7, 0, 7, 12] : [0, 0, 7, 0, 0, 7, 0, 12],
      arpOrder: ARP_ORDER,
      voice,
      kick,
      snare,
      hat: voice.hat,
      arcade: !!s.arcade,
    };
  }

  /* 编曲按「曲目 + 速度 + 拍号 + 和弦」缓存：同一首曲子反复进出首页，
     生成结果必须完全一致，否则用户会听到另一段旋律。 */
  const cache = new Map();

  function scoreOf(song) {
    const s = song || FALLBACK_SONG;
    const key = [s.id, s.bpm, s.meter, s.scene, (s.chords || []).join('')].join('|');
    let sc = cache.get(key);
    if (!sc) {
      sc = buildScore(s);
      cache.set(key, sc);
    }
    return sc;
  }

  /* ---------------- 上下文 ---------------- */

  function ensureCtx() {
    if (S.ctx) return S.ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    const c = new AC({ latencyHint: 'playback' });

    // 方波很扎手，挂个低通把高频磨掉；截止频率随场景变，见 begin()
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
    S.lp = lp;
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

  function kick(t, gain) {
    const c = S.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.085);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);
    o.connect(g);
    g.connect(S.master);
    o.start(t);
    o.stop(t + 0.23);
  }

  function noiseHit(t, dur, gain, type, freq, q) {
    if (!(gain > 0)) return;
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
    const sc = S.score;
    if (!sc) return;

    const bar = Math.floor(i / sc.steps) % sc.bars;
    const s = i % sc.steps;
    const chord = sc.chords[sc.prog[bar]];
    const v = sc.voice;

    // 低音：八分位，根音 / 五度 / 高八度，撑住低频又不抢旋律
    if (s % 2 === 0) {
      const k = s / 2;
      if (k < sc.bassOct.length) {
        tone(v.bass, mtof(chord.root + sc.bassOct[k]), t, sc.step * 1.7, v.bassGain);
      }
    }

    // 主旋律
    const m = sc.mel[bar][s];
    if (m != null) tone(v.lead, mtof(m), t, sc.step * 1.45, v.leadGain, -0.14);

    // 琶音：奇数位填空，音量压到刚能听见「有和声」的程度
    if (s % 2 === 1) {
      const idx = sc.arpOrder[((s - 1) / 2) % sc.arpOrder.length];
      tone(v.lead, mtof(chord.tones[idx] + 12), t, sc.step * 0.85, v.arpGain, 0.18);
    }

    // 鼓
    if (sc.kick.indexOf(s) >= 0) kick(t, v.kickGain);
    if (sc.snare.indexOf(s) >= 0) noiseHit(t, 0.085, v.snareGain, 'bandpass', 1750, 0.9);
    if (sc.hat === 'eighth' && s % 2 === 0) {
      noiseHit(t, 0.028, s === 0 ? v.hatGain * 1.4 : v.hatGain, 'highpass', 6800, 0.7);
    } else if (sc.hat === 'off' && s % 2 === 1) {
      noiseHit(t, 0.024, v.hatGain, 'highpass', 7200, 0.7);
    }
  }

  /* ---------------- 时钟 ---------------- */

  function tick() {
    const c = S.ctx;
    if (!c || !S.running || !S.score) return;
    while (S.nextAt < c.currentTime + LOOKAHEAD) {
      schedule(S.step, S.nextAt);
      S.nextAt += S.score.step;
      S.step = (S.step + 1) % (S.score.steps * S.score.bars);
    }
  }

  function begin() {
    const c = S.ctx;
    if (!c || S.running || c.state !== 'running') return;
    if (!S.score) S.score = scoreOf(FALLBACK_SONG);

    S.running = true;
    S.step = 0;
    S.nextAt = c.currentTime + 0.08;

    // 场景不同，明暗不同：lofi 闷、pixel 亮
    if (S.lp) {
      S.lp.frequency.cancelScheduledValues(c.currentTime);
      S.lp.frequency.setValueAtTime(S.lp.frequency.value, c.currentTime);
      S.lp.frequency.linearRampToValueAtTime(S.score.voice.cut, c.currentTime + 0.4);
    }

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

  /** 换曲目。运行中先淡出，200ms 后从新谱的第一拍起播。 */
  function setSong(song) {
    const next = scoreOf(song);
    if (S.score === next) return;
    S.score = next;

    if (!S.running) {
      S.step = 0;
      return;
    }
    silence(0.16);
    if (S.switchTimer) clearTimeout(S.switchTimer);
    S.switchTimer = setTimeout(() => {
      S.switchTimer = 0;
      if (S.want) begin();
    }, 200);
  }

  /** 取一段时域波形给 UI 画动态图。返回 false 表示当前没在响。 */
  function waveform(out) {
    const c = S.ctx;
    if (!c || !S.master) return false;
    if (!S.tap) {
      S.tap = c.createAnalyser();
      S.tap.fftSize = 1024;
      S.tap.smoothingTimeConstant = 0;
      S.master.connect(S.tap);
    }
    out.fill(0);
    S.tap.getFloatTimeDomainData(out);
    return S.running;
  }

  global.BGM = {
    play,
    stop,
    setSong,
    waveform,
    /* 编曲数据对外只读。曲目「像素心跳」直接拿这份谱安排伴奏与谱面，
       两边共用一份定义 —— 否则改一处忘另一处，首页和曲目很快就不是同一首曲子了。 */
    scoreOf,
    get running() {
      return S.running;
    },
    get bpm() {
      return S.score ? S.score.bpm : 0;
    },
    get ctx() {
      return S.ctx;
    },
  };
})(window);
