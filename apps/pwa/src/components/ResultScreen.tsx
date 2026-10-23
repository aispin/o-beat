import { Button } from '@/components/ui/button';
import { game, type GameSnapshot } from '@/engine';
import { cn } from '@/lib/utils';

const GRADE_TONE: Record<string, string> = {
  S: 'text-[#4ADE80]',
  A: 'text-[#FFC94D]',
  B: 'text-[#60A5FA]',
  C: 'text-[#98A0B0]',
  D: 'text-[#626B7D]',
};

export function ResultScreen({ snap }: { snap: GameSnapshot }) {
  const r = snap.result;
  if (!r) return null;

  return (
    <div className="home-scroll flex flex-col justify-center">
      <div className="text-center">
        <div
          className={cn(
            'text-[72px] font-bold leading-none tracking-tight',
            GRADE_TONE[r.grade] ?? 'text-foreground',
          )}
        >
          {r.grade}
        </div>
        <p className="mt-2 text-[13px] tracking-wide text-brand">{r.sub}</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        {[
          { v: r.score, k: '得分' },
          { v: r.maxCombo, k: '最大连击' },
        ].map((s) => (
          <div key={s.k} className="text-center">
            <b className="block text-[26px] font-bold leading-none tabular-nums">{s.v}</b>
            <span className="mt-1 block text-[10px] tracking-wide text-muted-foreground">
              {s.k}
            </span>
          </div>
        ))}
      </div>

      <div className="glass mt-6 rounded-md px-4 py-3">
        {r.rows.map((row) => (
          <div key={row.k} className="flex items-center gap-3 py-1.5">
            <span className="w-14 shrink-0 text-[12px] text-muted-foreground">{row.k}</span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <span
                className="brand-fill block h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(0, Math.min(100, row.v))}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-[12px] font-semibold tabular-nums">
              {Math.round(row.v)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-[10px] tracking-wide text-muted-foreground">
          <span>偏早</span>
          <span>命中分布</span>
          <span>偏慢</span>
        </div>
        <div className="glass flex h-16 items-end gap-0.5 rounded-sm px-2 py-2">
          {r.histo.map((b, i) => (
            <span
              key={i}
              className={cn(
                'flex-1 rounded-[1px]',
                b.kind === 'zero' ? 'bg-white/35' : b.kind === 'early' ? 'bg-good' : 'bg-great',
                b.h === 0 && 'opacity-0',
              )}
              style={{ height: `${Math.max(4, b.h)}%` }}
            />
          ))}
        </div>
      </div>

      <p className="mt-4 text-center text-[11.5px] leading-relaxed text-muted-foreground">
        {r.diag}
      </p>

      {/* 按钮区压一层渐变底：结算背景是场景画面，按钮直接浮在上面会糊成一块 */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-5 space-y-2.5 bg-gradient-to-t from-background via-background/92 to-transparent px-4 pb-2 pt-6">
        {r.canSpeedUp ? (
          <Button size="cta" onClick={() => game.speedUp()}>
            加快速度继续 · {r.nextBpm} BPM
          </Button>
        ) : null}
        <Button
          size="cta"
          variant={r.canSpeedUp ? 'outline' : 'default'}
          onClick={() => game.again()}
        >
          再来一次
        </Button>
        <Button
          size="lg"
          variant="ghost"
          className="w-full"
          onClick={() => game.home()}
        >
          返回首页
        </Button>
      </div>
    </div>
  );
}
