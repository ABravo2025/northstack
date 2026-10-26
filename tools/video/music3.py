# "Upbeat pop-house" background track for the HR video, synthesized from scratch (no samples, no
# licensing). 124 BPM, vi–IV–I–V in A (F#m, D, A, E): offbeat plucked chord stabs from the start, then
# four-on-the-floor kick, claps on 2 & 4, offbeat open hats, a bouncing octave bass with sidechain pump,
# a pluck hook, a noise riser into the second half, and a final stab + held chord.
#   python music3.py out.wav <seconds>
import numpy as np, wave, sys

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else 'music3.wav'
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 50.0
BPM = 124
B = 60 / BPM
bar = 4 * B
N = int(SR * (DUR + 2))
rng = np.random.default_rng(7)
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)
bus = {k: [np.zeros(N), np.zeros(N)] for k in ('drums', 'music')}

def put(sig, t, pan=0.0, g=1.0, to='music'):
    i = int(t * SR)
    if i >= N: return
    j = min(N, i + len(sig)); s = sig[: j - i] * g
    L, R = bus[to]
    L[i:j] += s * np.sqrt(0.5 * (1 - pan)); R[i:j] += s * np.sqrt(0.5 * (1 + pan))

def saw(f, t, voices=(-0.1, 0, 0.1)):
    s = np.zeros_like(t)
    for d in voices:
        ph = (f * 2 ** (d / 12) * t + rng.random()) % 1.0
        s += 2 * ph - 1
    return s / len(voices)

def lp(x, a):  # one-pole low-pass, a in (0,1): smaller = darker
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc); y[i] = acc
    return y

def stab(ms, dur=0.22, bright=0.35):
    n = int(dur * SR); t = np.arange(n) / SR
    s = sum(saw(hz(m), t) for m in ms) / len(ms)
    s = lp(s, bright)
    return s * np.minimum(1, t / 0.003) * np.exp(-t * 9)

def pluck(m, dur=0.35):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 18) + 0.25 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 25)
    return s * np.minimum(1, t / 0.002) * np.exp(-t * 7)

def pad(ms, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = lp(sum(saw(hz(m), t, (-0.12, 0.12)) for m in ms) / len(ms), 0.08)
    return s * np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.3)

def kick():
    n = int(0.3 * SR); t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t * 38)
    return np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8))

def hp(x, k=6): return x - np.convolve(x, np.ones(k) / k, mode='same')

def clap():
    n = int(0.22 * SR); t = np.arange(n) / SR
    noise = hp(rng.standard_normal(n))
    env = sum(np.exp(-np.maximum(0, t - d) * 60) * (t >= d) for d in (0, 0.009, 0.018)) + 0.5 * np.exp(-np.maximum(0, t - 0.02) * 16) * (t > 0.02)
    return noise * env * 0.45

def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR); t = np.arange(n) / SR
    return hp(hp(rng.standard_normal(n), 3), 3) * np.exp(-t * (14 if open_ else 70)) * 0.5

def bass(m, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = lp(saw(hz(m), t, (0,)), 0.06) * 2.2 + 0.6 * np.sin(2 * np.pi * hz(m) * t)
    return s * np.minimum(1, t / 0.005) * np.minimum(1, (dur - t) / 0.01)

def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n); out = np.empty(n); acc = 0.0
    for i in range(n):
        a = 0.02 + 0.5 * (t[i] / dur) ** 2; acc += a * (x[i] - acc); out[i] = acc
    return out * (t / dur) ** 1.5 * 0.9

