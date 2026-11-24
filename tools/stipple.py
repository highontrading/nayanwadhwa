#!/usr/bin/env python3
"""Render the hero artwork: a grainy, stippled marble head with an open top.

The source is a public-domain (CC0) museum photograph:

    Portrait Head of a Youth, Roman, 14-68 CE (reworked late 4th-early 5th century)
    The Art Institute of Chicago, 1889.105, Gift of Martin A. Ryerson
    https://www.artic.edu/artworks/262

The script cuts the sculpture out of its background, slices the head open just
below the eyes, lets the neck dissolve into dust and redraws everything as
random grain. It writes transparent images in two sizes for each theme:

    head-light-{1000,500}.webp   dark grain, for light backgrounds
    head-dark-{1000,500}.webp    light grain, for dark backgrounds

Usage:
    pip install numpy opencv-python-headless
    python3 tools/stipple.py                       # downloads the source photo
    python3 tools/stipple.py --src my-portrait.jpg # or use your own portrait

To use a different portrait, start with a frontal photo on a plain background
and adjust --rect, --cut and --neck until the preview (--preview) looks right.
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

import cv2
import numpy as np

SRC_URL = (
    "https://www.artic.edu/iiif/2/7502d86c-1387-4ae7-f334-94245a52ddd0"
    "/full/3000,/0/default.jpg"
)
# Retouching for the bundled sculpture: its nose is chipped and pitted.
DEFAULT_HEAL = [
    (0.470, 0.474, 0.046, 0.046, 0.35),   # bridge of the nose
    (0.472, 0.520, 0.024, 0.032, 0.55),   # tip, between the nostrils
]
INK = (17, 17, 17)        # grain colour on light backgrounds (#111111)
CHALK = (244, 244, 242)   # grain colour on dark backgrounds


def fetch_source(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        SRC_URL, headers={"User-Agent": "Mozilla/5.0", "AIC-User-Agent": "stipple.py"}
    )
    with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
        f.write(r.read())


def smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def segment(img: np.ndarray, rect_frac: tuple[float, float, float, float]) -> np.ndarray:
    """Foreground mask (uint8 0/1) via GrabCut, seeded with a rectangle."""
    H, W = img.shape[:2]
    s = 900.0 / W
    small = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    h, w = small.shape[:2]
    x, y, rw, rh = rect_frac
    rect = (int(x * w), int(y * h), int(rw * w), int(rh * h))
    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(small, mask, rect, bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)

    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n > 1:  # keep the largest blob only
        fg = (lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel)
    flood = fg.copy()
    cv2.floodFill(flood, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    fg = fg | (1 - flood)  # fill enclosed holes

    full = cv2.resize(fg, (W, H), interpolation=cv2.INTER_LINEAR)
    full = cv2.GaussianBlur(full.astype(np.float32), (0, 0), 2.0)
    return (full > 0.5).astype(np.uint8)


def heal(lum: np.ndarray, fx: float, fy: float, frx: float, fry: float, lift: float) -> np.ndarray:
    """Soften chips and pitting inside an ellipse and lift it towards the
    surrounding highlights. Position and radii are fractions of the image."""
    H, W = lum.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = ((xx - fx * W) / (frx * W)) ** 2 + ((yy - fy * H) / (fry * H)) ** 2
    w = np.clip(1.0 - d, 0, 1) ** 0.6
    k = max(3, int(0.012 * W) | 1)
    smooth = cv2.GaussianBlur(cv2.medianBlur(lum, k), (0, 0), 0.004 * W).astype(np.float32)
    ref = float(np.percentile(lum[d < 2.2], 90))
    smooth += lift * (ref - smooth)
    return np.clip(lum * (1 - w) + smooth * w, 0, 255).astype(np.uint8)


def tone(gray: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Photo luminance -> darkness in [0, 1] with punchy, engraving-like contrast."""
    clahe = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(8, 8))
    g = 0.45 * gray.astype(np.float32) + 0.55 * clahe.apply(gray).astype(np.float32)
    g /= 255.0
    # a little unsharp masking so lips, nostrils and hair strands read clearly
    g = np.clip(g + 0.65 * (g - cv2.GaussianBlur(g, (0, 0), 6.0)), 0, 1)
    lo, hi = np.percentile(g[mask > 0], [1.5, 99.5])
    t = np.clip((g - lo) / (hi - lo), 0, 1)
    return np.clip((0.90 - t) / (0.90 - 0.30), 0, 1) ** 1.05


