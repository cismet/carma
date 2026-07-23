#!/usr/bin/env python3

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import time
from pathlib import Path
from typing import Any

import laspy
import numpy as np
from numba import njit, prange, set_num_threads
from pyproj import CRS, Transformer

PROFILE_DEFINITIONS: dict[str, dict[str, Any]] = {
    "kwh": {
        "datumTransform": "dhhn2016-to-ellipsoidal-gcg2016",
        "pointFormat": 7,
        "retainedDimensions": [
            "classification",
            "synthetic",
            "overlap",
            "red",
            "green",
            "blue",
        ],
        "sourceCrs": "EPSG:25832+7837",
        "aoEvaluationCrs": "EPSG:25832 with ellipsoidal height",
        "outputCoordinates": "source-preserved",
        "registrationEvidence": "embedded compound CRS; no empirical rigid correction",
    },
    "awg": {
        "datumTransform": "identity-ellipsoidal",
        "pointFormat": 6,
        "retainedDimensions": ["classification"],
        "sourceCrs": "EPSG:25832 with inferred ellipsoidal height",
        "aoEvaluationCrs": "EPSG:25832 with ellipsoidal height",
        "outputCoordinates": "source-preserved",
        "registrationEvidence": "documented DGM1 rigid fit plus Mesh 2024 micro-correction",
        "rigid": {
            "pivot": [370_327.584, 5_680_082.375, 200.265],
            "eulerXyzDegrees": [5.103344567, 4.281994042, 0.0],
            "fitTranslation": [0.0, 0.0, -11.042280815],
            "microCorrection": [1.7, -1.0, 3.7],
        },
    },
    "oelbergMls": {
        "datumTransform": "dhhn2016-to-ellipsoidal-gcg2016",
        "pointFormat": 7,
        "retainedDimensions": ["intensity", "red", "green", "blue"],
        "sourceCrs": "EPSG:25832+7837",
        "aoEvaluationCrs": "EPSG:25832 with ellipsoidal height",
        "outputCoordinates": "source-preserved",
        "registrationEvidence": "provider sidecar and embedded compound CRS; no empirical rigid correction",
    },
    "nordbahntrasseSegments": {
        "datumTransform": "identity-ellipsoidal",
        "pointFormat": 6,
        "retainedDimensions": ["intensity", "classification", "user_data"],
        "sourceCrs": "EPSG:25832 with best-known inferred ellipsoidal height",
        "aoEvaluationCrs": "EPSG:25832 with ellipsoidal height",
        "outputCoordinates": "source-preserved",
        "registrationEvidence": "DGM1 cross-check median +47.9 m; provider vertical datum remains unconfirmed",
    },
}

MINIMUM_RAY_LENGTH_METERS = 50.0


