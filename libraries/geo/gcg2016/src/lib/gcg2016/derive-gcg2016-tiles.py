#!/usr/bin/env python3
"""Extract lossless, independently loadable GCG2016 Float32 tiles.

The generated browser tiles retain the source raster samples unchanged. The
runtime dynamically combines neighboring tiles when the BKG five-by-five
natural bicubic spline stencil crosses a tile boundary.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from osgeo import gdal

TERRAIN_RESOURCE = Path(
    "libraries/commons/resources/src/lib/de.nrw.wuppertal/terrain.ts"
)
TERRAIN_RESOURCE_EXPORT = "NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN"
TILE_SIZE_DEGREES = 2
# Samples are stored as indices on a half-millimetre lattice. The reference
# program gintbs reports on a whole millimetre, and the agreement with it that
# this package publishes is 0.502 mm, so half a lattice step (0.2026 mm
# measured) keeps the combined deviation below the resolution the authority
# itself reports at. For scale, the elevation tiles this grid corrects encode
# in steps of 1/256 m and carry a stated accuracy of 0.15 to 0.30 m.
#
# The step also decides the code width: at 0.5 mm the widest two-degree tile in
# the source grid (N52E012, 7.1159 m) needs 14,232 of the 65,534 usable uint16
# codes, so one fixed width covers the whole grid and the decoder needs no
# per-tile branch. A 0.1 mm lattice would have overflowed uint16 on that tile.
QUANTUM_METERS = 2.5e-4
NO_DATA_CODE = 65535
TILE_VALUE_ENCODING = "base64-uint16-rowdelta"
VERIFICATION_SEED = 4_064
SPLINE_STENCIL_RADIUS_BEFORE = 1
SPLINE_STENCIL_SIZE = 5

OFFICIAL_REFERENCE_VALIDATION = {
    "date": "2026-07-16",
    "method": "five-by-five natural spline reconstructed from BKG gintbs and compared with its millimeter-rounded output",
    "packageUrl": "https://daten.gdz.bkg.bund.de/produkte/sonstige/quasigeoid/aktuell/quasigeoid.geo89.de.zip",
    "archiveSha256": "d5a40a20ae4cdb372c6ca27dbf742c1f46d8e28be282a12ef083fb93b823c67a",
    "windowsExecutableSha256": "6326645be3f0c34bcfb1ca05af48e504c65c9c502fc427af27c7b21e8c6c7813",
    "linuxExecutableSha256": "77b73e922cd06d4b212514b5cd50e121de237b7f27b9510a85fe8432591f05c6",
    "binaryGridSha256": "f76662e147c4fcc381390a7b3a49f75fe7459cefb011a9d5c80a4e2b31a73c99",
    "mesh2024Region": [
        7.011041137873773,
        51.16418982648588,
        7.31648523301344,
        51.319169007294846,
    ],
    "pointCount": 321_201,
    "officialOutputResolutionMeters": 0.001,
    "maximumDistanceToRoundedOfficialOutputMeters": 0.000501833693043352,
}

BILINEAR_COMPARISON = {
    "region": OFFICIAL_REFERENCE_VALIDATION["mesh2024Region"],
    "pointCount": 2_883_601,
    "maximumAbsoluteDifferenceMeters": 0.0009526398344519293,
    "meanAbsoluteDifferenceMeters": 0.00019786990211275216,
    "rmseMeters": 0.00025106759117135785,
    "p99AbsoluteDifferenceMeters": 0.000650242044784477,
}


def read_terrain_bounds(resource: Path, export_name: str):
    """Read `bounds` of one exported terrain resource, the single source of
    truth for how far the elevation data we ship against reaches."""
    text = resource.read_text(encoding="utf8")
    start = text.index(f"export const {export_name}")
    # Stop at the next export, so a renamed or reordered declaration fails loudly
    # instead of silently handing back a neighbouring resource's bounds.
    following = text.find("\nexport const ", start + 1)
    block = text[start:] if following == -1 else text[start:following]
    match = re.search(r"bounds:\s*\[([^\]]*)\]", block)
    if match is None:
        raise RuntimeError(f"{export_name} in {resource} has no bounds")
    values = [float(part) for part in match.group(1).split(",")]
    if len(values) != 4:
        raise RuntimeError(f"{export_name} bounds must have four values")
    return tuple(values)


@dataclass(frozen=True)
class Bounds:
    west: float
    south: float
    east: float
    north: float

    def as_list(self):
        return [self.west, self.south, self.east, self.north]


class GdalGridReference:
    def __init__(self, path: Path):
        gdal.UseExceptions()
        dataset = gdal.Open(str(path))
        if dataset is None:
            raise RuntimeError(f"GDAL could not open {path}")
        transform = dataset.GetGeoTransform()
        if transform[2] != 0 or transform[4] != 0:
            raise RuntimeError("Rotated source grids are unsupported")
        band = dataset.GetRasterBand(1)
        self.values = band.ReadAsArray().astype("<f4", copy=False)
        self.step_longitude = transform[1]
        self.step_latitude = transform[5]
        self.first_longitude = transform[0] + transform[1] / 2.0
        self.first_latitude = transform[3] + transform[5] / 2.0
        self.nodata = band.GetNoDataValue()
        dataset = None

    def sample_indices(self, longitude: np.ndarray, latitude: np.ndarray):
        column = (longitude - self.first_longitude) / self.step_longitude
        row = (latitude - self.first_latitude) / self.step_latitude
        return column, row, np.floor(column).astype(np.int64), np.floor(row).astype(
            np.int64
        )

    def interpolate(self, longitude: np.ndarray, latitude: np.ndarray):
        column, row, column0, row0 = self.sample_indices(longitude, latitude)
        first_column = column0 - SPLINE_STENCIL_RADIUS_BEFORE
        first_row = row0 - SPLINE_STENCIL_RADIUS_BEFORE
        inside = (
            (first_column >= 0)
            & (first_row >= 0)
            & (first_column + SPLINE_STENCIL_SIZE <= self.values.shape[1])
            & (first_row + SPLINE_STENCIL_SIZE <= self.values.shape[0])
        )
        result = np.full(longitude.shape, np.nan, dtype=np.float64)
        if not np.any(inside):
            return result

        columns = first_column[inside][np.newaxis, :] + np.arange(
            SPLINE_STENCIL_SIZE
        )[:, np.newaxis]
        rows = first_row[inside][np.newaxis, :] + np.arange(
            SPLINE_STENCIL_SIZE
        )[:, np.newaxis]
        stencil = self.values[
            rows[:, np.newaxis, :], columns[np.newaxis, :, :]
        ].astype(np.float64, copy=False)
        valid = np.all(np.isfinite(stencil), axis=(0, 1))
        if self.nodata is not None:
            valid &= np.all(stencil != self.nodata, axis=(0, 1))
        row_interpolations = np.stack(
            [
                interpolate_five_point_natural_cubic(
                    stencil[row_index], column[inside] - first_column[inside]
                )
                for row_index in range(SPLINE_STENCIL_SIZE)
            ],
            axis=0,
        )
        interpolated = interpolate_five_point_natural_cubic(
            row_interpolations, row[inside] - first_row[inside]
        )
        target = result[inside]
        target[valid] = interpolated[valid]
        result[inside] = target
        return result


def interpolate_five_point_natural_cubic(
    samples: np.ndarray, coordinate: np.ndarray
):
    second_derivatives = np.zeros(samples.shape, dtype=np.float64)
    work = np.zeros(samples.shape, dtype=np.float64)
    for index in range(1, SPLINE_STENCIL_SIZE - 1):
        sigma = 0.5
        denominator = sigma * second_derivatives[index - 1] + 2.0
        second_derivatives[index] = (sigma - 1.0) / denominator
        curvature = (
            samples[index + 1] - 2.0 * samples[index] + samples[index - 1]
        )
        work[index] = (
            3.0 * curvature - sigma * work[index - 1]
        ) / denominator
    for index in range(SPLINE_STENCIL_SIZE - 2, -1, -1):
        second_derivatives[index] = (
            second_derivatives[index] * second_derivatives[index + 1]
            + work[index]
        )

    lower_index = np.floor(coordinate).astype(np.int64)
    upper_index = lower_index + 1
    sample_index = np.arange(coordinate.size)
    lower_weight = upper_index - coordinate
    upper_weight = coordinate - lower_index
    return (
        lower_weight * samples[lower_index, sample_index]
        + upper_weight * samples[upper_index, sample_index]
        + (
            (lower_weight**3 - lower_weight)
            * second_derivatives[lower_index, sample_index]
            + (upper_weight**3 - upper_weight)
            * second_derivatives[upper_index, sample_index]
        )
        / 6.0
    )


def tile_id(west: int, south: int):
    latitude_prefix = "S" if south < 0 else "N"
    longitude_prefix = "W" if west < 0 else "E"
    return (
        f"{latitude_prefix}{abs(south):02d}"
        f"{longitude_prefix}{abs(west):03d}"
    )


def encode_values(values: np.ndarray, no_data):
    """Quantise onto the source lattice, then delta-code along each row.

    Neighbouring quasigeoid samples differ by a few lattice steps, so the row
    delta leaves a mostly small residual that the transport layer and git
    compress well. Regrouping the byte planes on top would save a further 8 %
    on the wire and cost a second pass in the browser, which is not worth it;
    see the measurements in the pull request that introduced this encoding.
    """
    finite = values if no_data is None else values[values != no_data]
    # A tile can lie entirely outside the modelled area and hold nothing but
    # NoData. It carries no offset to derive, so pick zero and let every sample
    # encode as the NoData code; the runtime rejects such coordinates anyway.
    offset = float(np.min(finite)) if finite.size else 0.0
    codes = np.rint((values.astype(np.float64) - offset) / QUANTUM_METERS)
    if no_data is not None:
        codes = np.where(values == no_data, NO_DATA_CODE, codes)
    if np.any(codes < 0) or np.any(codes > NO_DATA_CODE):
        raise RuntimeError("quantised values leave the uint16 range")
    codes = codes.astype(np.int64)
    residual = codes.copy()
    residual[:, 1:] = codes[:, 1:] - codes[:, :-1]
    return offset, (residual & 0xFFFF).astype("<u2").tobytes()


def extract_tile(reference: GdalGridReference, bounds: Bounds, identifier: str):
    source_longitudes = (
        reference.first_longitude
        + np.arange(reference.values.shape[1]) * reference.step_longitude
    )
    source_latitudes = (
        reference.first_latitude
        + np.arange(reference.values.shape[0]) * reference.step_latitude
    )
    columns = np.flatnonzero(
        (source_longitudes >= bounds.west) & (source_longitudes < bounds.east)
    )
    rows = np.flatnonzero(
        (source_latitudes >= bounds.south) & (source_latitudes < bounds.north)
    )
    if columns.size == 0 or rows.size == 0:
        raise RuntimeError(f"{identifier} contains no source samples")
    column_start = int(columns[0])
    column_end = int(columns[-1])
    row_start = int(rows[0])
    row_end = int(rows[-1])
    values = np.ascontiguousarray(
        reference.values[row_start : row_end + 1, column_start : column_end + 1],
        dtype="<f4",
    )
    offset, payload = encode_values(values, reference.nodata)
    return {
        "format": "carma-gcg2016-uint16-tile-v4",
        "id": identifier,
        "bounds": bounds.as_list(),
        "grid": {
            "firstLongitude": reference.first_longitude,
            "firstLatitude": reference.first_latitude,
            "stepLongitude": reference.step_longitude,
            "stepLatitude": reference.step_latitude,
            "columnStart": column_start,
            "rowStart": row_start,
            "width": int(values.shape[1]),
            "height": int(values.shape[0]),
            "noDataValue": reference.nodata,
        },
        "values": {
            "encoding": TILE_VALUE_ENCODING,
            "offsetMeters": offset,
            "quantumMeters": QUANTUM_METERS,
            "noDataCode": NO_DATA_CODE,
            "data": base64.b64encode(payload).decode("ascii"),
        },
    }


def decode_tile(tile):
    """Reference decoder: the exact inverse of `encode_values`, mirrored by the
    browser implementation in libraries/geo/proj/src/lib/tiled-vertical-offset.ts."""
    grid = tile["grid"]
    values = tile["values"]
    if values["encoding"] != TILE_VALUE_ENCODING:
        raise RuntimeError(f"unsupported encoding {values['encoding']}")
    residual = np.frombuffer(
        base64.b64decode(values["data"]), dtype="<u2"
    ).reshape((grid["height"], grid["width"])).astype(np.int64)
    codes = np.cumsum(residual, axis=1) & 0xFFFF
    decoded = codes * values["quantumMeters"] + values["offsetMeters"]
    if grid["noDataValue"] is not None:
        decoded = np.where(codes == values["noDataCode"], grid["noDataValue"], decoded)
    return decoded.astype(np.float64)


def sample_from_tiles(tiles_by_id, source_column, source_row):
    """Read source samples from whichever tile window contains them.

    Tiles are located by the sample window they declare, not by a degree grid,
    so one named subset and a multi-tile set resolve through the same path.
    """
    result = np.full(source_column.shape, np.nan, dtype=np.float64)
    for tile in tiles_by_id.values():
        tile_grid = tile["grid"]
        columns = source_column - tile_grid["columnStart"]
        rows = source_row - tile_grid["rowStart"]
        inside = (
            (columns >= 0)
            & (rows >= 0)
            & (columns < tile_grid["width"])
            & (rows < tile_grid["height"])
        )
        if not np.any(inside):
            continue
        values = decode_tile(tile)
        result[inside] = values[rows[inside], columns[inside]]
    return result


def interpolate_tiles(tiles_by_id, longitude, latitude):
    first_tile = next(iter(tiles_by_id.values()))
    grid = first_tile["grid"]
    column = (longitude - grid["firstLongitude"]) / grid["stepLongitude"]
    row = (latitude - grid["firstLatitude"]) / grid["stepLatitude"]
    column0 = np.floor(column).astype(np.int64)
    row0 = np.floor(row).astype(np.int64)
    first_column = column0 - SPLINE_STENCIL_RADIUS_BEFORE
    first_row = row0 - SPLINE_STENCIL_RADIUS_BEFORE
    stencil = np.stack(
        [
            sample_from_tiles(
                tiles_by_id,
                first_column + column_offset,
                first_row + row_offset,
            )
            for row_offset in range(SPLINE_STENCIL_SIZE)
            for column_offset in range(SPLINE_STENCIL_SIZE)
        ],
        axis=0,
    ).reshape(
        SPLINE_STENCIL_SIZE, SPLINE_STENCIL_SIZE, longitude.size
    )
    valid = np.all(np.isfinite(stencil), axis=(0, 1))
    if grid["noDataValue"] is not None:
        valid &= np.all(stencil != grid["noDataValue"], axis=(0, 1))
    row_interpolations = np.stack(
        [
            interpolate_five_point_natural_cubic(
                stencil[row_index], column - first_column
            )
            for row_index in range(SPLINE_STENCIL_SIZE)
        ],
        axis=0,
    )
    interpolated = interpolate_five_point_natural_cubic(
        row_interpolations, row - first_row
    )
    return np.where(valid, interpolated, np.nan)


def verification_points(bounds: Bounds, random_count: int, seed: int):
    generator = np.random.default_rng(seed)
    longitude = generator.uniform(bounds.west, bounds.east, random_count)
    latitude = generator.uniform(bounds.south, bounds.north, random_count)
    edge = np.linspace(0.0, 1.0, 4_096, endpoint=False)
    east = np.nextafter(bounds.east, bounds.west)
    north = np.nextafter(bounds.north, bounds.south)
    longitude = np.concatenate(
        [
            longitude,
            np.full(edge.size, bounds.west),
            np.full(edge.size, east),
            bounds.west + edge * (bounds.east - bounds.west),
            bounds.west + edge * (bounds.east - bounds.west),
        ]
    )
    latitude = np.concatenate(
        [
            latitude,
            bounds.south + edge * (bounds.north - bounds.south),
            bounds.south + edge * (bounds.north - bounds.south),
            np.full(edge.size, bounds.south),
            np.full(edge.size, north),
        ]
    )
    return longitude, latitude


def verify_tile(reference, tile, tiles_by_id, random_count, seed):
    bounds = Bounds(*tile["bounds"])
    longitude, latitude = verification_points(bounds, random_count, seed)
    expected = reference.interpolate(longitude, latitude)
    actual = interpolate_tiles(tiles_by_id, longitude, latitude)
    supported = np.isfinite(expected) & np.isfinite(actual)
    # A finite tile set cannot support its own outer boundary, where the stencil
    # would need samples beyond the last tile. Record how often that happens
    # instead of dropping it silently from the error metric.
    unsupported_by_tiles = np.isfinite(expected) & ~np.isfinite(actual)
    absolute_error = np.abs(actual[supported] - expected[supported])
    # A tile can be entirely NoData, leaving nothing to compare.
    if absolute_error.size == 0:
        return {
            "tileId": tile["id"],
            "candidatePointCount": int(supported.size),
            "supportedPointCount": 0,
            "pointsResolvedOnlyByFullGrid": int(
                np.count_nonzero(unsupported_by_tiles)
            ),
            "maximumAbsoluteErrorMeters": 0.0,
            "p999AbsoluteErrorMeters": 0.0,
            "rmseMeters": 0.0,
        }
    return {
        "tileId": tile["id"],
        "candidatePointCount": int(supported.size),
        "supportedPointCount": int(np.count_nonzero(supported)),
        "pointsResolvedOnlyByFullGrid": int(np.count_nonzero(unsupported_by_tiles)),
        "maximumAbsoluteErrorMeters": float(np.max(absolute_error)),
        "p999AbsoluteErrorMeters": float(np.quantile(absolute_error, 0.999)),
        "rmseMeters": float(
            np.sqrt(np.mean((actual[supported] - expected[supported]) ** 2))
        ),
    }


def write_generated_typescript(output_directory: Path, provenance, tiles):
    loader_lines = [
        f'  "{tile["id"]}": () => import("./gcg2016/{tile["id"]}").then((module) => module.default),'
        for tile in tiles
    ]
    content = f'''// Generated by libraries/geo/gcg2016/src/lib/gcg2016/derive-gcg2016-tiles.py. Do not edit.
export const GCG2016_PROVENANCE = {json.dumps(provenance, indent=2)} as const;

export const GCG2016_TILE_LOADERS: Readonly<Record<
  string,
  () => Promise<unknown>
>> = {{
{chr(10).join(loader_lines)}
}};
'''
    (output_directory.parent / "gcg2016.ts").write_text(
        content, encoding="utf8"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-grid", required=True, type=Path)
    parser.add_argument(
        "--output-directory",
        type=Path,
        default=Path("libraries/geo/gcg2016/src/lib/gcg2016"),
    )
    parser.add_argument("--terrain-resource", type=Path, default=TERRAIN_RESOURCE)
    parser.add_argument("--terrain-export", default=TERRAIN_RESOURCE_EXPORT)
    parser.add_argument(
        "--bounds",
        type=float,
        nargs=4,
        metavar=("WEST", "SOUTH", "EAST", "NORTH"),
        help="override the terrain resource bounds",
    )
    parser.add_argument(
        "--tile-size-degrees", type=int, default=TILE_SIZE_DEGREES
    )
    parser.add_argument("--verification-random-points", type=int, default=100_000)
    arguments = parser.parse_args()

    if arguments.bounds:
        coverage = tuple(arguments.bounds)
        coverage_source = "explicit --bounds argument"
    else:
        coverage = read_terrain_bounds(
            arguments.terrain_resource, arguments.terrain_export
        )
        coverage_source = (
            f"{arguments.terrain_export}.bounds in {arguments.terrain_resource}"
        )
    if not (coverage[0] < coverage[2] and coverage[1] < coverage[3]):
        raise ValueError("Bounds must be ordered west < east and south < north")
    tile_size = arguments.tile_size_degrees
    if tile_size <= 0:
        raise ValueError("Tile size must be positive")
    # Snap outward to the tile grid: the bundled tiles are exactly those the
    # elevation coverage reaches into, so the payload follows the terrain.
    region = (
        math.floor(coverage[0] / tile_size) * tile_size,
        math.floor(coverage[1] / tile_size) * tile_size,
        math.ceil(coverage[2] / tile_size) * tile_size,
        math.ceil(coverage[3] / tile_size) * tile_size,
    )

    reference = GdalGridReference(arguments.source_grid)
    tiles = []
    for south in range(int(region[1]), int(region[3]), tile_size):
        for west in range(int(region[0]), int(region[2]), tile_size):
            bounds = Bounds(west, south, west + tile_size, south + tile_size)
            tiles.append(extract_tile(reference, bounds, tile_id(west, south)))

    tiles_by_id = {tile["id"]: tile for tile in tiles}
    verification = [
        verify_tile(
            reference,
            tile,
            tiles_by_id,
            arguments.verification_random_points,
            VERIFICATION_SEED + index,
        )
        for index, tile in enumerate(tiles)
    ]
    maximum_error = max(
        result["maximumAbsoluteErrorMeters"] for result in verification
    )
    # Half a lattice step bounds the error of a single sample, but not of an
    # interpolated value: the natural cubic spline carries negative weights and
    # overshoots, so a query can land further out than any of its 25 supports.
    # A whole step is the bound that holds; the measured value is recorded in
    # the provenance so a regression shows up as a number, not just as a pass.
    interpolation_tolerance = QUANTUM_METERS
    if maximum_error > interpolation_tolerance:
        raise RuntimeError(
            f"Tiled interpolation differs from the full grid by {maximum_error} m"
        )

    # The per-tile check above proves the tiles reproduce the source grid. This
    # proves the separate promise the region derivation makes: that the bundled
    # set can actually serve every point of the elevation coverage it was cut
    # for. Without it a coverage that outgrows the bundled tiles would ship
    # silently and only fail in the browser.
    coverage_longitude, coverage_latitude = verification_points(
        Bounds(*coverage), arguments.verification_random_points, VERIFICATION_SEED - 1
    )
    coverage_expected = reference.interpolate(coverage_longitude, coverage_latitude)
    coverage_actual = interpolate_tiles(
        tiles_by_id, coverage_longitude, coverage_latitude
    )
    coverage_missing = int(
        np.count_nonzero(np.isfinite(coverage_expected) & ~np.isfinite(coverage_actual))
    )
    if coverage_missing:
        raise RuntimeError(
            f"the bundled tiles cannot serve {coverage_missing} points inside the "
            f"elevation coverage {list(coverage)}"
        )
    coverage_supported = np.isfinite(coverage_expected) & np.isfinite(coverage_actual)
    coverage_error = float(
        np.max(
            np.abs(
                coverage_actual[coverage_supported]
                - coverage_expected[coverage_supported]
            )
        )
    )
    if coverage_error > interpolation_tolerance:
        raise RuntimeError(
            f"Coverage interpolation differs from the full grid by {coverage_error} m"
        )

    # What the lattice quantisation actually costs against the stored Float32
    # samples, measured rather than asserted.
    sample_deviation = 0.0
    for tile in tiles:
        tile_grid = tile["grid"]
        stored = reference.values[
            tile_grid["rowStart"] : tile_grid["rowStart"] + tile_grid["height"],
            tile_grid["columnStart"] : tile_grid["columnStart"] + tile_grid["width"],
        ].astype(np.float64)
        decoded = decode_tile(tile)
        if reference.nodata is not None:
            comparable = stored != reference.nodata
        else:
            comparable = np.ones(stored.shape, dtype=bool)
        if np.any(comparable):
            sample_deviation = max(
                sample_deviation,
                float(np.max(np.abs(decoded[comparable] - stored[comparable]))),
            )

    source_bytes = arguments.source_grid.read_bytes()
    provenance = {
        "format": "carma-gcg2016-uint16-tile-set-v4",
        "supportedRegion": list(region),
        "rootTileSizeDegrees": tile_size,
        "elevationCoverage": list(coverage),
        "elevationCoverageSource": coverage_source,
        "samplePartition": "source pixel centers, no duplicated halo",
        "sampleEncoding": {
            "id": TILE_VALUE_ENCODING,
            "quantumMeters": QUANTUM_METERS,
            "noDataCode": NO_DATA_CODE,
            "steps": "index on a 0.5 mm lattice, row delta, uint16 little-endian, base64",
            "maximumDeviationFromSourceFloat32Meters": sample_deviation,
        },
        "source": {
            "fileName": arguments.source_grid.name,
            "sha256": hashlib.sha256(source_bytes).hexdigest(),
            "byteLength": len(source_bytes),
            "description": "BKG GCG2016 GeoTIFF distributed with PROJ",
            "provider": "Bundesamt für Kartographie und Geodäsie (BKG)",
            "credit": "(c) Bundesamt für Kartographie und Geodäsie - BKG - Deutschland",
            "license": "CC-BY-4.0",
            "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
            "sourceUrl": "https://gdz.bkg.bund.de/index.php/default/quasigeoid-der-bundesrepublik-deutschland-quasigeoid.html",
            "documentationUrl": "https://sgx.geodatenzentrum.de/web_public/gdz/dokumentation/deu/quasigeoid.pdf",
            "adaptation": "spatially subset to the tiles the bundled elevation coverage reaches and repackaged as independently loadable CARMA TypeScript payload modules; sample values are stored as indices on a 0.25 mm lattice, delta-coded per raster row",
            "horizontalCrs": "EPSG:10283 (ETRS89/DREF91/2016)",
        },
        "sourceGrid": {
            "width": int(reference.values.shape[1]),
            "height": int(reference.values.shape[0]),
            "firstLongitude": reference.first_longitude,
            "firstLatitude": reference.first_latitude,
            "stepLongitude": reference.step_longitude,
            "stepLatitude": reference.step_latitude,
            "sampleEncoding": "source Float32",
        },
        "runtimeMethod": "BKG-compatible natural bicubic spline over a local five-by-five stencil of the stored lattice samples",
        "referenceMethod": "same spline evaluated directly against the complete source GeoTIFF array",
        "officialReferenceValidation": OFFICIAL_REFERENCE_VALIDATION,
        "bilinearComparison": BILINEAR_COMPARISON,
        "verificationSeed": VERIFICATION_SEED,
        "verificationRandomPointsPerTile": arguments.verification_random_points,
        "verificationEdgePointsPerTile": 16_384,
        "totalSupportedVerificationPointCount": sum(
            item["supportedPointCount"] for item in verification
        ),
        "maximumVerifiedDifferenceMeters": maximum_error,
        "elevationCoverageVerification": {
            "pointCount": int(coverage_longitude.size),
            "supportedPointCount": int(np.count_nonzero(coverage_supported)),
            "pointsTheBundledTilesCannotServe": coverage_missing,
            "maximumAbsoluteErrorMeters": coverage_error,
        },
        "verification": verification,
    }

    arguments.output_directory.mkdir(parents=True, exist_ok=True)
    for tile in tiles:
        (arguments.output_directory / f"{tile['id']}.ts").write_text(
            "// Generated by derive-gcg2016-tiles.py. Do not edit.\n"
            + "// prettier-ignore\n"
            + "const tile: unknown = "
            + json.dumps(tile, separators=(",", ":"))
            + ";\n\nexport default tile;\n",
            encoding="utf8",
        )
    (arguments.output_directory / "validation.json").write_text(
        json.dumps(provenance, indent=2) + "\n", encoding="utf8"
    )
    write_generated_typescript(arguments.output_directory, provenance, tiles)
    print(json.dumps(provenance, indent=2))


if __name__ == "__main__":
    main()
