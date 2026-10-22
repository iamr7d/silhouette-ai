"""Record the screen-recording demo of Silhouette.ai, as a maker would: a cursor really using the site and the studio.

The browser is driven with real mouse and keyboard input: the site (scrolling the lamps alight, the Malayalam reading),
then the studio (playing the show, adding a figure from the Library and keyframing it by dragging, a ready-made
movement, pulling Ravana off the cloth, the back view, dimming the lamps, the Story's scenes, cutting and turning a
figure in 3D, mapping a figure to motors). Every frame is kept as captured (film/raw/), with where the hand was, what the
camera should frame and which caption shows (film/raw/session.json); the clicks are written to film/demo_clicks.wav.
tools/camera.py then frames the films from it, so the camera can be changed without recording again.

Usage: python tools/record_demo.py      (needs python serve.py running, and Microsoft Edge)
"""
import json
import math
import shutil
from pathlib import Path

import numpy as np
from playwright.sync_api import sync_playwright

import mix_audio  # tools/mix_audio.py: the background music

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "film"
RAW = OUT / "raw"  # every frame as captured, and session.json
BASE = "http://localhost:8765/"
FPS = 30
W, H = 1920, 1080

CAP = """<html><head><style>
@font-face { font-family: G; src: url('{base}fonts/geist.woff2'); }
html, body { margin: 0; background: transparent; }
span { display: inline-block; padding: 14px 26px; border-radius: 12px; background: rgba(12, 12, 14, .78);
  font: 400 34px/1.35 G; color: #fff; max-width: 1300px; }
</style></head><body><span>{text}</span></body></html>"""

# Captions for the vertical cut, as people put them on their own Reels: plain white words, no box or headline.
VCAP = """<html><head><style>
@font-face { font-family: G; src: url('{base}fonts/geist.woff2'); }
html, body { margin: 0; background: transparent; width: 1080px; }
p { margin: 0 auto; width: 900px; text-align: center; font: 600 46px/1.3 G; color: #fff;
  text-shadow: 0 2px 4px rgba(0,0,0,.85), 0 0 18px rgba(0,0,0,.55); }
</style></head><body><p>{text}</p></body></html>"""

PUPPET_AT = """async (name) => { const core = await import('/js/core.js');
  const it = core.S.project.items.find(i => i.name === name);
  const el = document.querySelector('.puppet[data-id="' + it.id + '"]'); const b = el.getBoundingClientRect();
  return [b.left + b.width / 2, b.top + b.height * 0.45]; }"""
RULER_AT = """async (t) => { const core = await import('/js/core.js');
  const r = document.querySelector('#tl-ruler').getBoundingClientRect(); return [r.left + t * core.S.pps, r.top + r.height / 2]; }"""
OPEN_3D = """async () => { const core = await import('/js/core.js');
  const it = core.S.project.items.find(i => i.name === 'Rama');
  core.S.sel = { type: 'item', id: it.id }; core.emit('refresh'); core.emit('cmd', 'figure-3d'); }"""


