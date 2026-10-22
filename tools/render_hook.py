"""Render the Reel's opening hook: the studio itself, live.

First the show playing in the studio, the program monitor above and the timeline below with its playhead running;
then the Figure in 3D window, orbiting Rama as his arm moves. Each frame is laid out at 1080 x 1920 with a caption,
kept clear of Instagram's top bar and caption area. Writes film/hook.mp4 (no sound).

Usage: python tools/render_hook.py      (needs python serve.py running, and Microsoft Edge)
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
W, H = 1080, 1920
BG = (11, 9, 7)
LIVE_SECONDS, SPACE_SECONDS = 3.0, 2.5
START = 32.2  # Ravana comes in from near the lamps, huge and soft

CAPTION = """<html><head><style>
@font-face { font-family: G; src: url('{base}fonts/geist.woff2'); }
@font-face { font-family: C; src: url('{base}fonts/cormorant-500-italic.woff2'); font-style: italic; }
html, body { margin: 0; background: transparent; width: 1080px; }
div { padding: 0 80px; }
p { margin: 0 0 26px; font: 500 26px/1 G; letter-spacing: .28em; text-transform: uppercase; color: #d9b05a; }
h1 { margin: 0; font: italic 500 92px/1.02 C; color: #efe6d6; }
</style></head><body><div><p>{kicker}</p><h1>{title}</h1></div></body></html>"""


def caption(page, kicker, title):
    # The page is first opened on the site, so its fonts load (set_content keeps the URL).
    if not page.url.startswith(BASE):
        page.goto(BASE + "film-studio.html")
    page.set_content(CAPTION.replace("{base}", BASE).replace("{kicker}", kicker).replace("{title}", title))
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(300)
    png = page.locator("div").screenshot(omit_background=True)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def shot(page, rect, dpr=2):
    png = page.screenshot(clip={"x": rect[0], "y": rect[1], "width": rect[2], "height": rect[3]})
    return Image.open(io.BytesIO(png)).convert("RGB")


def framed(canvas, img, y, width=1000):
    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    x = (W - width) // 2
    border = Image.new("RGB", (width + 4, img.height + 4), (90, 72, 40))
    canvas.paste(border, (x - 2, y - 2))
    canvas.paste(img, (x, y))
    return y + img.height


def main():
    OUT.mkdir(exist_ok=True)
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", str(OUT / "hook.mp4")],
        stdin=subprocess.PIPE,
    )

    def emit(canvas):
        buf = io.BytesIO()
        canvas.save(buf, "JPEG", quality=94)
        ff.stdin.write(buf.getvalue())

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        cap_page = browser.new_page(viewport={"width": 1080, "height": 600})
        cap_live = caption(cap_page, "Silhouette.ai", "Shadow puppetry,<br>edited like film.")
        cap_space = caption(cap_page, "In 3D", "Every figure turns.<br>Every part moves.")

        # A fresh studio (its own browser profile, so the sample show), at full size and twice the pixels.
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=2)
        page.goto(BASE + "studio.html", wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.evaluate("""async (t) => {
          const core = await import('/js/core.js');
          const S = core.S;
          const rav = S.project.items.find(i => i.name === 'Ravana');
          S.sel = null; // no selection box on the screen
          S.t = t; core.emit('refresh');
        }""", START)
        page.wait_for_timeout(800)
        scr = page.eval_on_selector("#screen", "e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }")
        tl = page.eval_on_selector("#tl-scroll", "e => { const r = e.closest('.panel').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }")
        mon = [scr[0] + scr[2] * 0.44, scr[1], scr[2] * 0.50, scr[3]]  # the action: Sita, and Ravana coming in

        # 1. The show playing, the playhead running (the show is 25 fps; the film 30).
        steps = 0
        for i in range(round(LIVE_SECONDS * FPS)):
            want = round(i / FPS * 25)
            while steps < want:
                page.keyboard.press("ArrowRight")
                steps += 1
            canvas = Image.new("RGB", (W, H), BG)
            canvas.paste(cap_live, (0, 250), cap_live)
            y = framed(canvas, shot(page, mon), 640, 1000)
            framed(canvas, shot(page, tl), y + 50, 1000)
            emit(canvas)

        # 2. Rama in 3D: the arm and head cut as parts, the view orbiting while the arm lifts.
        page.evaluate("""async () => {
          const core = await import('/js/core.js'); const rig = await import('/js/rig.js');
          const S = core.S; const rama = S.project.items.find(i => i.name === 'Rama');
          S.sel = { type: 'item', id: rama.id };
          rig.cutFigure(rama, 'arm'); rig.cutFigure(rama, 'head'); S.rigEdit = null;
          S.t = 28; core.emit('refresh'); core.emit('cmd', 'figure-3d');
        }""")
        page.wait_for_timeout(1200)
        view = page.eval_on_selector("#v3-view", "e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }")
        n = round(SPACE_SECONDS * FPS)
        for i in range(n):
            k = i / max(n - 1, 1)
            page.evaluate("""async ([oy, arm, head]) => {
              const core = await import('/js/core.js'); const v3 = await import('/js/view3d.js');
              const rama = core.S.project.items.find(i => i.name === 'Rama');
              rama.parts.find(p => p.stick).props.rotation.base = [arm];
              rama.parts.find(p => p.name === 'Head').props.rotation.base = [head];
              v3.refreshFigure3D(); v3.setOrbit(-6, oy);
            }""", [-42 + 78 * k, -32 * math.sin(k * math.pi * 1.5), 7 * math.sin(k * math.pi)])
            canvas = Image.new("RGB", (W, H), BG)
            canvas.paste(cap_space, (0, 250), cap_space)
            framed(canvas, shot(page, view), 640, 1000)
            emit(canvas)
        browser.close()
    ff.stdin.close()
    ff.wait()
    print("wrote", OUT / "hook.mp4")


if __name__ == "__main__":
    main()
