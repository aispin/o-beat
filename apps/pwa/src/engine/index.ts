/* 引擎门面。
   ------------------------------------------------------------
   底层三个脚本（sfx / scene / backing）是 IIFE，挂到 window 上；
   game.js 是 canvas 与判定核心，纯 JS，不碰 React 也不碰 DOM 结构。
   这里给 UI 一层显式类型，边界之外的类型安全由 TypeScript 负责。 */

import './sfx.js';
import './scene.js';
import './backing.js';
import './bgm.js';

import {
  boot as bootEngine,
  subscribe as subscribeEngine,
  getSnapshot as getEngineSnapshot,
  setMode as setModeEngine,
  setDiff as setDiffEngine,
  setSong as setSongEngine,
  setStyle as setStyleEngine,
  stepBpm as stepBpmEngine,
  setSettings as setSettingsEngine,
  startRun,
  pause,
  resume,
  quit,
  speedUp,
  again,
  goHome,
  press,
  release,
  DIFF_NOTE as DIFF_NOTE_RAW,
  STYLES as STYLES_RAW,
  STYLE_ORDER as STYLE_ORDER_RAW,
  SONGS as SONGS_RAW,
  TIMBRES as TIMBRES_RAW,
  SCENES as SCENES_RAW,
  RHYTHM_STEP as RHYTHM_STEP_RAW,
} from './game.js';

export type Mode = 'drummer' | 'melodist' | 'rhythm';
export type Difficulty = 'casual' | 'normal' | 'strict';
export type Phase = 'home' | 'playing' | 'paused' | 'result';
export type SceneId = 'cyber' | 'classic' | 'lofi' | 'rock' | 'pixel';
export type StyleId = 'straight' | 'swing' | 'bossa' | 'mathrock';

export interface Settings {
  lookahead: number;
  offset: number;
  padOn: boolean;
  pitchJudge: boolean;
  sound: boolean;
  bgm: boolean;
  sceneOn: boolean;
  timbre: string;
  style: StyleId;
  bpm: number;
}

export interface ResultRow {
  k: string;
  v: number;
}

export interface GameResult {
  grade: string;
  sub: string;
  score: number;
  maxCombo: number;
  rows: ResultRow[];
  histo: { h: number; kind: 'early' | 'late' | 'zero' }[];
  diag: string;
  canSpeedUp: boolean;
  nextBpm: number;
}

export interface GameSnapshot {
  phase: Phase;
  mode: Mode;
  diff: Difficulty;
  style: StyleId;
  pick: string;
  songName: string;
  songTag: string;
  songBpm: number;
  songMeter: number;
  scene: SceneId;
  sceneLabel: string;
  sceneOn: boolean;
  bpm: number;
  styleBpm: number;
  score: number;
  combo: number;
  comboSeq: number;
  flashSeq: number;
  bpmSeq: number;
  hudBpm: string;
  countdown: number;
  result: GameResult | null;
  timbre: string;
  settings: Settings;
}

export interface StyleDef {
  id: StyleId;
  label: string;
  cn: string;
  scene: SceneId;
  meter: [number, number];
  bpm: number;
}

export interface SongDef {
  id: string;
  name: string;
  tag: string;
  scene: SceneId;
  bpm: number;
  meter: number;
  /** 有固定编曲（谱面来自编曲旋律，而不是随机生成） */
  arcade?: boolean;
}

export interface TimbreDef {
  id: string;
  name: string;
  ico: string;
}

export interface SceneDef {
  label: string;
  a: string;
  b: string;
  glow: string;
}

export const DIFF_NOTE = DIFF_NOTE_RAW as unknown as Record<Mode, Record<Difficulty, string>>;
export const STYLES = STYLES_RAW as unknown as Record<StyleId, StyleDef>;
export const STYLE_ORDER = STYLE_ORDER_RAW as StyleId[];
export const SONGS = SONGS_RAW as unknown as SongDef[];
export const TIMBRES = TIMBRES_RAW as unknown as TimbreDef[];
export const SCENES = SCENES_RAW as unknown as Record<SceneId, SceneDef>;
export const RHYTHM_STEP = RHYTHM_STEP_RAW as number;

/** 8bit 背景音乐。独立于「音效」开关：演奏时静音，首页和结算页循环。 */
interface BgmApi {
  play: () => void;
  stop: () => void;
  readonly running: boolean;
}

interface BgmWindow extends Window {
  BGM?: BgmApi;
}

export const bgm: BgmApi = {
  play: () => (window as unknown as BgmWindow).BGM?.play(),
  stop: () => (window as unknown as BgmWindow).BGM?.stop(),
  get running() {
    return !!(window as unknown as BgmWindow).BGM?.running;
  },
};

export const game = {
  boot: bootEngine as (opts: { stage: HTMLCanvasElement; glbg: HTMLCanvasElement }) => void,
  subscribe: subscribeEngine as (fn: () => void) => () => void,
  getSnapshot: getEngineSnapshot as () => GameSnapshot,
  setMode: setModeEngine as (m: Mode) => void,
  setDiff: setDiffEngine as (d: Difficulty) => void,
  setSong: setSongEngine as (id: string) => void,
  setStyle: setStyleEngine as (id: StyleId) => void,
  stepBpm: stepBpmEngine as (delta: number) => void,
  setSettings: setSettingsEngine as (patch: Partial<Settings>) => void,
  start: startRun as () => void,
  pause: pause as () => void,
  resume: resume as () => void,
  quit: quit as () => void,
  speedUp: speedUp as () => void,
  again: again as () => void,
  home: goHome as () => void,
  press: press as (x: number, pointerId: number) => void,
  release: release as (pointerId: number) => void,
};
