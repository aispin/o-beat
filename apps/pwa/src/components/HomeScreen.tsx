import type { ReactNode } from 'react';
import { MonitorDown, Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DIFF_NOTE,
  SONGS,
  STYLES,
  STYLE_ORDER,
  TIMBRES,
  game,
  type Difficulty,
  type GameSnapshot,
  type Mode,
  type StyleId,
} from '@/engine';
import { cn } from '@/lib/utils';

const MODES: { id: Mode; name: string; desc: string; icon: ReactNode }[] = [
  {
    id: 'drummer',
    name: '鼓手',
    desc: '4 轨 · 练节奏',
    icon: (
      <>
        <rect x="5" y="12" width="3.5" height="10" rx="1.6" />
        <rect x="11.5" y="7" width="3.5" height="15" rx="1.6" />
        <rect x="18" y="10" width="3.5" height="12" rx="1.6" />
        <rect x="24.5" y="14" width="3.5" height="8" rx="1.6" />
      </>
    ),
  },
  {
    id: 'melodist',
    name: '旋律家',
    desc: '双轨 · 练音感',
    icon: (
      <>
        <circle cx="8" cy="21" r="2.6" />
        <circle cx="15" cy="13" r="2.6" />
        <circle cx="22" cy="18" r="2.6" />
        <circle cx="28" cy="9" r="2.2" />
        <path d="M8 21V11l14-4v10" fill="none" strokeWidth="1.6" />
      </>
    ),
  },
  {
    id: 'rhythm',
    name: '节奏',
    desc: '单轨 · 练时值',
    icon: (
      <>
        <rect x="7" y="14" width="5" height="5" rx="1.6" />
        <rect x="13.5" y="14" width="5" height="5" rx="1.6" />
        <rect x="19" y="10" width="4" height="9" rx="1.6" />
        <rect x="24" y="17" width="4" height="2.4" rx="1.2" opacity="0.55" />
      </>
    ),
  },
];

const DIFFS: { id: Difficulty; label: string }[] = [
  { id: 'casual', label: '入门' },
  { id: 'normal', label: '熟练' },
  { id: 'strict', label: '挑战' },
];

