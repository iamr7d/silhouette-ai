"""Put the two films together: pictures, narration, music, the session's clicks, and the closing credits.

LinkedIn (16:9): the whole framed session (film/demo_video.mp4), then the credits (film/credits_16x9.mp4).
Reel (9:16): the night on the cloth (film/part1.mp4), the strongest moments of the studio (film/demo_vertical.mp4),
then the credits (film/credits_9x16.mp4).

The narration is a documentary voice telling the story behind the project, spoken by a Microsoft neural voice
(Prabhat, Indian English, through edge-tts; the lines are kept in film/vo/) and placed line by line on the pictures. The music (tools/mix_audio.py) dips
under each line and comes back between them; the clicks sit on top, quietly. Each film is levelled to -14 LUFS.

Writes film/silhouette-ai-demo.mp4 and film/silhouette-ai-reel.mp4; with --no-voice, the same films with only the
music and the clicks (silhouette-ai-demo-novoice.mp4, silhouette-ai-reel-novoice.mp4); with --malayalam, the Reel
and a 16:9 cut with Rahulraj's own Malayalam narration, subtitled in English (silhouette-ai-reel-ml.mp4, silhouette-ai-demo-ml.mp4).
Usage: python tools/finish.py [--no-voice | --malayalam]
"""
import subprocess
import sys
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


# Rahulraj's own Malayalam reading of the Reel (film/vo/ml/take.m4a, script in film/voiceover-malayalam.md). It runs
# longer than the English, so the Reel is cut to it: (file, start, end, hold at the end) and each line's place.
ML_TAKE = VO / "ml" / "take.m4a"
REEL_ML_CUTS = [
    ("part1.mp4", 0.0, 19.5, 0),
    ("demo_vertical_nocap.mp4", 14.0, 17.8, 0),  # the show playing on the timeline
    ("demo_vertical_nocap.mp4", 18.4, 29.6, 0),  # Hanuman from the library, dragged across the cloth
    ("demo_vertical_nocap.mp4", 30.0, 34.6, 0),  # a ready-made walk
    ("demo_vertical_nocap.mp4", 45.5, 49.0, 0),  # the lamps
    ("demo_vertical_nocap.mp4", 35.6, 40.6, 0),  # Ravana pulled off the cloth
    ("demo_vertical_nocap.mp4", 41.0, 44.6, 0),  # the back view
    ("demo_vertical_nocap.mp4", 62.0, 68.6, 0),  # Rama cut and turned in 3D
    ("demo_vertical_nocap.mp4", 70.4, 75.6, 3.0),  # mapping to motors, held while the line ends
]
# The same reading over the 16:9 session: the site, then the studio in the order the lines tell it.
DEMO_ML_CUTS = [
    ("demo_video_nocap.mp4", 0.0, 13.2, 0),    # the site: the night, the lamps lit by scrolling, Malayalam
    ("demo_video_nocap.mp4", 13.6, 17.8, 0),   # the show playing on the timeline
    ("demo_video_nocap.mp4", 18.2, 29.6, 0),   # Hanuman from the library, dragged across the cloth
    ("demo_video_nocap.mp4", 30.0, 34.6, 0),   # a ready-made walk
    ("demo_video_nocap.mp4", 45.5, 49.0, 0),   # the lamps
    ("demo_video_nocap.mp4", 56.0, 59.6, 0),   # the Story's scenes
    ("demo_video_nocap.mp4", 35.6, 40.6, 0),   # Ravana pulled off the cloth
    ("demo_video_nocap.mp4", 41.0, 44.6, 0),   # the back view
    ("demo_video_nocap.mp4", 60.2, 68.6, 0),   # Rama cut and turned in 3D
    ("demo_video_nocap.mp4", 70.4, 75.6, 2.5),  # mapping to motors, held while the line ends
]
DEMO_ML = [(0.6, 0.64, 13.88), (14.4, 14.62, 25.70), (26.0, 26.66, 41.96), (41.7, 42.56, 50.70),
           (50.3, 51.14, 56.40), (57.4, 56.92, 64.78), (66.0, 65.46, 73.81)]

