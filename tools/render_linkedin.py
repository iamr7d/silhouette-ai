"""Render the LinkedIn cut: a 4:5 (1080 x 1350) maker's demo of Silhouette.ai.

Real footage only: the show on the cloth (index.html?video&clean), the studio playing, its Lights and Motors panels and
the Figure in 3D window, each with a plain first-person subtitle (LinkedIn plays muted), then thanks and a closing
card. Shots are joined with short crossfades and the Tholpavakoothu recording runs quietly underneath.
Writes film/silhouette-ai-linkedin.mp4.

Usage: python tools/render_linkedin.py      (needs python serve.py running, and Microsoft Edge)
"""
import io
import math
import subprocess
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "film"
BASE = "http://localhost:8765/"
FPS = 30
W, H = 1080, 1350
BG = (14, 12, 10)
FADE = 0.35  # crossfade between shots, in seconds

SUB = """<html><head><style>
@font-face { font-family: G; src: url('{base}fonts/geist.woff2'); }
html, body { margin: 0; background: transparent; width: 1080px; }
div { box-sizing: border-box; width: 1080px; padding: 0 84px; }
p { margin: 0; font: 400 38px/1.38 G; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
</style></head><body><div><p>{text}</p></div></body></html>"""

CARD = """<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&display=swap"><style>
@font-face { font-family: G; src: url('{base}fonts/geist.woff2'); }
@font-face { font-family: C; src: url('{base}fonts/cormorant-500-italic.woff2'); font-style: italic; }
html, body { margin: 0; width: 1080px; height: 1350px; background: rgb(14,12,10); color: #e9e2d6; }
.wrap { position: absolute; left: 96px; right: 96px; top: 50%; transform: translateY(-50%); }
.k { font: 500 24px/1 G; letter-spacing: .2em; text-transform: uppercase; color: #c9a24a; margin: 0 0 40px; }
.n { font: 500 40px/1.25 G; margin: 0 0 8px; }
.r { font: 400 30px/1.45 G; color: #a59a8a; margin: 0 0 56px; }
/* the wordmark, as on the site: Marcellus capitals, "Studio · AI" small beneath */
.t { margin: 0 0 44px; display: flex; flex-direction: column; gap: 22px; }
.t .w { font: 400 62px/1 Marcellus; letter-spacing: .28em; text-transform: uppercase; color: #f1ecdf; }
.t .s { font: 400 18px/1 G; letter-spacing: .6em; text-transform: uppercase; color: #a59a8a; }
.ual { width: 420px; aspect-ratio: 512/100; margin: 70px 0 0;
  background: linear-gradient(180deg,#fff3cf 0%,#ffd56b 32%,#e0a12c 62%,#b97818 82%,#f4cf7a 100%);
  -webkit-mask: url('{base}assets/logo-ual-cci.png') left center / contain no-repeat; mask: url('{base}assets/logo-ual-cci.png') left center / contain no-repeat; }
</style></head><body><div class="wrap">{body}</div></body></html>"""

THANKS = """<p class="k">Thank you</p>
<p class="n">Vipin Viswanathan Pulavar</p><p class="r">for my first lessons in Tholpavakoothu, and his mentoring</p>
<p class="n">Hooman Samani</p><p class="r">UAL Creative Computing Institute, for guidance on robotics</p>
<p class="r" style="margin:0">And with respect to the pulavars, puppeteers and lamp keepers of Kerala's koothumadams, who made this art and have carried it for generations.</p>"""

END = """<p class="t" aria-label="Silhouette.ai"><span class="w">Silhouette</span><span class="s">Studio · AI</span></p>
<p class="n">Rahulraj P V</p><p class="r" style="margin:0">UAL Creative Computing Institute, London</p>
<div class="ual" role="img" aria-label="UAL Creative Computing Institute"></div>"""

# (kind, seconds, subtitle, options)
SHOTS = [
    # The hook: the question, over the studio playing the show.
    ("studio", 3.5, "What if you could edit a shadow puppet show like a film, and the same timeline moved the real puppets?", {"t": 33.4, "crop": "edit"}),
    ("cloth", 4.5, "This is Tholpavakoothu, the leather shadow puppetry of Kerala, played behind a cloth lit by 21 lamps.", {"t": (9.0, 13.0), "cam": (1.7, 935)}),
    ("cloth", 5.5, "I've been building Silhouette.ai, a studio for staging it in the browser.", {"t": (14.2, 19.6), "cam": (1.7, 1400)}),
    ("studio", 5.0, "Figures, lamps, story and sound sit on one timeline, keyframed like a film edit.", {"t": 31.6, "crop": "edit"}),
    ("studio", 4.5, "The lamps follow the real stage: 21 clay lamps on a beam, each one dimmable.", {"t": 17.0, "crop": "lights"}),
    ("cloth", 4.0, "You can watch from the audience's side, or from behind the cloth, where the puppeteers stand.", {"t": (20.25, 20.75), "cam": (3.4, 740)}),
    ("space", 4.5, "Each figure can turn in 3D and be cut into parts that move on their joints.", {}),
    ("studio", 3.5, "The same timeline can drive servos and lamps on an Arduino, for real puppets.", {"t": 33.0, "crop": "motors"}),
    ("card", 5.5, None, {"html": THANKS}),
    ("card", 4.0, None, {"html": END}),
]


