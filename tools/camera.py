"""Frame the recorded session (film/raw/, from tools/record_demo.py) as the two films: 16:9 for LinkedIn and 9:16 for
the Reel.

The camera is planned over the whole session, not chased frame by frame. It rests where it is while the hand works
inside the middle of the view, and only sets off when the hand leaves it; the path is then smoothed both ways in time,
so every move starts early and slowly, lands softly, and never lags behind the hand or overshoots.

16:9: the screen, eased in where the session asks for it, with the cursor drawn on and a caption along the bottom.
9:16: the whole studio on top, so it is always plain that this is an editor, with a thin gold box where the camera
is; that place up close below it; the caption above both.

Writes film/demo_video.mp4 and film/demo_vertical.mp4 (no sound), and a frame a second of each to look over; with
--no-captions, the same without the captions (*_nocap.mp4), for films subtitled from their narration instead.
With --insta, only the 9:16 cut, laid out inside Instagram's safe area (clear of the Reels header at the top and of
the caption and buttons at the bottom): film/demo_vertical_ig*.mp4.
Usage: python tools/camera.py [--no-captions] [--insta]
"""
import io
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "film"
RAW = OUT / "raw"
W, H = 1920, 1080
NEAR = 1.8  # how much closer the Reel's close-up is than the 16:9 view
NW, NH = 1080, 760  # the Reel's close-up
STUDIO_Y, NEAR_Y, CAP_Y = 330, 962, 200
INSTA = "--insta" in sys.argv
if INSTA:  # everything between about 260 px from the top and 400 px from the bottom
    NH = 520
    STUDIO_Y, NEAR_Y, CAP_Y = 380, 1000, 310


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


def smooth(a, sigma):
    """Gaussian smoothing over time, both ways, holding the ends."""
    r = int(sigma * 3)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    return np.convolve(np.pad(a, r, mode="edge"), k, mode="valid")


def plan(states, fps, near=1.0, aspect=W / H):
    """The camera's centre and zoom for every frame."""
    zoom = smooth(np.array([max(s["zoom"], 1.0) * near for s in states]), 0.55 * fps)
    cx, cy = np.empty(len(states)), np.empty(len(states))
    ax, ay = W / 2, H / 2
    for i, s in enumerate(states):
        if s["focus"]:
            ax, ay = s["focus"]
        else:
            vh = H / max(s["zoom"], 1.0) / near
            vw = vh * aspect
            # rest while the hand is within the middle of the view; set off only when it leaves
            if abs(s["x"] - ax) > vw * 0.28 or abs(s["y"] - ay) > vh * 0.28:
                ax, ay = s["x"], s["y"]
        cx[i], cy[i] = ax, ay
    return smooth(cx, 0.5 * fps), smooth(cy, 0.5 * fps), zoom


def view(cx, cy, vw, vh):
    left = min(max(cx - vw / 2, 0), W - vw)
    top = min(max(cy - vh / 2, 0), H - vh)
    return left, top


def ring(img, px, py, ripple, scale=1.0):
    """A soft ring where a click landed."""
    if ripple <= 0:
        return
    k = 1 - ripple / 8
    r = (10 + 26 * k) * scale
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse((px - r, py - r, px + r, py + r), outline=(255, 255, 255, int(150 * (1 - k))),
                                  width=max(2, round(3 * scale)))
    img.alpha_composite(layer)


def encoder(name, fps):
    return subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(fps), "-i", "-",
         "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", str(OUT / name)],
        stdin=subprocess.PIPE)


def jpeg(img, q=93):
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=q)
    return buf.getvalue()


def main():
    sess = json.loads((RAW / "session.json").read_text())
    fps, states = sess["fps"], sess["states"]
    cursor = arrow()
    vcursor = cursor.resize((40, 58), Image.LANCZOS)
    scursor = cursor.resize((17, 25), Image.LANCZOS)
    caps, vcaps = {}, {}
    captions = "--no-captions" not in sys.argv
    sfx = ("_ig" if INSTA else "") + ("" if captions else "_nocap")
    for f in RAW.glob("cap_*.png") if captions else []:
        caps[int(f.stem[4:])] = Image.open(f).convert("RGBA")
    for f in RAW.glob("vcap_*.png") if captions else []:
        vcaps[int(f.stem[5:])] = Image.open(f).convert("RGBA")

    cx, cy, zoom = plan(states, fps)
    nx, ny, nzoom = plan(states, fps, near=NEAR, aspect=NW / NH)
    for d in ("demo_frames", "demo_frames_v") if captions else ():
        shutil.rmtree(OUT / d, ignore_errors=True)
        (OUT / d).mkdir()
    ff = None if INSTA else encoder(f"demo_video{sfx}.mp4", fps)
    ffv = encoder(f"demo_vertical{sfx}.mp4", fps)
    k = 1080 / W
    for i, s in enumerate(states):
        raw = Image.open(RAW / f"{i:05d}.jpg").convert("RGB")

        # 16:9 (not needed for the Instagram layout)
        if not INSTA:
            z = zoom[i]
            left, top = view(cx[i], cy[i], W / z, H / z)
            img = (raw.resize((W, H), Image.LANCZOS, box=(left, top, left + W / z, top + H / z)) if z > 1.002 else raw).convert("RGBA")
            px, py = (s["x"] - left) * z, (s["y"] - top) * z
            ring(img, px, py, s["ripple"])
            img.alpha_composite(cursor, (int(px) - 1, int(py) - 1))
            if s["cap"] in caps:
                c = caps[s["cap"]]
                img.alpha_composite(c, ((W - c.width) // 2, H - 70 - c.height))
            ff.stdin.write(jpeg(img))

        # 9:16
        v = Image.new("RGBA", (1080, 1920), (14, 12, 10, 255))
        ch = H / nzoom[i]
        cw = ch * NW / NH
        nl, nt = view(nx[i], ny[i], cw, ch)
        whole = raw.resize((1080, 608), Image.LANCZOS).convert("RGBA")
        ImageDraw.Draw(whole).rectangle((nl * k, nt * k, (nl + cw) * k, (nt + ch) * k), outline=(242, 196, 106, 215), width=3)
        whole.alpha_composite(scursor, (int(s["x"] * k), int(s["y"] * k)))
        v.alpha_composite(whole, (0, STUDIO_Y))
        q = NW / cw
        near = raw.resize((NW, NH), Image.LANCZOS, box=(nl, nt, nl + cw, nt + ch)).convert("RGBA")
        px, py = (s["x"] - nl) * q, (s["y"] - nt) * q
        ring(near, px, py, s["ripple"], 1.4)
        if -60 < px < NW + 60 and -60 < py < NH + 60:
            near.alpha_composite(vcursor, (int(px) - 2, int(py) - 2))
        v.alpha_composite(near, (0, NEAR_Y))
        if s["cap"] in vcaps:
            c = vcaps[s["cap"]]
            v.alpha_composite(c, ((1080 - c.width) // 2, CAP_Y - c.height // 2))
        ffv.stdin.write(jpeg(v, 92))

        if i % fps == 0 and captions and not INSTA:
            img.convert("RGB").resize((960, 540)).save(OUT / "demo_frames" / f"{i // fps:03d}.jpg", quality=86)
            v.convert("RGB").resize((360, 640)).save(OUT / "demo_frames_v" / f"{i // fps:03d}.jpg", quality=86)
    for f in (ff, ffv) if ff else (ffv,):
        f.stdin.close()
        f.wait()
    print("wrote demo_video.mp4 and demo_vertical.mp4,", len(states), "frames")


if __name__ == "__main__":
    main()
