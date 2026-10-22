"""Sound for the project films: the background music, and reading and writing sound.

The music is "Madhava mamava" (Raga Neelambari, Thalam Aadhi, composed by Narayana Theerthar), played by Vadasseri
Sivadas (nadaswaram) and Vishnuprasad Marar, Guruvayur (edakka), from Nadamohanam in Blue Planet Cinema's
Abhinavabharatham series (produced by K P Ravishankar, directed by Sharath A Haridasan). It is credited at the end of
both films and kept out of the repository and the site (film/bgm.mp3). Its first 21 seconds are silent, so it is
played from 22 s.

tools/finish.py lays the narration and the session's clicks (film/demo_clicks.wav) over it.

Usage:
  python tools/mix_audio.py --recover-old    # take the clicks back out of a demo mixed with the old track
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "film"
RATE = 48000
MUSIC = OUT / "bgm.mp3"
MUSIC_START = 22.0  # the recording is silent before this
LEVEL = 0.33  # the recording is loud (about -10 dB); this sits it under the clicks


def pcm(path, start=0.0, secs=None):
    args = ["ffmpeg", "-loglevel", "error", "-ss", f"{start:.3f}", "-i", str(path)]
    if secs is not None:
        args += ["-t", f"{secs:.3f}"]
    raw = subprocess.run(args + ["-f", "f32le", "-ac", "2", "-ar", str(RATE), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def bed(secs, fade_in=1.5, fade_out=2.5):
    """The music for a film `secs` long, faded in and out."""
    n = int(secs * RATE)
    out = np.zeros((n, 2), np.float32)
    m = pcm(MUSIC, MUSIC_START, secs)[:n] * LEVEL
    out[: len(m)] = m
    fi, fo = int(fade_in * RATE), int(fade_out * RATE)
    out[:fi] *= np.linspace(0, 1, fi)[:, None]
    out[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return out


def read_wav(path):
    with wave.open(str(path)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").reshape(-1, 2).astype(np.float32) / 32767


def write_wav(path, x):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def recover_old_clicks():
    """A demo mixed with the earlier track (assets/audio/pavakkoothu.mp3 at 0.42, 1.5 s fade in): its clicks."""
    sess = read_wav(OUT / "demo_sound.wav")
    old = pcm(ROOT / "assets" / "audio" / "pavakkoothu.mp3", 0, len(sess) / RATE)[: len(sess)] * 0.42
    fi = int(1.5 * RATE)
    old[:fi] *= np.linspace(0, 1, fi)[:, None]
    fo = int(2.5 * RATE)
    old[-fo:] *= np.linspace(1, 0, fo)[:, None]
    clicks = sess.copy()
    clicks[: len(old)] -= old
    clicks[np.abs(clicks) < 0.004] = 0
    write_wav(OUT / "demo_clicks.wav", clicks)


if __name__ == "__main__":
    if "--recover-old" in sys.argv:
        recover_old_clicks()
