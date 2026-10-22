"""Render the 9:16 film of the landing page (index.html?video) frame by frame, by driving its clock.

Usage:
  python tools/render_film.py stills 2 6 12 ...   # save a few stills to film/stills/
  python tools/render_film.py frames               # pipe every frame to ffmpeg -> film/part1.mp4 (no sound)
Needs the local server (python serve.py) and Microsoft Edge (used through Playwright).
"""
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "film"
FPS = 30
W, H = 1080, 1920


def open_page(p, url):
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
    page.goto(url, wait_until="networkidle")
    page.wait_for_function("typeof window.__seek === 'function' && window.__ready", timeout=60000)
    page.evaluate("window.__ready")
    page.wait_for_timeout(800)
    return browser, page


def frames(url, length, out_file):
    OUT.mkdir(exist_ok=True)
    n = round(length * FPS)
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", str(out_file)],
        stdin=subprocess.PIPE,
    )
    with sync_playwright() as p:
        browser, page = open_page(p, url)
        for i in range(n):
            page.evaluate(f"window.__seek({i / FPS})")
            ff.stdin.write(page.screenshot(type="jpeg", quality=94))
            if i % 150 == 0:
                print(f"{out_file.name}: frame {i}/{n}", flush=True)
        browser.close()
    ff.stdin.close()
    ff.wait()
    print("wrote", out_file)


def stills(url, times):
    d = OUT / "stills"
    d.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser, page = open_page(p, url)
        # walk the clock forward so chapter changes and comets happen in order, as in the film
        t = 0.0
        for target in sorted(times):
            while t < target:
                t = min(target, t + 0.25)
                page.evaluate(f"window.__seek({t})")
            page.screenshot(path=str(d / f"{Path(url).stem}_{target:05.1f}.jpg"), type="jpeg", quality=90)
        browser.close()
    print("stills in", d)


def assemble(parts, out_file, cross=(0.5, 1.0)):
    """Join the parts (file, length) with crossfades and lay the Tholpavakoothu recording under them."""
    music = ROOT / "assets" / "audio" / "pavakkoothu.mp3"
    inputs, chain, length = [], "", parts[0][1]
    for i, (name, _) in enumerate(parts):
        inputs += ["-i", str(OUT / name)]
    label = "[0:v]"
    for i in range(1, len(parts)):
        c = cross[i - 1]
        out = f"[v{i}]"
        chain += f"{label}[{i}:v]xfade=transition=fade:duration={c}:offset={length - c}{out};"
        length = length - c + parts[i][1]
        label = out
    total = length
    chain += f"[{len(parts)}:a]atrim=0:{total},afade=t=in:st=0:d=1.5,afade=t=out:st={total - 3}:d=3,volume=0.9[a]"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-i", str(music), "-filter_complex", chain,
         "-map", label, "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
         "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{total:.3f}", str(OUT / out_file)],
        check=True,
    )
    print("wrote", OUT / out_file, f"({total:.1f} s)")


if __name__ == "__main__":
    if sys.argv[1] == "assemble":
        assemble([("hook.mp4", 5.5), ("part1.mp4", 35), ("part2.mp4", 30)], "silhouette-ai-reel.mp4")
        sys.exit()
    base = "http://localhost:8765/"
    if sys.argv[1] == "stills":
        page_url = sys.argv[2]
        stills(base + page_url, [float(x) for x in sys.argv[3:]])
    elif sys.argv[1] == "frames":
        page_url, length, name = sys.argv[2], float(sys.argv[3]), sys.argv[4]
        frames(base + page_url, length, OUT / name)