class Recorder:
    def __init__(self, browser):
        self.browser = browser
        self.page = browser.new_page(viewport={"width": W, "height": H})
        # Every page runs on a virtual clock that moves on exactly one frame per capture (see tools/virtual_clock.js).
        self.page.add_init_script(path=str(ROOT / "tools" / "virtual_clock.js"))
        self.cap_page = browser.new_page(viewport={"width": 1500, "height": 300})
        self.x, self.y = W * 0.55, H * 0.6
        self.zoom_to = 1.0  # how close the camera should be
        self.focus = None  # fixed point for it to frame, else the hand
        self.ripple = 0
        self.n = 0
        self.events = []  # (frame, kind) for the sound: clicks, presses, releases, wheel ticks, keys
        self.cap_id, self.n_caps = 0, 0
        self.states = []  # per frame: where the hand is and what the camera is asked to do (see tools/camera.py)
        self.marks = {}
        shutil.rmtree(RAW, ignore_errors=True)
        RAW.mkdir(parents=True)

    # ── captions ──
    def say(self, text):
        """Show a caption from this frame on; both cuts' captions are kept as images for tools/camera.py."""
        if text is None:
            self.cap_id = 0
            return
        if not self.cap_page.url.startswith(BASE):
            self.cap_page.goto(BASE + "film-studio.html")
        self.n_caps += 1
        self.cap_id = self.n_caps
        for tpl, sel, name in ((CAP, "span", "cap"), (VCAP, "p", "vcap")):
            self.cap_page.set_content(tpl.replace("{base}", BASE).replace("{text}", text))
            self.cap_page.evaluate("document.fonts.ready")
            self.cap_page.wait_for_timeout(150)
            self.cap_page.locator(sel).screenshot(path=str(RAW / f"{name}_{self.cap_id}.png"), omit_background=True)

    # ── one frame ──
    def frame(self):
        """Capture the screen as it is, and note the hand and the camera's brief; the framing is done afterwards."""
        for attempt in range(20):  # while a click is opening another page, wait for it to arrive
            try:
                self.page.evaluate(f"window.__advance && window.__advance({1000 / FPS})")
                break
            except Exception:
                self.page.wait_for_load_state("load")
                self.page.wait_for_timeout(300)
        self.page.screenshot(path=str(RAW / f"{self.n:05d}.jpg"), type="jpeg", quality=94)
        self.states.append({"x": round(self.x, 2), "y": round(self.y, 2), "zoom": self.zoom_to, "focus": self.focus,
                            "ripple": self.ripple, "cap": self.cap_id})
        self.ripple = max(0, self.ripple - 1)
        self.n += 1

    def hold(self, secs, each=None):
        for _ in range(round(secs * FPS)):
            if each:
                each()
            self.frame()

    # ── the hand ──
    def move(self, x, y, secs=None):
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
        self.events.append((self.n, "click"))
        if double:
            self.events.append((self.n + 3, "click"))
        self.ripple = 8
        self.hold(0.25)

    def drag(self, x, y, secs=1.0):
        self.page.mouse.down()
        self.events.append((self.n, "down"))
        self.ripple = 8
        self.move(x, y, secs)
        self.page.mouse.up()
        self.events.append((self.n, "up"))

    def scroll(self, secs, step):
        """Turn the wheel a notch at a time, as a hand does."""
        for i in range(round(secs * FPS)):
            self.page.mouse.wheel(0, step)
            if i % 3 == 0:
                self.events.append((self.n, "tick"))
            self.frame()

    def type(self, text):
        for ch in text:
            self.page.keyboard.type(ch)
            self.events.append((self.n, "key"))
            self.hold(0.12)

    def box(self, sel):
        loc = self.page.locator(sel).first
        loc.scroll_into_view_if_needed()  # as a person would scroll a panel to reach it
        self.page.wait_for_timeout(120)
        b = loc.bounding_box()
        return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, b

    def close(self):
        (RAW / "session.json").write_text(json.dumps(
            {"fps": FPS, "frames": self.n, "states": self.states, "events": self.events, "marks": self.marks}))


