"""Synthesizes Lensmith's built-in sound library (original, made in code — no samples).

    python synth.py <out dir>     -> <out dir>/<name>.ogg   (needs numpy and ffmpeg with libvorbis)

Effects are short mono clips; music loops are seamless and a whole number of bars long.
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
SR = 22050
rng = np.random.default_rng(7)


def t(sec):
    return np.arange(int(SR * sec)) / SR


def env(n, attack=0.005, decay=None, sustain=1.0):
    """Linear attack then exponential decay to silence over the whole clip."""
    a = max(1, int(SR * attack))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a)
    if decay is None:
        decay = n / SR / 5
    k = np.arange(n - a) / SR
    e[a:] = sustain * np.exp(-k / decay)
    return e


def sweep(f0, f1, sec, shape=np.sin, curve=1.0):
    """Oscillator whose pitch glides from f0 to f1."""
    x = np.linspace(0, 1, int(SR * sec)) ** curve
    f = f0 + (f1 - f0) * x
    phase = 2 * np.pi * np.cumsum(f) / SR
    return shape(phase)


def square(p):
    return np.sign(np.sin(p)) * 0.6


def saw(p):
    return ((p / np.pi) % 2 - 1) * 0.6


def tri(p):
    return (2 / np.pi) * np.arcsin(np.sin(p))


def noise(sec):
    return rng.uniform(-1, 1, int(SR * sec))


def lowpass(x, cutoff):
    """Simple FFT brick-wall lowpass (fine for short clips)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[f > cutoff] *= 0.02
    return np.fft.irfft(X, len(x))


def highpass(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[f < cutoff] *= 0.02
    return np.fft.irfft(X, len(x))


def tone(freq, sec, shape=np.sin):
    return shape(2 * np.pi * freq * t(sec))


def seq(*parts, gap=0.0):
    out = []
    for p in parts:
        out.append(p)
        if gap:
            out.append(np.zeros(int(SR * gap)))
    return np.concatenate(out)


def mix_at(base, clip, start):
    i = int(start * SR)
    end = min(len(base), i + len(clip))
    base[i:end] += clip[: end - i]


def save(name, x, peak=0.85):
    x = np.asarray(x, dtype=np.float64)
    m = np.max(np.abs(x)) or 1
    rms = np.sqrt(np.mean(x ** 2)) or 1
    # Peak-normalize, but cap the average loudness so harsh square waves don't blast.
    x = x * min(peak / m, 0.2 / rms)
    # 4 ms fade in/out so clips never click.
    f = min(len(x) // 4, int(SR * 0.004))
    if f:
        x[:f] *= np.linspace(0, 1, f)
        x[-f:] *= np.linspace(1, 0, f)
    wav = OUT / f"{name}.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-c:a", "libvorbis", "-q:a", "3", str(OUT / f"{name}.ogg")], check=True)
    wav.unlink()


