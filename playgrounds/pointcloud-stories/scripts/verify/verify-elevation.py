#!/usr/bin/env python3
"""Sample point heights and classifications against Wuppertal DGM1."""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request

import numpy as np
from PIL import Image
from pyproj import Transformer

TILE_URL = (
    "https://wuppertal-terrain.cismet.de/services/"
    "wupp_dgm_01/tiles/{z}/{x}/{y}.png"
)
TILE_ZOOM = 15
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATASETS = (
    ("seg2512", "nordbahntrasse-2025-12-segments.copc.laz", 93_257_079, 32632),
    ("oelberg-mls", "wuppertal-oelberg-mls-2025-09-11.copc.laz", 969_061_406, 25832),
    ("kwh-rgb", "kaiser-wilhelm-hain-rgb.copc.laz", 8_025_198, 25832),
    ("awg-seg", "awg-2-segmentierung.copc.laz", 14_720_114, 25832),
)


class DgmTiles:
    def __init__(self) -> None:
        self._tiles: dict[tuple[int, int], np.ndarray | None] = {}

    def height(self, longitude: float, latitude: float) -> float | None:
        tile_count = 2**TILE_ZOOM
        tile_x = (longitude + 180.0) / 360.0 * tile_count
        tile_y = (
            1.0
            - math.asinh(math.tan(math.radians(latitude))) / math.pi
        ) / 2.0 * tile_count
        x_index, y_index = int(tile_x), int(tile_y)
        key = (x_index, y_index)
        if key not in self._tiles:
            try:
                url = TILE_URL.format(z=TILE_ZOOM, x=x_index, y=y_index)
                with urllib.request.urlopen(url, timeout=20) as response:
                    import io

                    rgb = np.asarray(
                        Image.open(io.BytesIO(response.read())).convert("RGB"),
                        dtype=np.float64,
                    )
                self._tiles[key] = -10000.0 + (
                    rgb[..., 0] * 65536 + rgb[..., 1] * 256 + rgb[..., 2]
                ) * 0.1
            except Exception:
                self._tiles[key] = None

        tile = self._tiles[key]
        if tile is None:
            return None
        pixel_x = min(int((tile_x - x_index) * tile.shape[1]), tile.shape[1] - 1)
        pixel_y = min(int((tile_y - y_index) * tile.shape[0]), tile.shape[0] - 1)
        return float(tile[pixel_y, pixel_x])


def sample_csv(path: Path, step: int, pdal_bin: str) -> np.ndarray:
    with tempfile.TemporaryDirectory(prefix="pointcloud-elevation-") as temp_dir:
        pipeline_path = Path(temp_dir) / "pipeline.json"
        output_path = Path(temp_dir) / "sample.csv"
        pipeline = {
            "pipeline": [
                str(path),
                {"type": "filters.decimation", "step": step},
                {
                    "type": "writers.text",
                    "format": "csv",
                    "order": "X,Y,Z,Classification",
                    "keep_unspecified": "false",
                    "filename": str(output_path),
                },
            ]
        }
        pipeline_path.write_text(json.dumps(pipeline), encoding="utf-8")
        subprocess.run(
            [pdal_bin, "pipeline", str(pipeline_path)],
            check=True,
            capture_output=True,
        )
        return np.loadtxt(output_path, delimiter=",", skiprows=1, ndmin=2)


def dataset_stats(
    name: str,
    path: Path,
    count_hint: int,
    utm_epsg: int,
    pdal_bin: str,
    tiles: DgmTiles,
) -> dict[str, object]:
    points = sample_csv(path, max(1, count_hint // 150_000), pdal_bin)
    transformer = Transformer.from_crs(utm_epsg, 4326, always_xy=True)
    longitudes, latitudes = transformer.transform(points[:, 0], points[:, 1])
    dgm = np.array(
        [tiles.height(lon, lat) for lon, lat in zip(longitudes, latitudes)],
        dtype=np.float64,
    )
    valid = np.isfinite(dgm)
    points, dgm = points[valid], dgm[valid]
    delta_z = points[:, 2] - dgm
    classes = points[:, 3].astype(int)
    unique_classes, class_counts = np.unique(classes, return_counts=True)
    histogram = {
        int(class_id): int(count)
        for class_id, count in zip(unique_classes, class_counts)
    }
    result: dict[str, object] = {
        "dataset": name,
        "sampled": int(len(points)),
        "class_histogram": histogram,
    }
    ground = delta_z[classes == 2]
    if len(ground) > 50:
        result["ground_dz"] = {
            "n": int(len(ground)),
            "median": round(float(np.median(ground)), 3),
            "mean": round(float(np.mean(ground)), 3),
            "rmse": round(float(np.sqrt(np.mean(ground**2))), 3),
            "p05": round(float(np.percentile(ground, 5)), 3),
            "p95": round(float(np.percentile(ground, 95)), 3),
        }
    result["near_ground_share_per_class"] = {
        class_id: round(float(np.mean(np.abs(delta_z[classes == class_id]) < 0.3)), 3)
        for class_id, count in histogram.items()
        if count >= 100
    }
    return result


def main() -> None:
    configured_data_root = Path(
        os.environ.get("POINTCLOUD_DATA_ROOT", ".data/derived")
    )
    if not configured_data_root.is_absolute():
        configured_data_root = PROJECT_ROOT / configured_data_root
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-root",
        type=Path,
        default=configured_data_root,
    )
    parser.add_argument("--pdal-bin", default=os.environ.get("PDAL_BIN", "pdal"))
    args = parser.parse_args()
    tiles = DgmTiles()

    for name, filename, count_hint, epsg in DATASETS:
        path = args.data_root / filename
        try:
            if not path.is_file():
                raise FileNotFoundError(filename)
            print(
                json.dumps(
                    dataset_stats(
                        name,
                        path,
                        count_hint,
                        epsg,
                        args.pdal_bin,
                        tiles,
                    )
                )
            )
        except Exception as error:
            print(json.dumps({"dataset": name, "error": str(error)[:200]}))


if __name__ == "__main__":
    main()
