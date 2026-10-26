# "Energetic funk-pop" background track for the HR video, synthesized from scratch (no samples, no
# licensing). 132 BPM in D: I–vi–IV–V (D, Bm, G, A). Punchy kick + snare backbeat, 16th hats, a
# syncopated funk bass, bright brass-like stabs, muted guitar-style chops on the 16ths, a square-wave
# hook, snare-roll builds with a crash on every section start, and a final hit.
#   python music4.py out.wav <seconds>
import numpy as np, wave, sys

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else 'music4.wav'
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 50.0
BPM = 132
B = 60 / BPM
S = B / 4                       # sixteenth
bar = 4 * B
N = int(SR * (DUR + 2))
rng = np.random.default_rng(3)
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)
bus = {k: [np.zeros(N), np.zeros(N)] for k in ('drums', 'music')}

def put(sig, t, pan=0.0, g=1.0, to='music'):
    i = int(t * SR)
    if i >= N or i < 0: return
    j = min(N, i + len(sig)); s = sig[: j - i] * g
    L, R = bus[to]
    L[i:j] += s * np.sqrt(0.5 * (1 - pan)); R[i:j] += s * np.sqrt(0.5 * (1 + pan))

def saw(f, t, voices=(-0.08, 0, 0.08)):
    s = np.zeros_like(t)
    for d in voices:
        s += 2 * ((f * 2 ** (d / 12) * t + rng.random()) % 1.0) - 1
    return s / len(voices)

def sweep_lp(x, a0, a1, rate):  # one-pole low-pass whose cutoff decays from a0 to a1
    n = len(x); a = a1 + (a0 - a1) * np.exp(-np.arange(n) / SR * rate)
    y = np.empty(n); acc = 0.0
    for i in range(n):
        acc += a[i] * (x[i] - acc); y[i] = acc
    return y

def brass(ms, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = sweep_lp(sum(saw(hz(m), t) for m in ms) / len(ms), 0.55, 0.12, 14)
    return s * np.minimum(1, t / 0.006) * np.minimum(1, (dur - t) / 0.02) * (0.75 + 0.25 * np.exp(-t * 6))

def chop(ms):  # muted funk-guitar chop
    n = int(0.07 * SR); t = np.arange(n) / SR
    s = sum(saw(hz(m), t, (0,)) for m in ms) / len(ms) + 0.4 * rng.standard_normal(n)
    return sweep_lp(s, 0.6, 0.25, 30) * np.exp(-t * 45)

def square(m, dur):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 6 * t) * np.minimum(1, t / 0.15)
    ph = np.cumsum(f * vib) / SR
    s = np.sign(np.sin(2 * np.pi * ph)) * 0.6 + 0.4 * np.sin(2 * np.pi * 2 * ph)
    s = sweep_lp(s, 0.5, 0.2, 8)
    return s * np.minimum(1, t / 0.005) * np.minimum(1, (dur - t) / 0.02) * np.exp(-t * 1.2)

def kick():
    n = int(0.28 * SR); t = np.arange(n) / SR
    f = 50 + 130 * np.exp(-t * 40)
    return np.tanh(2.0 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9))

def hp(x, k=6): return x - np.convolve(x, np.ones(k) / k, mode='same')

