"""The closing titles and credits for both films, made like a film's: the title fades up out of black over a faint
lamp glow and drifts slowly closer, then the credits roll and settle on the address, then black.

The title and the credits are set in the browser (Marcellus, Geist, Cormorant) and moved here, frame by frame, with
sub-pixel steps, a little film grain and a vignette.

Writes film/credits_16x9.mp4 and film/credits_9x16.mp4 (no sound), and the same without the narration's credit
(credits_*_novoice.mp4) for the films without a voice, and with Rahulraj's own Malayalam narration
(credits_*_ml.mp4).
Usage: python tools/credits.py [variant ...]     (variants: voice, novoice, ml, ml_short; all by default)
Needs python serve.py running, and Microsoft Edge.
"""
import io
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "film"
BASE = "http://localhost:8765/"
FPS = 30

# (role, name); a role alone is a heading, a name alone a line of its own
CREDITS = [
    ("Created by", "Rahulraj P V"),
    (None, "UAL Creative Computing Institute, London"),
    ("", ""),
    ("Tholpavakoothu guidance", "Vipin Viswanathan Pulavar"),
    ("Robotics guidance", "Hooman Samani"),
    ("", ""),
    ("Puppet figures", "Museu do Oriente, Lisbon"),
    ("Photographs", "Daderot, CC0"),
    ("", ""),
    ("Music", None),
    (None, "Madhava mamava"),
    ("Raga", "Neelambari"),
    ("Thalam", "Aadhi"),
    ("Composer", "Narayana Theerthar"),
    ("Nadaswaram", "Vadasseri Sivadas"),
    ("Edakka", "Vishnuprasad Marar, Guruvayur"),
    (None, "from Nadamohanam, in the Abhinavabharatham series"),
    (None, "Blue Planet Cinema"),
    ("Produced by", "K P Ravishankar"),
    ("Directed by", "Sharath A Haridasan"),
    ("", ""),
    ("Narration", "{narration}"),
    ("Type", "Marcellus, Geist, Manjari, Rachana"),
    ("", ""),
    ("With respect", None),
    (None, "to the pulavars, puppeteers and lamp keepers of Kerala,"),
    (None, "who have carried this art for generations"),
]

PAGE = """<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&display=swap"><style>
@font-face { font-family: G; src: url('{base}fonts/geist.woff2'); }
@font-face { font-family: C; font-style: italic; src: url('{base}fonts/cormorant-500-italic.woff2'); }
html, body { margin: 0; background: transparent; width: {w}px; }
#title { width: {w}px; padding: 60px 0; text-align: center; color: #f1ecdf; }
#title .w { font: 400 {tw}px/1 Marcellus; letter-spacing: .3em; margin-right: -.3em; text-transform: uppercase; }
#title .s { margin-top: {ts}px; font: 400 {ss}px/1 G; letter-spacing: .62em; margin-right: -.62em; text-transform: uppercase; color: #a89d8c; }
#title .t { margin-top: {tt}px; font: 500 italic {it}px/1.3 C; color: #cdbfa6; }
#roll { width: {w}px; padding: 40px 0; color: #efe8da; }
.r { display: grid; grid-template-columns: 1fr 1fr; column-gap: {gap}px; align-items: baseline; margin: {lm}px 0; }
.r .k { text-align: right; font: 400 {rk}px/1.2 G; letter-spacing: .2em; text-transform: uppercase; color: #968a79; }
.r .v { text-align: left; font: 400 {rv}px/1.25 Marcellus; letter-spacing: .03em; }
.h { margin: {hm}px 0 {lm2}px; text-align: center; font: 400 {rk}px/1 G; letter-spacing: .5em; margin-right: -.5em;
  text-transform: uppercase; color: #c9a25a; }
.o { margin: {lm}px 0; text-align: center; font: 500 italic {ro}px/1.3 C; color: #d9cdb6; }
.gap { height: {gh}px; }
#end { width: {w}px; padding: 60px 0; text-align: center; }
#end .w { font: 400 {ew}px/1 Marcellus; letter-spacing: .3em; margin-right: -.3em; text-transform: uppercase; color: #f1ecdf; }
#end .u { margin-top: {eu}px; font: 500 {es}px/1.7 G; color: #f2c46a; letter-spacing: .04em; }
#end .n { margin-top: {en}px; font: 400 {rk}px/1 G; letter-spacing: .5em; margin-right: -.5em; text-transform: uppercase; color: #968a79; }
</style></head><body>
<div id="title"><div class="w">Silhouette</div><div class="s">Studio · AI</div>
<div class="t">a studio for shadow puppetry, beginning with Tholpavakoothu</div></div>
<div id="roll">{rows}</div>
<div id="end"><div class="w">Silhouette</div><div class="u">silhouetteai.vercel.app<br>github.com/iamr7d/silhouette-ai</div>
<div class="n">Open source</div></div>
</body></html>"""

