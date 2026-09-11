"""Create a provenance-preserving 30-frame action strip from six RGBA keyframes.

This is a small dependency-free optical-flow pass for the desktop-pet POC. It
uses a coarse-to-fine Horn-Schunck estimate and bidirectional warping rather
than pretending that a cross-fade is a new pose. The output is still a review
candidate: transparent edges and normal-size motion QA remain authoritative.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


KEY_INDICES = (0, 6, 12, 18, 24, 29)
RESAMPLE = Image.Resampling.BILINEAR


def read_rgba(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGBA")
    return np.asarray(image, dtype=np.float32) / 255.0


def resize_field(field: np.ndarray, width: int, height: int) -> np.ndarray:
    image = Image.fromarray(field.astype(np.float32), mode="F")
    return np.asarray(image.resize((width, height), RESAMPLE), dtype=np.float32)


def gray_and_mask(image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    alpha = image[..., 3]
    premultiplied = image[..., :3] * alpha[..., None]
    gray = premultiplied @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    mask = np.maximum(alpha, (gray > 0.025).astype(np.float32))
    return gray, mask


def neighbour_mean(field: np.ndarray) -> np.ndarray:
    padded = np.pad(field, ((1, 1), (1, 1)), mode="edge")
    return (
        padded[:-2, :-2] + padded[:-2, 1:-1] + padded[:-2, 2:]
        + padded[1:-1, :-2] + padded[1:-1, 2:]
        + padded[2:, :-2] + padded[2:, 1:-1] + padded[2:, 2:]
    ) / 8.0


def estimate_flow(first: np.ndarray, second: np.ndarray, first_mask: np.ndarray, second_mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Estimate forward flow from first to second in pixel coordinates."""

    height, width = first.shape
    flow_x = flow_y = None
    for scale, iterations in ((0.25, 70), (0.5, 55), (1.0, 45)):
        scaled_width = max(8, round(width * scale))
        scaled_height = max(8, round(height * scale))
        current = resize_field(first, scaled_width, scaled_height)
        target = resize_field(second, scaled_width, scaled_height)
        mask = np.maximum(
            resize_field(first_mask, scaled_width, scaled_height),
            resize_field(second_mask, scaled_width, scaled_height),
        )

        if flow_x is None:
            flow_x = np.zeros((scaled_height, scaled_width), dtype=np.float32)
            flow_y = np.zeros_like(flow_x)
        else:
            previous_height, previous_width = flow_x.shape
            flow_x = resize_field(flow_x, scaled_width, scaled_height) * (scaled_width / previous_width)
            flow_y = resize_field(flow_y, scaled_width, scaled_height) * (scaled_height / previous_height)

        ix = np.zeros_like(current)
        iy = np.zeros_like(current)
        ix[:, 1:-1] = (current[:, 2:] - current[:, :-2]) * 0.5
        iy[1:-1, :] = (current[2:, :] - current[:-2, :]) * 0.5
        it = target - current
        active = mask > 0.035
        ix[~active] = 0
        iy[~active] = 0
        it[~active] = 0

        smoothness = 0.85
        for _ in range(iterations):
            average_x = neighbour_mean(flow_x)
            average_y = neighbour_mean(flow_y)
            denominator = smoothness * smoothness + ix * ix + iy * iy
            correction = (ix * average_x + iy * average_y + it) / np.maximum(denominator, 1e-5)
            flow_x = np.where(active, average_x - ix * correction, average_x)
            flow_y = np.where(active, average_y - iy * correction, average_y)
            flow_x = np.clip(flow_x, -32, 32)
            flow_y = np.clip(flow_y, -32, 32)

    assert flow_x is not None and flow_y is not None
    return resize_field(flow_x, width, height) * (width / flow_x.shape[1]), resize_field(flow_y, width, height) * (height / flow_y.shape[0])


