"""Put the two films together: pictures, narration, music, the session's clicks, and the closing credits.

LinkedIn (16:9): the whole framed session (film/demo_video.mp4), then the credits (film/credits_16x9.mp4).
Reel (9:16): the night on the cloth (film/part1.mp4), the strongest moments of the studio (film/demo_vertical.mp4),
then the credits (film/credits_9x16.mp4).

The narration is a documentary voice telling the story behind the project, spoken by a Microsoft neural voice
(Prabhat, Indian English, through edge-tts; the lines are kept in film/vo/) and placed line by line on the pictures. The music (tools/mix_audio.py) dips
under each line and comes back between them; the clicks sit on top, quietly. Each film is levelled to -14 LUFS.

Writes film/silhouette-ai-demo.mp4 and film/silhouette-ai-reel.mp4.
Usage: python tools/finish.py
"""
import subprocess
from pathlib import Path

import numpy as np

import mix_audio  # tools/mix_audio.py: the music, and reading and writing sound

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "film"
VO = OUT / "vo"
FPS = 30
RATE = mix_audio.RATE
VOICE, PACE = "en-IN-PrabhatNeural", "+0%"
THOL = "Tholpavakoothu"

# (seconds into the film, words)
LINKEDIN = [
    (0.8, f"A few years ago, I set out to make a film about {THOL}, the leather shadow puppetry of Kerala. "
          "It never happened. But the art stayed with me."),
    (14.0, "I spent hours talking with Vipin Viswanathan Pulavar. The puppeteers themselves were asking how to keep "
           "this art alive, and carry it further."),
    (24.6, "So I built Silhouette A I: a studio in the browser, where figures, lamps, story and sound sit on one "
           "timeline, like a film edit."),
    (35.2, "Pull a figure off the cloth, or watch from behind it, where the puppeteers stand."),
    (44.8, "Twenty-one lamps on the beam, each its own light."),
    (49.5, "I took the idea to Hooman Samani at the Creative Computing Institute, and his guidance pushed me to build it."),
    (59.9, "Each figure turns in 3D, and can be cut into parts that move on their joints."),
    (70.3, "And with every puppet wired to motors, the same timeline can play real figures."),
    (78.0, "Silhouette A I. Open source, for anyone who wants to carry it on."),
]

# (file, start, end) in seconds; studio times are in the recorded session
REEL_CUTS = [
    ("part1.mp4", 0.0, 19.5),           # the moon, the lamps lighting, Ganapati, Rama and Sita, Ravana looming
    ("demo_vertical.mp4", 14.0, 17.5),  # the studio: the show playing on the timeline
    ("demo_vertical.mp4", 20.6, 27.1),  # Hanuman from the library, dragged across the cloth: keyframes
    ("demo_vertical.mp4", 35.6, 40.6),  # Ravana pulled off the cloth
    ("demo_vertical.mp4", 41.0, 44.6),  # the back view
    ("demo_vertical.mp4", 61.5, 69.5),  # Rama cut and turned in 3D
    ("demo_vertical.mp4", 70.5, 75.4),  # mapping to motors
]
FADE = 0.5  # between the show and the studio, and into the credits; the studio cuts are hard

REEL = [
    (0.6, f"A few years ago, I set out to make a film about {THOL}, the leather shadow puppetry of Kerala. "
          "It never happened. But the art stayed with me."),
    (13.2, "Talking with Vipin Viswanathan Pulavar, one question stayed: how do we carry this art further?"),
    (20.2, "So I built Silhouette A I. A studio in the browser, where every figure, lamp and story sits on one timeline."),
    (29.5, "Pull a figure off the cloth. Or watch from behind it."),
    (38.1, "Turn each figure in 3D, and cut it into parts that move."),
    (46.1, "And the same timeline can play real puppets, on motors."),
    (51.5, "Silhouette A I. Open source, for anyone who wants to carry it on."),
]


def speak(lines, tag):
    """Each line spoken once (kept in film/vo/), laid at its time; returns the voice track and where it speaks."""
    clips = []
    for i, (at, text) in enumerate(lines):
        path = VO / f"{tag}_{i:02d}.mp3"
        key = VO / f"{tag}_{i:02d}.txt"
        if not path.exists() or not key.exists() or key.read_text(encoding="utf-8") != f"{VOICE} {PACE} {text}":
            subprocess.run(["edge-tts", "--voice", VOICE, f"--rate={PACE}", "--text", text, "--write-media", str(path)],
                           check=True)
            key.write_text(f"{VOICE} {PACE} {text}", encoding="utf-8")
        clips.append((at, mix_audio.pcm(path)))
    return clips