# English subtitles for the Malayalam lines, a line at a time; a line in parts is shown part by part.
SUBS_ML = [
    ["A few years ago, I set out to make a film about Tholpavakoothu, the shadow puppetry of Kerala.",
     "The film never happened. But the art never left me."],
    ["Talking with Vipin Viswanathan Pulavar, one question remained:", "how do we carry this art forward?"],
    ["That is how I made Silhouette.ai.", "A studio that runs in the browser.",
     "Every puppet, every lamp and the story, on one timeline."],
    ["Move a puppet away from the cloth.", "Or watch from behind it."],
    ["Turn each puppet in 3D, and cut it into parts that move."],
    ["With the same timeline, move real puppets through motors."],
    ["Silhouette.ai.", "Open source, for everyone who wants to carry this art forward."],
]

SUB = """<html><head><style>
@font-face { font-family: G; src: url('{base}fonts/geist.woff2'); }
html, body { margin: 0; background: transparent; width: {w}px; }
p { margin: 0 auto; width: {tw}px; text-align: center; font: 500 {fs}px/1.3 G; color: #fff;
  text-shadow: 0 2px 4px rgba(0,0,0,.95), 0 0 10px rgba(0,0,0,.85), 0 0 28px rgba(0,0,0,.75); padding: 24px 0; }
</style></head><body><p>{text}</p></body></html>"""


def subtitles(spans, shape):
    """Each part of each line as an image, with when it shows: [(png, start, end)]."""
    from playwright.sync_api import sync_playwright
    w, tw, fs = (1080, 940, 44) if shape == "9x16" else (1920, 1500, 40)
    out = []
    (OUT / "subs").mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": w, "height": 400})
        page.goto("http://localhost:8765/film-studio.html")
        for li, ((a, b), parts) in enumerate(zip(spans, SUBS_ML)):
            weights = [len(t) for t in parts]
            t = a
            for pi, text in enumerate(parts):
                d = (b - a) * weights[pi] / sum(weights)
                png = OUT / "subs" / f"{shape}_{li}_{pi}.png"
                html = SUB.replace("{base}", "http://localhost:8765/").replace("{text}", text)
                page.set_content(html.replace("{w}", str(w)).replace("{tw}", str(tw)).replace("{fs}", str(fs)))
                page.evaluate("document.fonts.ready")
                page.wait_for_timeout(120)
                page.locator("p").screenshot(path=str(png), omit_background=True)
                out.append((png, t, t + d + (0.3 if pi == len(parts) - 1 else 0)))
                t += d
        browser.close()
    return out


def burn(src, subs, shape, dst):
    """Lay the subtitles over a finished film: in 9:16 above the studio, in 16:9 along the bottom."""
    SHOW_END = REEL_ML_CUTS[0][2] - FADE
    from PIL import Image
    if shape == "9x16":  # a subtitle running across the cut to the studio moves up with it
        subs = [part for png, a, b in subs
                for part in ([(png, a, SHOW_END), (png, SHOW_END, b)] if a < SHOW_END < b else [(png, a, b)])]
    args, chain, last = ["-i", str(src)], "", "0:v"
    for i, (png, a, b) in enumerate(subs):
        h = Image.open(png).height
        if shape == "9x16":  # over the opening show, low in the frame clear of the moon; then above the studio
            y = f"{1560 - h // 2}" if a < SHOW_END else f"{200 - h // 2}"
        else:
            y = f"H-{60 + h}"
        args += ["-i", str(png)]
        nxt = "v" if i == len(subs) - 1 else f"s{i}"
        chain += f"[{last}][{i + 1}:v]overlay=x=(W-w)/2:y={y}:enable='between(t,{a:.2f},{b:.2f})'[{nxt}];"
        last = nxt
    chain = chain[:-1]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "warning", *args, "-filter_complex", chain, "-map", "[v]", "-map", "0:a",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy",
                    "-movflags", "+faststart", str(dst)], check=True)
    print("wrote", dst)


