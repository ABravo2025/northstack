# "Inspiring / uplifting corporate" background track, synthesized from scratch (no samples, no
# licensing). 112 BPM, I–V–vi–IV in C: piano arpeggio + pads from the start, then kick, claps on 2 & 4,
# shaker, bass and a bright lead join. Ends on a held tonic chord.
#   python music2.py out.wav <seconds>
import numpy as np, wave, sys

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else 'music2.wav'
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 45.0
BPM = 112
B = 60 / BPM
N = int(SR * (DUR + 2))
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(11)
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)

def put(sig, t, pan=0.0, g=1.0):
    i = int(t * SR)
    if i >= N: return
    j = min(N, i + len(sig)); s = sig[: j - i] * g
    L[i:j] += s * np.sqrt(0.5 * (1 - pan)); R[i:j] += s * np.sqrt(0.5 * (1 + pan))

def piano(m, dur=1.2, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m)
    s = np.zeros(n)
    for k, a in enumerate([1.0, 0.45, 0.22, 0.12, 0.06], start=1):
        s += a * np.sin(2 * np.pi * f * k * t * (1 + 0.0004 * k)) * np.exp(-t * (2.2 + k * 1.3))
    s *= np.minimum(1, t / 0.004)
    return s * vel

def pad(ms, dur):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for m in ms:
        for d in (-0.08, 0.08):
            f = hz(m) * 2 ** (d / 12)
            s += np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * 2 * f * t)
    e = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.5)
    return s * e / len(ms)

def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)

def hp(x):  # crude high-pass: subtract a short moving average
    k = 8; return x - np.convolve(x, np.ones(k) / k, mode='same')

def clap():
    n = int(0.25 * SR); t = np.arange(n) / SR
    noise = hp(rng.standard_normal(n))
    env = np.exp(-t * 22) + 0.6 * np.exp(-np.maximum(0, t - 0.012) * 30) * (t > 0.012)
    return noise * env * 0.6

def shaker():
    n = int(0.09 * SR); t = np.arange(n) / SR
    return hp(hp(rng.standard_normal(n))) * np.exp(-t * 45) * 0.5

def bass(m, dur):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
    return s * np.minimum(1, t / 0.01) * np.exp(-t * 2.5)

def lead(m, dur):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m)
    vib = 1 + 0.003 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.2)
    s = np.sin(2 * np.pi * f * np.cumsum(vib) / SR) + 0.35 * np.sin(2 * np.pi * 2 * f * np.cumsum(vib) / SR)
    return s * np.minimum(1, t / 0.03) * np.exp(-t * 1.6)

# I–V–vi–IV: C, G, Am, F (root, chord tones for arpeggio)
prog = [(48, [60, 64, 67, 72]), (43, [59, 62, 67, 71]), (45, [60, 64, 69, 72]), (41, [60, 65, 69, 72])]
bar = 4 * B
bars = int(np.ceil(DUR / bar))
melody = [  # (beat offset within 4-bar phrase, midi, beats)
    (0, 76, 1.5), (1.5, 74, 0.5), (2, 72, 2), (4, 74, 1.5), (5.5, 76, 0.5), (6, 79, 2),
    (8, 81, 1.5), (9.5, 79, 0.5), (10, 76, 2), (12, 77, 1.5), (13.5, 76, 0.5), (14, 74, 2),
]
for b in range(bars):
    t0 = b * bar
    last = t0 + bar >= DUR - 0.01
    root, tones = prog[b % 4]
    full = b >= 2               # drums/bass join after a 2-bar intro
    lead_on = b >= 6 and not last
    if last:
        put(pad([60, 64, 67, 72], bar + 1.5), t0, g=0.10)
        put(piano(60, 2.5) + piano(64, 2.5) + piano(67, 2.5) + piano(72, 2.5), t0, g=0.12)
        put(bass(36, 2.0), t0, g=0.22); put(kick(), t0, g=0.5)
        continue
    put(pad(tones[:3], bar + 0.4), t0, g=0.07)
    pattern = [0, 1, 2, 3, 2, 1, 2, 3]  # eighth-note piano arpeggio
    for i8, ti in enumerate(pattern):
        m = tones[ti] + (12 if (i8 == 3 and b % 2) else 0)
        put(piano(m, 1.1, 0.85 if i8 % 2 else 1.0), t0 + i8 * B / 2, pan=0.25 * np.sin(i8), g=0.10)
    if full:
        for beat in range(4):
            put(kick(), t0 + beat * B, g=0.42 if beat % 2 == 0 else 0.3)
            if beat in (1, 3): put(clap(), t0 + beat * B, pan=0.05, g=0.22)
        for s16 in range(16):
            put(shaker(), t0 + s16 * B / 4, pan=0.35, g=0.10 if s16 % 2 else 0.05)
        for e in range(8):  # bass eighths, octave pop on the "and" of 4
            put(bass(root - 12 + (12 if e == 7 else 0), B / 2 * 0.95), t0 + e * B / 2, g=0.20)
    if lead_on:
        ph = (b - 6) % 4
        for off, m, beats in melody:
            if ph * 4 <= off < ph * 4 + 4:
                put(lead(m, beats * B * 1.05), t0 + (off - ph * 4) * B, pan=-0.1, g=0.07)

def reverb(x, seed):
    g = np.random.default_rng(seed); n = int(1.6 * SR)
    ir = g.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.5); ir[0] = 0; ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << (len(x) + n - 2).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * 0.85 + y * 0.25

L = reverb(L, 1); R = reverb(R, 2)
end = int(DUR * SR)
L, R = L[:end], R[:end]
fi, fo = int(0.3 * SR), int(1.8 * SR)
for c in (L, R):
    c[:fi] *= np.linspace(0, 1, fi); c[-fo:] *= np.linspace(1, 0, fo)
pk = max(np.abs(L).max(), np.abs(R).max()); L, R = L / pk * 0.7, R / pk * 0.7
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.stack([L, R], 1) * 32767).astype(np.int16).tobytes())
print('wrote', OUT, f'{DUR:.1f}s')
