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


# Rahulraj's own Malayalam narration (film/vo/ml/take.m4a; what he says, with an English translation, is in
# film/vo/ml/transcript.json). It is used as recorded, sentence by sentence at the moment it was said, and the pictures
# are cut to what each sentence is about: (file, start, end, hold at the end).
ML_TAKE = VO / "ml" / "take.m4a"
# each sentence's start and end in the take, found from the pauses between them
SENTENCES = [(0.63, 3.50), (3.79, 10.51), (11.22, 13.57), (14.63, 21.83), (22.45, 25.69), (26.65, 32.32),
             (33.15, 41.94), (42.87, 46.10), (46.45, 50.70), (51.16, 56.39), (56.93, 67.96), (69.39, 73.27)]
# What is on screen while each sentence (or group of sentences) is said: (file, start, longest it may run). Each
# group's shots fill the time until the next group begins; nothing is shown twice. Sentences are numbered from 0.
V, D = "demo_vertical_ig_nocap.mp4", "demo_video_nocap.mp4"  # the Reel's studio in Instagram's safe layout
# The Reel, about a minute: the three sentences that repeat others are left out, the pauses are shortened and the
# reading runs a little quicker (its pitch kept); the credits are the short ones.
REEL_ML = dict(keep=[0, 1, 3, 5, 6, 7, 8, 10, 11], tempo=1.06, gap=0.45, credits="_ml_short", plan=[
    ([0, 1, 3], [("part1.mp4", 0.0, 22.0)]),              # the art, UAL, Vipin chettan and Hooman Samani: the show
    ([5], [(V, 14.0, 3.8), (V, 18.4, 6.2)]),               # like editing a film: the studio, a figure from the library
    ([6], [(V, 24.6, 5.0), (V, 45.5, 4.5)]),               # which puppet moves when, which light: keyframes, the lamps
    ([7], [(V, 62.4, 6.0)]),                               # puppets in 3D
    ([8], [(V, 70.4, 5.0)]),                               # real puppets and lights through an Arduino
    ([10], [(V, 41.0, 3.6), (V, 35.6, 5.0), (V, 30.0, 4.6)]),  # not to replace the art: behind the cloth, Ravana, a walk
    ([11], [(V, 50.5, 5.0)]),                              # happy to collaborate: the lamps coming back up
])
# The 16:9 film: every sentence, as it was said, then the full credits.
DEMO_ML = dict(keep=list(range(12)), tempo=1.0, gap=None, credits="_ml", plan=[
    ([0, 1, 2], [(D, 0.0, 13.2)]),                         # the art, UAL, coming back to it: the site
    ([3], [(D, 13.6, 4.2), (D, 30.0, 4.6)]),               # Vipin chettan and Hooman Samani: the studio playing, a walk
    ([4], [(D, 56.0, 3.6)]),                               # this idea: the Story's scenes
    ([5], [(D, 18.2, 6.4)]),                               # like editing a film: a figure from the library
    ([6], [(D, 24.6, 5.0), (D, 45.5, 5.0)]),               # which puppet moves when, which light: keyframes, the lamps
    ([7], [(D, 62.4, 5.0)]),                               # puppets in 3D
    ([8], [(D, 70.4, 5.0)]),                               # real puppets and lights through an Arduino
    ([9], [(D, 35.6, 5.0)]),                               # an open-source studio in the browser
    ([10], [(D, 41.0, 3.6), (D, 50.5, 5.0), (D, 67.4, 2.2)]),  # not to replace the art
    ([11], []),                                            # happy to collaborate: over the credits
])

# English subtitles of what is said, as (start, end) in the take; long sentences in parts, split where he pauses
SUBS_ML = [
    (0.63, 3.50, "Tholpavakoothu is a very old art form, Kerala's own."),
    (3.79, 6.68, "When I arrived at UAL, I really wanted to connect"),
    (6.68, 10.51, "an art form from home with technology."),
    (11.22, 13.57, "That is how I came back to Tholpavakoothu."),
    (14.63, 18.31, "Then I spoke with Vipin chettan, a master of this art,"),
    (18.31, 21.83, "and with Hooman Samani, the robotics professor at our university."),
    (22.45, 25.69, "It was from those conversations that I came to this idea."),
    (26.65, 30.41, "Simply put: what if we could create a Tholpavakoothu performance"),
    (30.41, 32.32, "the way we edit a film?"),
    (33.15, 38.68, "Which puppet moves when, which light comes on when:"),
    (38.68, 41.94, "we can set it all on a timeline, just like in Premiere Pro."),
    (42.87, 46.10, "We can also edit and animate the puppets in 3D."),
    (46.45, 50.70, "And with the same timeline, we can control real puppets and lights through an Arduino."),
    (51.16, 56.39, "I have made it as an open-source, browser-based studio."),
    (56.93, 59.90, "It is not meant to replace an art form."),
    (59.90, 67.96, "It is about whether technology can help us create, preserve and share it in a new way."),
    (69.39, 73.27, "If anyone would like to collaborate on this, I'm really happy to collab."),
]

