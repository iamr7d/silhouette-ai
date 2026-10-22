"""Record a screen-recording demo of Silhouette.ai, as a maker would: a cursor really using the site and the studio.

The browser is driven with real mouse and keyboard input (scrolling the site, opening the studio, playing, dragging
values, the back view, the Lights panel, cutting and turning a figure in 3D, Motors); every frame is captured, the
cursor is drawn on (a headless browser has none), the view eases in toward what the cursor is doing, and a few short
first-person captions run along the bottom. Hard cuts, no transitions. 1920 x 1080, 30 fps, with the recording
underneath. Writes film/silhouette-ai-demo.mp4.

Usage: python tools/record_demo.py      (needs python serve.py running, and Microsoft Edge)
"""
import io
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "film"
BASE = "http://localhost:8765/"
FPS = 30
W, H = 1920, 1080

CAP = """<html><head><style>
@font-face { font-family: G; src: url('{base}fonts/geist.woff2'); }
html, body { margin: 0; background: transparent; }
span { display: inline-block; padding: 14px 26px; border-radius: 12px; background: rgba(12, 12, 14, .78);
  font: 400 34px/1.35 G; color: #fff; max-width: 1300px; }
</style></head><body><span>{text}</span></body></html>"""

END = """<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&display=swap"><style>
@font-face { font-family: G; src: url('{base}fonts/geist.woff2'); }
html, body { margin: 0; width: 1920px; height: 1080px; background: #0e0c0a; color: #e9e2d6; }
.wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.w { font: 400 92px/1 Marcellus; letter-spacing: .28em; margin-right: -.28em; text-transform: uppercase; color: #f1ecdf; }
.s { margin-top: 30px; font: 400 22px/1 G; letter-spacing: .6em; margin-right: -.6em; text-transform: uppercase; color: #a59a8a; }
.t { margin-top: 90px; font: 400 30px/1.6 G; color: #c9c0b2; }
.u { margin-top: 50px; font: 500 30px/1 G; color: #f2c46a; }
</style></head><body><div class="wrap">
<div class="w">Silhouette</div><div class="s">Studio · AI</div>
<div class="t">Thank you to Vipin Viswanathan Pulavar for my first lessons in Tholpavakoothu,<br>and to Hooman Samani at UAL Creative Computing Institute for guidance on robotics.</div>
<div class="u">silhouetteai.vercel.app</div>
</div></body></html>"""