def build(img: np.ndarray, args: argparse.Namespace) -> dict[str, np.ndarray]:
    """Return per-pixel grain probabilities for both themes, cropped to the art."""
    H, W = img.shape[:2]
    # The red channel sees through the brown staining on old marble far better
    # than a plain greyscale conversion does.
    lum = np.ascontiguousarray(img[..., 2])
    mask = segment(img, tuple(args.rect))
    for hx, hy, hrx, hry, lift in args.heal:
        lum = heal(lum, hx, hy, hrx, hry, lift)
    dark = tone(lum, mask)

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    # ---- the cut: an ellipse through the head just below the eyes ------------
    cy = args.cut * H
    row = np.where(mask[int(cy)] > 0)[0]
    x_l, x_r = float(row.min()), float(row.max())
    cx, rx = (x_l + x_r) / 2.0, (x_r - x_l) / 2.0
    ry = rx * args.tilt
    u = (xx - cx) / rx
    inside_x = np.abs(u) <= 1.0
    arc = ry * np.sqrt(np.clip(1.0 - u * u, 0.0, 1.0))
    e_out = (u * u + ((yy - cy) / ry) ** 2) <= 1.0

    wall = args.wall * rx                       # thickness of the marble shell
    rxi, ryi = rx - wall, ry - 0.34 * wall
    cyi = cy + 0.10 * wall                      # the hollow sits a touch forward
    e_in = (((xx - cx) / rxi) ** 2 + ((yy - cyi) / ryi) ** 2) <= 1.0

    below = np.where(inside_x, yy >= cy + arc, yy >= cy)
    body = (mask > 0) & below & ~e_out          # the outer surface we keep

    # ---- lengthen the neck so it has room to dissolve ------------------------
    y_s = int(args.neck * H)                    # row that gets smeared downwards
    y_end = int(min(H - 1, (args.neck + args.dust) * H))
    src_row = cv2.GaussianBlur(dark[y_s - 6:y_s + 1], (0, 0), 3.0)[-1]
    cols = body[y_s]
    for y in range(y_s + 1, y_end + 1):
        body[y] = cols
        dark[y] = src_row
    body[y_end + 1:] = False

    obj = body | e_out

    # ---- shading --------------------------------------------------------------
    dist = cv2.distanceTransform(obj.astype(np.uint8), cv2.DIST_L2, 5)
    edge = np.exp(-dist / (args.edge * 2.0 * rx))
    # broad cylindrical falloff: the sides of the face turn away from the light
    ys_idx = np.arange(H)
    left = np.array([np.argmax(r) if r.any() else 0 for r in obj], np.float32)
    right = np.array([W - 1 - np.argmax(r[::-1]) if r.any() else W - 1 for r in obj], np.float32)
    left = cv2.GaussianBlur(left.reshape(-1, 1), (0, 0), 12.0).ravel()
    right = cv2.GaussianBlur(right.reshape(-1, 1), (0, 0), 12.0).ravel()
    mid, half = (left + right) / 2.0, np.maximum((right - left) / 2.0, 1.0)
    side = np.clip(np.abs(xx - mid[:, None]) / half[:, None], 0, 1) ** 2.6
    del ys_idx

    surf = 1.0 - (1.0 - dark) * (1.0 - args.edge_gain * edge) * (1.0 - args.side_gain * side)
    # a soft contact shadow right under the rim
    under = np.exp(-np.clip(yy - (cy + arc), 0, None) / (0.55 * ry)) * inside_x
    surf = 1.0 - (1.0 - surf) * (1.0 - 0.16 * under)

    # the rim (cut face) catches the light; the hollow is nearly black
    rim_shade = 0.10 + 0.22 * np.abs(u) ** 2 + 0.55 * np.exp(-dist / (0.012 * 2 * rx))
    depth = smoothstep(cyi - ryi, cyi + ryi, yy)           # 0 at the back wall
    hollow = 0.985 - 0.11 * (1.0 - depth) ** 3.0 * (1.0 - np.abs((xx - cx) / rxi) ** 2).clip(0, 1)

    d_light = np.where(e_in, hollow, np.where(e_out, np.clip(rim_shade, 0, 1), surf))
    d_light = np.where(obj, d_light, 0.0)

    # dark theme: draw the light instead of the shadow
    lit = np.clip(1.0 - surf, 0, 1) ** 1.25
    lit = np.clip(lit * 1.18 + 0.05, 0, 1)
    rim_lit = np.clip(0.95 - 0.35 * np.abs(u) ** 2, 0, 1)
    hollow_lit = 0.03 + 0.12 * (1.0 - depth) ** 3.0 * (1.0 - np.abs((xx - cx) / rxi) ** 2).clip(0, 1)
    d_dark = np.where(e_in, hollow_lit, np.where(e_out, rim_lit, lit))
    d_dark = np.where(obj, d_dark, 0.0)

    # ---- dissolve: the neck thins out into dust --------------------------------
    f0, f1 = args.fade * H, float(y_end)
    fade = (1.0 - smoothstep(f0, f1, yy)) ** 1.6
    d_light = d_light * fade
    d_dark = d_dark * fade

    # ---- crop -------------------------------------------------------------------
    ys, xs = np.where(obj)
    pad = int(0.035 * (xs.max() - xs.min()))
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(H, y_end + pad)
    return {
        "light": d_light[y0:y1, x0:x1],
        "dark": d_dark[y0:y1, x0:x1],
        "fade_y": np.array([(f0 - y0) / (y1 - y0), (f1 - y0) / (y1 - y0)]),
    }