NARRATION = {"voice": "synthesised voice, Microsoft Prabhat", "novoice": None,
             "ml": "Rahulraj P V, in Malayalam", "ml_short": "Rahulraj P V, in Malayalam"}
# The short credits (a Reel of about a minute): the people and the music only, on one screen after the title.
SHORT = {"Created by", "Tholpavakoothu guidance", "Robotics guidance", "Music", "Raga", "Thalam", "Composer",
         "Nadaswaram", "Edakka", "Produced by", "Directed by", "Narration"}
SHORT_LINES = {"UAL Creative Computing Institute, London", "Madhava mamava",
               "from Nadamohanam, in the Abhinavabharatham series", "Blue Planet Cinema"}

SIZES = {
    "16x9": dict(w=1920, h=1080, tw=96, ts=30, ss=22, tt=56, it=40, gap=48, lm=12, rk=19, rv=34, hm=10, lm2=22, ro=34,
                 gh=46, ew=64, eu=40, es=30, en=40, secs=17.0),
    "9x16": dict(w=1080, h=1920, tw=74, ts=28, ss=20, tt=60, it=40, gap=36, lm=14, rk=18, rv=34, hm=10, lm2=24, ro=34,
                 gh=56, ew=56, eu=44, es=32, en=44, secs=15.0),
}


def rows(narration, short=False):
    out = []
    for k, v in CREDITS:
        if short and k not in SHORT and v not in SHORT_LINES and not (k == "" and v == ""):
            continue
        if k == "" and v == "" and (not out or out[-1] == '<div class="gap"></div>'):
            continue  # no gap at the top, nor two together
        if k == "Narration":
            if not narration:
                continue
            v = narration
        if k == "" and v == "":
            out.append('<div class="gap"></div>')
        elif v is None:
            out.append(f'<div class="h">{k}</div>')
        elif k is None:
            out.append(f'<div class="o">{v}</div>')
        else:
            out.append(f'<div class="r"><div class="k">{k}</div><div class="v">{v}</div></div>')
    while out and out[-1] == '<div class="gap"></div>':
        out.pop()
    return "".join(out)


