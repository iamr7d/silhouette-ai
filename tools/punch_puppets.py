"""Give the painted museum figures a punched-leather shadow, as Tholpavakoothu figures have.

The figures added from other traditions (Andhra, Odisha and others) are painted, translucent leather: on the lit cloth
they read as soft grey shapes with no light coming through. This makes each one a solid leather shape and punches it
the way a Tholpavakoothu figure is punched: rows of small holes inset along its outline, and holes following the lines
painted inside it. The colours are kept, for the back view and the 3D view.

Writes assets/puppets/punched/<name>.webp; the originals in assets/puppets/ are left as they are.
Usage: python tools/punch_puppets.py
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "puppets"
OUT = SRC / "punched"
NAMES = ["lakshmana", "hanuman-rc", "tree", "maricha", "hanuman", "indrajit", "vibhishana", "ravana-hermit",
         "rakshasa", "rakshasa-2", "giant", "warrior", "elephant", "tiger", "chariot", "clown"]


def resample(contour, step):
    """Points every `step` pixels along a closed contour."""
    pts = contour[:, 0, :].astype(np.float32)
    if len(pts) < 3:
        return []
    seg = np.diff(np.vstack([pts, pts[:1]]), axis=0)
    lengths = np.hypot(seg[:, 0], seg[:, 1])
    total = lengths.sum()
    out = []
    d = step / 2
    acc = 0.0
    for p, s, l in zip(pts, seg, lengths):
        while l > 0 and d <= acc + l:
            u = (d - acc) / l
            out.append(p + s * u)
            d += step
        acc += l
    return out


class Spacing:
    """Keeps holes from crowding: a point is taken only if no hole lies within `gap`."""

    def __init__(self, gap):
        self.gap = gap
        self.grid = {}

    def take(self, x, y):
        cx, cy = int(x // self.gap), int(y // self.gap)
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for (qx, qy) in self.grid.get((cx + i, cy + j), ()):
                    if (qx - x) ** 2 + (qy - y) ** 2 < self.gap ** 2:
                        return False
        self.grid.setdefault((cx, cy), []).append((x, y))
        return True


def punch(name):
    im = Image.open(SRC / f"{name}.webp").convert("RGBA")
    rgba = np.array(im)
    alpha = rgba[:, :, 3]
    h = alpha.shape[0]
    k = h / 900  # sizes are set for a figure 900 px tall
    # A solid leather shape: the translucent parts filled in, small gaps closed.
    solid = (alpha > 50).astype(np.uint8)
    solid = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    dist = cv2.distanceTransform(solid, cv2.DIST_L2, 5)

    holes = []
    space = Spacing(5.2 * k)
    # Borders: two rows of holes inset along the outline.
    for inset, step in ((6.5 * k, 7.5 * k), (13 * k, 9 * k)):
        band = (dist >= inset).astype(np.uint8)
        contours, _ = cv2.findContours(band, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
        for c in contours:
            if cv2.arcLength(c, True) < 60 * k:
                continue
            for x, y in resample(c, step):
                if space.take(x, y):
                    holes.append((x, y, 1.8 * k))
    # Inside: holes following the painted lines (the edges between the painted colours).
    gray = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2GRAY)
    # Smooth away the photo's grain and the leather's texture, so only the painted shapes give lines.
    gray = cv2.bilateralFilter(gray, 9, 70, 9)
    gray = cv2.medianBlur(gray, 7)
    edges = cv2.Canny(gray, 70, 160)
    edges[dist < 18 * k] = 0
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    inner = Spacing(10 * k)
    for c in sorted(contours, key=lambda c: -cv2.arcLength(c, False)):
        if cv2.arcLength(c, False) < 140 * k:  # long lines only; small marks stay solid
            continue
        for x, y in resample(c, 10 * k):
            if dist[int(y), int(x)] >= 18 * k and inner.take(x, y) and space.take(x, y):
                holes.append((x, y, 1.5 * k))

    out_alpha = (solid * 255).astype(np.uint8)
    for x, y, r in holes:
        cv2.circle(out_alpha, (int(round(x)), int(round(y))), max(1, int(round(r))), 0, -1, lineType=cv2.LINE_AA)
    rgba[:, :, 3] = out_alpha
    OUT.mkdir(exist_ok=True)
    Image.fromarray(rgba).save(OUT / f"{name}.webp", "WEBP", quality=90, method=6)
    return len(holes)


if __name__ == "__main__":
    for n in NAMES:
        print(f"{n}: {punch(n)} holes")