def grain(prob: np.ndarray, fade_y: np.ndarray, lattice_w: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Random dither on a coarse lattice. Returns (lattice points image, shape)."""
    h0, w0 = prob.shape
    lw = lattice_w
    lh = int(round(h0 * lw / w0))
    p = cv2.resize(prob, (lw, lh), interpolation=cv2.INTER_AREA)
    rng = np.random.default_rng(seed)
    on = rng.random((lh, lw)) < p

    # scatter the grains inside the dissolve zone so the edge breaks up into dust
    ys, xs = np.nonzero(on)
    fy0, fy1 = fade_y[0] * lh, fade_y[1] * lh
    t = np.clip((ys - fy0) / max(fy1 - fy0, 1.0), 0, 1)
    spread = (t ** 1.7) * 0.085 * lh
    ys2 = ys + np.abs(rng.normal(0, 1, len(ys))) * spread * 0.9
    xs2 = xs + rng.normal(0, 1, len(xs)) * spread * 0.55
    ok = (ys2 >= 0) & (ys2 < lh) & (xs2 >= 0) & (xs2 < lw)
    out = np.zeros((lh, lw), np.float32)
    out[ys2[ok].astype(int), xs2[ok].astype(int)] = 1.0
    return out, np.array([lh, lw])


def rasterise(points: np.ndarray, scale: int) -> np.ndarray:
    """Lattice points -> 8-bit alpha. At scale 2 each grain becomes a soft 2px dot."""
    if scale == 1:
        soft = cv2.GaussianBlur(points, (0, 0), 0.42)
        a = np.clip(soft * 1.9, 0, 1)
    else:
        big = cv2.resize(points, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST)
        soft = cv2.GaussianBlur(big, (0, 0), 0.62 * scale / 2.0)
        a = np.clip((soft - 0.16) / 0.52, 0, 1)
    return (a * 255.0 + 0.5).astype(np.uint8)


def save(alpha: np.ndarray, colour: tuple[int, int, int], path: Path, quality: int) -> None:
    h, w = alpha.shape
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = colour[2], colour[1], colour[0]  # BGR
    rgba[..., 3] = alpha
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".webp":
        cv2.imwrite(str(path), rgba, [cv2.IMWRITE_WEBP_QUALITY, quality])
    else:
        cv2.imwrite(str(path), rgba, [cv2.IMWRITE_PNG_COMPRESSION, 9])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, default=Path(__file__).with_name("source") / "portrait-head-of-a-youth.jpg")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "assets" / "img")
    ap.add_argument("--rect", type=float, nargs=4, default=[0.135, 0.085, 0.69, 0.735],
                    metavar=("X", "Y", "W", "H"), help="box around the subject, as fractions of the image")
    ap.add_argument("--cut", type=float, default=0.397, help="height of the cut (fraction of image height)")
    ap.add_argument("--tilt", type=float, default=0.165, help="how far we look into the opening (ellipse ry/rx)")
    ap.add_argument("--wall", type=float, default=0.075, help="shell thickness, as a fraction of the opening radius")
    ap.add_argument("--neck", type=float, default=0.772, help="row that is extended downwards (fraction of height)")
    ap.add_argument("--fade", type=float, default=0.762, help="where the dissolve starts (fraction of height)")
    ap.add_argument("--dust", type=float, default=0.16, help="how far the dust falls below --neck")
    ap.add_argument("--edge", type=float, default=0.028, help="width of the edge shading")
    ap.add_argument("--edge-gain", type=float, default=0.55, help="strength of the edge shading")
    ap.add_argument("--side-gain", type=float, default=0.36, help="how much the sides fall into shadow")
    ap.add_argument("--heal", type=float, nargs=5, action="append", metavar=("X", "Y", "RX", "RY", "LIFT"),
                    help="retouch damage inside an ellipse (image fractions, lift 0-1); repeatable. "
                         "Defaults repair the chipped nose of the bundled sculpture.")
    ap.add_argument("--lattice", type=int, default=500, help="grains across the image")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--quality", type=int, default=101, help="WebP quality; >100 means lossless")
    ap.add_argument("--format", choices=["webp", "png"], default="webp")
    ap.add_argument("--preview", type=Path, help="also write a flattened preview PNG here")
    args = ap.parse_args()
    if args.heal is None:
        using_default_source = args.src == ap.get_default("src")
        args.heal = DEFAULT_HEAL if using_default_source else []

    if not args.src.exists():
        print(f"downloading source photo -> {args.src}")
        fetch_source(args.src)
    img = cv2.imread(str(args.src))
    if img is None:
        print(f"could not read {args.src}", file=sys.stderr)
        return 1

    maps = build(img, args)
    previews = []
    for theme, colour, bg in (("light", INK, (250, 250, 250)), ("dark", CHALK, (15, 15, 15))):
        pts, _ = grain(maps[theme], maps["fade_y"], args.lattice, args.seed)
        for scale in (2, 1):
            alpha = rasterise(pts, scale)
            out = args.out / f"head-{theme}-{args.lattice * scale}.{args.format}"
            save(alpha, colour, out, args.quality)
            print(f"{out}  {alpha.shape[1]}x{alpha.shape[0]}  {out.stat().st_size / 1024:.1f} KB")
            if scale == 2 and args.preview:
                a = alpha[..., None].astype(np.float32) / 255.0
                flat = np.full(alpha.shape + (3,), bg[::-1], np.float32) * (1 - a) + np.array(colour[::-1], np.float32) * a
                previews.append(flat.astype(np.uint8))
    if args.preview:
        cv2.imwrite(str(args.preview), np.hstack(previews))
        print(f"preview -> {args.preview}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
