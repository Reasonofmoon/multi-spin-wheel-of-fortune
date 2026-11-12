#!/usr/bin/env python3
"""
"From Phonics to Reading" — 8-second seamless storybook loop.

Renders five hand-painted keyframes into a looping 16:9 animation with
page-turn transitions, breathing camera moves, warm light sweeps and
drifting dust motes.  No text is ever drawn into the frame.

Usage:
    python3 render_loop.py --frames /tmp/p2r_frames       # write PNG frames
    python3 render_loop.py --preview /tmp/preview.png     # one contact sheet

For a full render plus encode, use encode.py in this folder.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

# --------------------------------------------------------------------------
# timing / format
# --------------------------------------------------------------------------
W, H = 1920, 1080
FPS = 24
DURATION = 8.0
N_FRAMES = int(round(FPS * DURATION))      # 192
SLOT = DURATION / 5.0                       # 1.6 s per milestone
TRANS = 0.60                                # page-turn length (s)
CAM_LIFE = SLOT + TRANS                     # camera move spans reveal -> removal

SRC_SCALE = 1.3953                          # pre-upsample the paintings once
SW, SH = 1920, 1080

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SCENE_DIR = os.path.join(ROOT, "assets", "scenes")
SCENE_FILES = [
    "scene-1-letter-sounds.png",
    "scene-2-blend-cat.png",
    "scene-3-phonics-patterns.png",
    "scene-4-beginner-reader.png",
    "scene-5-library-chapter-book.png",
]

# per scene: focal centre in source-normalised coords, lateral drift, light direction
SCENE_TUNE = [
    # fx/fy: focal point, dx/dy: lateral drift over the shot,
    # zs: per-scene zoom bias so the girl stays the same size on screen
    dict(fx=0.540, fy=0.500, dx=+0.010, dy=-0.008, sweep=+1, zs=1.000),
    dict(fx=0.556, fy=0.505, dx=-0.013, dy=-0.006, sweep=-1, zs=0.992),
    dict(fx=0.470, fy=0.520, dx=+0.009, dy=-0.008, sweep=+1, zs=0.905),
    dict(fx=0.520, fy=0.500, dx=-0.010, dy=-0.007, sweep=-1, zs=0.995),
    dict(fx=0.500, fy=0.520, dx=+0.008, dy=-0.009, sweep=+1, zs=0.972),
]

ZOOM_START = 0.962     # fraction of the painting visible when it is born
ZOOM_END = 0.997       # ... and when it hands over to the next milestone

PAPER_RGB = np.array([247.0, 242.0, 229.0], dtype=np.float32)


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------
def ease_out_cubic(p: float) -> float:
    p = min(max(p, 0.0), 1.0)
    return 1.0 - (1.0 - p) ** 3


def ease_in_out(p: float) -> float:
    p = min(max(p, 0.0), 1.0)
    return p * p * (3.0 - 2.0 * p)


def smoothstep(p: float) -> float:
    p = min(max(p, 0.0), 1.0)
    return p * p * (3.0 - 2.0 * p)


def blur(a: np.ndarray, radius: float, mode: str = "L") -> np.ndarray:
    """Gaussian blur a 2-D float array via PIL (keeps memory low)."""
    lo, hi = float(a.min()), float(a.max())
    span = max(hi - lo, 1e-6)
    img = Image.fromarray(((a - lo) / span * 255.0).astype(np.uint8), mode="L")
    img = img.filter(ImageFilter.GaussianBlur(radius))
    out = np.asarray(img, dtype=np.float32) / 255.0 * span + lo
    return out


def low_freq_noise(rng: np.random.Generator, h: int, w: int, cell: int) -> np.ndarray:
    small = rng.random((max(h // cell, 2), max(w // cell, 2))).astype(np.float32)
    img = Image.fromarray((small * 255).astype(np.uint8), mode="L")
    img = img.resize((w, h), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0


# --------------------------------------------------------------------------
# scene preparation
# --------------------------------------------------------------------------
def load_scenes() -> list[np.ndarray]:
    scenes = []
    target = np.array([247.0, 243.0, 232.0], dtype=np.float32)
    for name in SCENE_FILES:
        path = os.path.join(SCENE_DIR, name)
        img = Image.open(path).convert("RGB").resize((SW, SH), Image.LANCZOS)
        # gentle micro-contrast so upscaling keeps the pencil tooth
        img = img.filter(ImageFilter.UnsharpMask(radius=2.2, percent=52, threshold=2))
        a = np.asarray(img, dtype=np.float32)

        # normalise the paper white-point across scenes so cuts do not flicker
        luma = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        white = float(np.percentile(luma, 97.5))
        gain = float(np.clip(247.0 / max(white, 1.0), 0.965, 1.075))
        a = a * gain
        scenes.append(np.clip(a, 0, 255).astype(np.float32))
    return scenes


def build_overlays() -> dict:
    rng = np.random.default_rng(20261025)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    nx = (xx - W / 2) / (W / 2)
    ny = (yy - H / 2) / (H / 2)
    r = np.sqrt(nx ** 2 + ny ** 2 * 0.85)

    # vignette: whisper-soft, keeps the ivory airy
    vig = 1.0 - 0.098 * np.clip(r, 0, 1.35) ** 2.4
    vig = vig.astype(np.float32)

    # paper tooth: fine grain + coarser fibre wash
    grain = rng.normal(0, 1, (H, W)).astype(np.float32)
    grain = blur(grain, 0.6)
    grain /= max(np.abs(grain).max(), 1e-6)
    fibre = low_freq_noise(rng, H, W, 5) - 0.5
    fibre = blur(fibre, 1.4)
    paper = (0.55 * grain + 0.9 * fibre).astype(np.float32)

    # moving light sweep (rolled horizontally each frame)
    sweep = low_freq_noise(rng, 96, 512, 24)
    sweep = sweep - sweep.mean()
    sweep = sweep / (np.abs(sweep).max() + 1e-6)
    sweep_img = Image.fromarray(((sweep * 0.5 + 0.5) * 255).astype(np.uint8), "L")
    sweep_big = np.asarray(
        sweep_img.resize((W, H), Image.BICUBIC), dtype=np.float32
    ) / 255.0
    sweep_big = sweep_big - sweep_big.mean()
    sweep_big /= np.abs(sweep_big).max() + 1e-6

    # dust motes (loop-safe: fully periodic over DURATION)
    n = 30
    motes = dict(
        x=rng.random(n),
        y=rng.random(n),
        rad=rng.uniform(7.0, 26.0, n),
        phase=rng.uniform(0, 2 * math.pi, n),
        rise=rng.uniform(0.35, 1.0, n),
        amp=rng.uniform(0.004, 0.013, n),
        alpha=rng.uniform(0.05, 0.135, n),
    )

    # soft blob sprite for the motes
    R = 40
    gy, gx = np.mgrid[-R:R + 1, -R:R + 1].astype(np.float32)
    blob = np.exp(-(gx ** 2 + gy ** 2) / (2 * (R * 0.42) ** 2))
    blob = (blob / blob.max()).astype(np.float32)

    return dict(vig=vig, paper=paper, sweep=sweep_big, motes=motes, blob=blob)


# --------------------------------------------------------------------------
# camera
# --------------------------------------------------------------------------
def camera(scene: np.ndarray, p: float, tune: dict) -> np.ndarray:
    """Render one scene at camera progress p (0..1) into a WxH frame.

    ``z`` is the fraction of the painting that stays visible, so the move is a
    slow push-in that never wanders off the artwork.
    """
    e = ease_out_cubic(p)
    # a whisper of settle so the page feels like it lands rather than slides
    e = e + 0.030 * math.sin(math.pi * min(p / 0.42, 1.0)) * (1.0 - p) ** 1.5
    z = (ZOOM_START + (ZOOM_END - ZOOM_START) * e) * tune.get("zs", 1.0)

    # gentle float so the frame never feels frozen
    float_x = 2.4 * math.sin(2 * math.pi * p * 0.9 + 0.4)
    float_y = 1.7 * math.sin(2 * math.pi * p * 1.3 + 1.9)

    half_w, half_h = W * z / 2.0, H * z / 2.0
    cx = float(np.clip((tune["fx"] + tune["dx"] * e) * SW + float_x, half_w, SW - half_w))
    cy = float(np.clip((tune["fy"] + tune["dy"] * e) * SH + float_y, half_h, SH - half_h))

    a = z
    c = cx - (W / 2.0) * z
    f = cy - (H / 2.0) * z
    img = Image.fromarray(np.clip(scene, 0, 255).astype(np.uint8), "RGB")
    return np.asarray(
        img.transform((W, H), Image.AFFINE, (a, 0, c, 0, a, f), resample=Image.BICUBIC),
        dtype=np.float32,
    )


# --------------------------------------------------------------------------
# page-turn
# --------------------------------------------------------------------------
def _hwarp(img: np.ndarray, shift: np.ndarray) -> np.ndarray:
    """Horizontal bilinear gather; shift>0 samples from the right (content moves left)."""
    x = np.arange(W, dtype=np.float32)[None, :]
    sx = np.clip(x + shift, 0.0, W - 1.0)
    x0 = np.floor(sx).astype(np.int32)
    fx = (sx - x0)[..., None]
    x0 = np.clip(x0, 0, W - 1)
    x1 = np.clip(x0 + 1, 0, W - 1)
    p0 = np.take_along_axis(img, x0[..., None], axis=1)
    p1 = np.take_along_axis(img, x1[..., None], axis=1)
    return p0 * (1.0 - fx) + p1 * fx


def page_turn(outgoing: np.ndarray, incoming: np.ndarray, prog: float, paper_tex: np.ndarray | None = None) -> np.ndarray:
    """A storybook leaf sweeps left to right, uncovering the next spread.

    Layers, back to front: the new painting, the shadow the lifted leaf throws
    onto it, a few fanned ghost sheets, the cream underside of the lifting leaf,
    and finally the old painting still lying flat to the right of the fold.
    """
    e = ease_in_out(prog) * 0.72 + prog * 0.28
    xc = -0.30 * W + (1.60 * W) * e

    v = np.linspace(0.0, 1.0, H, dtype=np.float32)
    # a hand-drawn seam: the leaf peels from the lower edge and trails at the top
    seam = (
        xc
        + 88.0 * np.sin(v * 2.05 + 1.15)
        + 52.0 * (v - 0.5)
        + 20.0 * np.sin(v * 6.3 + 2.3)
        + 8.0 * np.sin(v * 12.7 + 0.4)
    ).astype(np.float32)

    xs = np.arange(W, dtype=np.float32)[None, :]
    d = xs - seam[:, None]                      # <0 -> new page, >0 -> old page

    frame = incoming.copy()

    # -- shadow the lifted leaf casts onto the newly revealed page --------------
    lift = math.sin(math.pi * prog) ** 0.55      # leaf is highest mid-turn
    band = np.clip(-d, 0.0, None)
    shade = 0.30 * lift * np.exp(-band / 120.0)
    frame *= (1.0 - shade)[..., None]

    # warm reflected bounce right under the leaf, keeps it airy
    bounce = 0.020 * lift * np.exp(-band / 26.0)
    frame += bounce[..., None] * 255.0 * np.array([1.0, 0.97, 0.90], dtype=np.float32)

    # -- fanned ghost sheets settling onto the new page ------------------------
    for off, strength, wid in ((30.0, 0.22, 9.0), (52.0, 0.14, 13.0), (78.0, 0.08, 18.0)):
        g = np.exp(-((band - off) / wid) ** 2) * lift
        frame = frame * (1.0 - g[..., None] * strength) + PAPER_RGB * g[..., None] * strength
        lip = np.exp(-((band - off + 5.0) / 1.8) ** 2) * lift * 0.5
        frame = frame * (1.0 - lip[..., None]) + (PAPER_RGB * 0.93) * lip[..., None]

    # -- the cream underside of the lifting leaf --------------------------------
    width = 96.0 + 340.0 * lift
    q = np.clip(1.0 - band / width, 0.0, 1.0)     # 1 at the fold, 0 at the free edge
    # the leaf only exists in a band of `width` px hugging the fold
    leaf_alpha = np.clip(band / 2.0, 0.0, 1.0) * np.clip((width - band) / 2.0, 0.0, 1.0)
    # shade it like curled paper: catches light near the fold, dips at the edge
    curl = 1.0 - q
    curl_shade = 0.90 + 0.10 * np.maximum(np.sin(np.pi * np.clip(band / width, 0, 1)), 0.0) ** 0.7

    paper_face = PAPER_RGB[None, None, :] * curl_shade[..., None] * (0.988 + 0.026 * (1.0 - curl)[..., None])
    if paper_tex is not None:
        paper_face = paper_face * (1.0 + 0.020 * paper_tex[..., None])
    # faint fibre shading on the leaf underside so it does not read as flat fill
    paper_face = paper_face * (0.99 + 0.014 * np.sin(v * 22.0))[:, None, None]
    frame = frame * (1.0 - leaf_alpha[..., None]) + paper_face * leaf_alpha[..., None]

    # crisp outer edge of the leaf: hairline pencil + a sliver of highlight
    edge = np.exp(-((band - width) / 1.9) ** 2) * lift
    frame = frame * (1.0 - 0.34 * edge[..., None])
    hi = np.exp(-((band - width - 3.5) / 1.9) ** 2) * lift
    frame += hi[..., None] * 26.0 * np.array([1.0, 0.99, 0.94], dtype=np.float32)
    # pencil hairline tracing the free edge of the leaf
    hair = np.exp(-((band - width - 1.2) / 1.0) ** 2) * lift
    frame = frame * (1.0 - 0.16 * hair[..., None])

    # -- the old painting, still flat right of the fold ------------------------
    m = np.clip(0.5 + d / 2.0, 0.0, 1.0)[..., None]
    right = np.clip(d, 0.0, None)
    old = outgoing * (1.0 - 0.20 * np.exp(-right / 34.0))[..., None]
    frame = frame * (1.0 - m) + old * m

    # a breath of warm light as the leaf passes
    frame = frame + (0.014 * math.sin(math.pi * prog) ** 1.4) * 255.0 * np.array(
        [1.0, 0.975, 0.92], dtype=np.float32
    )
    return np.clip(frame, 0, 255)


# --------------------------------------------------------------------------
# atmosphere
# --------------------------------------------------------------------------
def add_dust(frame: np.ndarray, t: float, ov: dict) -> np.ndarray:
    m = ov["motes"]
    blob = ov["blob"]
    R = (blob.shape[0] - 1) // 2
    loop = t / DURATION

    for i in range(len(m["x"])):
        prog = (loop * m["rise"][i] + m["phase"][i] / (2 * math.pi)) % 1.0
        py = (m["y"][i] - prog * 0.16) % 1.0
        px = (m["x"][i] + m["amp"][i] * math.sin(2 * math.pi * loop + m["phase"][i])) % 1.0
        # fade in/out at the edges of the drift so the wrap is invisible
        fade = smoothstep(min(prog / 0.18, 1.0)) * smoothstep(min((1.0 - prog) / 0.22, 1.0))
        alpha = m["alpha"][i] * fade
        if alpha < 0.004:
            continue
        cx, cy = px * W, py * H
        r = m["rad"][i]
        size = int(r * 1.15)
        x0, x1 = int(cx) - size, int(cx) + size + 1
        y0, y1 = int(cy) - size, int(cy) + size + 1
        if x1 <= 0 or y1 <= 0 or x0 >= W or y0 >= H:
            continue
        sx0, sy0 = max(0, -x0), max(0, -y0)
        x0c, x1c = max(0, x0), min(W, x1)
        y0c, y1c = max(0, y0), min(H, y1)
        sprite = np.asarray(
            Image.fromarray((blob * 255).astype(np.uint8), "L").resize(
                (2 * size + 1, 2 * size + 1), Image.BILINEAR
            ),
            dtype=np.float32,
        ) / 255.0
        sprite = sprite[sy0:sy0 + (y1c - y0c), sx0:sx0 + (x1c - x0c)]
        patch = frame[y0c:y1c, x0c:x1c]
        frame[y0c:y1c, x0c:x1c] = patch * (1.0 - alpha * sprite[..., None] * 0.55) + (
            np.array([250.0, 226.0, 176.0], dtype=np.float32)
            * alpha
            * sprite[..., None]
        )
    return frame


def finish(frame: np.ndarray, t: float, ov: dict, tune: dict, grain_shift: int) -> np.ndarray:
    # light sweep drifting across the page
    sweep = np.roll(ov["sweep"], grain_shift, axis=1)
    frame = frame + sweep[..., None] * 7.5 * np.array([1.0, 0.93, 0.78], dtype=np.float32)

    # paper tooth (static-ish, tiny shift to keep the fibres alive)
    paper = np.roll(ov["paper"], int(grain_shift * 0.05), axis=0)
    frame = frame + paper[..., None] * 3.4

    # vignette
    frame = frame * ov["vig"][..., None]

    # a hair of extra light so the ivory stays luminous after encoding
    frame = frame * 1.012 + 2.2

    # gentle warm bloom so highlights stay watercolour-soft
    return frame


# --------------------------------------------------------------------------
# one frame
# --------------------------------------------------------------------------
def render_frame(t: float, scenes: list[np.ndarray], ov: dict) -> np.ndarray:
    t = t % DURATION
    i = int(math.floor(t / SLOT)) % 5
    u = t - i * SLOT

    nxt = (i + 1) % 5

    def cam_p(idx: int, time: float) -> float:
        # scene born TRANS before its slot, dies TRANS after it
        t0 = idx * SLOT - TRANS
        dt = time - t0
        if dt < -SLOT:                     # wrapped (scene 1 near the loop seam)
            dt += DURATION
        elif dt > DURATION - SLOT:
            dt -= DURATION
        return min(max(dt / CAM_LIFE, 0.0), 1.0)

    grain_shift = int(round(W * (t / DURATION)))

    if u < SLOT - TRANS:
        p = cam_p(i, t)
        frame = camera(scenes[i], p, SCENE_TUNE[i])
        frame = finish(frame, t, ov, SCENE_TUNE[i], grain_shift)
    else:
        prog = (u - (SLOT - TRANS)) / TRANS
        a = camera(scenes[i], cam_p(i, t), SCENE_TUNE[i])
        b = camera(scenes[nxt], cam_p(nxt, t), SCENE_TUNE[nxt])
        a = finish(a, t, ov, SCENE_TUNE[i], grain_shift)
        b = finish(b, t, ov, SCENE_TUNE[nxt], grain_shift)
        frame = page_turn(a, b, prog, ov['paper'])

    frame = add_dust(frame, t, ov)
    return np.clip(frame, 0, 255).astype(np.uint8)


# --------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", help="directory for PNG frames")
    ap.add_argument("--preview", help="write a contact sheet of stills here")
    ap.add_argument("--every", type=int, default=1)
    args = ap.parse_args()

    scenes = load_scenes()
    ov = build_overlays()

    if args.preview:
        times = [0.35, 1.95, 3.55, 5.15, 6.75, 7.55]
        sheet = Image.new("RGB", (W // 2 * 3, H // 2 * 2), (245, 242, 232))
        for k, tt in enumerate(times):
            fr = render_frame(tt, scenes, ov)
            thumb = Image.fromarray(fr).resize((W // 2, H // 2), Image.LANCZOS)
            sheet.paste(thumb, ((k % 3) * (W // 2), (k // 3) * (H // 2)))
        sheet.save(args.preview)
        print("wrote", args.preview)
        return 0

    if not args.frames:
        ap.error("need --frames or --preview")
    os.makedirs(args.frames, exist_ok=True)
    for k in range(0, N_FRAMES, args.every):
        t = k / FPS
        fr = render_frame(t, scenes, ov)
        Image.fromarray(fr).save(os.path.join(args.frames, f"f_{k:04d}.png"))
        if k % 24 == 0:
            print(f"frame {k}/{N_FRAMES}", flush=True)
    print("done", N_FRAMES)
    return 0


if __name__ == "__main__":
    sys.exit(main())