def arrow():
    """A plain macOS-style pointer, drawn at 2x and scaled down for clean edges."""
    s = 2
    im = Image.new("RGBA", (26 * s, 38 * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = [(1, 1), (1, 27), (7.5, 21), (12, 31.5), (16, 29.8), (11.6, 19.8), (20, 19.8)]
    d.polygon([(x * s, y * s) for x, y in pts], fill=(0, 0, 0, 255))
    inner = [(3, 5.5), (3, 22.5), (8.2, 17.8), (12.8, 28.6), (14, 28), (9.5, 17.6), (15.6, 17.6)]
    d.polygon([(x * s, y * s) for x, y in inner], fill=(255, 255, 255, 255))
    return im.resize((26, 38), Image.LANCZOS)


class Recorder:
    def __init__(self, browser):
        self.browser = browser
        self.page = browser.new_page(viewport={"width": W, "height": H})
        self.cap_page = browser.new_page(viewport={"width": 1500, "height": 300})
        self.cursor = arrow()
        self.x, self.y = W * 0.55, H * 0.6
        self.zoom, self.zoom_to = 1.0, 1.0
        self.cx, self.cy = W / 2, H / 2  # centre of the zoomed view
        self.focus = None  # fixed point to zoom on, else the cursor
        self.caption = None
        self.ripple = 0
        self.n = 0
        self.ff = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
             "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", str(OUT / "demo_video.mp4")],
            stdin=subprocess.PIPE)

    # ── captions ──
    def say(self, text):
        if text is None:
            self.caption = None
            return
        if not self.cap_page.url.startswith(BASE):
            self.cap_page.goto(BASE + "film-studio.html")
        self.cap_page.set_content(CAP.replace("{base}", BASE).replace("{text}", text))
        self.cap_page.evaluate("document.fonts.ready")
        self.cap_page.wait_for_timeout(150)
        self.caption = Image.open(io.BytesIO(self.cap_page.locator("span").screenshot(omit_background=True))).convert("RGBA")

    # ── one frame ──
    def frame(self):
        shot = Image.open(io.BytesIO(self.page.screenshot(type="jpeg", quality=92))).convert("RGB")
        self.zoom += (self.zoom_to - self.zoom) * 0.08
        fx, fy = self.focus or (self.x, self.y)
        self.cx += (fx - self.cx) * 0.08
        self.cy += (fy - self.cy) * 0.08
        z = self.zoom
        vw, vh = W / z, H / z
        left = min(max(self.cx - vw / 2, 0), W - vw)
        top = min(max(self.cy - vh / 2, 0), H - vh)
        if z > 1.01:
            shot = shot.crop((round(left), round(top), round(left + vw), round(top + vh))).resize((W, H), Image.LANCZOS)
        img = shot.convert("RGBA")
        px, py = (self.x - left) * z, (self.y - top) * z
        if self.ripple > 0:  # a soft ring where the click landed
            k = 1 - self.ripple / 8
            ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            r = 10 + 26 * k
            ImageDraw.Draw(ring).ellipse((px - r, py - r, px + r, py + r), outline=(255, 255, 255, int(150 * (1 - k))), width=3)
            img.alpha_composite(ring)
            self.ripple -= 1
        img.alpha_composite(self.cursor, (int(px) - 1, int(py) - 1))
        if self.caption:
            img.alpha_composite(self.caption, ((W - self.caption.width) // 2, H - 70 - self.caption.height))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=93)
        self.ff.stdin.write(buf.getvalue())
        if self.n % FPS == 0:  # one frame a second, to look over while it records
            (OUT / "demo_frames").mkdir(exist_ok=True)
            img.convert("RGB").resize((960, 540)).save(OUT / "demo_frames" / f"{self.n // FPS:03d}.jpg", quality=88)
        self.n += 1

    def hold(self, secs, each=None):
        for _ in range(round(secs * FPS)):
            if each:
                each()
            self.frame()

    # ── the hand ──
    def move(self, x, y, secs=None, drag=False):
        x0, y0 = self.x, self.y
        dist = math.hypot(x - x0, y - y0)
        secs = secs or min(0.9, 0.3 + dist / 1800)
        n = max(2, round(secs * FPS))
        bend = (dist * 0.08) * (1 if (x - x0) * (y - y0) >= 0 else -1)  # hands move in slight arcs, not lines
        for i in range(1, n + 1):
            u = i / n
            e = u * u * (3 - 2 * u)
            nx = x0 + (x - x0) * e - (y - y0) / max(dist, 1) * bend * math.sin(math.pi * u)
            ny = y0 + (y - y0) * e + (x - x0) / max(dist, 1) * bend * math.sin(math.pi * u)
            self.x, self.y = nx, ny
            self.page.mouse.move(nx, ny)
            self.frame()

    def click(self, x=None, y=None, double=False):
        if x is not None:
            self.move(x, y)
        self.page.mouse.click(self.x, self.y, click_count=2 if double else 1)
        self.ripple = 8
        self.hold(0.25)

    def drag(self, x, y, secs=1.0):
        self.page.mouse.down()
        self.ripple = 8
        self.move(x, y, secs)
        self.page.mouse.up()

    def box(self, sel):
        b = self.page.locator(sel).first.bounding_box()
        return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, b

    def close(self):
        self.ff.stdin.close()
        self.ff.wait()


def run():
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        r = Recorder(browser)
        pg = r.page

        # 1. The site: the night, then scrolling lights the lamps.
        pg.goto(BASE + "index.html", wait_until="networkidle")
        pg.wait_for_timeout(1500)
        r.hold(1.6)
        r.say("I'm building a studio for Tholpavakoothu, the leather shadow puppetry of Kerala.")
        r.move(W * 0.52, H * 0.62, 0.6)
        # a calm scroll: just far enough for the lamps to light, one after another
        r.hold(3.2, each=lambda: pg.mouse.wheel(0, 9))
        r.hold(1.0)
        # 2. Into the studio.
        x, y, _ = r.box(".enter")
        r.say(None)
        r.click(x, y)
        pg.wait_for_load_state("networkidle")
        pg.wait_for_timeout(2200)
        r.hold(0.5)
        # Move the playhead into the Rama and Sita scene.
        rx = pg.evaluate("""async () => { const core = await import('/js/core.js');
          const r = document.querySelector('#tl-ruler').getBoundingClientRect(); return [r.left + 27.6 * core.S.pps, r.top + r.height / 2]; }""")
        r.say("Every figure, lamp and sound sits on one timeline, like a film edit.")
        r.click(rx[0], rx[1])
        r.focus = None
        r.zoom_to = 1.0
        r.hold(0.3)
        r.zoom_to = 1.28
        r.focus = (W * 0.72, H * 0.42)
        r.move(W * 0.72, H * 0.56, 0.5)
        r.hold(5.0, each=lambda: pg.keyboard.press("ArrowRight"))  # on to Ravana's coming
        # 3. Ravana: pull him off the cloth.
        r.zoom_to = 1.0
        r.focus = None
        rav = pg.evaluate("""async () => { const core = await import('/js/core.js');
          const it = core.S.project.items.find(i => i.name === 'Ravana');
          const el = document.querySelector(`.puppet[data-id="${it.id}"]`); const b = el.getBoundingClientRect();
          return [b.left + b.width / 2, b.top + b.height * 0.45]; }""")
        r.say("Pull a figure off the cloth and its shadow grows and softens, as it does on a real stage.")
        r.click(rav[0], rav[1])
        r.hold(0.5)
        x, y, _ = r.box('#ec .hot[data-path="depth"]')
        r.move(x, y, 0.7)
        r.drag(x + 260, y, 1.6)
        r.hold(1.2)
        r.drag(x + 130, y, 0.8)
        r.hold(0.6)
        # 4. The back view.
        x, y, _ = r.box("#view-back")
        r.say("Or watch from behind the cloth, where the puppeteers stand.")
        r.click(x, y)
        r.zoom_to = 1.3
        r.focus = (W * 0.72, H * 0.38)
        r.hold(2.2, each=lambda: pg.keyboard.press("ArrowRight"))
        r.zoom_to = 1.0
        r.focus = None
        x, y, _ = r.box("#view-front")
        r.click(x, y)
        # 5. The lamps.
        x, y, _ = r.box('[data-tab="lights"]')
        r.say("Twenty-one clay lamps on a beam, each one its own light.")
        r.click(x, y)
        r.zoom_to = 1.45
        r.focus = (W * 0.2, H * 0.2)
        r.move(W * 0.16, H * 0.16, 0.8)
        r.move(W * 0.3, H * 0.17, 1.2)
        r.hold(0.8)
        r.zoom_to = 1.0
        r.focus = None
        # 6. Rama in 3D.
        ram = pg.evaluate("""async () => { const core = await import('/js/core.js');
          const it = core.S.project.items.find(i => i.name === 'Rama');
          const el = document.querySelector(`.puppet[data-id="${it.id}"]`); const b = el.getBoundingClientRect();
          return [b.left + b.width / 2, b.top + b.height * 0.5]; }""")
        r.say("Figures turn in 3D, and can be cut into parts that move on their joints.")
        r.move(ram[0], ram[1], 0.7)
        r.click(double=True)
        r.zoom_to = 1.3
        r.focus = (W / 2, H / 2)  # ease in on the 3D window
        pg.wait_for_timeout(600)
        if not pg.locator("#dlg-3d[open]").count():  # if the double-click was taken as a drag, open it as the menu would
            pg.evaluate("""async () => { const core = await import('/js/core.js');
              const it = core.S.project.items.find(i => i.name === 'Rama');
              core.S.sel = { type: 'item', id: it.id }; core.emit('refresh'); core.emit('cmd', 'figure-3d'); }""")
            pg.wait_for_timeout(600)
        r.hold(0.6)
        for cut in ("arm", "head"):
            x, y, _ = r.box("[data-v3-cut]")
            r.click(x, y)
            pg.locator("[data-v3-cut]").select_option(cut)
            pg.wait_for_timeout(300)
            r.hold(0.3)
        x, y, b = r.box("#v3-view")
        r.move(x - 80, y + 40, 0.6)
        r.drag(x + 140, y + 10, 1.1)
        x, y, b = r.box('[data-v3="turn"]')
        start = b["x"] + b["width"] * 0.5
        r.move(start, y, 0.6)
        r.drag(b["x"] + b["width"] * 0.72, y, 1.1)
        r.hold(0.3)
        x, y, b = r.box('[data-v3^="part:"]')
        start = b["x"] + b["width"] * 0.5
        r.move(start, y, 0.6)
        r.drag(b["x"] + b["width"] * 0.38, y, 1.0)
        r.hold(0.6)
        r.zoom_to = 1.0
        r.focus = None
        # 7. Motors.
        x, y, _ = r.box('[data-v3-act="close"]')
        r.click(x, y)
        x, y, _ = r.box('[data-tab="motors"]')
        r.say("The same timeline can drive servos and lamps on an Arduino, for real puppets.")
        r.click(x, y)
        r.zoom_to = 1.35
        r.focus = (W * 0.2, H * 0.22)
        r.move(W * 0.12, H * 0.2, 0.8)
        r.hold(2.0)
        r.say(None)
        # 8. Close.
        pg.set_content(END.replace("{base}", BASE))
        pg.evaluate("document.fonts.ready")
        pg.wait_for_timeout(500)
        r.zoom, r.zoom_to, r.focus = 1.0, 1.0, None
        r.x, r.y = W + 50, H + 50  # the cursor leaves
        r.hold(4.5)
        r.close()
        frames = r.n
        browser.close()

    secs = frames / FPS
    music = ROOT / "assets" / "audio" / "pavakkoothu.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(OUT / "demo_video.mp4"), "-i", str(music),
         "-filter_complex", f"[1:a]atrim=0:{secs},afade=t=in:st=0:d=1.5,afade=t=out:st={secs - 2.5}:d=2.5,volume=0.55[a]",
         "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
         "-t", f"{secs:.3f}", str(OUT / "silhouette-ai-demo.mp4")],
        check=True)
    print("wrote", OUT / "silhouette-ai-demo.mp4", f"({secs:.1f} s)")


if __name__ == "__main__":
    run()
