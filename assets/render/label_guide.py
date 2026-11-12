#!/usr/bin/env python3
"""Generate a label-placement guide: where each milestone leaves clean ivory space."""

import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
STILLS = os.path.join(ROOT, "assets", "animation", "stills")
OUT = os.path.join(ROOT, "assets", "animation", "label-safe-areas.png")

# clean-paper rectangles in 0..1 frame coords, derived from the rendered stills
ZONES = [
    # (x0, y0, x1, y1) — deliberately conservative, well clear of the artwork
    (0.030, 0.060, 0.450, 0.470),
    (0.030, 0.200, 0.415, 0.520),
    (0.625, 0.120, 0.970, 0.530),
    (0.030, 0.060, 0.365, 0.430),
    (0.030, 0.060, 0.510, 0.395),
]
CAPTIONS = [
    "1  Letter sounds",
    "2  Blending  c-a-t",
    "3  Phonics patterns",
    "4  Beginner reader",
    "5  Chapter book",
]

CELL_W, CELL_H = 768, 432
PAD = 26
INK = (62, 74, 72)
TEAL = (52, 104, 100)
MUSTARD = (176, 137, 55)
IVORY = (247, 242, 229)


def dashed(draw, box, colour, width=3, dash=14, gap=9):
    x0, y0, x1, y1 = box
    for (ax, ay, bx, by) in ((x0, y0, x1, y0), (x1, y0, x1, y1),
                             (x1, y1, x0, y1), (x0, y1, x0, y0)):
        length = max(abs(bx - ax), abs(by - ay))
        steps = max(int(length // (dash + gap)), 1)
        for s in range(steps + 1):
            t0 = s * (dash + gap) / length
            t1 = min((s * (dash + gap) + dash) / length, 1.0)
            draw.line(
                [ax + (bx - ax) * t0, ay + (by - ay) * t0,
                 ax + (bx - ax) * t1, ay + (by - ay) * t1],
                fill=colour, width=width,
            )


def main() -> int:
    files = sorted(os.listdir(STILLS))
    cols, rows = 3, 2
    W = PAD + cols * (CELL_W + PAD)
    H = 120 + PAD + rows * (CELL_H + PAD + 34)
    sheet = Image.new("RGB", (W, H), IVORY)
    d = ImageDraw.Draw(sheet)

    d.text((PAD, 34), "FROM PHONICS TO READING  -  label safe areas (16:9, 1920x1080)",
           fill=INK)
    d.text((PAD, 62), "dashed box = clean paper reserved for your text; nothing in the "
                      "animation enters it except drifting dust motes",
           fill=(110, 118, 112))

    for i, f in enumerate(files):
        im = Image.open(os.path.join(STILLS, f)).convert("RGB").resize(
            (CELL_W, CELL_H), Image.LANCZOS)
        cx = PAD + (i % cols) * (CELL_W + PAD)
        cy = 120 + PAD + (i // cols) * (CELL_H + PAD + 34)
        sheet.paste(im, (cx, cy))
        zx0, zy0, zx1, zy1 = ZONES[i]
        dashed(d, (cx + zx0 * CELL_W, cy + zy0 * CELL_H,
                   cx + zx1 * CELL_W, cy + zy1 * CELL_H), TEAL)
        d.rectangle([cx, cy + CELL_H - 30, cx + 210, cy + CELL_H], fill=IVORY)
        d.text((cx + 4, cy + CELL_H - 26), CAPTIONS[i], fill=MUSTARD)
        d.text((cx + CELL_W - 150, cy + CELL_H - 26), f"{i * 1.6:.1f}s - {(i + 1) * 1.6:.1f}s",
               fill=(120, 126, 120))

    d.text((PAD, H - 34),
           "Timing: 8.00 s loop at 24 fps  -  5 milestones x 1.60 s  -  0.60 s page-turn "
           "wipes back to milestone 1",
           fill=INK)
    sheet.save(OUT)
    print("wrote", OUT, sheet.size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