# vi–IV–I–V in A: (bass root, stab chord)
prog = [(42, [61, 66, 69, 73]), (38, [62, 66, 69, 74]), (45, [61, 64, 69, 73]), (40, [59, 64, 68, 71])]
hook = [  # (eighth offset in a 2-bar phrase, midi) — catchy, mostly offbeat
    (0, 81), (1, 80), (3, 78), (5, 76), (6, 78), (8, 81), (9, 83), (11, 85), (12, 83), (14, 81),
]
bars = int(np.ceil(DUR / bar))
drop2 = 10                   # riser before this bar, hook enters
kicks = []
for b in range(bars):
    t0 = b * bar
    last = t0 + bar >= DUR - 0.01
    root, ch = prog[b % 4]
    if last:
        put(stab(ch, 0.6, 0.5), t0, g=0.32)
        put(pad(ch, bar + 1.2), t0, g=0.16)
        put(bass(root - 12, 1.2), t0, g=0.28)
        put(kick(), t0, g=0.8, to='drums'); kicks.append(t0)
        put(clap(), t0, g=0.5, to='drums')
        continue
    intro = b < 2
    build = b == drop2 - 1
    # offbeat chord stabs (the "and" of every beat), brighter once the beat is in
    for beat in range(4):
        put(stab(ch, 0.2, 0.18 if intro else 0.35), t0 + beat * B + B / 2, pan=0.15 * (-1) ** beat, g=0.30)
    put(pad(ch[:3], bar), t0, g=0.10 if not intro else 0.06)
    if intro:
        if b == 1: put(riser(bar), t0, g=0.18)
        continue
    for beat in range(4):
        if not (build and beat == 3):
            put(kick(), t0 + beat * B, g=0.85, to='drums'); kicks.append(t0 + beat * B)
        if beat in (1, 3): put(clap(), t0 + beat * B, g=0.55, to='drums')
        put(hat(True), t0 + beat * B + B / 2, pan=0.3, g=0.22, to='drums')
        for s in (0, 1, 3): put(hat(), t0 + beat * B + s * B / 4, pan=-0.3, g=0.10 if s else 0.14, to='drums')
    # bouncing octave bass on 8ths
    for e in range(8):
        m = root - 12 + (12 if e % 2 else 0)
        put(bass(m, B / 2 * 0.85), t0 + e * B / 2, g=0.26)
    if build: put(riser(bar), t0, g=0.25)
    if b >= 4:
        ph = (b - 4) % 2
        for off, m in hook:
            if ph * 8 <= off < ph * 8 + 8:
                g = 0.20 if b >= drop2 else 0.13
                put(pluck(m), t0 + (off - ph * 8) * B / 2, pan=-0.12, g=g)
                if b >= drop2: put(pluck(m - 12), t0 + (off - ph * 8) * B / 2, pan=0.12, g=0.08)

# sidechain pump on the music bus from every kick
duck = np.ones(N); rel = int(0.22 * SR); curve = 1 - 0.6 * np.exp(-np.arange(rel) / SR * 14)
for t in kicks:
    i = int(t * SR); j = min(N, i + rel); duck[i:j] = np.minimum(duck[i:j], curve[: j - i])

def reverb(x, seed, tail=1.2):
    g = np.random.default_rng(seed); n = int(tail * SR)
    ir = g.standard_normal(n) * np.exp(-np.arange(n) / SR * 4.5); ir[0] = 0; ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << (len(x) + n - 2).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * 0.9 + y * 0.18

mL, mR = (reverb(c * duck, s) for c, s in zip(bus['music'], (1, 2)))
L = mL + bus['drums'][0]; R = mR + bus['drums'][1]
end = int(DUR * SR); L, R = L[:end], R[:end]
fi, fo = int(0.05 * SR), int(1.5 * SR)
for c in (L, R):
    c[:fi] *= np.linspace(0, 1, fi); c[-fo:] *= np.linspace(1, 0, fo)
pk = max(np.abs(L).max(), np.abs(R).max()); L, R = np.tanh(L / pk * 1.3) * 0.82, np.tanh(R / pk * 1.3) * 0.82
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.stack([L, R], 1) * 32767).astype(np.int16).tobytes())
print('wrote', OUT, f'{DUR:.1f}s')
