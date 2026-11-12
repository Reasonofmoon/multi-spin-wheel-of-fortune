#!/usr/bin/env python3
"""Render and encode the "From Phonics to Reading" 8-second seamless loop."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from PIL import Image

import render_loop as R

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.path.join(ROOT, "assets", "animation")

_STATE = {}


def _init(frames_dir: str):
    _STATE["scenes"] = R.load_scenes()
    _STATE["ov"] = R.build_overlays()
    _STATE["frames"] = frames_dir


def _work(k: int) -> str:
    fr = R.render_frame(k / R.FPS, _STATE["scenes"], _STATE["ov"])
    path = os.path.join(_STATE["frames"], f"f_{k:04d}.png")
    Image.fromarray(fr).save(path, compress_level=1)
    return path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--keep-frames", action="store_true")
    args = ap.parse_args()

    ffmpeg = os.environ.get("FFMPEG")
    if not ffmpeg:
        import imageio_ffmpeg

        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    os.makedirs(OUT_DIR, exist_ok=True)
    frames = "/tmp/p2r_frames"
    shutil.rmtree(frames, ignore_errors=True)
    os.makedirs(frames, exist_ok=True)

    t0 = time.time()
    with Pool(args.jobs, initializer=_init, initargs=(frames,)) as pool:
        list(pool.imap_unordered(_work, range(R.N_FRAMES), chunksize=4))
    print(f"rendered {R.N_FRAMES} frames in {time.time() - t0:.1f}s with {args.jobs} jobs")

    mp4 = os.path.join(OUT_DIR, "from-phonics-to-reading-loop.mp4")
    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-framerate", str(R.FPS),
        "-i", os.path.join(frames, "f_%04d.png"),
        "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
        "-c:v", "libx264", "-preset", "slow", "-crf", "17",
        "-tune", "film", "-profile:v", "high", "-level", "4.2",
        "-x264-params", "keyint=48:min-keyint=1:scenecut=0",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-movflags", "+faststart",
        mp4,
    ]
    subprocess.run(cmd, check=True)
    print("wrote", mp4, f"{os.path.getsize(mp4) / 1e6:.1f} MB")

    webm = os.path.join(OUT_DIR, "from-phonics-to-reading-loop.webm")
    subprocess.run(
        [
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-framerate", str(R.FPS), "-i", os.path.join(frames, "f_%04d.png"),
            "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0",
            "-pix_fmt", "yuv420p", "-row-mt", "1", webm,
        ],
        check=True,
    )
    print("wrote", webm, f"{os.path.getsize(webm) / 1e6:.1f} MB")

    gif = os.path.join(OUT_DIR, "preview-loop.gif")
    subprocess.run(
        [
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-framerate", str(R.FPS), "-i", os.path.join(frames, "f_%04d.png"),
            "-vf", "fps=10,scale=480:-1:flags=lanczos,split[a][b];"
                   "[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
            "-loop", "0", gif,
        ],
        check=True,
    )
    print("wrote", gif, f"{os.path.getsize(gif) / 1e6:.1f} MB")

    # one clean still per milestone, for laying out labels in an editor
    stills = os.path.join(OUT_DIR, "stills")
    os.makedirs(stills, exist_ok=True)
    for n, t in enumerate((0.80, 2.40, 4.00, 5.60, 7.00), start=1):
        k = int(round(t * R.FPS))
        shutil.copyfile(
            os.path.join(frames, f"f_{k:04d}.png"),
            os.path.join(stills, f"milestone-{n}-{t:.2f}s.png"),
        )
    print("wrote", stills)

    # poster still from the middle of milestone 1 (calm, most label space)
    poster = os.path.join(OUT_DIR, "poster-16x9.png")
    shutil.copyfile(os.path.join(frames, "f_0021.png"), poster)
    print("wrote", poster)

    if not args.keep_frames:
        shutil.rmtree(frames, ignore_errors=True)

    # ---- verification -----------------------------------------------------
    probe = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", mp4], capture_output=True, text=True
    )
    for line in probe.stderr.splitlines():
        if "Duration" in line or "Stream #" in line:
            print(line.strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
