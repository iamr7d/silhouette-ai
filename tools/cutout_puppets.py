"""Cut shadow-puppet photographs out of their white backgrounds, keeping the leather's real colour.

Adapted from the portfolio's tools/cutout_puppets.py. The white becomes fully transparent, including inside
the punched holes, so lamplight shows through them on the screen as it does through real leather. Unlike the
portfolio version the colour is kept: Silhouette.ai darkens figures itself for the audience-side view.

Usage: python -I tools/cutout_puppets.py <source folder> <output folder>
Writes <name>.webp (900 px on the long side, alpha) for every image in the source folder.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HEIGHT = 900


def cutout(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    # The paper or wall behind, row by row: museum backdrops often darken towards the floor, so take the
    # median of the left and right edges of each row (smoothed down the picture) rather than one colour.
    b = max(4, min(a.shape[:2]) // 60)
    edges = np.concatenate([a[:, :b], a[:, -b:]], axis=1)
    rows = np.median(edges, axis=1)
    rows = ndimage.median_filter(rows, size=(max(3, a.shape[0] // 40), 1))
    bg = rows[:, None, :]
    # Distance from the background, mostly in brightness and saturation: dyed and translucent leather is
    # darker and more coloured than the white wall behind it.
    sat = a.max(axis=2) - a.min(axis=2)
    dist = np.linalg.norm(a - bg, axis=2) * 0.5 + np.clip(bg.mean(axis=2) - a.mean(axis=2), 0, None) * 0.9 + sat * 0.35
    alpha = np.clip((dist - 30) / 28, 0, 1)
    # Keep the puppet itself: the largest solid shape, not the slivers of neighbours at the edges.
    solid = ndimage.binary_opening(alpha > 0.5, iterations=2)
    lab, n = ndimage.label(solid)
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        main = lab == (int(np.argmax(sizes)) + 1)
        alpha *= ndimage.binary_dilation(main, iterations=3)  # punched holes stay open
    alpha = ndimage.gaussian_filter(alpha, 0.35)
    out = Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8), "RGBA")
    box = Image.fromarray((alpha > 0.1).astype(np.uint8) * 255).getbbox()
    if box:
        out = out.crop(box)
    w, h = out.size
    if h < w:  # a wide figure (an animal, a chariot): hold it to the width instead
        return out.resize((round(HEIGHT * 1.15), round(h * HEIGHT * 1.15 / w)), Image.LANCZOS)
    return out.resize((round(w * HEIGHT / h), HEIGHT), Image.LANCZOS)


def main(src, dst):
    dst = Path(dst)
    dst.mkdir(parents=True, exist_ok=True)
    for p in sorted(Path(src).iterdir()):
        if p.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        im = cutout(p)
        im.save(dst / f"{p.stem}.webp", quality=88, method=6)
        print(f"{p.name} -> {p.stem}.webp {im.size}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
