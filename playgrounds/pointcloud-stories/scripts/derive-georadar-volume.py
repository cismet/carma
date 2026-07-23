#!/usr/bin/env python3
"""Extract a lossless uint16 Georadar tensor for interactive volume rendering."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pdal


TRACE_BREAK_METERS = 1.0


def read_points(path: Path) -> np.ndarray:
    pipeline = pdal.Pipeline(
        json.dumps([{"type": "readers.las", "filename": str(path)}])
    )
    pipeline.execute()
    return pipeline.arrays[0]


def trace_ranges(t0: np.ndarray) -> list[tuple[int, int]]:
    xy = np.column_stack((t0["X"], t0["Y"]))
    steps = np.linalg.norm(np.diff(xy, axis=0), axis=1)
    starts = np.concatenate(
        (
            np.array([0], dtype=np.int64),
            np.flatnonzero(steps > TRACE_BREAK_METERS) + 1,
            np.array([len(t0)], dtype=np.int64),
        )
    )
    ranges = [(int(start), int(end)) for start, end in zip(starts[:-1], starts[1:])]
    lengths = {end - start for start, end in ranges}
    if len(lengths) != 1:
        raise ValueError(f"trace point counts differ: {sorted(lengths)}")
    return ranges


def cumulative_distance(xy: np.ndarray) -> np.ndarray:
    return np.concatenate(
        (
            np.array([0.0], dtype=np.float64),
            np.cumsum(np.linalg.norm(np.diff(xy, axis=0), axis=1)),
        )
    )


def histogram256(values: np.ndarray, maximum_code: int) -> list[int]:
    histogram, _ = np.histogram(values, bins=256, range=(0, maximum_code + 1))
    return histogram.astype(int).tolist()


def estimate_spatial_noise_floor(signal: np.ndarray) -> tuple[float, int]:
    """Estimate incoherent noise from a trace/slice 3x3 median residual.

    This is a visualization heuristic, not an instrument calibration. The depth
    axis is deliberately excluded so coherent radar wavelets remain intact.
    """

    padded = np.pad(signal, ((0, 0), (1, 1), (1, 1)), mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(padded, (1, 3, 3))
    spatial_median = np.median(windows, axis=(-3, -2, -1))
    residual = (signal - spatial_median).ravel()
    unsaturated = np.abs(signal.ravel()) < 32_760
    residual = residual[unsaturated]
    residual_median = np.median(residual)
    sigma = float(
        np.median(np.abs(residual - residual_median)) / 0.6744897501960817
    )
    # A 64-code boundary also matches one full-scale 10-bit quantization step.
    threshold = max(64, int(round(sigma / 64.0) * 64))
    return sigma, threshold


def pack_u10(values: np.ndarray) -> np.ndarray:
    """Pack uint10 codes consecutively, least-significant bit first."""

    flat = values.ravel().astype(np.uint16, copy=False)
    shifts = np.arange(10, dtype=np.uint16)
    bits = ((flat[:, np.newaxis] >> shifts) & 1).astype(np.uint8)
    return np.packbits(bits.reshape(-1), bitorder="little")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract a regular [depth, trace, slice] uint16 volume block"
    )
    parser.add_argument("volume_laz", type=Path)
    parser.add_argument("t0_laz", type=Path)
    parser.add_argument("output_prefix", type=Path)
    parser.add_argument("--capture-id", type=int, required=True)
    parser.add_argument("--start-meter", type=float, default=0.0)
    parser.add_argument("--length-meter", type=float, default=10.0)
    args = parser.parse_args()

    t0 = read_points(args.t0_laz)
    volume = read_points(args.volume_laz)
    ranges = trace_ranges(t0)
    trace_count = len(ranges)
    slices_per_trace = ranges[0][1] - ranges[0][0]
    surface_count = trace_count * slices_per_trace

    if len(volume) % surface_count != 0:
        raise ValueError(
            f"volume point count {len(volume)} is not a multiple of {surface_count}"
        )
    depth_count = len(volume) // surface_count

    center_trace = trace_count // 2
    center_start, center_end = ranges[center_trace]
    center_xy = np.column_stack(
        (t0["X"][center_start:center_end], t0["Y"][center_start:center_end])
    )
    station = cumulative_distance(center_xy)
    start_slice = int(np.searchsorted(station, args.start_meter, side="left"))
    end_slice = int(
        np.searchsorted(station, args.start_meter + args.length_meter, side="right")
    )
    end_slice = min(end_slice, slices_per_trace)
    if end_slice - start_slice < 2:
        raise ValueError("selected interval contains fewer than two slices")

    # Original record order is depth-major, then trace-major, then slice-major.
    # Keep every uint16 sample; visibility is exclusively a shader concern.
    intensity = volume["Intensity"].reshape(
        depth_count, trace_count, slices_per_trace
    )[:, :, start_slice:end_slice]
    intensity = np.ascontiguousarray(intensity.astype("<u2", copy=False))

    selected_station = station[start_slice:end_slice]
    selected_station = selected_station - selected_station[0]
    middle_slice = start_slice + (end_slice - start_slice) // 2
    middle_xy = np.array(
        [
            [t0["X"][start + middle_slice], t0["Y"][start + middle_slice]]
            for start, _ in ranges
        ],
        dtype=np.float64,
    )
    lateral_steps = np.linalg.norm(np.diff(middle_xy, axis=0), axis=1)
    lateral_station = cumulative_distance(middle_xy)
    lateral_station -= lateral_station[center_trace]

    depth_z = volume["Z"][::surface_count]
    depth_mm = np.maximum(0.0, -depth_z * 20.0)

    output_bin = args.output_prefix.with_suffix(".r16")
    output_gated = args.output_prefix.with_name(
        args.output_prefix.name + "-noise-gated.r16"
    )
    output_u10 = args.output_prefix.with_name(
        args.output_prefix.name + "-noise-gated.u10"
    )
    output_json = args.output_prefix.with_suffix(".json")
    output_bin.parent.mkdir(parents=True, exist_ok=True)
    intensity.tofile(output_bin)

    signal = intensity.astype(np.int32) - 32_768
    noise_sigma, noise_threshold = estimate_spatial_noise_floor(signal)
    active = np.abs(signal) >= noise_threshold
    gated_signal = np.where(active, signal, 0)
    gated_intensity = np.clip(gated_signal + 32_768, 0, 65_535).astype("<u2")
    gated_intensity.tofile(output_gated)

    u10 = np.rint((gated_signal.astype(np.float64) + 32_768) * (1023 / 65_535))
    u10 = np.clip(u10, 0, 1023).astype("<u2")
    packed_u10 = pack_u10(u10)
    packed_u10.tofile(output_u10)
    u10_decoded = u10.astype(np.float64) * (65_535 / 1023) - 32_768
    quantization_error = u10_decoded - gated_signal

    shape = {
        "slice": int(intensity.shape[2]),
        "trace": int(intensity.shape[1]),
        "depth": int(intensity.shape[0]),
    }
    raw_variant = {
        "id": "raw16",
        "label": "Raw R16",
        "url": output_bin.name,
        "dtype": "uint16-le",
        "validBits": 16,
        "maximumCode": 65_535,
        "signalOffset": 32_768,
        "order": ["depth", "trace", "slice"],
        "shape": shape,
        "byteLength": int(intensity.nbytes),
        "valueRange": [int(intensity.min()), int(intensity.max())],
        "histogram256": histogram256(intensity, 65_535),
    }
    gated_variant = {
        "id": "noise-gated16",
        "label": "Noise-gated R16",
        "url": output_gated.name,
        "dtype": "uint16-le",
        "validBits": 16,
        "maximumCode": 65_535,
        "signalOffset": 32_768,
        "order": ["depth", "trace", "slice"],
        "shape": shape,
        "byteLength": int(gated_intensity.nbytes),
        "valueRange": [int(gated_intensity.min()), int(gated_intensity.max())],
        "histogram256": histogram256(gated_intensity, 65_535),
    }
    u10_variant = {
        "id": "noise-gated10",
        "label": "Noise-gated 10-bit",
        "url": output_u10.name,
        "dtype": "uint10-packed-le",
        "validBits": 10,
        "maximumCode": 1023,
        "signalOffset": 512,
        "order": ["depth", "trace", "slice"],
        "shape": shape,
        "byteLength": int(packed_u10.nbytes),
        "unpackedByteLength": int(u10.nbytes),
        "valueRange": [int(u10.min()), int(u10.max())],
        "histogram256": histogram256(u10, 1023),
    }
    metadata = {
        "format": "carma-georadar-volume-v1",
        "captureId": args.capture_id,
        "source": {
            "volume": args.volume_laz.name,
            "surface": args.t0_laz.name,
        },
        "data": raw_variant,
        "variants": [raw_variant, gated_variant, u10_variant],
        "noiseGate": {
            "method": "depth-preserving spatial 3x3 median residual MAD",
            "interpretation": "heuristic visualization floor, not instrument calibration",
            "estimatedSigmaCodes": noise_sigma,
            "thresholdCodes": noise_threshold,
            "removedSampleCount": int(np.count_nonzero(~active)),
            "removedFraction": float(np.mean(~active)),
        },
        "quantization10Bit": {
            "method": "linear full-scale signed mapping to codes 0..1023",
            "storage": "packed little-endian 10-bit stream",
            "maximumAbsoluteErrorCodes16": float(np.max(np.abs(quantization_error))),
            "rmseCodes16": float(np.sqrt(np.mean(quantization_error**2))),
            "activeRmseCodes16": float(
                np.sqrt(np.mean(quantization_error[active] ** 2))
            ),
        },
        "selection": {
            "startSlice": start_slice,
            "endSliceExclusive": end_slice,
            "requestedStartMeter": args.start_meter,
            "requestedLengthMeter": args.length_meter,
            "actualLengthMeter": float(selected_station[-1]),
        },
        "axes": {
            "sliceMeters": selected_station.round(6).tolist(),
            "traceMeters": lateral_station.round(6).tolist(),
            "depthMillimeters": depth_mm.round(4).tolist(),
        },
        "spacing": {
            "sliceMedianMeters": float(np.median(np.diff(selected_station))),
            "traceMedianMeters": float(np.median(lateral_steps)),
            "depthMedianMillimeters": float(np.median(np.diff(depth_mm))),
        },
        "histogram256": raw_variant["histogram256"],
    }
    output_json.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "metadata": str(output_json),
                "shape": shape,
                "variants": [variant["url"] for variant in metadata["variants"]],
                "noiseThresholdCodes": noise_threshold,
                "removedFraction": metadata["noiseGate"]["removedFraction"],
            }
        )
    )


if __name__ == "__main__":
    main()
