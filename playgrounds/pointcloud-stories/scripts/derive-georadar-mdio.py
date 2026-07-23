#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#   "multidimio==1.2.0",
#   "numpy==2.4.6",
# ]
# ///

"""Create and verify an MDIO v1 store for a CARMA sliced GPR volume."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from importlib.metadata import version
from pathlib import Path
from typing import Any

import numpy as np
from mdio.api.io import open_mdio, to_mdio
from mdio.builder.dataset_builder import MDIODatasetBuilder
from mdio.builder.schemas.chunk_grid import RegularChunkGrid, RegularChunkShape
from mdio.builder.schemas.dtype import ScalarType
from mdio.builder.schemas.v1.units import LengthUnitEnum, LengthUnitModel
from mdio.builder.schemas.v1.variable import CoordinateMetadata, VariableMetadata
from mdio.builder.xarray_builder import to_xarray_dataset

DEFAULT_CHUNK_SLICES = 128
UINT16_BYTES = 2


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Convert a carma-georadar-volume-v1 R16 tensor to an MDIO v1 / "
            "Zarr v3 store with per-slice placement variables."
        )
    )
    parser.add_argument("input_metadata", type=Path)
    parser.add_argument("output_store", type=Path)
    parser.add_argument(
        "--chunk-slices",
        type=int,
        default=DEFAULT_CHUNK_SLICES,
        help="Number of complete cross-sections in one amplitude chunk.",
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if args.chunk_slices < 1:
        parser.error("--chunk-slices must be positive")
    args.input_metadata = args.input_metadata.resolve()
    args.output_store = args.output_store.resolve()
    return args


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def directory_stats(root: Path) -> tuple[int, int]:
    files = [path for path in root.rglob("*") if path.is_file()]
    return sum(path.stat().st_size for path in files), len(files)


def chunk_stats(root: Path, variable_name: str) -> tuple[int, int]:
    chunk_root = root / variable_name / "c"
    if not chunk_root.exists():
        return 0, 0
    files = [path for path in chunk_root.rglob("*") if path.is_file()]
    return sum(path.stat().st_size for path in files), len(files)


def regular_chunks(*shape: int) -> RegularChunkGrid:
    return RegularChunkGrid(configuration=RegularChunkShape(chunk_shape=shape))


def derive_slice_poses(centerline: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    previous = np.concatenate((centerline[:1], centerline[:-1]), axis=0)
    following = np.concatenate((centerline[1:], centerline[-1:]), axis=0)
    forward_horizontal = following - previous
    lengths = np.linalg.norm(forward_horizontal, axis=1)
    unstable = np.flatnonzero(lengths == 0)
    if unstable.size:
        raise ValueError(f"slice {int(unstable[0])} has no stable forward direction")
    forward_horizontal /= lengths[:, np.newaxis]

    basis_frd_enu = np.zeros((centerline.shape[0], 3, 3), dtype=np.float64)
    basis_frd_enu[:, 0, :2] = forward_horizontal
    basis_frd_enu[:, 1, 0] = forward_horizontal[:, 1]
    basis_frd_enu[:, 1, 1] = -forward_horizontal[:, 0]
    basis_frd_enu[:, 2, 2] = -1

    products = basis_frd_enu @ np.swapaxes(basis_frd_enu, 1, 2)
    identity = np.broadcast_to(np.eye(3), products.shape)
    if not np.allclose(products, identity, rtol=0, atol=1e-12):
        raise ValueError("derived Forward/Right/Down bases are not orthonormal")

    return centerline.copy(), basis_frd_enu


def calculate_amplitude_statistics(
    source: np.ndarray,
    signal_offset: int,
    maximum_code: int,
) -> tuple[list[int], int]:
    histogram = np.zeros(256, dtype=np.int64)
    active_sample_count = 0
    flat_source = source.reshape(-1)
    negative_scale = max(1, signal_offset)
    positive_scale = max(1, maximum_code - signal_offset)
    block_samples = 2 * 1024 * 1024
    for start in range(0, flat_source.size, block_samples):
        samples = flat_source[start : start + block_samples].astype(
            np.int32, copy=False
        )
        centered = samples - signal_offset
        active_sample_count += int(np.count_nonzero(centered))
        normalized = np.where(
            centered < 0,
            np.abs(centered) / negative_scale,
            centered / positive_scale,
        )
        bins = np.minimum(255, np.floor(normalized * 256)).astype(np.uint8)
        histogram += np.bincount(bins, minlength=256)
    return [int(value) for value in histogram], active_sample_count


def coordinate_metadata(
    *,
    attributes: dict[str, Any],
    meter: LengthUnitModel | None = None,
) -> CoordinateMetadata:
    return CoordinateMetadata(units_v1=meter, attributes=attributes)


def variable_metadata(
    chunks: tuple[int, ...],
    *,
    attributes: dict[str, Any],
    meter: LengthUnitModel | None = None,
) -> VariableMetadata:
    return VariableMetadata(
        chunk_grid=regular_chunks(*chunks),
        units_v1=meter,
        attributes=attributes,
    )


def build_mdio_schema(
    *,
    name: str,
    capture_id: int,
    source_metadata_name: str,
    source_amplitude_name: str,
    source_amplitude_sha256: str,
    horizontal_crs: str,
    slice_count: int,
    trace_count: int,
    depth_count: int,
    chunk_slices: int,
    signal: dict[str, Any],
) -> Any:
    meter = LengthUnitModel(length=LengthUnitEnum.METER)
    attributes = {
        "defaultVariableName": "amplitude",
        "carmaFormat": "carma-georadar-mdio-v1",
        "captureId": capture_id,
        "source": {
            "metadata": source_metadata_name,
            "amplitude": source_amplitude_name,
            "amplitudeSha256": source_amplitude_sha256,
        },
        "signal": signal,
        "placement": {
            "model": "per-slice-pose-variables",
            "horizontalCrs": horizontal_crs,
            "verticalReference": "external-unresolved",
            "elevationOffsetsBakedIntoSamples": False,
            "basisOrder": ["forward", "right", "down"],
            "basisComponents": ["east", "north", "up"],
            "horizontalAnchorSource": "delivered T0 center trace",
            "orientationSource": (
                "horizontal centered-difference tangent; pitch and roll unresolved"
            ),
        },
        "localVolume": {
            "viewableWithoutPoseVariables": True,
            "sampleAxes": ["slice", "trace", "depth"],
        },
    }
    builder = MDIODatasetBuilder(name=name, attributes=attributes)
    for dimension_name, size in (
        ("slice", slice_count),
        ("trace", trace_count),
        ("depth", depth_count),
        ("horizontal_component", 2),
        ("basis_axis", 3),
        ("enu_component", 3),
    ):
        builder.add_dimension(dimension_name, size)

    builder.add_coordinate(
        "slice_m",
        long_name="distance along the acquisition spine",
        dimensions=("slice",),
        data_type=ScalarType.FLOAT64,
        metadata=coordinate_metadata(
            meter=meter,
            attributes={"axis": "slice", "positive": "forward"},
        ),
    )
    builder.add_coordinate(
        "trace_m",
        long_name="cross-track distance from the center trace",
        dimensions=("trace",),
        data_type=ScalarType.FLOAT64,
        metadata=coordinate_metadata(
            meter=meter,
            attributes={"axis": "trace", "positive": "right"},
        ),
    )
    builder.add_coordinate(
        "depth_m",
        long_name="nominal sample depth below the local slice anchor",
        dimensions=("depth",),
        data_type=ScalarType.FLOAT64,
        metadata=coordinate_metadata(
            meter=meter,
            attributes={"axis": "depth", "positive": "down"},
        ),
    )
    builder.add_coordinate(
        "horizontal_component",
        dimensions=("horizontal_component",),
        data_type=ScalarType.UINT8,
        metadata=coordinate_metadata(
            attributes={"codes": {"0": "easting", "1": "northing"}}
        ),
    )
    builder.add_coordinate(
        "basis_axis",
        dimensions=("basis_axis",),
        data_type=ScalarType.UINT8,
        metadata=coordinate_metadata(
            attributes={"codes": {"0": "forward", "1": "right", "2": "down"}}
        ),
    )
    builder.add_coordinate(
        "enu_component",
        dimensions=("enu_component",),
        data_type=ScalarType.UINT8,
        metadata=coordinate_metadata(
            attributes={"codes": {"0": "east", "1": "north", "2": "up"}}
        ),
    )

    amplitude_chunks = (min(chunk_slices, slice_count), trace_count, depth_count)
    builder.add_variable(
        "amplitude",
        long_name="lossless ground-penetrating radar amplitude",
        dimensions=("slice", "trace", "depth"),
        data_type=ScalarType.UINT16,
        coordinates=("slice_m", "trace_m", "depth_m"),
        metadata=variable_metadata(
            amplitude_chunks,
            attributes={
                "units": "instrument_code",
                "sourceOrder": ["depth", "trace", "slice"],
                "signalOffset": signal["signalOffset"],
                "samplesAreUnmodified": True,
            },
        ),
    )
    pose_chunk = min(chunk_slices, slice_count)
    builder.add_variable(
        "anchor_horizontal_m",
        long_name="per-slice horizontal anchor",
        dimensions=("slice", "horizontal_component"),
        data_type=ScalarType.FLOAT64,
        coordinates=("slice_m", "horizontal_component"),
        metadata=variable_metadata(
            (pose_chunk, 2),
            meter=meter,
            attributes={
                "components": ["easting", "northing"],
                "crs": horizontal_crs,
            },
        ),
    )
    builder.add_variable(
        "basis_frd_enu",
        long_name="per-slice Forward/Right/Down basis in East/North/Up components",
        dimensions=("slice", "basis_axis", "enu_component"),
        data_type=ScalarType.FLOAT64,
        coordinates=("slice_m", "basis_axis", "enu_component"),
        metadata=variable_metadata(
            (pose_chunk, 3, 3),
            attributes={
                "orientationSource": (
                    "horizontal centered-difference tangent; pitch and roll unresolved"
                ),
                "orthonormal": True,
            },
        ),
    )
    builder.add_variable(
        "elevation_offset_m",
        long_name="external per-slice elevation correction",
        dimensions=("slice",),
        data_type=ScalarType.FLOAT32,
        coordinates=("slice_m",),
        metadata=variable_metadata(
            (pose_chunk,),
            meter=meter,
            attributes={
                "positive": "up",
                "status": "unresolved",
                "bakedIntoAmplitudeSamples": False,
            },
        ),
    )
    builder.add_variable(
        "pose_status",
        long_name="availability level of each per-slice pose",
        dimensions=("slice",),
        data_type=ScalarType.UINT8,
        coordinates=("slice_m",),
        metadata=variable_metadata(
            (pose_chunk,),
            attributes={
                "codes": {
                    "0": "unlocated",
                    "1": "horizontal-anchor-and-heading-only",
                    "2": "full-3d-pose",
                }
            },
        ),
    )
    return builder.build()


def set_array(
    dataset: Any,
    name: str,
    values: np.ndarray,
    chunks: tuple[int, ...],
    shards: tuple[int, ...] | None = None,
) -> None:
    data_array = dataset[name]
    if data_array.shape != values.shape:
        raise ValueError(
            f"{name} data shape {values.shape} does not match schema {data_array.shape}"
        )
    if name in dataset.indexes:
        dimensions = data_array.dims
        attributes = dict(data_array.attrs)
        dataset.coords[name] = (dimensions, values)
        data_array = dataset[name]
        data_array.attrs.update(attributes)
    else:
        data_array.data = values
    data_array.encoding["chunks"] = chunks
    if shards is not None:
        data_array.encoding["shards"] = shards
    data_array.encoding["fill_value"] = None
    data_array.encoding["compressors"] = None


def main() -> None:
    args = parse_arguments()
    metadata = json.loads(args.input_metadata.read_text())
    if metadata.get("format") != "carma-georadar-volume-v1":
        raise ValueError(f"unsupported source format: {metadata.get('format')}")

    variants = [metadata.get("data"), *metadata.get("variants", [])]
    raw_variant = next(
        (variant for variant in variants if variant and variant.get("id") == "raw16"),
        None,
    )
    if raw_variant is None:
        raise ValueError("source metadata has no raw16 variant")
    if raw_variant.get("dtype") != "uint16-le":
        raise ValueError(f"unsupported source dtype: {raw_variant.get('dtype')}")
    if raw_variant.get("order") != ["depth", "trace", "slice"]:
        raise ValueError(f"unsupported source order: {raw_variant.get('order')}")

    shape = raw_variant["shape"]
    slice_count = int(shape["slice"])
    trace_count = int(shape["trace"])
    depth_count = int(shape["depth"])
    expected_bytes = slice_count * trace_count * depth_count * UINT16_BYTES
    source_amplitude = (args.input_metadata.parent / raw_variant["url"]).resolve()
    if source_amplitude.stat().st_size != expected_bytes:
        raise ValueError(
            f"source byte length {source_amplitude.stat().st_size} does not match "
            f"{expected_bytes}"
        )

    slice_m = np.asarray(metadata["axes"]["sliceMeters"], dtype=np.float64)
    trace_m = np.asarray(metadata["axes"]["traceMeters"], dtype=np.float64)
    depth_m = np.asarray(metadata["axes"]["depthMillimeters"], dtype=np.float64) / 1000
    centerline = np.asarray(metadata["georeference"]["centerlineUtm"], dtype=np.float64)
    expected_shapes = {
        "slice_m": ((slice_count,), slice_m.shape),
        "trace_m": ((trace_count,), trace_m.shape),
        "depth_m": ((depth_count,), depth_m.shape),
        "centerline": ((slice_count, 2), centerline.shape),
    }
    for name, (expected, actual) in expected_shapes.items():
        if expected != actual:
            raise ValueError(f"{name} shape {actual} does not match {expected}")

    if args.output_store.exists():
        if not args.force:
            raise FileExistsError(f"output already exists: {args.output_store}")
        shutil.rmtree(args.output_store)
    args.output_store.parent.mkdir(parents=True, exist_ok=True)

    source_sha256 = sha256_file(source_amplitude)
    source_tensor = np.memmap(
        source_amplitude,
        mode="r",
        dtype="<u2",
        shape=(depth_count, trace_count, slice_count),
    )
    normalized_histogram, active_sample_count = calculate_amplitude_statistics(
        source_tensor,
        raw_variant["signalOffset"],
        raw_variant["maximumCode"],
    )
    signal = {
        "validBits": raw_variant["validBits"],
        "maximumCode": raw_variant["maximumCode"],
        "signalOffset": raw_variant["signalOffset"],
        "normalizedAmplitudeHistogram256": normalized_histogram,
        "activeSampleCount": active_sample_count,
    }
    schema = build_mdio_schema(
        name=f"CARMA GPR capture {metadata['captureId']}",
        capture_id=metadata["captureId"],
        source_metadata_name=args.input_metadata.name,
        source_amplitude_name=source_amplitude.name,
        source_amplitude_sha256=source_sha256,
        horizontal_crs=metadata["georeference"]["crs"],
        slice_count=slice_count,
        trace_count=trace_count,
        depth_count=depth_count,
        chunk_slices=args.chunk_slices,
        signal=signal,
    )
    dataset = to_xarray_dataset(schema)

    amplitude = np.transpose(source_tensor, (2, 1, 0))
    anchor_horizontal_m, basis_frd_enu = derive_slice_poses(centerline)
    elevation_offset_m = np.full(slice_count, np.nan, dtype=np.float32)
    pose_status = np.full(slice_count, 1, dtype=np.uint8)
    chunk_slices = min(args.chunk_slices, slice_count)
    shard_slices = math.ceil(slice_count / chunk_slices) * chunk_slices

    arrays: dict[str, tuple[np.ndarray, tuple[int, ...], tuple[int, ...] | None]] = {
        "slice_m": (slice_m, (chunk_slices,), (shard_slices,)),
        "trace_m": (trace_m, (trace_count,), None),
        "depth_m": (depth_m, (depth_count,), None),
        "horizontal_component": (np.arange(2, dtype=np.uint8), (2,), None),
        "basis_axis": (np.arange(3, dtype=np.uint8), (3,), None),
        "enu_component": (np.arange(3, dtype=np.uint8), (3,), None),
        "amplitude": (
            amplitude,
            (chunk_slices, trace_count, depth_count),
            (shard_slices, trace_count, depth_count),
        ),
        "anchor_horizontal_m": (
            anchor_horizontal_m,
            (chunk_slices, 2),
            (shard_slices, 2),
        ),
        "basis_frd_enu": (
            basis_frd_enu,
            (chunk_slices, 3, 3),
            (shard_slices, 3, 3),
        ),
        "elevation_offset_m": (
            elevation_offset_m,
            (chunk_slices,),
            (shard_slices,),
        ),
        "pose_status": (
            pose_status,
            (chunk_slices,),
            (shard_slices,),
        ),
    }
    for name, (values, chunks, shards) in arrays.items():
        set_array(dataset, name, values, chunks, shards)

    to_mdio(dataset, args.output_store, mode="w-")

    reopened = open_mdio(args.output_store, chunks=None)
    reopened_amplitude = reopened["amplitude"].transpose("depth", "trace", "slice")
    if reopened_amplitude.dtype != np.dtype("uint16"):
        raise ValueError(
            f"MDIO amplitude reopened as {reopened_amplitude.dtype}, expected uint16"
        )
    if not np.array_equal(reopened_amplitude.values, source_tensor):
        raise ValueError("MDIO amplitude differs from the source R16 tensor")
    if not np.array_equal(reopened["anchor_horizontal_m"].values, centerline):
        raise ValueError("reopened per-slice horizontal anchors differ")
    if not np.array_equal(reopened["basis_frd_enu"].values, basis_frd_enu):
        raise ValueError("reopened per-slice orientation bases differ")
    if not np.all(np.isnan(reopened["elevation_offset_m"].values)):
        raise ValueError("unresolved elevations were not preserved as NaN")
    if not np.array_equal(reopened["pose_status"].values, pose_status):
        raise ValueError("reopened per-slice pose status differs")

    store_bytes, file_count = directory_stats(args.output_store)
    amplitude_storage_bytes, amplitude_shard_count = chunk_stats(
        args.output_store, "amplitude"
    )
    report = {
        "output": str(args.output_store),
        "mdioVersion": version("multidimio"),
        "apiVersion": reopened.attrs.get("apiVersion"),
        "zarrFormat": 3,
        "captureId": metadata["captureId"],
        "logicalShape": [slice_count, trace_count, depth_count],
        "logicalDimensions": ["slice", "trace", "depth"],
        "sourceOrder": ["depth", "trace", "slice"],
        "dataType": "uint16",
        "sourceBytes": expected_bytes,
        "amplitudeStorageBytes": amplitude_storage_bytes,
        "storeBytes": store_bytes,
        "totalOverheadBytes": store_bytes - expected_bytes,
        "fileCount": file_count,
        "amplitudeShardCount": amplitude_shard_count,
        "amplitudeInnerChunkCount": math.ceil(slice_count / chunk_slices),
        "amplitudeChunkShape": [chunk_slices, trace_count, depth_count],
        "amplitudeShardShape": [shard_slices, trace_count, depth_count],
        "sourceAmplitudeSha256": source_sha256,
        "normalizedAmplitudeHistogram256": {
            "bins": len(normalized_histogram),
            "sampleCount": sum(normalized_histogram),
        },
        "activeSampleCount": active_sample_count,
        "byteExactSourceVerification": {
            "passed": True,
            "verifiedBytes": expected_bytes,
            "includesFullUint16Domain": True,
        },
        "pose": {
            "sliceCount": slice_count,
            "horizontalAnchor": "anchor_horizontal_m",
            "orientationBasis": "basis_frd_enu",
            "elevationOffset": "elevation_offset_m",
            "poseStatus": "pose_status",
            "currentStatus": "horizontal-anchor-and-heading-only",
            "elevationStatus": "unresolved",
        },
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