def png(page, html, selector=None, transparent=True):
    if not page.url.startswith(BASE):
        page.goto(BASE + "film-studio.html")  # same origin, so the fonts load
    page.set_content(html.replace("{base}", BASE))
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(250)
    shot = page.locator(selector).screenshot(omit_background=transparent) if selector else page.screenshot()
    return Image.open(io.BytesIO(shot)).convert("RGBA")


def fit(img, width, height=None):
    if height is None:
        return img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    k = max(width / img.width, height / img.height)
    img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    x, y = (img.width - width) // 2, (img.height - height) // 2
    return img.crop((x, y, x + width, y + height))


def with_subtitle(frame, sub):
    if sub is None:
        return frame
    # a soft dark band under the words, as on any captioned video
    band = Image.new("RGBA", (W, 380), (0, 0, 0, 0))
    for y in range(380):
        a = int(170 * min(1, y / 260))
        band.paste((0, 0, 0, a), (0, y, W, y + 1))
    frame = frame.convert("RGBA")
    frame.alpha_composite(band, (0, H - 380))
    frame.alpha_composite(sub, (0, H - 96 - sub.height))
    return frame.convert("RGB")


def enc(img):
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=94)
    return buf.getvalue()


def dec(b):
    return Image.open(io.BytesIO(b)).convert("RGB")


def rect(page, sel, closest=None):
    js = "e => { const n = %s; const r = n.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }" % (
        f"e.closest('{closest}')" if closest else "e")
    return page.eval_on_selector(sel, js)


def grab(page, r):
    b = page.screenshot(clip={"x": r[0], "y": r[1], "width": r[2], "height": r[3]})
    return Image.open(io.BytesIO(b)).convert("RGB")


