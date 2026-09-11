#!/usr/bin/env python3
"""Remove matte color from transparent cutout edges without changing alpha."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def nearest_opaque(pixels, x: int, y: int, width: int, height: int, radius: int = 8):
    best = None
    best_distance = None
    for distance in range(1, radius + 1):
        for dx in range(-distance, distance + 1):
            for dy in (-distance, distance):
                px, py = x + dx, y + dy
                if 0 <= px < width and 0 <= py < height:
                    r, g, b, a = pixels[px, py]
                    if a >= 245:
                        score = dx * dx + dy * dy
                        if best_distance is None or score < best_distance:
                            best = (r, g, b)
                            best_distance = score
        for dy in range(-distance + 1, distance):
            for dx in (-distance, distance):
                px, py = x + dx, y + dy
                if 0 <= px < width and 0 <= py < height:
                    r, g, b, a = pixels[px, py]
                    if a >= 245:
                        score = dx * dx + dy * dy
                        if best_distance is None or score < best_distance:
                            best = (r, g, b)
                            best_distance = score
        if best is not None:
            return best
    return None


def touches_transparent(pixels, x: int, y: int, width: int, height: int, radius: int = 2) -> bool:
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius:
                continue
            px, py = x + dx, y + dy
            if 0 <= px < width and 0 <= py < height and pixels[px, py][3] == 0:
                return True
    return False


def clean(source: Path, destination: Path) -> dict[str, int | str | bool]:
    image = Image.open(source).convert("RGBA")
    width, height = image.size
    pixels = image.load()
    alpha_values = [pixels[x, y][3] for y in range(height) for x in range(width)]
    if min(alpha_values) == 255:
        raise ValueError("fully opaque output; likely baked checkerboard/background")

    changed = 0
    cleared_hidden = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                if r or g or b:
                    pixels[x, y] = (0, 0, 0, 0)
                    cleared_hidden += 1
                continue
            if a < 245 or touches_transparent(pixels, x, y, width, height):
                source_rgb = nearest_opaque(pixels, x, y, width, height)
                if source_rgb is None:
                    continue
                if (r, g, b) != source_rgb:
                    pixels[x, y] = (*source_rgb, a)
                    changed += 1

    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG")
    return {
        "source": str(source),
        "output": str(destination),
        "width": width,
        "height": height,
        "changed_edge_rgb": changed,
        "cleared_hidden_rgb": cleared_hidden,
        "alpha_preserved": True,
        "ok": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for source in sorted(args.input_dir.glob("[0-9][0-9]-*.png")):
        if "retry" in source.name:
            continue
        destination = args.output_dir / source.name
        try:
            print(clean(source, destination))
        except ValueError as error:
            print({"source": str(source), "ok": False, "reason": str(error)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
