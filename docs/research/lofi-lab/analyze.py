import wave, struct, math, sys, json, cmath

def read(path):
    w = wave.open(path, 'rb')
    nch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
    raw = w.readframes(n)
    w.close()
    vals = struct.unpack('<%dh' % (n * nch), raw)
    if nch == 2:
        mono = [(vals[i * 2] + vals[i * 2 + 1]) / 65536.0 for i in range(n)]
    else:
        mono = [v / 32768.0 for v in vals]
    return mono, sr

def fft(x):
    n = len(x)
    if n == 1:
        return x
    even = fft(x[0::2]); odd = fft(x[1::2])
    out = [0j] * n
    for k in range(n // 2):
        t = cmath.exp(-2j * math.pi * k / n) * odd[k]
        out[k] = even[k] + t
        out[k + n // 2] = even[k] - t
    return out

def centroid(frame, sr):
    n = len(frame)
    win = [frame[i] * (0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1))) for i in range(n)]
    sp = fft([complex(v, 0) for v in win])
    num = den = 0.0
    for k in range(1, n // 2):
        mag = abs(sp[k])
        num += (k * sr / n) * mag
        den += mag
    return num / den if den else 0.0

def band_energy(frame, sr):
    n = len(frame)
    sp = fft([complex(v, 0) for v in frame])
    bands = [(0, 120), (120, 400), (400, 2000), (2000, 6000), (6000, 20000)]
    tot = 0.0
    acc = [0.0] * len(bands)
    for k in range(1, n // 2):
        f = k * sr / n
        p = abs(sp[k]) ** 2
        tot += p
        for i, (lo, hi) in enumerate(bands):
            if lo <= f < hi:
                acc[i] += p
                break
    return [round(10 * math.log10((a / tot) + 1e-12), 1) for a in acc]

def db(x):
    return 20 * math.log10(max(x, 1e-9))

def envelope(seg, sr, hop_ms=2.0):
    hop = max(1, int(sr * hop_ms / 1000))
    env = []
    for i in range(0, len(seg) - hop, hop):
        s = 0.0
        for j in range(i, i + hop):
            s += seg[j] * seg[j]
        env.append(math.sqrt(s / hop))
    return env, hop / sr

def analyze_hit(mono, sr, t0, span=0.9):
    i0 = int(t0 * sr)
    seg = mono[i0:i0 + int(sr * span)]
    env, dt = envelope(seg, sr)
    emax = max(env)
    ipk = env.index(emax)
    # attack on envelope: 10% -> 90%
    def first(p):
        for i in range(ipk + 1):
            if env[i] >= p * emax:
                return i
        return 0
    a10, a90 = first(0.1), first(0.9)
    attack_ms = (a90 - a10) * dt * 1000
    # decay to -20 dB from envelope peak
    tgt = emax * 0.1
    idx = len(env) - 1
    for i in range(ipk, len(env)):
        if env[i] < tgt:
            idx = i
            break
    decay_ms = (idx - ipk) * dt * 1000
    # full hit duration: below -40 dB
    tgt2 = emax * 0.01
    idx2 = len(env) - 1
    for i in range(ipk, len(env)):
        if env[i] < tgt2:
            idx2 = i
            break
    tail_ms = (idx2 - ipk) * dt * 1000
    peak = max(abs(v) for v in seg)
    rms = math.sqrt(sum(v * v for v in seg) / len(seg))
    fr = int(sr * 0.08)
    c0 = centroid(seg[0:fr], sr)
    c1 = centroid(seg[int(sr * 0.05):int(sr * 0.05) + fr], sr)
    be = band_energy(seg[0:fr], sr)
    return {
        'peak_db': round(db(peak), 1),
        'rms_db': round(db(rms), 1),
        'attack_ms': round(attack_ms, 1),
        'decay20_ms': int(decay_ms),
        'tail40_ms': int(tail_ms),
        'centroid': round(c0),
        'centroid_50ms': round(c1),
        'bands_0_120_400_2k_6k_hi': be,
    }

if __name__ == '__main__':
    path = sys.argv[1]
    mono, sr = read(path)
    ts = [float(t) for t in sys.argv[2:]]
    if not ts:
        print(json.dumps({
            'peak_db': round(db(max(abs(v) for v in mono)), 1),
            'rms_db': round(db(math.sqrt(sum(v * v for v in mono) / len(mono))), 1),
            'duration': round(len(mono) / sr, 2),
        }, indent=1))
    else:
        for t in ts:
            print(t, json.dumps(analyze_hit(mono, sr, t), ensure_ascii=False))
