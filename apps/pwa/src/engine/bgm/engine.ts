/* 引擎：上下文、时钟、状态机、对外 API。
   只管「什么时候排下一个十六分位」，具体发声交给 arrange / voices。 */
import type { Bus, Score, SongLike } from './types';
import { FALLBACK_SONG, scoreOf } from './score';
import { ensureSamples, needSamples } from './samples';
import { scheduleStep } from './arrange';

/** 提前排期的秒数 */
const LOOKAHEAD = 0.15;
/** 排期时钟的间隔（ms） */
const TICK = 40;
/** 总音量：只在首页和结算页响，不用给击打音让位 */
const VOL = 0.62;

const GESTURES = ['pointerdown', 'touchstart', 'mousedown', 'keydown'] as const;

export interface BgmApi {
  setSong: (song: SongLike) => void;
  play: () => void;
  stop: () => void;
  waveform: (out: Float32Array<ArrayBuffer>) => boolean;
  scoreOf: (song?: SongLike) => Score;
  readonly running: boolean;
  readonly bpm: number;
  readonly ctx: AudioContext | null;
}

function createBus(): Bus | null {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC({ latencyHint: 'playback' });

  // 总低通：每种风格留一个开口 —— lofi 闷、古典开
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 9000;
  lp.Q.value = 0.3;

  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(lp);
  lp.connect(ctx.destination);

  // 白噪声：鼓的瞬态和黑胶底噪都从这条 buffer 里切
  const len = Math.floor(ctx.sampleRate * 0.6);
  const noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  // 黑胶底噪：常驻循环，增益为 0 时等于不存在
  const vs = ctx.createBufferSource();
  vs.buffer = noise;
  vs.loop = true;
  const vf = ctx.createBiquadFilter();
  vf.type = 'bandpass';
  vf.frequency.value = 2600;
  vf.Q.value = 0.5;
  const vinyl = ctx.createGain();
  vinyl.gain.value = 0;
  vs.connect(vf);
  vf.connect(vinyl);
  vinyl.connect(master);
  vs.start();

  return { ctx, master, lp, noise, bufs: {}, vinyl };
}