def lay(clips, secs):
    n = int(secs * RATE)
    voice = np.zeros((n, 2), np.float32)
    speaking = np.zeros(n, np.float32)
    end = 0.0
    for at, c in clips:
        at = max(at, end + 0.35)  # never over the last line
        loud = np.nonzero(np.abs(c).max(1) > 0.01)[0]  # the voice's own silence before and after
        c = c[max(0, loud[0] - RATE // 20): loud[-1] + RATE // 8]
        c = c / max(1e-6, np.abs(c).max()) * 0.8
        s = int(at * RATE)
        e = min(n, s + len(c))
        voice[s:e] += c[: e - s]
        speaking[s:e] = 1
        end = at + len(c) / RATE
        print(f"  {at:5.1f}-{end:5.1f}s")
    return voice, speaking


def duck(speaking, low=0.22):
    """The music's level: down under the voice, eased in 0.35 s before a line and back out over a second after."""
    n = len(speaking)
    hop = RATE // 100
    s = speaking[::hop].copy()
    pre, post = 35, 100
    held = s.copy()
    for i in np.nonzero(s)[0]:
        held[max(0, i - pre): i + post] = 1
    k = np.hanning(41)
    k /= k.sum()
    env = np.convolve(held, k, mode="same")
    g = 1 - (1 - low) * np.clip(env, 0, 1)
    return np.interp(np.arange(n), np.arange(len(g)) * hop, g).astype(np.float32)[:, None]


def mix(secs, clips, clicks, path):
    voice, speaking = lay(clips, secs)
    music = mix_audio.bed(secs, fade_in=1.2, fade_out=3.0)[: len(voice)] * duck(speaking)
    track = music + voice * 0.9
    track[: len(clicks)] += clicks[: len(track)] * 0.8
    mix_audio.write_wav(path, track)


def mux(video_args, chain, audio, secs, out):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "warning", *video_args, "-i", str(audio), "-filter_complex", chain,
         "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
         "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-ar", str(RATE), "-movflags", "+faststart",
         "-t", f"{secs:.3f}", str(out)], check=True)
    print("wrote", out, f"({secs:.1f} s)")


def length(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                                capture_output=True, text=True, check=True).stdout)


def linkedin(clicks):
    session, credits = length(OUT / "demo_video.mp4"), length(OUT / "credits_16x9.mp4")
    total = session - FADE + credits
    print("LinkedIn narration")
    mix(total, speak(LINKEDIN, "li"), clicks, OUT / "demo_mix.wav")
    n = 2
    chain = (f"[0:v]fps={FPS},setsar=1,format=yuv420p[a];[1:v]fps={FPS},setsar=1,format=yuv420p[b];"
             f"[a][b]xfade=transition=fade:duration={FADE}:offset={session - FADE}[v];"
             f"[{n}:a]loudnorm=I=-14:TP=-1.5:LRA=9[a]")
    mux(["-i", str(OUT / "demo_video.mp4"), "-i", str(OUT / "credits_16x9.mp4")], chain, OUT / "demo_mix.wav", total,
        OUT / "silhouette-ai-demo.mp4")


def reel(clicks):
    inputs, chain, labels = [], "", []
    for i, (f, a, b) in enumerate(REEL_CUTS):
        inputs += ["-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", str(OUT / f)]
        chain += f"[{i}:v]setpts=PTS-STARTPTS,fps={FPS},scale=1080:1920,setsar=1,format=yuv420p,settb=1/{FPS}[v{i}];"
        labels.append(f"[v{i}]")
    n = len(REEL_CUTS)
    credits = length(OUT / "credits_9x16.mp4")
    inputs += ["-i", str(OUT / "credits_9x16.mp4")]
    chain += f"[{n}:v]setpts=PTS-STARTPTS,fps={FPS},scale=1080:1920,setsar=1,format=yuv420p,settb=1/{FPS}[cr];"
    chain += f"{''.join(labels[1:])}concat=n={n - 1}:v=1:a=0,settb=1/{FPS}[studio];"
    show_len = REEL_CUTS[0][2] - REEL_CUTS[0][1]
    studio_len = sum(b - a for f, a, b in REEL_CUTS[1:])
    chain += f"[v0][studio]xfade=transition=fade:duration={FADE}:offset={show_len - FADE}[ss];"
    body = show_len - FADE + studio_len
    chain += f"[ss][cr]xfade=transition=fade:duration={FADE}:offset={body - FADE}[v];"
    total = body - FADE + credits
    chain += f"[{n + 1}:a]loudnorm=I=-14:TP=-1.5:LRA=9[a]"

    # each studio cut's clicks where its picture lands
    track = np.zeros((int(total * RATE) + RATE, 2), np.float32)
    at = show_len - FADE
    for f, a, b in REEL_CUTS[1:]:
        seg = clicks[int(a * RATE): int(b * RATE)]
        s = int(at * RATE)
        track[s: s + len(seg)] += seg[: len(track) - s]
        at += b - a
    print("Reel narration")
    mix(total, speak(REEL, "reel"), track, OUT / "reel_mix.wav")
    mux(inputs, chain, OUT / "reel_mix.wav", total, OUT / "silhouette-ai-reel.mp4")


def main():
    clicks = mix_audio.read_wav(OUT / "demo_clicks.wav")
    linkedin(clicks)
    reel(clicks)


if __name__ == "__main__":
    main()
