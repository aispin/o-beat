/* ============================================================
   backing.js · 编曲层
   ------------------------------------------------------------
   把「每小节一个 pad」升级成有层次的伴奏：鼓组、贝斯、和声、
   加花各自独立，随段落推进。所有事件按 16 分网格生成，再用
   30ms 的 lookahead 提前排进 WebAudio 时钟。
   ============================================================ */
(function (global) {
  'use strict';

  const NOTE_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function chordSemis(name) {
    const m = /^([A-G])(m?)$/.exec(name) || ['', 'C', ''];
    const r = NOTE_SEMI[m[1]];
    return m[2] === 'm' ? [r, r + 3, r + 7] : [r, r + 4, r + 7];
  }

  // 每个场景一套编曲性格
  const GROOVE = {
    cyber: {
      kit: 'techno',
      kick: [0, 1, 2, 3],
      snare: [1, 3],
      open: [0.5, 1.5, 2.5, 3.5],
      ghost: 4,          // 每拍 4 个 16 分闭镲
      bass: [0, 0.75, 1.5, 2, 2.75, 3.5],
      stab: [0.5, 1.5, 2.5, 3.5],
      keys: 'lead',
      padType: 'synth',
      swing: 0,
      human: 0.002,
    },
    classic: {
      kit: 'acoustic',
      kick: [0, 2],
      snare: [1],
      open: [],
      ghost: 2,          // 8 分踩镲
      bass: [0, 2],
      arp: [0, 0.5, 1, 1.5, 2, 2.5],   // 分解和弦
      keys: 'piano',
      padType: 'strings',
      swing: 0,
      human: 0.004,
    },
    lofi: {
      kit: 'kpr77',
      kick: [0, 1.75, 2.5],
      snare: [1, 3],
      open: [],
      ghost: 2,
      bass: [0, 1.5, 2, 3.5],
      stab: [1, 3],
      keys: 'rhodes',
      padType: 'strings',
      swing: 0.07,
      human: 0.006,
    },
    rock: {
      kit: 'acoustic',
      kick: [0, 1.5, 2, 2.75],
      snare: [1, 3],
      open: [3.5],
      ghost: 2,
      bass: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      strum: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      keys: 'guitar',
      padType: 'strings',
      swing: 0,
      human: 0.003,
    },
  };

  const Backing = {
    events: [],
    idx: 0,
    timer: null,
    t0: 0,
    nowFn: null,
    mode: 'music',
    song: null,

    build(song, bars, mode) {
      if (mode === 'music' && song.arcade) return this.buildArcade(song, bars);

      const S = global.SFX;
      const g = GROOVE[song.scene] || GROOVE.lofi;
      const beat = 60 / song.bpm;
      const meter = song.meter;
      const barDur = beat * meter;
      const ev = [];
      const section = (bar) => (bar < 4 ? 0 : bar < 8 ? 1 : bar < 12 ? 2 : 3);

      const at = (t0) => ({ t0 });
      const push = (bar, pos, fn, arg) => {
        if (pos >= meter) return;
        ev.push({ at: bar * barDur + pos * beat, fn, arg });
      };

      if (mode === 'rhythm') {
        // 练习模式：节拍器优先，鼓组只做轻微衬底。
        // 鼓组跟随场景（g.kit），换歌就换练习的"鼓房"，而不是全场一套 acoustic。
        for (let bar = 0; bar < bars; bar++) {
          for (let b = 0; b < meter; b++) {
            push(bar, b, (t, a) => S.click(t, a), b === 0);
            if (meter === 4 && (b === 1 || b === 3)) {
              push(bar, b, (t, k) => S.drum('snare', t, { gain: 0.13, kit: k }), g.kit);
            }
          }
          push(bar, 0, (t, k) => S.drum('kick', t, { gain: 0.32, kit: k, duck: 0.1 }), g.kit);
        }
      } else {
        for (let bar = 0; bar < bars; bar++) {
          const sec = section(bar);
          const chord = song.chords[bar % song.chords.length];
          const semis = chordSemis(chord);
          const bassRoot = 36 + semis[0];
          const voice = [60 + semis[0], 60 + semis[1], 60 + semis[2]];
          const swingShift = (p) => {
            // 反拍往后挪一点，做出摇摆
            const isOff = Math.abs(p % 1) > 0.1;
            return p + (isOff ? g.swing : 0);
          };

          // —— 鼓 ——
          g.kick.forEach((b) => {
            if (b >= meter) return;
            // 第 2 段之后加一个切分底鼓
            push(bar, b, (t) => S.drum('kick', t, { gain: 0.95 }));
          });
          if (sec >= 2 && meter === 4) {
            push(bar, 3.5, (t) => S.drum('kick', t, { gain: 0.55 }));
          }

          g.snare.forEach((b) => {
            if (b >= meter) return;
            push(bar, b, (t, a) => S.drum('snare', t, { gain: a, kit: g.kit }), sec >= 1 ? 0.82 : 0.6);
          });

          g.open.forEach((b) => {
            if (b >= meter) return;
            push(bar, b, (t) => S.drum('openhat', t, { gain: 0.34 }));
          });

          if (g.ghost && sec >= 1) {
            const div = g.ghost;               // 每拍的细分数
            for (let i = 0; i < meter * div; i++) {
              const p = i / div;
              if (Math.abs(p % 1) < 0.01) continue;
              // 稀疏化，避免机械
              if ((i * 7 + bar * 3) % 5 === 0) continue;
              push(bar, swingShift(p), (t) => S.drum('hat', t, { gain: 0.17 }));
            }
          }

          // 段落末尾加花
          if (bar === 3 || bar === 7 || bar === 11) {
            const base = meter - 1;
            [0, 0.25, 0.5, 0.75].forEach((d, i) => {
              push(bar, base + d, (t) => S.drum('snare', t, { gain: 0.22 + i * 0.09, rate: 1 + i * 0.06 }));
            });
          }

          // —— 贝斯 ——
          (g.bass || []).forEach((b, i) => {
            if (b >= meter) return;
            const note = i % 4 === 3 ? bassRoot + 7 : bassRoot;
            push(bar, b, (t, n) => S.note('bass', n, t, { dur: beat * 0.85, gain: 0.95 }), note);
          });

          // —— 和声 ——
          if (g.arp) {
            // 古典：分解和弦
            g.arp.forEach((p, i) => {
              if (p >= meter) return;
              const n = 60 + semis[[0, 1, 2, 1, 2, 0][i % 6]] + (i > 3 ? 12 : 0);
              push(bar, p, (t, m) => S.note('piano', m, t, { dur: beat * 0.9, gain: 0.42, pan: (i % 2 ? 0.14 : -0.14) }), n);
            });
          }

          if (g.strum) {
            // 摇滚：强力和弦扫弦
            g.strum.forEach((p, i) => {
              if (p >= meter) return;
              const acc = Math.abs(p % 1) < 0.01 ? 0.5 : 0.3;
              push(bar, p, (t) => {
                S.note('guitar', 48 + semis[0], t, { dur: beat * 0.5, gain: acc, pan: -0.18 });
                S.note('guitar', 48 + semis[0] + 7, t, { dur: beat * 0.5, gain: acc * 0.8, pan: 0.18 });
              });
            });
          }

          if (g.stab) {
            g.stab.forEach((p) => {
              if (p >= meter) return;
              if (sec === 0 && p % 2 > 1) return;
              push(bar, p, (t) => {
                voice.forEach((m, i) => {
                  global.SFX.note(g.keys === 'rhodes' ? 'rhodes' : 'rhodes', m, t + i * 0.006, {
                    dur: beat * 0.8, gain: 0.24, pan: (i - 1) * 0.2,
                  });
                });
              });
            });
          }

          // 铺底：长音贯穿整小节
          const padNotes = [bassRoot + 24, bassRoot + 24 + semis[1] - semis[0], bassRoot + 24 + 7];
          push(bar, 0, (t) => {
            global.SFX.note('pad', padNotes, t, {
              dur: barDur * 1.02,
              gain: sec === 0 ? 0.55 : 0.85,
            });
          });
        }
      }

      ev.sort((a, b) => a.at - b.at);
      this.events = ev;
      this.idx = 0;
      this.mode = mode;
      return ev;
    },

    /* 固定编曲曲目：把 bgm.js 那份谱直接搬过来当伴奏。
       ------------------------------------------------------------
       旋律不在这里排 —— 玩家打的每个音就是旋律音，伴奏只负责贝斯、
       琶音和鼓。所以漏音的时候这三层还在，音乐不会散成一地。
       数据来自 BGM.score，和首页循环播放的是同一份定义。 */
    buildArcade(song, bars) {
      const S = global.SFX;
      const sc = global.BGM && global.BGM.score;
      if (!sc) { this.events = []; this.idx = 0; this.mode = 'music'; return []; }

      const beat = 60 / song.bpm;
      const sixteenth = beat / 4;
      const barDur = beat * song.meter;
      const ev = [];
      const push = (bar, s, fn, arg) => {
        ev.push({ at: bar * barDur + s * sixteenth, fn, arg });
      };

      for (let bar = 0; bar < bars; bar++) {
        const src = bar % sc.bars;
        const chord = sc.chords[sc.prog[src]];

        // 贝斯：八个八分位，根音 / 五度 / 高八度
        sc.bassOct.forEach((semi, k) => {
          push(bar, k * 2, (t, n) => {
            S.note('chipBass', n, t, { dur: sixteenth * 1.7, gain: 0.9 });
          }, chord.root + semi);
        });

        // 琶音：奇数十六分位填空，音量压到刚能听出「有和声」
        for (let s = 1; s < 16; s += 2) {
          const idx = sc.arpOrder[((s - 1) / 2) % sc.arpOrder.length];
          push(bar, s, (t, n) => {
            S.note('chipLead', n, t, { dur: sixteenth * 0.85, gain: 0.16, pan: 0.22 });
          }, chord.tones[idx] + 12);
        }

        // 鼓：底鼓 1/4/4&、军鼓 2/4、踩镲八分位
        [0, 6, 8].forEach((s) => push(bar, s, (t) => S.drum('kick', t, { gain: 0.9, kit: 'chip' })));
        [4, 12].forEach((s) => push(bar, s, (t) => S.drum('snare', t, { gain: 1, kit: 'chip' })));
        for (let s = 0; s < 16; s += 2) {
          push(bar, s, (t, g) => S.drum('hat', t, { gain: g, kit: 'chip' }), s === 0 ? 0.75 : 0.52);
        }
      }

      ev.sort((a, b) => a.at - b.at);
      this.events = ev;
      this.idx = 0;
      this.mode = 'music';
      return ev;
    },

    /* 节奏模式：没有伴奏，只有节拍器。
       每小节自带 bpm（每 16 小节 +10），所以完全按传入的时间轴排，
       重音轮廓由风格决定（4/4 落在 1、3，7/8 落在 1、4、6）。
       底鼓只在每小节第一拍点一下，给个"节"的落点。 */
    buildRhythm(bars, accent, kit) {
      const S = global.SFX;
      const ev = [];

      bars.forEach((bar) => {
        const unit = bar.dur / bar.ticks;          // 一拍：4/4 是四分，7/8 是八分
        for (let k = 0; k < bar.ticks; k++) {
          const idx = Math.min(accent.length - 1, Math.round(k * unit * 2));
          ev.push({
            at: bar.t + k * unit,
            fn: (t, a) => S.click(t, a),
            arg: accent[idx] >= 0.8,
          });
        }
        ev.push({ at: bar.t, fn: (t, k) => S.drum('kick', t, { gain: 0.26, kit: k, duck: 0.08 }), arg: kit });
      });

      ev.sort((a, b) => a.at - b.at);
      this.events = ev;
      this.idx = 0;
      this.mode = 'rhythm';
      return ev;
    },

    start(t0, nowFn) {
      this.stop();
      this.t0 = t0;
      this.nowFn = nowFn;
      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
    },

    tick() {
      const nowFn = this.nowFn || (() => 0);
      const t0 = this.t0;
      const horizon = nowFn() - t0 + 0.4;
      while (this.idx < this.events.length && this.events[this.idx].at < horizon) {
        const e = this.events[this.idx++];
        const t = t0 + e.at;
        if (t > nowFn() - 0.06) {
          try { e.fn(t, e.arg); } catch (err) {}
        }
      }
      if (this.idx >= this.events.length && nowFn() - t0 > 0.6) this.stop();
    },

    stop() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    },
  };

  global.Backing = Backing;
})(window);