def main():
    OUT.mkdir(exist_ok=True)
    frames = []  # list of shots, each a list of frames kept as JPEG bytes

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        cap = browser.new_page(viewport={"width": 1080, "height": 1350})
        subs = [png(cap, SUB.replace("{text}", s[2]), "div") if s[2] else None for s in SHOTS]

        cloth = browser.new_page(viewport={"width": W, "height": H})
        cloth.goto(BASE + "index.html?video&clean", wait_until="networkidle")
        cloth.wait_for_function("typeof window.__seekShow === 'function' && window.__ready", timeout=60000)
        cloth.evaluate("window.__ready")
        cloth.wait_for_timeout(800)

        studio = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=2)
        studio.goto(BASE + "studio.html", wait_until="networkidle")
        studio.wait_for_timeout(2500)

        clock = 10.0  # the cloth's own clock (flames, wobble) keeps running across shots
        for (kind, secs, _, opt), sub in zip(SHOTS, subs):
            n = round(secs * FPS)
            shot = []
            if kind == "cloth":
                t0, t1 = opt["t"]
                cloth.evaluate(f"window.__camera({opt['cam'][0]}, {opt['cam'][1]})")
                cloth.evaluate(f"window.__seekShow({t0}, {clock})")
                cloth.wait_for_timeout(400)  # the canvases follow the new size
                for i in range(n):
                    clock += 1 / FPS
                    cloth.evaluate(f"window.__seekShow({t0 + (t1 - t0) * i / max(n - 1, 1)}, {clock})")
                    img = Image.open(io.BytesIO(cloth.screenshot())).convert("RGB")
                    shot.append(enc(with_subtitle(img, sub)))
            elif kind == "studio":
                crop = opt["crop"]
                studio.evaluate("""async ([t, crop]) => {
                  const core = await import('/js/core.js'); const S = core.S;
                  document.querySelector('#dlg-3d').open && document.querySelector('#dlg-3d').close();
                  const rav = S.project.items.find(i => i.name === 'Ravana');
                  S.sel = crop === 'motors' ? { type: 'item', id: rav.id } : null;
                  S.t = t; core.emit('refresh');
                  document.querySelector(`[data-tab="${crop === 'lights' ? 'lights' : crop === 'motors' ? 'motors' : 'effects'}"]`).click();
                  if (crop === 'motors' && !S.project.motors.outputs.length) document.querySelector('[data-mact="automap"]').click();
                }""", [opt["t"], crop])
                studio.wait_for_timeout(700)
                if crop == "edit":  # the monitor and the timeline
                    r = rect(studio, "#tl-scroll", ".panel")
                    m = rect(studio, "#screen", ".panel")
                    region = [m[0], m[1], m[2], r[1] + r[3] - m[1]]
                else:  # the panel on the left, beside the monitor
                    region = [0, 30, 1300, 600]
                steps = 0
                for i in range(n):
                    want = round(i / FPS * 25)
                    while steps < want:
                        studio.keyboard.press("ArrowRight")
                        steps += 1
                    img = grab(studio, region)
                    frame = Image.new("RGB", (W, H), BG)
                    img = fit(img, 1000)
                    frame.paste(img, ((W - img.width) // 2, max(60, (H - 300 - img.height) // 2)))
                    shot.append(enc(with_subtitle(frame, sub)))
            elif kind == "space":
                studio.evaluate("""async () => {
                  const core = await import('/js/core.js'); const rig = await import('/js/rig.js');
                  const S = core.S; const rama = S.project.items.find(i => i.name === 'Rama');
                  S.sel = { type: 'item', id: rama.id };
                  if (!rama.parts.some(p => p.cut)) { rig.cutFigure(rama, 'arm'); rig.cutFigure(rama, 'head'); }
                  S.rigEdit = null; S.t = 28; core.emit('refresh'); core.emit('cmd', 'figure-3d');
                }""")
                studio.wait_for_timeout(1200)
                v = rect(studio, "#v3-view")
                view = [v[0] + v[2] * 0.2, v[1] + v[3] * 0.06, v[2] * 0.6, v[3] * 0.84]  # close on the figure
                for i in range(n):
                    k = i / max(n - 1, 1)
                    studio.evaluate("""async ([oy, arm, head, turn]) => {
                      const core = await import('/js/core.js'); const v3 = await import('/js/view3d.js');
                      const rama = core.S.project.items.find(i => i.name === 'Rama');
                      rama.parts.find(p => p.stick).props.rotation.base = [arm];
                      rama.parts.find(p => p.name === 'Head').props.rotation.base = [head];
                      core.getProp(rama, 'turn').base = [turn];
                      v3.refreshFigure3D(); v3.setOrbit(-5, oy);
                    }""", [-24 + 30 * k, -30 * math.sin(k * math.pi * 1.5), 6 * math.sin(k * math.pi), 0])
                    frame = Image.new("RGB", (W, H), BG)
                    img = fit(grab(studio, view), 1000)
                    frame.paste(img, ((W - img.width) // 2, max(60, (H - 300 - img.height) // 2)))
                    shot.append(enc(with_subtitle(frame, sub)))
            else:  # card
                card = png(cap, CARD.replace("{body}", opt["html"]), transparent=False).convert("RGB")
                shot = [enc(card)] * n
            frames.append(shot)
            print(f"{kind}: {len(shot)} frames", flush=True)
        browser.close()

    # Join with short crossfades, and write.
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", str(OUT / "linkedin_video.mp4")],
        stdin=subprocess.PIPE,
    )
    f = round(FADE * FPS)
    total = 0
    for si, shot in enumerate(frames):
        body = shot if si == 0 else shot[f:]
        if si > 0:
            prev = frames[si - 1][-f:]
            for j in range(f):
                ff.stdin.write(enc(Image.blend(dec(prev[j]), dec(shot[j]), (j + 1) / (f + 1))))
                total += 1
        end = len(body) - (f if si < len(frames) - 1 else 0)
        for b in body[:end]:
            ff.stdin.write(b)
            total += 1
    ff.stdin.close()
    ff.wait()
    seconds = total / FPS
    music = ROOT / "assets" / "audio" / "pavakkoothu.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(OUT / "linkedin_video.mp4"), "-i", str(music),
         "-filter_complex", f"[1:a]atrim=0:{seconds},afade=t=in:st=0:d=1.5,afade=t=out:st={seconds - 2.5}:d=2.5,volume=0.6[a]",
         "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
         "-t", f"{seconds:.3f}", str(OUT / "silhouette-ai-linkedin.mp4")],
        check=True,
    )
    print("wrote", OUT / "silhouette-ai-linkedin.mp4", f"({seconds:.1f} s)")


if __name__ == "__main__":
    main()