def snare(g=1.0):
    n = int(0.2 * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    noise = hp(rng.standard_normal(n)) * np.exp(-t * 18)
    return (0.6 * body + 0.8 * noise) * g

def hat(open_=False):
    n = int((0.16 if open_ else 0.04) * SR); t = np.arange(n) / SR
    return hp(hp(rng.standard_normal(n), 3), 3) * np.exp(-t * (16 if open_ else 80)) * 0.5

def crash():
    n = int(1.6 * SR); t = np.arange(n) / SR
    return hp(hp(rng.standard_normal(n), 3), 2) * np.exp(-t * 2.2) * 0.45

def bass(m, dur, slide=0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = hz(m) * 2 ** (slide / 12 * np.minimum(1, t / dur))
    ph = np.cumsum(f) / SR
    s = sweep_lp(2 * (ph % 1.0) - 1, 0.25, 0.05, 20) * 2.4 + 0.7 * np.sin(2 * np.pi * ph)
    return s * np.minimum(1, t / 0.004) * np.minimum(1, (dur - t) / 0.008)

# I–vi–IV–V in D: (bass root, chord)
prog = [(38, [62, 66, 69, 74]), (35, [62, 66, 71, 74]), (43, [62, 67, 71, 74]), (45, [61, 64, 69, 73])]
# funk bass: (16th, octave offset, length in 16ths)
groove = [(0, 0, 2), (3, 0, 1), (4, 12, 1), (6, 0, 2), (8, 0, 1), (10, 12, 1), (11, 0, 2), (14, 7, 1), (15, 12, 1)]
brass_hits = [(0, 2), (6, 1), (10, 2), (14, 2)]          # (16th, length) syncopated stabs
hook = [(0, 81, 2), (3, 78, 1), (4, 81, 2), (6, 83, 2), (8, 85, 3), (12, 83, 1), (13, 81, 1), (14, 78, 2),
        (16, 76, 2), (19, 78, 1), (20, 81, 3), (24, 78, 2), (26, 76, 2), (28, 74, 4)]  # 2-bar phrase
bars = int(np.ceil(DUR / bar))
SEC = {0, 1, 5, 9, 13, 17}        # crash on these bar starts
kicks = []
for b in range(bars):
    t0 = b * bar
    last = t0 + bar >= DUR - 0.01
    root, ch = prog[b % 4]
    if last:
        put(brass([62, 66, 69, 74, 78], 1.4), t0, g=0.36)
        put(bass(root - 12, 1.2), t0, g=0.3)
        put(kick(), t0, g=0.9, to='drums'); put(snare(), t0, g=0.5, to='drums'); put(crash(), t0, g=0.5, to='drums')
        continue
    roll = b % 4 == 0 and b >= 4           # snare fill into every 4-bar section
    if b in SEC: put(crash(), t0, g=0.45, to='drums')
    if b < 1:  # intro: chops + brass + hats, snare roll into the beat
        for s16 in range(16):
            if s16 % 2: put(chop(ch[1:]), t0 + s16 * S, pan=0.35, g=0.32)
        for s16, ln in brass_hits: put(brass(ch, ln * S * 0.9), t0 + s16 * S, g=0.42)
        for s16 in range(16): put(hat(), t0 + s16 * S, pan=-0.3, g=0.12 if s16 % 2 else 0.18, to='drums')
        if b == 0:
            for k in range(8): put(snare(0.3 + 0.08 * k), t0 + 2 * B + k * B / 4, to='drums')
        continue
    for beat in range(4):
        put(kick(), t0 + beat * B, g=0.9, to='drums'); kicks.append(t0 + beat * B)
        if beat in (1, 3) and not (roll and beat == 3): put(snare(), t0 + beat * B, g=0.62, to='drums')
        put(hat(True), t0 + beat * B + B / 2, pan=0.3, g=0.16, to='drums')
    for s16 in range(16):
        put(hat(), t0 + s16 * S, pan=-0.3, g=0.10 if s16 % 2 else 0.15, to='drums')
        if s16 % 2: put(chop(ch[1:]), t0 + s16 * S, pan=0.35, g=0.16)
    if roll:
        for k in range(4): put(snare(0.35 + 0.12 * k), t0 + 3 * B + k * S, to='drums')
    for s16, octv, ln in groove:
        put(bass(root - 12 + octv, ln * S * 0.92, slide=-2 if s16 == 15 else 0), t0 + s16 * S, g=0.30)
    for s16, ln in brass_hits: put(brass(ch, ln * S * 0.9), t0 + s16 * S, g=0.24)
    if b >= 5:
        ph = (b - 5) % 2
        for off, m, ln in hook:
            if ph * 16 <= off < ph * 16 + 16:
                g = 0.15 if b >= 9 else 0.11
                put(square(m, ln * S * 0.95), t0 + (off - ph * 16) * S, pan=-0.1, g=g)
                if b >= 9: put(square(m + 12, ln * S * 0.95), t0 + (off - ph * 16) * S, pan=0.15, g=0.045)

duck = np.ones(N); rel = int(0.16 * SR); curve = 1 - 0.45 * np.exp(-np.arange(rel) / SR * 18)
for t in kicks:
    i = int(t * SR); j = min(N, i + rel); duck[i:j] = np.minimum(duck[i:j], curve[: j - i])

def reverb(x, seed, tail=0.9):
    g = np.random.default_rng(seed); n = int(tail * SR)
    ir = g.standard_normal(n) * np.exp(-np.arange(n) / SR * 6); ir[0] = 0; ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << (len(x) + n - 2).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * 0.92 + y * 0.12

mL, mR = (reverb(c * duck, s) for c, s in zip(bus['music'], (1, 2)))
L = mL + bus['drums'][0]; R = mR + bus['drums'][1]
end = int(DUR * SR); L, R = L[:end], R[:end]
fi, fo = int(0.02 * SR), int(1.2 * SR)
for c in (L, R):
    c[:fi] *= np.linspace(0, 1, fi); c[-fo:] *= np.linspace(1, 0, fo)
pk = max(np.abs(L).max(), np.abs(R).max()); L, R = np.tanh(L / pk * 1.5) * 0.84, np.tanh(R / pk * 1.5) * 0.84
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.stack([L, R], 1) * 32767).astype(np.int16).tobytes())
print('wrote', OUT, f'{DUR:.1f}s')