def run():
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        r = Recorder(browser)
        pg = r.page
        step = lambda: pg.keyboard.press("ArrowRight")  # the show moves on a frame at a time
        at = lambda t: pg.evaluate(RULER_AT, t)
        figure = lambda name: pg.evaluate(PUPPET_AT, name)

        # 1. The site: the night, the lamps lit by scrolling, and the page in Malayalam.
        pg.goto(BASE + "index.html", wait_until="networkidle")
        pg.wait_for_timeout(1500)
        r.hold(1.6)
        r.say("I'm building a studio for Tholpavakoothu, the leather shadow puppetry of Kerala.")
        r.move(W * 0.52, H * 0.62, 0.6)
        r.scroll(4.2, 15)  # far enough for the lamps to light and the first chapter to appear
        r.hold(1.8)
        x, y, _ = r.box("#lang")
        r.say("The site reads in English or Malayalam.")
        r.click(x, y)
        r.zoom_to, r.focus = 1.3, (W * 0.42, H * 0.42)
        r.hold(2.4)
        r.zoom_to, r.focus = 1.0, None
        r.click(x, y)  # back to English
        r.hold(0.3)

        # 2. Into the studio; the show plays.
        x, y, _ = r.box(".enter")
        r.say(None)
        r.click(x, y)
        pg.wait_for_load_state("networkidle")
        pg.wait_for_timeout(2200)
        r.marks["studio"] = r.n  # where the Reel picks up the session
        r.hold(0.4)
        r.say("Every figure, lamp and sound sits on one timeline, like a film edit.")
        r.click(*at(24.4))
        r.zoom_to, r.focus = 1.28, (W * 0.72, H * 0.42)
        r.move(W * 0.72, H * 0.56, 0.5)
        r.hold(3.2, each=step)
        r.zoom_to, r.focus = 1.0, None

        # 3. A new figure from the Library, keyframed by dragging it on the cloth.
        x, y, _ = r.box('[data-ptab="library"]')
        r.say("Add a figure from the library, then move it: the timeline keeps each keyframe.")
        r.click(x, y)
        r.hold(0.3)
        x, y, _ = r.box('[data-lib="img:hanuman"]')
        r.click(x, y)
        r.hold(0.6)
        x, y, _ = r.box('#ec .sw[data-path="position"]')  # the stopwatch: animate its position
        r.click(x, y)
        r.hold(0.3)
        hx, hy = figure("Hanuman")
        r.move(hx, hy, 0.6)
        r.drag(hx - 300, hy + 10, 1.0)
        r.click(*at(27.6))
        hx, hy = figure("Hanuman")
        r.move(hx, hy, 0.6)
        r.drag(hx + 460, hy - 20, 1.1)
        r.click(*at(25.0))
        r.zoom_to, r.focus = 1.2, (W * 0.72, H * 0.5)
        r.hold(2.6, each=step)
        r.zoom_to, r.focus = 1.0, None

        # 4. A ready-made movement.
        x, y, _ = r.box('#ec select[data-set="move"]')
        r.say("Or give it a movement: walk, bow, strike, loom.")
        r.click(x, y)
        pg.locator('#ec select[data-set="move"]').select_option("walk")
        r.hold(0.4)
        r.zoom_to, r.focus = 1.2, (W * 0.72, H * 0.42)
        r.hold(2.6, each=step)
        r.zoom_to, r.focus = 1.0, None

        # 5. Ravana: off the cloth.
        r.click(*at(33.4))
        r.say("Pull a figure off the cloth and its shadow grows and softens, as it does on a real stage.")
        r.click(*figure("Ravana"))
        r.hold(0.5)
        x, y, _ = r.box('#ec .hot[data-path="depth"]')
        r.move(x, y, 0.7)
        r.drag(x + 260, y, 1.5)
        r.hold(1.0)
        r.drag(x + 120, y, 0.8)
        r.hold(0.4)

        # 6. The back view.
        x, y, _ = r.box("#view-back")
        r.say("Or watch from behind the cloth, where the puppeteers stand.")
        r.click(x, y)
        r.zoom_to, r.focus = 1.3, (W * 0.72, H * 0.38)
        r.hold(2.2, each=step)
        r.zoom_to, r.focus = 1.0, None
        x, y, _ = r.box("#view-front")
        r.click(x, y)

        # 7. The lamps: dim them all, then bring them back.
        x, y, _ = r.box('[data-tab="lights"]')
        r.say("Twenty-one clay lamps on a beam, each its own light: dim them, colour them, light them in turn.")
        r.click(x, y)
        r.hold(0.4)
        r.zoom_to, r.focus = 1.2, (W * 0.5, H * 0.32)
        for level in ("35", "110"):
            x, y, _ = r.box('[data-act="lamps-edit-all"]')
            r.click(x, y)
            r.hold(0.3)
            x, y, _ = r.box('#dlg-form input[name="intensity"]')
            r.click(x, y)
            r.type(level)
            x, y, _ = r.box("#dlg-form .mfoot .btn.primary")
            r.click(x, y)
            r.hold(1.4)
        r.zoom_to, r.focus = 1.0, None

        # 8. Story: scenes with narration, as subtitles under the cloth.
        x, y, _ = r.box('[data-tab="story"]')
        r.say("Scenes carry the narration, shown as subtitles under the cloth.")
        r.click(x, y)
        r.zoom_to, r.focus = 1.3, (W * 0.24, H * 0.3)
        r.move(W * 0.2, H * 0.3, 0.8)
        r.hold(2.2)
        r.zoom_to, r.focus = 1.0, None

        # 9. Rama in 3D.
        r.say("Figures turn in 3D, and can be cut into parts that move on their joints.")
        r.move(*figure("Rama"), 0.7)
        r.click(double=True)
        pg.wait_for_timeout(600)
        if not pg.locator("#dlg-3d[open]").count():  # if the double-click was taken as a drag, open it as the menu would
            pg.evaluate(OPEN_3D)
            pg.wait_for_timeout(600)
        r.zoom_to, r.focus = 1.3, (W / 2, H / 2)
        r.hold(0.5)
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
        r.move(b["x"] + b["width"] * 0.5, y, 0.6)
        r.drag(b["x"] + b["width"] * 0.72, y, 1.0)
        x, y, b = r.box('[data-v3^="part:"]')
        r.move(b["x"] + b["width"] * 0.5, y, 0.6)
        r.drag(b["x"] + b["width"] * 0.38, y, 1.0)
        r.hold(0.5)
        r.zoom_to, r.focus = 1.0, None
        x, y, _ = r.box('[data-v3-act="close"]')
        r.click(x, y)

        # 10. Motors: map a figure to servos.
        r.click(*figure("Ravana"))
        x, y, _ = r.box('[data-tab="motors"]')
        r.say("Map any value to a servo or lamp on an Arduino, and play real puppets from the same timeline.")
        r.click(x, y)
        r.hold(0.4)
        x, y, _ = r.box('[data-mact="automap"]')
        r.click(x, y)
        r.zoom_to, r.focus = 1.3, (W * 0.2, H * 0.3)
        r.move(W * 0.16, H * 0.34, 0.8)
        r.hold(2.2)
        r.say(None)

        r.marks["end"] = r.n
        r.close()
        frames, events = r.n, r.events
        browser.close()

    sound(frames / FPS, events)
    print("recorded", frames, "frames to", RAW, "- now: python tools/camera.py")


def sound(secs, events, rate=48000):
    """A quiet mouse and keyboard: a click for each click, a press and release for each drag, ticks while the wheel
    turns, and a tap for each key. Written on their own (film/demo_clicks.wav); tools/mix_audio.py lays the music and
    the voice under them."""
    n = int(secs * rate)
    out = np.zeros((n, 2), np.float32)

    rng = np.random.default_rng(7)

    def click(freq, length, level):
        t = np.arange(int(length * rate)) / rate
        body = np.sin(2 * np.pi * freq * t) * np.exp(-t * 180)
        noise = rng.standard_normal(len(t)) * np.exp(-t * 900) * 0.6
        return ((body + noise) * level).astype(np.float32)

    sounds = {"click": click(2400, 0.03, 0.22), "down": click(2000, 0.025, 0.16), "up": click(2700, 0.02, 0.12),
              "tick": click(3200, 0.012, 0.07), "key": click(1800, 0.03, 0.14)}
    for frame, kind in events:
        s = sounds[kind]
        start = int(frame / FPS * rate)
        end = min(n, start + len(s))
        if start < n:
            out[start:end] += s[: end - start, None]
    mix_audio.write_wav(OUT / "demo_clicks.wav", out)


if __name__ == "__main__":
    run()