export function createBgm(): BgmApi {
  const state = {
    bus: null as Bus | null,
    timer: 0 as number,
    switchTimer: 0 as number,
    score: null as Score | null,
    step: 0,
    nextAt: 0,
    want: false,
    running: false,
    bound: false,
    loadedKey: '',
    loadingKey: '',
    loading: null as Promise<void> | null,
    tap: null as AnalyserNode | null,
  };

  function ensureBus(): Bus | null {
    if (state.bus) return state.bus;
    const bus = createBus();
    if (!bus) return null;
    state.bus = bus;

    // 切到后台就把表停了：定时器被节流后，回到前台会一口气补排一串音符
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) silence(0.12);
      else if (state.want) begin();
    });
    return bus;
  }

  /** 浏览器要求音频上下文必须由用户手势唤醒。
      页面挂载时就会调 play()，那会儿还没有手势，先挂监听等第一次点按。 */
  function bindGestures(): void {
    if (state.bound) return;
    state.bound = true;
    const wake = (): void => {
      const bus = state.bus;
      if (!bus || bus.ctx.state === 'running') return;
      bus.ctx
        .resume()
        .then(() => {
          if (state.want) go();
        })
        .catch(() => {
          /* 还没解锁成功，等下一次手势 */
        });
    };
    GESTURES.forEach((e) => window.addEventListener(e, wake, { passive: true, capture: true }));
  }

  /** 只加载当前曲目要用的采样，缺什么补什么 */
  function ensureLoaded(sc: Score): Promise<void> {
    const bus = state.bus;
    if (!bus) return Promise.resolve();

    const key = needSamples(sc).join(',');
    if (state.loadedKey === key) return Promise.resolve();
    if (state.loading && state.loadingKey === key) return state.loading;

    state.loadingKey = key;
    state.loading = ensureSamples(bus, needSamples(sc)).then(() => {
      state.loadedKey = key;
      state.loading = null;
    });
    return state.loading;
  }

  function tick(): void {
    const bus = state.bus;
    const sc = state.score;
    if (!bus || !state.running || !sc) return;
    while (state.nextAt < bus.ctx.currentTime + LOOKAHEAD) {
      scheduleStep(bus, sc, state.step, state.nextAt);
      state.nextAt += sc.step;
      state.step = (state.step + 1) % (sc.steps * sc.bars);
    }
  }

  function begin(): void {
    const bus = state.bus;
    const sc = state.score;
    if (!bus || !sc || state.running || bus.ctx.state !== 'running') return;

    state.running = true;
    state.step = 0;
    state.nextAt = bus.ctx.currentTime + 0.08;

    const now = bus.ctx.currentTime;
    bus.lp.frequency.cancelScheduledValues(now);
    bus.lp.frequency.setValueAtTime(bus.lp.frequency.value, now);
    bus.lp.frequency.linearRampToValueAtTime(sc.mix.cut, now + 0.4);

    if (bus.vinyl) {
      bus.vinyl.gain.cancelScheduledValues(now);
      bus.vinyl.gain.setValueAtTime(bus.vinyl.gain.value, now);
      bus.vinyl.gain.linearRampToValueAtTime(sc.vinyl, now + 0.6);
    }

    bus.master.gain.cancelScheduledValues(now);
    bus.master.gain.setValueAtTime(bus.master.gain.value, now);
    bus.master.gain.linearRampToValueAtTime(VOL * (sc.mix.vol || 1), now + 0.5);

    state.timer = window.setInterval(tick, TICK);
    tick();
  }

  /** 停止排期并淡出。不动 want —— 给「切后台」和「换曲」复用。 */
  function silence(fade?: number): void {
    const was = state.running;
    state.running = false;
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = 0;
    }
    const bus = state.bus;
    if (!bus || !was) return;
    const f = fade == null ? 0.2 : fade;
    const now = bus.ctx.currentTime;
    bus.master.gain.cancelScheduledValues(now);
    bus.master.gain.setValueAtTime(bus.master.gain.value, now);
    bus.master.gain.linearRampToValueAtTime(0, now + f);
    if (bus.vinyl) bus.vinyl.gain.setTargetAtTime(0, now, f / 3);
  }

  function go(): void {
    const sc = state.score || scoreOf(FALLBACK_SONG);
    state.score = sc;
    ensureLoaded(sc).then(() => {
      if (state.want) begin();
    });
  }

  function play(): void {
    state.want = true;
    const bus = ensureBus();
    if (!bus) return;
    if (bus.ctx.state === 'running') {
      go();
      return;
    }
    // 已经有手势的页面上 resume 会直接成功；没有就等 bindGestures 那次
    bus.ctx
      .resume()
      .then(() => {
        if (state.want) go();
      })
      .catch(() => {});
    bindGestures();
  }

  function stop(): void {
    state.want = false;
    silence();
  }

  /** 换曲目：运行中先淡出，采样备好后从新谱的第一拍起播 */
  function setSong(song: SongLike): void {
    const next = scoreOf(song);
    if (state.score === next) return;
    state.score = next;

    if (!state.running) {
      state.step = 0;
      if (state.want) void ensureLoaded(next);
      return;
    }

    silence(0.16);
    if (state.switchTimer) clearTimeout(state.switchTimer);
    state.switchTimer = window.setTimeout(() => {
      state.switchTimer = 0;
      if (!state.want) return;
      ensureLoaded(next).then(() => {
        if (state.want) begin();
      });
    }, 200);
  }

  /** 取时域波形给 UI 画动态图。返回 false 表示此刻没在响。 */
  function waveform(out: Float32Array<ArrayBuffer>): boolean {
    const bus = state.bus;
    if (!bus) return false;
    if (!state.tap) {
      state.tap = bus.ctx.createAnalyser();
      state.tap.fftSize = 1024;
      state.tap.smoothingTimeConstant = 0;
      bus.master.connect(state.tap);
    }
    out.fill(0);
    state.tap.getFloatTimeDomainData(out);
    return state.running;
  }

  /* 开发期诊断用：把总线露出来，好接一条录音链路量频谱。
     生产构建里 import.meta.env.DEV 是常量 false，整块会被摇掉。 */
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__bgmBus = () => state.bus;
  }

  return {
    play,
    stop,
    setSong,
    waveform,
    scoreOf,
    get running() {
      return state.running;
    },
    get bpm() {
      return state.score ? state.score.bpm : 0;
    },
    get ctx() {
      return state.bus ? state.bus.ctx : null;
    },
  };
}