def sample(image: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    valid = (x >= 0) & (x <= width - 1) & (y >= 0) & (y <= height - 1)
    x = np.clip(x, 0, width - 1)
    y = np.clip(y, 0, height - 1)
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = np.minimum(x0 + 1, width - 1)
    y1 = np.minimum(y0 + 1, height - 1)
    tx = (x - x0)[..., None]
    ty = (y - y0)[..., None]
    top = image[y0, x0] * (1 - tx) + image[y0, x1] * tx
    bottom = image[y1, x0] * (1 - tx) + image[y1, x1] * tx
    result = bottom * ty + top * (1 - ty)
    result[~valid] = 0
    return result


def warp(image: np.ndarray, flow_x: np.ndarray, flow_y: np.ndarray, amount: float) -> np.ndarray:
    height, width = image.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    return sample(image, xx - flow_x * amount, yy - flow_y * amount)


def interpolate(first: np.ndarray, second: np.ndarray, forward: tuple[np.ndarray, np.ndarray], backward: tuple[np.ndarray, np.ndarray], amount: float) -> np.ndarray:
    if amount <= 0:
        return first.copy()
    if amount >= 1:
        return second.copy()

    first_premultiplied = first.copy()
    second_premultiplied = second.copy()
    first_premultiplied[..., :3] *= first_premultiplied[..., 3:4]
    second_premultiplied[..., :3] *= second_premultiplied[..., 3:4]
    first_warped = warp(first_premultiplied, forward[0], forward[1], amount)
    second_warped = warp(second_premultiplied, backward[0], backward[1], 1 - amount)

    # Do not cross-dissolve two independently warped dogs: that creates a
    # visible double head/tail. Follow one optical-flow field and use the
    # reverse warp only to fill newly exposed transparent holes.
    result = first_warped.copy()
    first_alpha = first_warped[..., 3]
    fill_holes = first_alpha < 0.08
    result[fill_holes] = second_warped[fill_holes]
    alpha = np.clip(result[..., 3], 0, 1)
    result[..., :3] = np.where(alpha[..., None] > 1e-4, result[..., :3] / np.maximum(alpha[..., None], 1e-4), 0)
    result[..., 3] = alpha
    result[alpha < 0.01] = 0
    return np.clip(result, 0, 1)


def save_frame(frame: np.ndarray, path: Path) -> None:
    rgba = np.round(np.clip(frame, 0, 1) * 255).astype(np.uint8)
    rgba[rgba[..., 3] == 0, :3] = 0
    Image.fromarray(rgba, mode="RGBA").save(path)


def make_contact_sheet(frames: list[Path], output: Path, columns: int = 6) -> None:
    cell_width, cell_height = 192, 208
    rows = math.ceil(len(frames) / columns)
    sheet = Image.new("RGBA", (columns * cell_width, rows * cell_height), (244, 241, 237, 255))
    draw = ImageDraw.Draw(sheet)
    for index, frame_path in enumerate(frames):
        image = Image.open(frame_path).convert("RGBA")
        x = (index % columns) * cell_width
        y = (index // columns) * cell_height
        sheet.alpha_composite(image, (x, y))
        draw.rectangle((x + 3, y + 3, x + 28, y + 20), fill=(255, 255, 255, 230))
        draw.text((x + 7, y + 5), f"{index:02d}", fill=(55, 55, 55, 255))
    sheet.convert("RGB").save(output)


def build_action(action: str, source_dir: Path, output_root: Path, frame_count: int) -> dict:
    source_paths = [source_dir / f"{action}-{index}.png" for index in range(6)]
    if any(not path.exists() for path in source_paths):
        missing = [str(path) for path in source_paths if not path.exists()]
        raise FileNotFoundError("missing keyframes: " + ", ".join(missing))

    keyframes = [read_rgba(path) for path in source_paths]
    gray_masks = [gray_and_mask(frame) for frame in keyframes]
    flows = []
    for index in range(5):
        forward = estimate_flow(gray_masks[index][0], gray_masks[index + 1][0], gray_masks[index][1], gray_masks[index + 1][1])
        backward = estimate_flow(gray_masks[index + 1][0], gray_masks[index][0], gray_masks[index + 1][1], gray_masks[index][1])
        flows.append((forward, backward))

    output_dir = output_root / action
    output_dir.mkdir(parents=True, exist_ok=True)
    frame_paths: list[Path] = []
    for frame_index in range(frame_count):
        if frame_index in KEY_INDICES:
            key_index = KEY_INDICES.index(frame_index)
            frame = keyframes[key_index]
        else:
            segment = max(index for index, key_index in enumerate(KEY_INDICES) if key_index < frame_index)
            start_index = KEY_INDICES[segment]
            end_index = KEY_INDICES[segment + 1]
            amount = (frame_index - start_index) / (end_index - start_index)
            frame = interpolate(keyframes[segment], keyframes[segment + 1], flows[segment][0], flows[segment][1], amount)
        frame_path = output_dir / f"{frame_index:02d}.png"
        save_frame(frame, frame_path)
        frame_paths.append(frame_path)

    make_contact_sheet(frame_paths, output_root / f"{action}-contact-sheet.png")
    manifest = {
        "ok": True,
        "action": action,
        "frameCount": frame_count,
        "sourceKeyframes": [str(path) for path in source_paths],
        "keyframeIndices": list(KEY_INDICES),
        "method": "bidirectional-coarse-to-fine-horn-schunck-premultiplied-rgba-warp",
        "outputDir": str(output_dir),
        "contactSheet": str(output_root / f"{action}-contact-sheet.png"),
    }
    (output_root / f"{action}-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--action", choices=("feeding-real", "drinking-real", "all"), default="all")
    parser.add_argument("--frame-count", type=int, default=30)
    args = parser.parse_args()
    if args.frame_count != 30:
        raise ValueError("this asset contract intentionally produces exactly 30 frames")

    actions = ("feeding-real", "drinking-real") if args.action == "all" else (args.action,)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifests = [build_action(action, args.source_dir, args.output_dir, args.frame_count) for action in actions]
    print(json.dumps({"ok": True, "actions": manifests}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
