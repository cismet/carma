#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import laspy


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Split one large LAZ into lossless compressed parts so Untwine can "
            "build a COPC without materializing one oversized temporary tree."
        )
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("output_directory", type=Path)
    parser.add_argument("--points-per-part", type=int, default=20_500_000)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.points_per_part <= 0:
        raise ValueError("--points-per-part must be positive")
    if not args.source.is_file():
        raise FileNotFoundError(args.source)
    if args.output_directory.exists():
        raise FileExistsError(args.output_directory)

    args.output_directory.mkdir(parents=True)
    parts: list[dict[str, int | str]] = []
    written = 0
    try:
        with laspy.open(args.source) as reader:
            expected = int(reader.header.point_count)
            dimensions = list(reader.header.point_format.dimension_names)
            if "AO" not in dimensions:
                raise ValueError("Source lacks the required AO Extra Byte")

            for index, points in enumerate(
                reader.chunk_iterator(args.points_per_part)
            ):
                part_path = args.output_directory / f"part-{index:04d}.laz"
                with laspy.open(
                    part_path,
                    mode="w",
                    header=reader.header.copy(),
                    do_compress=True,
                ) as writer:
                    writer.write_points(points)
                point_count = len(points)
                written += point_count
                parts.append(
                    {
                        "file": part_path.name,
                        "pointCount": point_count,
                        "bytes": part_path.stat().st_size,
                    }
                )

        if written != expected:
            raise RuntimeError(f"Wrote {written} of {expected} source points")

        manifest = {
            "schema": "carma.untwine-laz-parts",
            "version": 1,
            "source": args.source.name,
            "sourceBytes": args.source.stat().st_size,
            "pointCount": written,
            "pointsPerPart": args.points_per_part,
            "dimensions": dimensions,
            "parts": parts,
        }
        (args.output_directory / "manifest.json").write_text(
            f"{json.dumps(manifest, indent=2)}\n"
        )
    except BaseException:
        shutil.rmtree(args.output_directory, ignore_errors=True)
        raise


if __name__ == "__main__":
    main()