class Gcg2016Spline:
    """Vectorized copy of CARMA's BKG-compatible 5x5 natural spline."""

    def __init__(self, tile_path: Path):
        tile_text = tile_path.read_text()
        if tile_path.suffix == ".ts":
            declaration = "const tile: unknown = "
            start = tile_text.find(declaration)
            end_marker = ";\n\nexport default tile;"
            end = tile_text.rfind(end_marker)
            prefix = tile_text[:start]
            if (
                start < 0
                or end <= start
                or any(
                    line and not line.startswith("//")
                    for line in prefix.splitlines()
                )
                or tile_text[end:].strip() != end_marker.strip()
            ):
                raise ValueError(f"Unsupported TypeScript tile module: {tile_path}")
            tile_text = tile_text[start + len(declaration) : end]
        tile = json.loads(tile_text)
        if tile.get("format") != "carma-gcg2016-float32-tile-v2":
            raise ValueError(f"Unsupported GCG2016 tile: {tile_path}")
        grid = tile["grid"]
        self.first_longitude = float(grid["firstLongitude"])
        self.first_latitude = float(grid["firstLatitude"])
        self.step_longitude = float(grid["stepLongitude"])
        self.step_latitude = float(grid["stepLatitude"])
        self.column_start = int(grid["columnStart"])
        self.row_start = int(grid["rowStart"])
        self.width = int(grid["width"])
        self.height = int(grid["height"])
        self.no_data = grid["noDataValue"]
        decoded = base64.b64decode(tile["values"]["data"])
        self.values = np.frombuffer(decoded, dtype="<f4").reshape(
            (self.height, self.width)
        )
        self.to_geographic = Transformer.from_crs(
            "EPSG:25832", "EPSG:4326", always_xy=True
        )
        reference = float(
            self.undulation(
                np.asarray([371_804.597]), np.asarray([5_678_240.294])
            )[0]
        )
        reference_error = abs(reference - 46.59667038816)
        if reference_error > 1.0e-8:
            raise ValueError(
                f"Python GCG2016 spline differs from CARMA reference by {reference_error} m"
            )
        self.resource = {
            "file": tile_path.name,
            "sha256": sha256(tile_path),
            "tileId": tile["id"],
            "method": "bkg-natural-bicubic-spline-5x5",
            "evaluationOrder": ["longitude", "latitude"],
            "sourceSamples": "unchanged Float32 GCG2016 grid values",
            "implementationReferenceAgreement": {
                "point": [371804.597, 5678240.294],
                "expectedMeters": 46.59667038816,
                "absoluteDifferenceMeters": reference_error,
            },
        }

    @staticmethod
    def interpolate(samples: np.ndarray, coordinate: np.ndarray) -> np.ndarray:
        second = np.zeros_like(samples, dtype=np.float64)
        work = np.zeros_like(samples, dtype=np.float64)
        for index in range(1, 4):
            denominator = 0.5 * second[:, index - 1] + 2.0
            second[:, index] = -0.5 / denominator
            curvature = (
                samples[:, index + 1]
                - 2.0 * samples[:, index]
                + samples[:, index - 1]
            )
            work[:, index] = (
                3.0 * curvature - 0.5 * work[:, index - 1]
            ) / denominator
        for index in range(3, -1, -1):
            second[:, index] = (
                second[:, index] * second[:, index + 1] + work[:, index]
            )
        lower = np.floor(coordinate).astype(np.int64)
        upper = lower + 1
        lower_weight = upper - coordinate
        upper_weight = coordinate - lower
        rows = np.arange(len(samples))
        return (
            lower_weight * samples[rows, lower]
            + upper_weight * samples[rows, upper]
            + (
                (lower_weight**3 - lower_weight) * second[rows, lower]
                + (upper_weight**3 - upper_weight) * second[rows, upper]
            )
            / 6.0
        )

    def undulation(self, easting: np.ndarray, northing: np.ndarray) -> np.ndarray:
        longitude, latitude = self.to_geographic.transform(easting, northing)
        source_column = (longitude - self.first_longitude) / self.step_longitude
        source_row = (latitude - self.first_latitude) / self.step_latitude
        first_column = np.floor(source_column).astype(np.int64) - 1
        first_row = np.floor(source_row).astype(np.int64) - 1
        local_columns = first_column - self.column_start
        local_rows = first_row - self.row_start
        if (
            np.any(local_columns < 0)
            or np.any(local_columns + 4 >= self.width)
            or np.any(local_rows < 0)
            or np.any(local_rows + 4 >= self.height)
        ):
            raise ValueError("GCG2016 5x5 stencil leaves the bundled tile")
        row_interpolations = np.empty((len(easting), 5), dtype=np.float64)
        column_coordinate = source_column - first_column
        for row_offset in range(5):
            samples = np.empty((len(easting), 5), dtype=np.float64)
            sample_rows = local_rows + row_offset
            for column_offset in range(5):
                samples[:, column_offset] = self.values[
                    sample_rows, local_columns + column_offset
                ]
            if self.no_data is not None and np.any(samples == self.no_data):
                raise ValueError("GCG2016 source stencil contains NoData")
            row_interpolations[:, row_offset] = self.interpolate(
                samples, column_coordinate
            )
        return self.interpolate(row_interpolations, source_row - first_row)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while block := source.read(8 * 1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def registered_positions(
    points: laspy.ScaleAwarePointRecord,
    profile: dict[str, Any],
    gcg2016: Gcg2016Spline | None,
) -> np.ndarray:
    east = np.asarray(points.x, dtype=np.float64)
    north = np.asarray(points.y, dtype=np.float64)
    up = np.asarray(points.z, dtype=np.float64)
    if profile["datumTransform"] == "dhhn2016-to-ellipsoidal-gcg2016":
        if gcg2016 is None:
            raise ValueError("DHHN2016 profile requires a GCG2016 resource")
        up = up + gcg2016.undulation(east, north)
    rigid = profile.get("rigid")
    if rigid is None:
        return np.column_stack((east, north, up))
    pivot = np.asarray(rigid["pivot"], dtype=np.float64)
    translation = np.asarray(rigid["fitTranslation"], dtype=np.float64) + np.asarray(
        rigid["microCorrection"], dtype=np.float64
    )
    east = east - pivot[0]
    north = north - pivot[1]
    up = up - pivot[2]
    rx = math.radians(rigid["eulerXyzDegrees"][0])
    ry = math.radians(rigid["eulerXyzDegrees"][1])
    cosine_x, sine_x = math.cos(rx), math.sin(rx)
    cosine_y, sine_y = math.cos(ry), math.sin(ry)
    north_after_x = cosine_x * north - sine_x * up
    up_after_x = sine_x * north + cosine_x * up
    east_after_y = cosine_y * east + sine_y * up_after_x
    up_after_y = -sine_y * east + cosine_y * up_after_x
    return np.column_stack(
        (
            pivot[0] + east_after_y + translation[0],
            pivot[1] + north_after_x + translation[1],
            pivot[2] + up_after_y + translation[2],
        )
    )


def fibonacci_hemisphere(count: int) -> np.ndarray:
    """Deterministic, approximately equal-area samples of the upper hemisphere."""
    directions = np.empty((count, 3), dtype=np.float64)
    golden_angle = math.pi * (3.0 - math.sqrt(5.0))
    for index in range(count):
        up = (index + 0.5) / count
        radius = math.sqrt(max(0.0, 1.0 - up * up))
        azimuth = index * golden_angle
        directions[index] = [
            radius * math.cos(azimuth),
            radius * math.sin(azimuth),
            up,
        ]
    return directions


def linear_indices(cells: np.ndarray, shape: np.ndarray) -> np.ndarray:
    return (cells[:, 0] * shape[1] + cells[:, 1]) * shape[2] + cells[:, 2]


@njit(inline="always")
def axis_separates_triangle_and_box(
    axis_x: float,
    axis_y: float,
    axis_z: float,
    vertex_0_x: float,
    vertex_0_y: float,
    vertex_0_z: float,
    vertex_1_x: float,
    vertex_1_y: float,
    vertex_1_z: float,
    vertex_2_x: float,
    vertex_2_y: float,
    vertex_2_z: float,
    box_half_extent: float,
) -> bool:
    """Return whether one SAT axis proves triangle/AABB separation."""
    axis_length_squared = (
        axis_x * axis_x + axis_y * axis_y + axis_z * axis_z
    )
    if axis_length_squared < 1.0e-24:
        return False
    projection_0 = (
        vertex_0_x * axis_x + vertex_0_y * axis_y + vertex_0_z * axis_z
    )
    projection_1 = (
        vertex_1_x * axis_x + vertex_1_y * axis_y + vertex_1_z * axis_z
    )
    projection_2 = (
        vertex_2_x * axis_x + vertex_2_y * axis_y + vertex_2_z * axis_z
    )
    projection_min = min(projection_0, projection_1, projection_2)
    projection_max = max(projection_0, projection_1, projection_2)
    box_radius = box_half_extent * (
        abs(axis_x) + abs(axis_y) + abs(axis_z)
    )
    return projection_min > box_radius or projection_max < -box_radius


@njit(inline="always")
def triangle_intersects_voxel(
    vertex_0_x: float,
    vertex_0_y: float,
    vertex_0_z: float,
    vertex_1_x: float,
    vertex_1_y: float,
    vertex_1_z: float,
    vertex_2_x: float,
    vertex_2_y: float,
    vertex_2_z: float,
    center_x: float,
    center_y: float,
    center_z: float,
    box_half_extent: float,
) -> bool:
    """Exact triangle/AABB overlap test using the separating-axis theorem."""
    local_0_x = vertex_0_x - center_x
    local_0_y = vertex_0_y - center_y
    local_0_z = vertex_0_z - center_z
    local_1_x = vertex_1_x - center_x
    local_1_y = vertex_1_y - center_y
    local_1_z = vertex_1_z - center_z
    local_2_x = vertex_2_x - center_x
    local_2_y = vertex_2_y - center_y
    local_2_z = vertex_2_z - center_z

    # The three AABB face normals.
    if (
        min(local_0_x, local_1_x, local_2_x) > box_half_extent
        or max(local_0_x, local_1_x, local_2_x) < -box_half_extent
        or min(local_0_y, local_1_y, local_2_y) > box_half_extent
        or max(local_0_y, local_1_y, local_2_y) < -box_half_extent
        or min(local_0_z, local_1_z, local_2_z) > box_half_extent
        or max(local_0_z, local_1_z, local_2_z) < -box_half_extent
    ):
        return False

    edge_0_x = local_1_x - local_0_x
    edge_0_y = local_1_y - local_0_y
    edge_0_z = local_1_z - local_0_z
    edge_1_x = local_2_x - local_1_x
    edge_1_y = local_2_y - local_1_y
    edge_1_z = local_2_z - local_1_z
    edge_2_x = local_0_x - local_2_x
    edge_2_y = local_0_y - local_2_y
    edge_2_z = local_0_z - local_2_z

    # Nine edge cross box-axis tests.
    for edge_x, edge_y, edge_z in (
        (edge_0_x, edge_0_y, edge_0_z),
        (edge_1_x, edge_1_y, edge_1_z),
        (edge_2_x, edge_2_y, edge_2_z),
    ):
        if axis_separates_triangle_and_box(
            0.0,
            edge_z,
            -edge_y,
            local_0_x,
            local_0_y,
            local_0_z,
            local_1_x,
            local_1_y,
            local_1_z,
            local_2_x,
            local_2_y,
            local_2_z,
            box_half_extent,
        ) or axis_separates_triangle_and_box(
            -edge_z,
            0.0,
            edge_x,
            local_0_x,
            local_0_y,
            local_0_z,
            local_1_x,
            local_1_y,
            local_1_z,
            local_2_x,
            local_2_y,
            local_2_z,
            box_half_extent,
        ) or axis_separates_triangle_and_box(
            edge_y,
            -edge_x,
            0.0,
            local_0_x,
            local_0_y,
            local_0_z,
            local_1_x,
            local_1_y,
            local_1_z,
            local_2_x,
            local_2_y,
            local_2_z,
            box_half_extent,
        ):
            return False

    # Triangle face normal.
    normal_x = edge_0_y * edge_1_z - edge_0_z * edge_1_y
    normal_y = edge_0_z * edge_1_x - edge_0_x * edge_1_z
    normal_z = edge_0_x * edge_1_y - edge_0_y * edge_1_x
    return not axis_separates_triangle_and_box(
        normal_x,
        normal_y,
        normal_z,
        local_0_x,
        local_0_y,
        local_0_z,
        local_1_x,
        local_1_y,
        local_1_z,
        local_2_x,
        local_2_y,
        local_2_z,
        box_half_extent,
    )


@njit
def rasterize_triangles_into_voxels(
    triangles: np.ndarray,
    triangle_origin: np.ndarray,
    grid_min: np.ndarray,
    shape: np.ndarray,
    voxel_size: float,
    occupied: np.ndarray,
) -> tuple[int, int]:
    """Conservatively visit candidate voxels and mark exact intersections."""
    candidate_tests = 0
    intersecting_tests = 0
    half_extent = voxel_size * 0.5
    for triangle_index in range(len(triangles)):
        vertex_0_x = float(triangles[triangle_index, 0, 0]) + triangle_origin[0]
        vertex_0_y = float(triangles[triangle_index, 0, 1]) + triangle_origin[1]
        vertex_0_z = float(triangles[triangle_index, 0, 2]) + triangle_origin[2]
        vertex_1_x = float(triangles[triangle_index, 1, 0]) + triangle_origin[0]
        vertex_1_y = float(triangles[triangle_index, 1, 1]) + triangle_origin[1]
        vertex_1_z = float(triangles[triangle_index, 1, 2]) + triangle_origin[2]
        vertex_2_x = float(triangles[triangle_index, 2, 0]) + triangle_origin[0]
        vertex_2_y = float(triangles[triangle_index, 2, 1]) + triangle_origin[1]
        vertex_2_z = float(triangles[triangle_index, 2, 2]) + triangle_origin[2]

        cell_min_x = max(
            0,
            int(
                math.floor(
                    (min(vertex_0_x, vertex_1_x, vertex_2_x) - grid_min[0])
                    / voxel_size
                )
            ),
        )
        cell_min_y = max(
            0,
            int(
                math.floor(
                    (min(vertex_0_y, vertex_1_y, vertex_2_y) - grid_min[1])
                    / voxel_size
                )
            ),
        )
        cell_min_z = max(
            0,
            int(
                math.floor(
                    (min(vertex_0_z, vertex_1_z, vertex_2_z) - grid_min[2])
                    / voxel_size
                )
            ),
        )
        cell_max_x = min(
            shape[0] - 1,
            int(
                math.floor(
                    (max(vertex_0_x, vertex_1_x, vertex_2_x) - grid_min[0])
                    / voxel_size
                )
            ),
        )
        cell_max_y = min(
            shape[1] - 1,
            int(
                math.floor(
                    (max(vertex_0_y, vertex_1_y, vertex_2_y) - grid_min[1])
                    / voxel_size
                )
            ),
        )
        cell_max_z = min(
            shape[2] - 1,
            int(
                math.floor(
                    (max(vertex_0_z, vertex_1_z, vertex_2_z) - grid_min[2])
                    / voxel_size
                )
            ),
        )
        if (
            cell_min_x > cell_max_x
            or cell_min_y > cell_max_y
            or cell_min_z > cell_max_z
        ):
            continue

        for cell_x in range(cell_min_x, cell_max_x + 1):
            center_x = grid_min[0] + (cell_x + 0.5) * voxel_size
            for cell_y in range(cell_min_y, cell_max_y + 1):
                center_y = grid_min[1] + (cell_y + 0.5) * voxel_size
                for cell_z in range(cell_min_z, cell_max_z + 1):
                    candidate_tests += 1
                    center_z = grid_min[2] + (cell_z + 0.5) * voxel_size
                    if triangle_intersects_voxel(
                        vertex_0_x,
                        vertex_0_y,
                        vertex_0_z,
                        vertex_1_x,
                        vertex_1_y,
                        vertex_1_z,
                        vertex_2_x,
                        vertex_2_y,
                        vertex_2_z,
                        center_x,
                        center_y,
                        center_z,
                        half_extent,
                    ):
                        linear = (
                            (cell_x * shape[1] + cell_y) * shape[2] + cell_z
                        )
                        occupied[linear] = True
                        intersecting_tests += 1
    return candidate_tests, intersecting_tests


@njit(parallel=True)
def trace_sky_visibility(
    query_cells: np.ndarray,
    occupied: np.ndarray,
    shape: np.ndarray,
    directions: np.ndarray,
    voxel_size: float,
    ray_length: float,
    self_bias: float,
) -> np.ndarray:
    """Trace each sky ray through the shared point/mesh occupancy grid."""
    result = np.empty(len(query_cells), dtype=np.uint16)
    infinity = 1.0e30
    for point_index in prange(len(query_cells)):
        visible = 0
        start_x = query_cells[point_index, 0]
        start_y = query_cells[point_index, 1]
        start_z = query_cells[point_index, 2]
        for ray_index in range(len(directions)):
            dx = directions[ray_index, 0]
            dy = directions[ray_index, 1]
            dz = directions[ray_index, 2]
            cell_x = start_x
            cell_y = start_y
            cell_z = start_z

            step_x = 1 if dx >= 0.0 else -1
            step_y = 1 if dy >= 0.0 else -1
            step_z = 1 if dz >= 0.0 else -1
            abs_x = abs(dx)
            abs_y = abs(dy)
            abs_z = abs(dz)
            delta_x = 1.0 / abs_x if abs_x > 1.0e-15 else infinity
            delta_y = 1.0 / abs_y if abs_y > 1.0e-15 else infinity
            delta_z = 1.0 / abs_z if abs_z > 1.0e-15 else infinity
            next_x = 0.5 * delta_x
            next_y = 0.5 * delta_y
            next_z = 0.5 * delta_z

            blocked = False
            while True:
                if next_x <= next_y and next_x <= next_z:
                    distance = next_x * voxel_size
                    if distance > ray_length:
                        break
                    cell_x += step_x
                    next_x += delta_x
                elif next_y <= next_z:
                    distance = next_y * voxel_size
                    if distance > ray_length:
                        break
                    cell_y += step_y
                    next_y += delta_y
                else:
                    distance = next_z * voxel_size
                    if distance > ray_length:
                        break
                    cell_z += step_z
                    next_z += delta_z

                if (
                    cell_x < 0
                    or cell_x >= shape[0]
                    or cell_y < 0
                    or cell_y >= shape[1]
                    or cell_z < 0
                    or cell_z >= shape[2]
                ):
                    break
                if distance < self_bias:
                    continue
                linear = (cell_x * shape[1] + cell_y) * shape[2] + cell_z
                if occupied[linear]:
                    blocked = True
                    break
            if not blocked:
                visible += 1
        result[point_index] = visible
    return result


def dimension_values(
    points: laspy.ScaleAwarePointRecord, name: str
) -> np.ndarray:
    if name == "X":
        return np.asarray(points.x)
    if name == "Y":
        return np.asarray(points.y)
    if name == "Z":
        return np.asarray(points.z)
    return np.asarray(points[name])


def inspect_source(args: argparse.Namespace) -> None:
    if args.footprint_cell_size <= 0:
        raise ValueError("Footprint cell size must be positive")
    profile = PROFILE_DEFINITIONS[args.profile]
    gcg2016 = (
        Gcg2016Spline(args.gcg2016_tile)
        if profile["datumTransform"] == "dhhn2016-to-ellipsoidal-gcg2016"
        else None
    )
    started = time.perf_counter()
    registered_min = np.full(3, np.inf)
    registered_max = np.full(3, -np.inf)
    dimension_stats: dict[str, dict[str, float | int]] = {}
    footprint_cells: set[tuple[int, int]] = set()
    scanned = 0
    with laspy.open(args.source) as reader:
        point_count = int(reader.header.point_count)
        dimension_names = list(reader.header.point_format.dimension_names)
        if any(name.lower() == "ao" for name in dimension_names):
            raise ValueError("AO must be baked from an immutable source without AO")
        available = {name.lower() for name in dimension_names}
        missing = set(profile["retainedDimensions"]) - available
        if missing:
            raise ValueError(f"Source lacks retained dimensions: {sorted(missing)}")
        parsed_crs = reader.header.parse_crs()
        source_wkt = parsed_crs.to_wkt() if parsed_crs is not None else None
        point_format = int(reader.header.point_format.id)
        point_record_length = int(reader.header.point_format.size)
        for points in reader.chunk_iterator(args.chunk_size):
            positions = registered_positions(points, profile, gcg2016)
            registered_min = np.minimum(registered_min, positions.min(axis=0))
            registered_max = np.maximum(registered_max, positions.max(axis=0))
            horizontal_cells = np.floor(
                positions[:, :2] / args.footprint_cell_size
            ).astype(np.int64)
            footprint_cells.update(
                (int(cell[0]), int(cell[1]))
                for cell in np.unique(horizontal_cells, axis=0)
            )
            scanned += len(points)
            for name in dimension_names:
                values = dimension_values(points, name)
                chunk_min = float(np.min(values))
                chunk_max = float(np.max(values))
                chunk_nonzero = int(np.count_nonzero(values))
                current = dimension_stats.get(name)
                if current is None:
                    dimension_stats[name] = {
                        "minimum": chunk_min,
                        "maximum": chunk_max,
                        "nonzero": chunk_nonzero,
                    }
                else:
                    current["minimum"] = min(float(current["minimum"]), chunk_min)
                    current["maximum"] = max(float(current["maximum"]), chunk_max)
                    current["nonzero"] = int(current["nonzero"]) + chunk_nonzero
    if scanned != point_count:
        raise RuntimeError(f"Read {scanned} of {point_count} source points")
    varying = [
        name
        for name, stats in dimension_stats.items()
        if stats["minimum"] != stats["maximum"]
    ]
    output = {
        "schema": "carma.pointcloud-ao-inspection",
        "version": 1,
        "asset": args.profile,
        "source": {
            "file": args.source.name,
            "sha256": sha256(args.source),
            "bytes": args.source.stat().st_size,
            "pointCount": point_count,
            "pointFormat": point_format,
            "pointRecordLength": point_record_length,
            "wkt": source_wkt,
            "dimensions": dimension_stats,
            "varyingDimensions": varying,
        },
        "workingFrame": {
            "horizontalCrs": "EPSG:25832",
            "verticalDatum": "WGS84/GRS80-compatible ellipsoidal height",
            "registeredBounds": {
                "minimum": registered_min.tolist(),
                "maximum": registered_max.tolist(),
            },
            "horizontalFootprint": {
                "cellSizeMeters": args.footprint_cell_size,
                "cells": sorted(footprint_cells, key=lambda cell: (cell[1], cell[0])),
            },
        },
        "registration": profile,
        "gcg2016": gcg2016.resource if gcg2016 is not None else None,
        "durationSeconds": time.perf_counter() - started,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps(output, indent=2))


def count_nonzero_memmap(values: np.memmap, block_size: int) -> int:
    return sum(
        int(np.count_nonzero(values[start : start + block_size]))
        for start in range(0, len(values), block_size)
    )


def build_output_header(
    source_header: laspy.LasHeader, profile: dict[str, Any], asset: str
) -> laspy.LasHeader:
    header = laspy.LasHeader(point_format=profile["pointFormat"], version="1.4")
    header.scales = np.asarray(source_header.scales).copy()
    header.offsets = np.asarray(source_header.offsets).copy()
    source_crs = source_header.parse_crs()
    if source_crs is not None:
        header.add_crs(CRS.from_wkt(source_crs.to_wkt()))
    header.system_identifier = "CARMA"
    header.generating_software = f"CARMA Mesh2024 AO {asset}"[:32]
    header.add_extra_dim(
        laspy.ExtraBytesParams(
            name="AO",
            type=np.uint8,
            description="Mesh2024 sky visibility 0..255",
        )
    )
    return header


def copy_output_points(
    source: laspy.ScaleAwarePointRecord,
    header: laspy.LasHeader,
    retained_dimensions: list[str],
    ao: np.ndarray,
) -> laspy.ScaleAwarePointRecord:
    output = laspy.ScaleAwarePointRecord.zeros(len(source), header=header)
    output.X = source.X
    output.Y = source.Y
    output.Z = source.Z
    for name in retained_dimensions:
        output[name] = source[name]
    output["AO"] = ao
    return output


def bake(args: argparse.Namespace) -> None:
    if (
        args.voxel_size <= 0
        or args.ray_length < MINIMUM_RAY_LENGTH_METERS
        or args.ray_count < 1
        or args.self_bias < args.voxel_size
    ):
        raise ValueError(
            "AO sampling parameters must be positive and ray length must be "
            f"at least {MINIMUM_RAY_LENGTH_METERS:g} m"
        )
    if args.threads is not None:
        set_num_threads(args.threads)
    profile = PROFILE_DEFINITIONS[args.profile]
    gcg2016 = (
        Gcg2016Spline(args.gcg2016_tile)
        if profile["datumTransform"] == "dhhn2016-to-ellipsoidal-gcg2016"
        else None
    )
    inspection = json.loads(args.inspection.read_text())
    if (
        inspection.get("schema") != "carma.pointcloud-ao-inspection"
        or inspection.get("asset") != args.profile
    ):
        raise ValueError("Inspection does not match the selected asset profile")
    source_dimensions = inspection["source"]["dimensions"]
    constant_retained = [
        name
        for name in profile["retainedDimensions"]
        if source_dimensions[name]["minimum"]
        == source_dimensions[name]["maximum"]
    ]
    if constant_retained:
        raise ValueError(
            "Retained payload contains constant or empty dimensions: "
            f"{constant_retained}"
        )
    retained_lower = {name.lower() for name in profile["retainedDimensions"]}
    unretained_varying = [
        name
        for name in inspection["source"]["varyingDimensions"]
        if name not in ("X", "Y", "Z") and name.lower() not in retained_lower
    ]
    if unretained_varying:
        raise ValueError(
            "Profile would discard varying source dimensions: "
            f"{unretained_varying}"
        )
    mesh_manifest = json.loads(args.mesh_manifest.read_text())
    triangle_metadata = json.loads(args.triangles_metadata.read_text())
    if mesh_manifest.get("schema") != "carma.mesh-ao-source":
        raise ValueError("Mesh 2024 manifest is required")
    if int(triangle_metadata.get("triangleCount", 0)) < 1:
        raise ValueError("Mesh 2024 triangle set is empty")
    started = time.perf_counter()
    point_count = int(inspection["source"]["pointCount"])
    bounds = inspection["workingFrame"]["registeredBounds"]
    cloud_min = np.asarray(bounds["minimum"], dtype=np.float64)
    cloud_max = np.asarray(bounds["maximum"], dtype=np.float64)
    halo = args.ray_length + args.voxel_size * 2.0
    grid_min = np.floor((cloud_min - halo) / args.voxel_size) * args.voxel_size
    grid_max = np.ceil((cloud_max + halo) / args.voxel_size) * args.voxel_size
    shape = np.ceil((grid_max - grid_min) / args.voxel_size).astype(np.int64) + 1
    voxel_count = int(np.prod(shape, dtype=np.int64))
    if voxel_count <= 0 or voxel_count > args.maximum_voxels:
        raise RuntimeError(
            f"AO grid {shape.tolist()} has {voxel_count} voxels; "
            f"limit is {args.maximum_voxels}"
        )

    args.work_directory.mkdir(parents=True, exist_ok=True)
    occupied_path = args.work_directory / "combined-occupied.u8"
    point_index_path = args.work_directory / "point-voxel-indices.i64"
    ao_path = args.work_directory / "point-voxel-ao.u8"
    resumed_work = None
    if args.resume_work:
        if args.resume_report is None:
            raise ValueError("--resume-work requires --resume-report")
        resumed_work = json.loads(args.resume_report.read_text())
        if resumed_work.get("schema") != "carma.pointcloud-ao-bake":
            raise ValueError("Resume report is not a point-cloud AO bake report")
        if resumed_work.get("asset") != args.profile:
            raise ValueError("Resume report belongs to a different AO profile")
        previous_ao = resumed_work["ao"]
        if (
            previous_ao["gridShape"] != shape.tolist()
            or not np.allclose(previous_ao["gridOrigin"], grid_min)
            or previous_ao["gridVoxels"] != voxel_count
            or previous_ao["voxelSizeMeters"] != args.voxel_size
            or previous_ao["rayLengthMeters"] != args.ray_length
            or previous_ao["rayCount"] != args.ray_count
            or previous_ao["selfBiasMeters"] != args.self_bias
        ):
            raise ValueError("Resume work parameters differ from the reference report")
        if occupied_path.stat().st_size != voxel_count:
            raise ValueError("Resume occupancy raster has the wrong byte length")
        if point_index_path.stat().st_size % np.dtype("<i8").itemsize != 0:
            raise ValueError("Resume point-voxel index file is truncated")
        point_voxel_count = (
            point_index_path.stat().st_size // np.dtype("<i8").itemsize
        )
        if point_voxel_count != previous_ao["pointOccupiedVoxels"]:
            raise ValueError("Resume point-voxel count differs from the report")
        if ao_path.stat().st_size != point_voxel_count:
            raise ValueError("Resume AO file is truncated")
        occupied = np.memmap(
            occupied_path, dtype=np.uint8, mode="r", shape=voxel_count
        )
        point_voxel_linear = np.memmap(
            point_index_path, dtype="<i8", mode="r", shape=point_voxel_count
        )
        ao_values = np.memmap(
            ao_path, dtype=np.uint8, mode="r", shape=point_voxel_count
        )
        combined_voxel_count = count_nonzero_memmap(
            occupied, args.memmap_scan_block
        )
        if combined_voxel_count != previous_ao["combinedOccupiedVoxels"]:
            raise ValueError("Resume occupied-voxel count differs from the report")
        mesh_candidate_tests = resumed_work["mesh"]["candidateVoxelTests"]
        mesh_intersecting_tests = resumed_work["mesh"]["intersectingVoxelTests"]
    else:
        for path in (occupied_path, point_index_path, ao_path):
            path.unlink(missing_ok=True)
        occupied = np.memmap(
            occupied_path, dtype=np.uint8, mode="w+", shape=voxel_count
        )
        occupied[:] = 0

        scanned = 0
        with laspy.open(args.source) as reader:
            if int(reader.header.point_count) != point_count:
                raise RuntimeError("Source point count changed after inspection")
            for points in reader.chunk_iterator(args.chunk_size):
                positions = registered_positions(points, profile, gcg2016)
                cells = np.floor((positions - grid_min) / args.voxel_size).astype(
                    np.int64
                )
                if np.any(cells < 0) or np.any(cells >= shape):
                    raise RuntimeError("Registered source point lies outside AO grid")
                occupied[np.unique(linear_indices(cells, shape))] = 1
                scanned += len(points)
        if scanned != point_count:
            raise RuntimeError(f"Occupancy pass read {scanned} of {point_count} points")
        occupied.flush()
        point_voxel_count = 0
        with point_index_path.open("wb") as point_index_file:
            for start in range(0, voxel_count, args.memmap_scan_block):
                local = np.flatnonzero(
                    occupied[start : start + args.memmap_scan_block]
                )
                if len(local) == 0:
                    continue
                indices = (local.astype(np.int64) + start).astype(
                    "<i8", copy=False
                )
                indices.tofile(point_index_file)
                point_voxel_count += len(indices)
        point_voxel_linear = np.memmap(
            point_index_path, dtype="<i8", mode="r", shape=point_voxel_count
        )
        triangle_origin = np.asarray(triangle_metadata["origin"], dtype=np.float64)
        triangles = np.memmap(args.triangles, dtype="<f4", mode="r").reshape(
            (-1, 3, 3)
        )
        mesh_candidate_tests, mesh_intersecting_tests = (
            rasterize_triangles_into_voxels(
                triangles,
                triangle_origin,
                grid_min,
                shape,
                args.voxel_size,
                occupied,
            )
        )
        occupied.flush()
        combined_voxel_count = count_nonzero_memmap(
            occupied, args.memmap_scan_block
        )

        ao_values = np.memmap(
            ao_path, dtype=np.uint8, mode="w+", shape=point_voxel_count
        )
        directions = fibonacci_hemisphere(args.ray_count)
        for start in range(0, point_voxel_count, args.ao_query_batch):
            end = min(point_voxel_count, start + args.ao_query_batch)
            query_linear = np.asarray(point_voxel_linear[start:end])
            query_cells = np.column_stack(
                np.unravel_index(query_linear, shape)
            ).astype(np.int32)
            visible_rays = trace_sky_visibility(
                query_cells,
                occupied,
                shape,
                directions,
                args.voxel_size,
                args.ray_length,
                args.self_bias,
            )
            ao_values[start:end] = np.rint(
                255.0 * visible_rays / args.ray_count
            ).astype(np.uint8)
        ao_values.flush()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.unlink(missing_ok=True)
    written = 0
    ao_min = 255
    ao_max = 0
    ao_sum = 0
    with laspy.open(args.source) as reader:
        output_header = build_output_header(reader.header, profile, args.profile)
        with laspy.open(
            args.output,
            mode="w",
            header=output_header,
            do_compress=True,
        ) as writer:
            for points in reader.chunk_iterator(args.chunk_size):
                positions = registered_positions(points, profile, gcg2016)
                cells = np.floor((positions - grid_min) / args.voxel_size).astype(
                    np.int64
                )
                point_linear = linear_indices(cells, shape)
                lookup = np.searchsorted(point_voxel_linear, point_linear)
                if np.any(lookup >= point_voxel_count) or np.any(
                    point_voxel_linear[lookup] != point_linear
                ):
                    raise RuntimeError("Point voxel is missing from the AO lookup")
                point_ao = np.asarray(ao_values[lookup], dtype=np.uint8)
                writer.write_points(
                    copy_output_points(
                        points,
                        output_header,
                        profile["retainedDimensions"],
                        point_ao,
                    )
                )
                ao_min = min(ao_min, int(point_ao.min()))
                ao_max = max(ao_max, int(point_ao.max()))
                ao_sum += int(point_ao.astype(np.uint64).sum())
                written += len(points)
    if written != point_count:
        raise RuntimeError(f"Writer produced {written} of {point_count} points")
    with laspy.open(args.output) as verification:
        if int(verification.header.point_count) != point_count:
            raise RuntimeError("Output header point count does not match source")
        output_dimensions = list(verification.header.point_format.dimension_names)
        if "AO" not in output_dimensions:
            raise RuntimeError("Output lacks AO Extra Byte")
        output_point_format = int(verification.header.point_format.id)

    source_stats = inspection["source"]["dimensions"]
    retained_lower = {name.lower() for name in profile["retainedDimensions"]}
    dropped = []
    for name, stats in source_stats.items():
        if name in ("X", "Y", "Z") or name.lower() in retained_lower:
            continue
        constant = stats["minimum"] == stats["maximum"]
        dropped.append(
            {
                "name": name,
                "reason": "constant-or-empty" if constant else "not-retained-by-profile",
                **stats,
            }
        )
    report = {
        "schema": "carma.pointcloud-ao-bake",
        "version": 2,
        "asset": args.profile,
        "source": inspection["source"],
        "workingFrame": inspection["workingFrame"],
        "registration": profile,
        "gcg2016": gcg2016.resource if gcg2016 is not None else None,
        "mesh": {
            "source": mesh_manifest["sourceTileset"],
            "manifest": args.mesh_manifest.name,
            "manifestSha256": sha256(args.mesh_manifest),
            "tileCount": mesh_manifest["selection"]["tileCount"],
            "geometricErrorTargetMeters": mesh_manifest["selection"][
                "errorTargetMeters"
            ],
            "selectionBufferMeters": mesh_manifest["selection"]["bufferMeters"],
            "triangleCount": triangle_metadata["triangleCount"],
            "trianglesSha256": sha256(args.triangles),
            "trianglesMetadataSha256": sha256(args.triangles_metadata),
            "voxelization": "exact triangle/AABB separating-axis test",
            "candidateVoxelTests": int(mesh_candidate_tests),
            "intersectingVoxelTests": int(mesh_intersecting_tests),
            "meshContributedVoxels": combined_voxel_count - point_voxel_count,
        },
        "ao": {
            "occluder": "shared point occupancy plus mandatory Mesh 2024 triangles",
            "voxelSizeMeters": args.voxel_size,
            "pointOccupiedVoxels": point_voxel_count,
            "combinedOccupiedVoxels": combined_voxel_count,
            "rayLengthMeters": args.ray_length,
            "rayCount": args.ray_count,
            "selfBiasMeters": args.self_bias,
            "directions": "deterministic equal-area Fibonacci upper hemisphere",
            "traversal": "parallel exact 3D DDA",
            "gridOrigin": grid_min.tolist(),
            "gridShape": shape.tolist(),
            "gridVoxels": voxel_count,
            "minimum": ao_min,
            "maximum": ao_max,
            "mean": ao_sum / point_count,
        },
        "fields": {
            "retainedPayload": profile["retainedDimensions"],
            "addedExtraDimensions": ["AO=uint8"],
            "droppedSourceDimensions": dropped,
            "note": "LAS point formats retain mandatory structural fields even when their values are constant.",
        },
        "durationSeconds": time.perf_counter() - started,
        "resume": {
            "workReused": args.resume_work,
            "referenceReport": args.resume_report.name
            if args.resume_report is not None
            else None,
        },
        "intermediate": {
            "file": args.output_label or args.output.name,
            "sha256": sha256(args.output),
            "bytes": args.output.stat().st_size,
            "pointCount": point_count,
            "pointFormat": output_point_format,
            "dimensions": output_dimensions,
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)
    inspect_parser = commands.add_parser("inspect")
    inspect_parser.add_argument("--source", type=Path, required=True)
    inspect_parser.add_argument("--profile", choices=PROFILE_DEFINITIONS, required=True)
    inspect_parser.add_argument("--gcg2016-tile", type=Path)
    inspect_parser.add_argument("--output", type=Path, required=True)
    inspect_parser.add_argument("--chunk-size", type=int, default=500_000)
    inspect_parser.add_argument("--footprint-cell-size", type=float, default=25.0)

    bake_parser = commands.add_parser("bake")
    bake_parser.add_argument("--source", type=Path, required=True)
    bake_parser.add_argument("--profile", choices=PROFILE_DEFINITIONS, required=True)
    bake_parser.add_argument("--gcg2016-tile", type=Path)
    bake_parser.add_argument("--inspection", type=Path, required=True)
    bake_parser.add_argument("--triangles", type=Path, required=True)
    bake_parser.add_argument("--triangles-metadata", type=Path, required=True)
    bake_parser.add_argument("--mesh-manifest", type=Path, required=True)
    bake_parser.add_argument("--work-directory", type=Path, required=True)
    bake_parser.add_argument("--output", type=Path, required=True)
    bake_parser.add_argument("--output-label")
    bake_parser.add_argument("--report", type=Path, required=True)
    bake_parser.add_argument("--voxel-size", type=float, default=0.5)
    bake_parser.add_argument("--ray-length", type=float, default=50.0)
    bake_parser.add_argument("--ray-count", type=int, default=256)
    bake_parser.add_argument("--self-bias", type=float, default=1.0)
    bake_parser.add_argument("--chunk-size", type=int, default=500_000)
    bake_parser.add_argument("--memmap-scan-block", type=int, default=10_000_000)
    bake_parser.add_argument("--ao-query-batch", type=int, default=250_000)
    bake_parser.add_argument("--maximum-voxels", type=int, default=8_000_000_000)
    bake_parser.add_argument("--threads", type=int)
    bake_parser.add_argument("--resume-work", action="store_true")
    bake_parser.add_argument("--resume-report", type=Path)
    return root


def main() -> None:
    args = parser().parse_args()
    if args.profile in ("kwh", "oelbergMls") and args.gcg2016_tile is None:
        raise ValueError(f"{args.profile} requires --gcg2016-tile")
    if args.command == "inspect":
        inspect_source(args)
    else:
        bake(args)


if __name__ == "__main__":
    main()