def ease(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def render(page, name, sz, narration, short=False):
    w, h, secs = sz["w"], sz["h"], (8.5 if short else sz["secs"])
    html = PAGE.replace("{base}", BASE).replace("{rows}", rows(narration, short))
    for key, val in sz.items():
        html = html.replace("{" + key + "}", str(val))
    page.set_viewport_size({"width": w, "height": h})
    page.set_content(html)
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(800)
    shot = lambda sel: Image.open(io.BytesIO(page.locator(sel).screenshot(omit_background=True))).convert("RGBA")
    title, roll, end = shot("#title"), shot("#roll"), shot("#end")

    # a faint lamp glow behind the title, and a vignette over everything
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.hypot((xx - w / 2) / (w * 0.55), (yy - h * 0.5) / (h * 0.45))
    glow = np.clip(1 - d, 0, 1) ** 2
    vig = 1 - 0.55 * np.clip(np.hypot((xx - w / 2) / (w * 0.75), (yy - h / 2) / (h * 0.75)), 0, 1) ** 2.2
    rng = np.random.default_rng(3)
    grain = [rng.normal(0, 5.5, (h, w, 1)).astype(np.float32) for _ in range(6)]
    base = np.array([10, 9, 8], np.float32)

    # timing: title 0.6 to 5.4 s; the roll starts at 5.0 s and the end block comes to rest at secs - 2.6 s. The short
    # credits: the title to 2.8 s, then everything on one screen, held.
    t_roll0, t_rest = (2.5, 3.3) if short else (5.0, secs - 2.6)
    t_out = 2.0 if short else 4.4
    stack = Image.new("RGBA", (w, roll.height + h + end.height), (0, 0, 0, 0))
    stack.alpha_composite(roll, (0, h))
    end_top = h + roll.height + int(h * 0.12)
    stack = stack.crop((0, 0, w, end_top + end.height))
    full = Image.new("RGBA", (w, end_top + end.height + h), (0, 0, 0, 0))
    full.alpha_composite(stack)
    full.alpha_composite(end, (0, end_top))
    rest = end_top + end.height / 2 - h / 2  # scroll at which the end block is centred
    if short:  # the credits and the end block together, centred
        rest = (h + end_top + end.height) / 2 - h / 2
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", str(OUT / name)],
        stdin=subprocess.PIPE)
    n = round(secs * FPS)
    for i in range(n):
        t = i / FPS
        a_title = ease((t - 0.4) / (0.9 if short else 1.6)) * (1 - ease((t - t_out) / (0.7 if short else 1.0)))
        a_glow = 0.10 * ease((t - 0.3) / 2.0) * (1 - ease((t - t_out - 0.2) / 1.4)) + 0.05 * ease((t - t_rest + 1.0) / 1.5)
        fade = 1 - ease((t - (secs - 0.9)) / 0.9)
        bg = base[None, None, :] + glow[..., None] * np.array([255, 170, 80], np.float32) * a_glow
        frame = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).convert("RGBA")
        if a_title > 0:
            s = 1.0 + 0.035 * (t / 5.4)  # a slow push in
            tw_, th_ = title.width * s, title.height * s
            t_img = title.resize((round(tw_), round(th_)), Image.LANCZOS)
            t_img.putalpha(t_img.getchannel("A").point(lambda p: int(p * a_title)))
            frame.alpha_composite(t_img, (round((w - tw_) / 2), round((h - th_) / 2)))
        if t > t_roll0:
            # constant speed, easing out as the end block arrives
            u = (t - t_roll0) / (t_rest - t_roll0)
            f = u if u < 0.8 else 0.8 + 0.1 * (1 - (1 - (u - 0.8) / 0.2) ** 2) if u < 1 else 0.9
            off = rest if short else rest * f / 0.9
            view = full.resize((w, h), Image.LANCZOS, box=(0, off, w, off + h))
            # soften the roll at the top and bottom edges
            m = np.ones(h, np.float32)
            e = int(h * 0.16)
            m[:e] = np.linspace(0, 1, e) ** 1.5
            m[-e:] = np.linspace(1, 0, e) ** 1.5
            alpha = np.array(view.getchannel("A"), np.float32) * m[:, None] * ease((t - t_roll0) / 0.8)
            view.putalpha(Image.fromarray(alpha.astype(np.uint8)))
            frame.alpha_composite(view)
        px = np.array(frame.convert("RGB"), np.float32)
        px = (px * vig[..., None] + grain[i % 6]) * fade
        out = Image.fromarray(np.clip(px, 0, 255).astype(np.uint8))
        buf = io.BytesIO()
        out.save(buf, "JPEG", quality=94)
        ff.stdin.write(buf.getvalue())
        if i % FPS == 0:
            (OUT / "credit_frames").mkdir(exist_ok=True)
            out.resize((w // 3, h // 3)).save(OUT / "credit_frames" / f"{name[:-4]}_{i // FPS:02d}.jpg", quality=86)
    ff.stdin.close()
    ff.wait()
    print("wrote", name, f"({secs} s)")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page()
        page.goto(BASE + "film-studio.html")
        for key, sz in SIZES.items():
            for variant in sys.argv[1:] or NARRATION:
                if variant.endswith("_short") and key != "9x16":
                    continue  # the short credits are for the Reel
                sfx = "" if variant == "voice" else f"_{variant}"
                render(page, f"credits_{key}{sfx}.mp4", sz, NARRATION[variant], variant.endswith("_short"))
        browser.close()


if __name__ == "__main__":
    main()