SUB = """<html><head><style>
@font-face { font-family: G; src: url('{base}fonts/geist.woff2'); }
html, body { margin: 0; background: transparent; width: {w}px; }
p { margin: 0 auto; width: {tw}px; text-align: center; padding: 2px 0; }
/* film subtitles: white on a dark box that follows each line */
span { font: 500 {fs}px/1.55 G; color: #fff; background: rgba(0,0,0,.72); padding: 4px 14px;
  box-decoration-break: clone; -webkit-box-decoration-break: clone; }
</style></head><body><p><span>{text}</span></p></body></html>"""


def subtitles(shape, place):
    """Each subtitle as an image, with when it shows in the film: [(png, start, end)]. `place` turns a time in the
    take into a time in the film, or None for a sentence left out."""
    from playwright.sync_api import sync_playwright
    w, tw, fs = (1080, 940, 44) if shape == "9x16" else (1920, 1500, 40)
    out = []
    (OUT / "subs").mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": w, "height": 400})
        page.goto("http://localhost:8765/film-studio.html")
        for i, (a, b, text) in enumerate(SUBS_ML):
            fa, fb = place(a), place(b)
            if fa is None:
                continue
            png = OUT / "subs" / f"{shape}_{i:02d}.png"
            html = SUB.replace("{base}", "http://localhost:8765/").replace("{text}", text)
            page.set_content(html.replace("{w}", str(w)).replace("{tw}", str(tw)).replace("{fs}", str(fs)))
            page.evaluate("document.fonts.ready")
            page.wait_for_timeout(120)
            page.locator("p").screenshot(path=str(png), omit_background=True)
            out.append((png, fa, fb + 0.25))
        browser.close()
    return out


# What Instagram takes best for a Reel: H.264 High, 1080 x 1920 at 30 fps, a key frame every 2 s, about 8 Mbit/s
# (higher only makes it squeeze harder), BT.709 colour, and sound at 48 kHz (already levelled to -14 LUFS).
INSTA_VIDEO = ["-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-level", "4.1", "-crf", "19",
               "-maxrate", "8M", "-bufsize", "16M", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
               "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
               "-r", "30"]


def burn(src, subs, shape, dst, shows=()):
    """Lay the subtitles over a finished film. In 16:9 along the bottom; in 9:16 above the studio, and low in the frame,
    clear of the moon, while the show itself is on (`shows`: its spans); a subtitle running across a cut moves with it."""
    from PIL import Image
    for c in sorted({t for span in shows for t in span}):
        subs = [part for png, a, b in subs for part in ([(png, a, c), (png, c, b)] if a < c < b else [(png, a, b)])]
    args, chain, last = ["-i", str(src)], "", "0:v"
    for i, (png, a, b) in enumerate(subs):
        h = Image.open(png).height
        if shape == "9x16":
            low = any(x <= a < y for x, y in shows)
            y = f"{1330 - h // 2}" if low else f"{310 - h // 2}"  # inside Instagram's safe area
        else:
            y = f"H-{60 + h}"
        args += ["-i", str(png)]
        nxt = "v" if i == len(subs) - 1 else f"s{i}"
        chain += f"[{last}][{i + 1}:v]overlay=x=(W-w)/2:y={y}:enable='between(t,{a:.2f},{b:.2f})'[{nxt}];"
        last = nxt
    chain = chain[:-1]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "warning", *args, "-filter_complex", chain, "-map", "[v]", "-map", "0:a",
                    *(INSTA_VIDEO if shape == "9x16" else ["-c:v", "libx264", "-preset", "slow", "-crf", "18",
                                                           "-pix_fmt", "yuv420p"]),
                    "-c:a", "copy", "-movflags", "+faststart", str(dst)], check=True)
    if shape == "9x16":  # a cover to choose on upload: the opening, the moon and the title
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "1.2", "-i", str(dst), "-frames:v", "1", "-q:v", "2",
                        str(dst.with_name(dst.stem + "-cover.jpg"))], check=True)
    print("wrote", dst)



# The take was recorded with Dolby On, which already removes noise, shapes the tone, levels the voice and widens it to
# stereo, so it is used as it is: only the few peaks it clipped are rebuilt, and a ceiling keeps them from clipping
# again. (Cleaning it again, by EQ, noise reduction or a speech-enhancement model, only made it sound worse.)
VOICE_CLEAN = "adeclip,alimiter=limit=0.95"