function Block({
  title,
  hint,
  hidden,
  children,
}: {
  title: string;
  hint?: string;
  hidden?: boolean;
  children: ReactNode;
}) {
  if (hidden) return null;
  return (
    <section className="mb-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[2.4px] text-[#BEC6D2] [text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_0_12px_rgba(0,0,0,0.6)]">
          <span className="h-[9px] w-[2px] rounded-full bg-brand shadow-[0_0_8px_var(--accent-glow)]" />
          {title}
        </h2>
        {hint ? (
          <span className="text-[11px] tracking-wide text-muted-foreground/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function HomeScreen({
  snap,
  onOpenSettings,
  showInstall,
  onInstall,
}: {
  snap: GameSnapshot;
  onOpenSettings: () => void;
  showInstall: boolean;
  onInstall: () => void;
}) {
  const rhythm = snap.mode === 'rhythm';
  const diffNote = DIFF_NOTE[snap.mode][snap.diff];

  return (
    <>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="设置"
        className="glass fixed right-4 top-[calc(env(safe-area-inset-top,0px)+16px)] z-10 grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
      >
        <Settings2 className="size-[18px]" />
      </button>

      <div className="home-scroll">
        <header className="mb-6 flex items-center gap-3 pr-12">
          <div className="brand-fill brand-glow grid size-[46px] shrink-0 place-items-center rounded-full text-[21px] font-bold text-[#06100E]">
            O
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-bold leading-none tracking-[3.4px]">O MY BEAT</h1>
            <p className="mt-1 text-[11px] tracking-[0.6px] text-muted-foreground">
              节奏练习 · 音感训练
            </p>
          </div>
          <span className="brand-text shrink-0 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide">
            {snap.sceneLabel}
          </span>
        </header>

        <Block title="模式">
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => {
              const on = snap.mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => game.setMode(m.id)}
                  className={cn(
                    'relative overflow-hidden rounded-md px-3 pb-3 pt-3 text-left transition-all active:scale-[0.985]',
                    on ? 'glass-on' : 'glass',
                  )}
                >
                  <svg
                    viewBox="0 0 32 32"
                    className={cn(
                      'mb-2 size-6 transition-colors',
                      on ? 'fill-brand stroke-brand' : 'fill-text-dim stroke-text-dim',
                    )}
                  >
                    {m.icon}
                  </svg>
                  <b className="block text-sm font-semibold">{m.name}</b>
                  <em className="mt-1 block text-[10px] not-italic text-muted-foreground">
                    {m.desc}
                  </em>
                </button>
              );
            })}
          </div>
        </Block>

        <Block title="音色" hint="敲起来更解压" hidden={!rhythm}>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TIMBRES.map((t) => {
              const on = snap.timbre === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => game.setSettings({ timbre: t.id })}
                  className={cn(
                    'flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-md px-1 pb-2 pt-2 transition-all active:scale-95',
                    on ? 'glass-on text-foreground' : 'glass text-muted-foreground',
                  )}
                >
                  <svg
                    viewBox="0 0 16 16"
                    className={cn('size-4', on ? 'stroke-brand' : 'stroke-current opacity-60')}
                    fill="none"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dangerouslySetInnerHTML={{ __html: t.ico }}
                  />
                  <b className="text-[11px] font-medium">{t.name}</b>
                </button>
              );
            })}
          </div>
        </Block>

        <Block title="风格" hint="拍号随风格" hidden={!rhythm}>
          <div className="grid grid-cols-2 gap-2">
            {STYLE_ORDER.map((id: StyleId) => {
              const st = STYLES[id];
              const on = snap.style === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => game.setStyle(id)}
                  className={cn(
                    'relative rounded-md px-3 py-3 text-left transition-all active:scale-[0.985]',
                    on ? 'glass-on' : 'glass',
                  )}
                >
                  <b className="block text-[13px] font-semibold leading-tight">{st.label}</b>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{st.cn}</span>
                  <em
                    className={cn(
                      'absolute right-3 top-3 rounded-full border px-1.5 py-0.5 text-[10px] not-italic tabular-nums',
                      on
                        ? 'border-brand/45 text-brand'
                        : 'border-line-strong text-muted-foreground',
                    )}
                  >
                    {st.meter[0]}/{st.meter[1]}
                  </em>
                </button>
              );
            })}
          </div>

          <div className="glass mt-2 flex items-center gap-3 rounded-md px-3 py-2">
            <span className="text-[10px] font-semibold tracking-[1.6px] text-muted-foreground">
              BPM
            </span>
            <Button
              variant="secondary"
              size="icon"
              aria-label="减慢"
              className="size-7 text-base"
              onClick={() => game.stepBpm(-2)}
            >
              −
            </Button>
            <b className="min-w-12 text-center text-[22px] font-bold tabular-nums text-brand">
              {snap.bpm}
            </b>
            <Button
              variant="secondary"
              size="icon"
              aria-label="加快"
              className="size-7 text-base"
              onClick={() => game.stepBpm(2)}
            >
              +
            </Button>
            <span className="ml-auto text-[10px] tracking-wide text-muted-foreground">
              每 16 小节 +10
            </span>
          </div>
        </Block>

        <Block
          title="曲目"
          hint={`${Math.round((16 * snap.songMeter * 60) / snap.songBpm)} 秒`}
          hidden={rhythm}
        >
          <div className="grid grid-cols-2 gap-2">
            {SONGS.map((s) => {
              const on = snap.pick === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => game.setSong(s.id)}
                  className={cn(
                    'relative overflow-hidden rounded-md px-3 pb-2.5 pt-2.5 text-left transition-all active:scale-[0.985]',
                    on ? 'glass-on' : 'glass',
                  )}
                >
                  <span
                    className={cn(
                      'mb-2 block size-1.5 rounded-full bg-brand',
                      on ? 'opacity-100 shadow-[0_0_10px_var(--accent-a)]' : 'opacity-35',
                    )}
                  />
                  <b className="block text-sm font-semibold tracking-wide">{s.name}</b>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{s.tag}</span>
                  <em className="mt-2 block text-[10.5px] not-italic tabular-nums text-text-dim">
                    {s.bpm} BPM · {s.meter}/4
                  </em>
                </button>
              );
            })}
          </div>
        </Block>

        <Block title="难度">
          <div className="glass grid grid-cols-3 gap-1 rounded-md p-1">
            {DIFFS.map((d) => {
              const on = snap.diff === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => game.setDiff(d.id)}
                  className={cn(
                    'rounded-sm py-2.5 text-[13px] transition-all',
                    on
                      ? 'bg-gradient-to-b from-white/[0.11] to-white/[0.05] text-foreground shadow-[0_2px_10px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-dim">{diffNote}</p>
        </Block>
      </div>

      <div className="cta-dock">
        <Button size="cta" onClick={() => game.start()}>
          {rhythm ? '开始练习' : '开始演奏'}
        </Button>
        <p className="mt-3 text-center text-[11px] tracking-wide text-text-dim">
          {rhythm ? '跟着节拍器敲 · 灰色段要留白 · 没有失败' : '跟着拍子敲准就好 · 没有失败'}
        </p>
        {/* 安装入口放在这里而不是顶部：顶部那条会和品牌行、设置按钮撞在一起。
            只在浏览器真的接住了 beforeinstallprompt 时才出现，装过就不再显示。 */}
        {showInstall ? (
          <div className="mt-1.5 text-center">
            <button
              type="button"
              onClick={onInstall}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <MonitorDown className="size-3.5" />
              装到桌面 · 断网也能玩
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