# ---------------------------------------------------------------- effects
save("pop", sweep(900, 250, 0.09) * env(int(SR * 0.09), 0.002, 0.03) + 0.3 * noise(0.09) * env(int(SR * 0.09), 0.001, 0.008))
bite = lowpass(noise(0.07), 1800) * env(int(SR * 0.07), 0.002, 0.02) + 0.5 * sweep(180, 90, 0.07) * env(int(SR * 0.07), 0.002, 0.025)
save("chomp", seq(bite, bite * 0.8, gap=0.04))
save("coin", seq(tone(988, 0.07, square) * env(int(SR * 0.07), 0.002, 0.2), tone(1319, 0.25, square) * env(int(SR * 0.25), 0.002, 0.09)))
save("jump", sweep(300, 820, 0.2, square, 0.7) * env(int(SR * 0.2), 0.003, 0.12))
boom_n = int(SR * 0.8)
save("boom", lowpass(noise(0.8), 700) * env(boom_n, 0.003, 0.18) + 0.9 * sweep(90, 35, 0.8) * env(boom_n, 0.003, 0.25))
sw = noise(0.35)
X = np.fft.rfft(sw)
save("swish", np.fft.irfft(X * np.exp(-((np.fft.rfftfreq(len(sw), 1 / SR) - 3500) / 1800) ** 2), len(sw)) * np.sin(np.linspace(0, np.pi, len(sw))) ** 2)
save("whoosh", lowpass(noise(0.45), 1200) * np.sin(np.linspace(0, np.pi, int(SR * 0.45))) ** 1.5)
save("click", highpass(noise(0.025), 2000) * env(int(SR * 0.025), 0.001, 0.004))
dn = int(SR * 0.9)
save("ding", (tone(1318, 0.9) + 0.4 * tone(2636, 0.9) + 0.2 * tone(3954, 0.9)) * env(dn, 0.002, 0.25))
save("buzz", lowpass(tone(110, 0.4, square) + 0.6 * tone(116, 0.4, saw), 2500) * env(int(SR * 0.4), 0.005, 0.5))
notes = [523, 659, 784, 1047]
save("win", seq(*[tone(f, 0.11 if i < 3 else 0.45, square) * env(int(SR * (0.11 if i < 3 else 0.45)), 0.003, 0.08 if i < 3 else 0.25) for i, f in enumerate(notes)]))
w1 = sweep(392, 370, 0.35, saw) * env(int(SR * 0.35), 0.01, 0.4)
w2 = sweep(370, 330, 0.35, saw) * env(int(SR * 0.35), 0.01, 0.4)
w3 = sweep(330, 220, 0.7, saw) * env(int(SR * 0.7), 0.01, 0.35)
save("lose", lowpass(seq(w1, w2, w3, gap=0.05), 2200))
save("laser", sweep(1600, 280, 0.16, square, 0.6) * env(int(SR * 0.16), 0.002, 0.08))
bn = int(SR * 0.3)
save("bounce", sweep(180, 420, 0.3) * (1 + 0.3 * np.sin(2 * np.pi * 18 * t(0.3))) * env(bn, 0.003, 0.12))
sp = lowpass(noise(0.6), 2500) * env(int(SR * 0.6), 0.005, 0.15)
for k in range(5):
    mix_at(sp, sweep(600 + 300 * k, 1400 + 300 * k, 0.05) * 0.3, 0.12 + 0.07 * k)
save("splash", sp)
save("tick", (tone(1800, 0.05) + highpass(noise(0.05), 3000) * 0.3) * env(int(SR * 0.05), 0.001, 0.01))
save("kick", sweep(160, 45, 0.28) * env(int(SR * 0.28), 0.001, 0.09))
save("snare", (highpass(noise(0.18), 1200) * 0.8 + tone(190, 0.18) * 0.4) * env(int(SR * 0.18), 0.001, 0.05))
save("hihat", highpass(noise(0.06), 6000) * env(int(SR * 0.06), 0.001, 0.012))
spk = np.zeros(int(SR * 0.6))
for k, f in enumerate([1568, 2093, 2637, 3136, 3951]):
    mix_at(spk, tone(f, 0.25) * env(int(SR * 0.25), 0.002, 0.07) * 0.6, k * 0.06)
save("sparkle", spk)
sh = highpass(noise(0.12), 1500) * env(int(SR * 0.12), 0.001, 0.02)
save("shutter", seq(sh, sh * 0.7, gap=0.04))
save("whip", highpass(sweep(400, 3000, 0.12, saw), 900) * env(int(SR * 0.12), 0.002, 0.05) + highpass(noise(0.12), 2500) * env(int(SR * 0.12), 0.001, 0.03))
save("powerup", sweep(300, 1200, 0.5, square) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 24 * t(0.5)))) * env(int(SR * 0.5), 0.005, 0.4))