# (seconds into the Reel, start and end in the take)
REEL_ML = [(0.6, 0.64, 13.88), (14.4, 14.62, 25.70), (26.0, 26.66, 41.96), (42.4, 42.56, 50.70),
           (51.0, 51.14, 56.40), (57.4, 56.92, 64.78), (66.0, 65.46, 73.81)]


# The phone take clips in places, booms (rumble and too much low end), is dull where speech is clearest (3-6 kHz),
# and comes in slightly mismatched stereo. In order: to mono, the clipped peaks rebuilt, rumble off, a little hiss off,
# the boom thinned, presence and a little air back, sibilance softened, levelled, and held under a ceiling.
VOICE_CLEAN = ("pan=mono|c0=0.5*c0+0.5*c1,adeclip,highpass=f=90,afftdn=nr=12:nf=-50,"
               "equalizer=f=220:t=q:w=1:g=-4,equalizer=f=3500:t=q:w=1.2:g=5,equalizer=f=9000:t=q:w=1:g=2,"
               "deesser=i=0.4,acompressor=threshold=-24dB:ratio=3:attack=6:release=160:makeup=2,alimiter=limit=0.89")


def own_voice(lines):
    """Lines cut from the recorded take, cleaned (VOICE_CLEAN), each with a little room either side."""
    clean = VO / "ml" / "take_clean.wav"
    if not clean.exists() or clean.stat().st_mtime < max(ML_TAKE.stat().st_mtime, Path(__file__).stat().st_mtime):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(ML_TAKE), "-af", VOICE_CLEAN,
                        "-ar", str(RATE), "-ac", "2", str(clean)], check=True)
    take = mix_audio.read_wav(clean)
    return [(at, take[max(0, int((a - 0.15) * RATE)): int((b + 0.25) * RATE)]) for at, a, b in lines]


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
    lay.spans = []
    for at, c in clips:
        at = max(at, end + 0.35)  # never over the last line
        loud = np.nonzero(np.abs(c).max(1) > 0.004)[0]  # the voice's own silence before and after
        c = c[max(0, loud[0] - RATE // 8): loud[-1] + RATE // 4].copy()
        # every line at the same loudness, not the same peak, so none sounds nearer or further than the rest
        c *= 0.11 / max(1e-6, np.sqrt((c[np.abs(c).max(1) > 0.01] ** 2).mean()))
        c /= max(1.0, np.abs(c).max() / 0.95)
        fi, fo = RATE // 50, RATE // 15  # short fades, so no cut clicks
        c[:fi] *= np.linspace(0, 1, fi)[:, None]
        c[-fo:] *= np.linspace(1, 0, fo)[:, None]
        s = int(at * RATE)
        e = min(n, s + len(c))
        voice[s:e] += c[: e - s]
        speaking[s:e] = 1
        end = at + len(c) / RATE
        lay.spans.append((at, end))
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


def linkedin(clicks, voice=True):
    sfx = "" if voice else "_novoice"
    session, credits = length(OUT / "demo_video.mp4"), length(OUT / f"credits_16x9{sfx}.mp4")
    total = session - FADE + credits
    print("LinkedIn narration")
    mix(total, speak(LINKEDIN, "li") if voice else [], clicks, OUT / "demo_mix.wav")
    n = 2
    chain = (f"[0:v]fps={FPS},setsar=1,format=yuv420p[a];[1:v]fps={FPS},setsar=1,format=yuv420p[b];"
             f"[a][b]xfade=transition=fade:duration={FADE}:offset={session - FADE}[v];"
             f"[{n}:a]loudnorm=I=-14:TP=-1.5:LRA=9[a]")
    mux(["-i", str(OUT / "demo_video.mp4"), "-i", str(OUT / f"credits_16x9{sfx}.mp4")], chain, OUT / "demo_mix.wav",
        total, OUT / f"silhouette-ai-demo{sfx.replace('_', '-')}.mp4")


def reel(clicks, voice=True, cuts=None, clips=None, sfx=None, shape="9x16", name="reel"):
    """A film cut from pieces: the first joined to the rest by a fade, then the credits."""
    sfx = sfx if sfx is not None else ("" if voice else "_novoice")
    size = "1080:1920" if shape == "9x16" else "1920:1080"
    cuts = [c if len(c) == 4 else (*c, 0) for c in (cuts or REEL_CUTS)]
    inputs, chain, labels = [], "", []
    for i, (f, a, b, hold) in enumerate(cuts):
        inputs += ["-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", str(OUT / f)]
        pad = f",tpad=stop_mode=clone:stop_duration={hold}" if hold else ""
        chain += (f"[{i}:v]setpts=PTS-STARTPTS,fps={FPS}{pad},scale={size},setsar=1,format=yuv420p,"
                  f"settb=1/{FPS}[v{i}];")
        labels.append(f"[v{i}]")
    n = len(cuts)
    credits = length(OUT / f"credits_{shape}{sfx}.mp4")
    inputs += ["-i", str(OUT / f"credits_{shape}{sfx}.mp4")]
    chain += f"[{n}:v]setpts=PTS-STARTPTS,fps={FPS},scale={size},setsar=1,format=yuv420p,settb=1/{FPS}[cr];"
    chain += f"{''.join(labels[1:])}concat=n={n - 1}:v=1:a=0,settb=1/{FPS}[studio];"
    show_len = cuts[0][2] - cuts[0][1]
    studio_len = sum(b - a + hold for f, a, b, hold in cuts[1:])
    chain += f"[v0][studio]xfade=transition=fade:duration={FADE}:offset={show_len - FADE}[ss];"
    body = show_len - FADE + studio_len
    chain += f"[ss][cr]xfade=transition=fade:duration={FADE}:offset={body - FADE}[v];"
    total = body - FADE + credits
    chain += f"[{n + 1}:a]loudnorm=I=-14:TP=-1.5:LRA=9[a]"

    # each studio cut's clicks where its picture lands
    track = np.zeros((int(total * RATE) + RATE, 2), np.float32)
    at = show_len - FADE
    for f, a, b, hold in cuts[1:]:
        seg = clicks[int(a * RATE): int(b * RATE)]
        s = int(at * RATE)
        track[s: s + len(seg)] += seg[: len(track) - s]
        at += b - a + hold
    print(name, "narration")
    if clips is None:
        clips = speak(REEL, "reel") if voice else []
    mix(total, clips, track, OUT / f"{name}_mix.wav")
    out = OUT / f"silhouette-ai-{name}{sfx.replace('_', '-')}.mp4"
    mux(inputs, chain, OUT / f"{name}_mix.wav", total, out)
    if sfx == "_ml":  # English subtitles of the Malayalam
        plain = out.with_name(out.stem + "-plain.mp4")
        out.replace(plain)
        burn(plain, subtitles(lay.spans, shape), shape, out)
        plain.unlink()


def main():
    clicks = mix_audio.read_wav(OUT / "demo_clicks.wav")
    if "--malayalam" in sys.argv:
        reel(clicks, cuts=REEL_ML_CUTS, clips=own_voice(REEL_ML), sfx="_ml")
        reel(clicks, cuts=DEMO_ML_CUTS, clips=own_voice(DEMO_ML), sfx="_ml", shape="16x9", name="demo")
        return
    voice = "--no-voice" not in sys.argv
    linkedin(clicks, voice)
    reel(clicks, voice)


if __name__ == "__main__":
    main()