def own_voice(lines, tempo=1.0):
    """Sentences cut from the recorded take, with its clipped peaks rebuilt (VOICE_CLEAN), each with a little room either side, to be laid
    where they were said."""
    clean = VO / "ml" / "take_clean.wav"
    if not clean.exists() or clean.stat().st_mtime < max(ML_TAKE.stat().st_mtime, Path(__file__).stat().st_mtime):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(ML_TAKE), "-af", VOICE_CLEAN,
                        "-ar", str(RATE), "-ac", "2", str(clean)], check=True)
    if tempo != 1.0:
        quick = VO / "ml" / f"take_clean_{tempo}.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(clean), "-af", f"atempo={tempo}", str(quick)],
                       check=True)
        clean = quick
    take = mix_audio.read_wav(clean)
    return [take[max(0, int((a / tempo - 0.15) * RATE)): int((b / tempo + 0.25) * RATE)] for a, b in lines]


def ml_film(clicks, spec, shape, name):
    """A film to Rahulraj's Malayalam narration: each kept sentence placed (as said, or one after another with
    `gap` between), and the pictures cut to the plan, then subtitles."""
    tempo, keep = spec["tempo"], spec["keep"]
    voices = own_voice([SENTENCES[i] for i in keep], tempo)
    starts, t = {}, 0.6
    for i in keep:
        a, b = SENTENCES[i]
        starts[i] = a - 0.12 if spec["gap"] is None else t
        t = starts[i] + (b - a) / tempo + (spec["gap"] or 0)
    ends = {i: starts[i] + (SENTENCES[i][1] - SENTENCES[i][0]) / tempo for i in keep}

    def place(x):
        for i in keep:
            a, b = SENTENCES[i]
            if a - 0.05 <= x <= b + 0.05:
                return starts[i] + 0.12 + (x - a) / tempo
        return None

    cuts = []
    groups = spec["plan"]
    for gi, (sents, shots) in enumerate(groups):
        if not shots:
            continue
        g0 = 0.0 if gi == 0 else starts[sents[0]]
        nxt = [starts[g[0][0]] for g in groups[gi + 1:] if g[1]]
        g1 = nxt[0] if nxt else ends[sents[-1]] + 0.9
        need = g1 - g0 + (FADE if gi == 0 else 0)
        for k, (f, a, most) in enumerate(shots):
            if need <= 0.05:
                break
            run = min(most, need)
            last = k == len(shots) - 1
            cuts.append((f, a, a + run, max(0.0, need - run) if last else 0))
            need -= run + (max(0.0, need - run) if last else 0)
    clips = [(starts[i], v) for i, v in zip(keep, voices)]
    reel(clicks, cuts=cuts, clips=clips, sfx="_ml", shape=shape, name=name, credits_sfx=spec["credits"], place=place)


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


def lay(clips, secs, gap=0.35):
    n = int(secs * RATE)
    voice = np.zeros((n, 2), np.float32)
    speaking = np.zeros(n, np.float32)
    end = 0.0
    lay.spans = []
    for at, c in clips:
        at = max(at, end + gap)  # never over the last line
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


def duck(speaking, low=0.2):
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


def mix(secs, clips, clicks, path, gap=0.35):
    voice, speaking = lay(clips, secs, gap)
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


def reel(clicks, voice=True, cuts=None, clips=None, sfx=None, shape="9x16", name="reel", credits_sfx=None, place=None):
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
    cr_file = OUT / f"credits_{shape}{sfx if credits_sfx is None else credits_sfx}.mp4"
    credits = length(cr_file)
    inputs += ["-i", str(cr_file)]
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
    mix(total, clips, track, OUT / f"{name}_mix.wav", gap=-1.0 if sfx == "_ml" else 0.35)
    out = OUT / f"silhouette-ai-{name}{sfx.replace('_', '-')}.mp4"
    mux(inputs, chain, OUT / f"{name}_mix.wav", total, out)
    if sfx == "_ml":  # English subtitles of the Malayalam
        shows, t = [], 0.0
        for k, (f, a, b, hold) in enumerate(cuts):
            if f.startswith("part"):
                shows.append((t, t + b - a - (FADE if k == 0 else 0)))
            t += b - a + hold - (FADE if k == 0 else 0)
        plain = out.with_name(out.stem + "-plain.mp4")
        out.replace(plain)
        burn(plain, subtitles(shape, place), shape, out, shows if shape == "9x16" else ())
        plain.unlink()


def main():
    clicks = mix_audio.read_wav(OUT / "demo_clicks.wav")
    if "--malayalam" in sys.argv:
        ml_film(clicks, REEL_ML, "9x16", "reel")
        ml_film(clicks, DEMO_ML, "16x9", "demo")
        return
    voice = "--no-voice" not in sys.argv
    linkedin(clicks, voice)
    reel(clicks, voice)


if __name__ == "__main__":
    main()