# ---------------------------------------------------------------- music loops
def drums(bpm, bars, pattern):
    """pattern: per 16th step, a string of k(ick) s(nare) h(at)."""
    step = 60 / bpm / 4
    n = int(SR * step * 16 * bars)
    out = np.zeros(n)
    kick = sweep(150, 45, 0.25) * env(int(SR * 0.25), 0.001, 0.08)
    snare = (highpass(noise(0.16), 1200) * 0.7 + tone(190, 0.16) * 0.35) * env(int(SR * 0.16), 0.001, 0.045)
    hat = highpass(noise(0.05), 6500) * env(int(SR * 0.05), 0.001, 0.01) * 0.35
    for bar in range(bars):
        for s, hits in enumerate(pattern):
            at = (bar * 16 + s) * step
            if "k" in hits:
                mix_at(out, kick, at)
            if "s" in hits:
                mix_at(out, snare, at)
            if "h" in hits:
                mix_at(out, hat, at)
    return out


def loop_tail(x, sec=0.03):
    """Wrap any ringing past the end back to the start, so the loop is seamless."""
    return x


def notes_track(bpm, events, length_beats, shape, vol, decay=0.15):
    """events: (beat, midi note, length in beats)."""
    beat = 60 / bpm
    out = np.zeros(int(SR * beat * length_beats))
    for start, note, length in events:
        f = 440 * 2 ** ((note - 69) / 12)
        dur = length * beat
        clip = shape(2 * np.pi * f * t(dur)) * env(int(SR * dur), 0.005, decay) * vol
        mix_at(out, clip, start * beat)
    return out


# Arcade: 128 BPM, 4 bars (C - A min - F - G), chiptune bass + arpeggio + drums.
BPM = 128
chords = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]]
bass, arp = [], []
for bar, ch in enumerate(chords):
    for b in range(4):
        bass.append((bar * 4 + b, ch[0] - 12 if b % 2 == 0 else ch[0], 0.9))
    for s in range(16):
        arp.append((bar * 4 + s * 0.25, ch[s % 3] + 24, 0.22))
arcade = notes_track(BPM, bass, 16, square, 0.35, 0.2) + notes_track(BPM, arp, 16, square, 0.18, 0.08)
arcade += drums(BPM, 4, ["kh", "", "h", "", "sh", "", "h", "k", "kh", "", "h", "", "sh", "", "h", ""]) * 0.9
save("music-arcade", lowpass(arcade, 7000), 0.8)

# Chill: 90 BPM, soft triangle chords + lofi beat.
BPM = 90
chords = [[50, 53, 57, 60], [48, 52, 55, 59], [45, 48, 52, 55], [47, 50, 53, 57]]
pad, mel = [], []
for bar, ch in enumerate(chords):
    for n in ch:
        pad.append((bar * 4, n, 3.9))
    for k, b in enumerate([0, 1.5, 2.5, 3]):
        mel.append((bar * 4 + b, ch[(k + bar) % 4] + 12, 0.9))
chill = notes_track(BPM, pad, 16, tri, 0.18, 1.2) + notes_track(BPM, mel, 16, np.sin, 0.22, 0.35)
chill += drums(BPM, 4, ["kh", "", "h", "", "sh", "", "h", "", "h", "", "kh", "", "sh", "", "h", "h"]) * 0.6
save("music-chill", lowpass(chill, 4500), 0.75)

# Beat: 112 BPM drum loop (matches Rhythm Tap's tempo), 4 bars.
beat = drums(112, 4, ["kh", "", "h", "", "sh", "", "h", "", "kh", "", "kh", "", "sh", "", "h", "h"])
bassline = notes_track(112, [(b, 40 if (b // 2) % 2 == 0 else 43, 0.45) for b in range(16)], 16, saw, 0.3, 0.12)
save("music-beat", lowpass(beat + lowpass(bassline, 900), 9000), 0.8)

print("sounds:", sorted(p.stem for p in OUT.glob("*.ogg")))
