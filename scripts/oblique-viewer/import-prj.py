#!/usr/bin/env python3
"""Normalize INPHO exterior orientations and calibration; never process imagery."""
import argparse
from collections import Counter
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import re
import runpy
import sys
import tempfile


_parser = runpy.run_path(str(Path(__file__).with_name("inpho-parser.py")))
InphoError = _parser["InphoError"]
parse_document = _parser["parse_document"]
ROTATION_TOLERANCE = 1e-8
_VIEWS = {"LE": "left", "RI": "right", "FW": "front", "BW": "back", "NA": "nadir"}


def one(block, field, default=None, required=True):
    values = block["fields"].get(field, [])
    if not values and not required:
        return default
    if len(values) != 1:
        raise InphoError(f"${block['keyword']} line {block['line']}: expected one ${field}, got {len(values)}")
    return values[0]


def numeric(value, label):
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise InphoError(f"{label}: expected a finite number")
    return value


def numeric_rows(value, rows, columns, label):
    if not isinstance(value, list) or len(value) != rows:
        raise InphoError(f"{label}: expected {rows} rows")
    for row in value:
        if not isinstance(row, list) or len(row) != columns:
            raise InphoError(f"{label}: expected {columns} columns")
        for element in row:
            numeric(element, label)
    return value


def identity(value, label):
    if not isinstance(value, str) or not value or value.strip() != value:
        raise InphoError(f"{label}: expected a non-empty source ID")
    return value


def insert_unique(target, source_id, value, label):
    if source_id in target:
        raise InphoError(f"duplicate {label} source ID: {source_id}")
    target[source_id] = value


def image_id_info(source_id):
    match = re.fullmatch(r"(?:LE|RI|FW|BW|NA)_(\d+)_(\d+)", source_id)
    if not match:
        match = re.fullmatch(r"(\d+)_(\d+)_\d+", source_id)
    return {"lineIndex": int(match[1]), "waypointIndex": int(match[2])} if match else {}


def validate_rotation(matrix, source_id):
    numeric_rows(matrix, 3, 3, f"{source_id} rotation")
    error = max(abs(sum(matrix[i][k] * matrix[j][k] for k in range(3)) - (1 if i == j else 0))
                for i in range(3) for j in range(3))
    a, b, c = matrix
    determinant = (a[0] * (b[1] * c[2] - b[2] * c[1])
                   - a[1] * (b[0] * c[2] - b[2] * c[0])
                   + a[2] * (b[0] * c[1] - b[1] * c[0]))
    if error > ROTATION_TOLERANCE or abs(determinant - 1) > ROTATION_TOLERANCE:
        raise InphoError(f"{source_id}: exterior matrix is not an orthonormal proper rotation")


def normalize(blocks, series_id, height_datum="unknown"):
    identity(series_id, "series ID")
    if height_datum not in ("unknown", "dhhn2016", "ellipsoidal"):
        raise InphoError("height datum must be unknown, dhhn2016 or ellipsoidal")
    cameras, images, stations, heads = {}, {}, {}, {}
    coordinate_blocks = [b for b in blocks if b["keyword"] == "COORDINATE_SYSTEM_SET"]
    if len(coordinate_blocks) != 1:
        raise InphoError("expected one horizontal coordinate-system definition")
    wkt = one(coordinate_blocks[0], "COORDINATE_SYSTEM")
    wkt = " ".join(wkt) if isinstance(wkt, list) else str(wkt)
    if not re.search(r'AUTHORITY\s*\[\s*"EPSG"\s*,\s*"25832"\s*\]', wkt):
        raise InphoError("this importer currently requires explicit EPSG:25832 in source WKT")

    for block in blocks:
        if block["keyword"] == "MULTIHEADSYSTEM":
            entries = one(block, "HEADS", [], required=False)
            if isinstance(entries, str):
                entries = [entries]
            for entry in entries:
                tokens = entry.split()
                if len(tokens) != 4 or tokens[2] not in _VIEWS.values():
                    raise InphoError("unsupported or ambiguous $HEADS entry")
                if tokens[3] in _VIEWS and _VIEWS[tokens[3]] != tokens[2]:
                    raise InphoError("$HEADS camera code disagrees with its physical view label")
                insert_unique(heads, tokens[0], tokens[2], "multihead camera")
        elif block["keyword"] == "CAMERA_DEFINITION":
            ids = block["fields"].get("ID", [])
            if len(ids) != 2 or ids[1] != one(block, "ACTIVE_CALIBRATION"):
                raise InphoError("camera must contain exactly one explicitly active calibration")
            source_id = identity(ids[0], "camera ID")
            width = numeric(one(block, "CCD_COLUMNS"), f"{source_id} width")
            height = numeric(one(block, "CCD_ROWS"), f"{source_id} height")
            focal = numeric(one(block, "FOCAL_LENGTH"), f"{source_id} focal length")
            if width <= 0 or height <= 0 or int(width) != width or int(height) != height or focal <= 0:
                raise InphoError(f"{source_id}: camera dimensions and focal length must be positive")
            if one(block, "PIXEL_REFERENCE") != "CenterTopLeft":
                raise InphoError(f"{source_id}: unsupported pixel reference")
            principal = one(block, "PRINCIPAL_POINT_PPA")
            if principal != [0, 0]:
                raise InphoError(f"{source_id}: nonzero PRINCIPAL_POINT_PPA requires an explicit calibration transform")
            affine = numeric_rows(one(block, "CCD_INTERIOR_ORIENTATION"), 2, 3, f"{source_id} affine")
            if abs(affine[0][0] * affine[1][1] - affine[0][1] * affine[1][0]) < 1e-12:
                raise InphoError(f"{source_id}: singular image-mm-to-pixel affine")
            camera = {"sourceId": source_id, "widthPx": int(width), "heightPx": int(height),
                      "focalLengthMm": focal, "imageMmToPixelAffine": affine,
                      "mountRotationDeg": numeric(one(block, "CAMERA_MOUNT_ROTATION", 0, required=False), f"{source_id} mount rotation")}
            insert_unique(cameras, source_id, camera, "camera")
        elif block["keyword"] == "PHOTO":
            source_id = identity(one(block, "PHOTO_NUM"), "image ID")
            camera_id = identity(one(block, "CAMERA_ID"), f"{source_id} camera ID")
            exterior = one(block, "EXT_ORI")
            if not isinstance(exterior, list) or len(exterior) != 5:
                raise InphoError(f"{source_id}: EXT_ORI must contain timestamp, position and three rotation rows")
            position = exterior[1]
            if not isinstance(position, list) or len(position) != 4:
                raise InphoError(f"{source_id}: EXT_ORI position must contain focal length, x, y, z")
            for value in position:
                numeric(value, f"{source_id} position")
            matrix = exterior[2:]
            validate_rotation(matrix, source_id)
            image = {"cameraId": camera_id, "positionM": position[1:], "rotationMatrixRows": matrix,
                     **image_id_info(source_id), "_focalLengthMm": position[0]}
            insert_unique(images, source_id, image, "image")
        elif block["keyword"] == "STATION":
            source_id = identity(one(block, "STATION_ID"), "station ID")
            entries = one(block, "IMAGES")
            if not isinstance(entries, list) or not entries or not all(isinstance(entry, str) for entry in entries):
                raise InphoError(f"{source_id}: station IMAGES must be a braced image-ID list")
            if len(entries) != len(set(entries)):
                raise InphoError(f"{source_id}: duplicate image in station")
            insert_unique(stations, source_id, entries, "station")

    if not cameras or not images:
        raise InphoError("source has no camera definitions or image orientations")
    for camera_id, view in heads.items():
        if camera_id not in cameras:
            raise InphoError(f"multihead references unknown camera: {camera_id}")
        cameras[camera_id]["view"] = view
    for source_id, image in images.items():
        camera = cameras.get(image["cameraId"])
        if camera is None:
            raise InphoError(f"{source_id}: unknown camera {image['cameraId']}")
        if abs(image.pop("_focalLengthMm") - camera["focalLengthMm"]) > 1e-8:
            raise InphoError(f"{source_id}: exterior focal length disagrees with camera calibration")
    for station_id, entries in stations.items():
        for source_id in entries:
            if source_id not in images:
                raise InphoError(f"{station_id}: unknown station image {source_id}")
            if "stationId" in images[source_id]:
                raise InphoError(f"{source_id}: assigned to more than one source station")
            images[source_id]["stationId"] = station_id

    metadata = {"schemaVersion": 1, "seriesId": series_id,
                "conventions": {"horizontalCrs": "EPSG:25832", "verticalDatum": height_datum,
                                "positionUnit": "m", "rotationLayout": "row-major",
                                "rotationTransform": "world-to-camera", "opticalAxis": "-z",
                                "worldAxes": ["easting", "northing", "up"],
                                "cameraAxes": "source-image-mm", "pixelReference": "pixel-center",
                                "pixelOrigin": "top-left", "pixelAxes": {"x": "right", "y": "down"}},
                "cameras": dict(sorted(cameras.items())), "images": dict(sorted(images.items()))}
    return metadata, {"images": len(images), "cameras": len(cameras), "stations": len(stations)}


def load_image_ids(path):
    text = path.read_text(encoding="utf-8-sig")
    first = next((line for line in text.splitlines() if line.strip()), "")
    if ";" in first and "photo" in first.split(";"):
        rows = csv.DictReader(text.splitlines(), delimiter=";")
        ids = [row["photo"].strip() for row in rows]
    else:
        ids = [line.strip() for line in text.splitlines() if line.strip()]
    if not ids or any(not source_id for source_id in ids) or len(ids) != len(set(ids)):
        raise InphoError("image subset must contain non-empty, unique source IDs")
    return set(ids)


def write_atomic(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(payload, stream, indent=2, ensure_ascii=False, allow_nan=False)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Original INPHO/MATCH-AT PRJ")
    parser.add_argument("--output", type=Path, required=True, help="Normalized v1 metadata JSON")
    parser.add_argument("--series-id", required=True)
    parser.add_argument("--height-datum", choices=("unknown", "dhhn2016", "ellipsoidal"), default="unknown")
    parser.add_argument("--image-ids", type=Path, help="One source ID per line, or semicolon CSV with a photo column")
    parser.add_argument("--expected-images", type=int, help="Assert full source image count before subsetting")
    parser.add_argument("--expected-cameras", type=int)
    parser.add_argument("--expected-stations", type=int)
    args = parser.parse_args(argv)
    try:
        sources = [args.input, *([args.image_ids] if args.image_ids else [])]
        if any(args.output.resolve() == source.resolve() for source in sources):
            raise InphoError("output must not replace a source PRJ or image-ID file")
        source = args.input.read_bytes()
        try:
            text = source.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = source.decode("latin-1")
        metadata, counts = normalize(parse_document(text), args.series_id, args.height_datum)
        for key in ("images", "cameras", "stations"):
            expected = getattr(args, f"expected_{key}")
            if expected is not None and counts[key] != expected:
                raise InphoError(f"source {key}: expected {expected}, got {counts[key]}")
        if args.image_ids:
            selected = load_image_ids(args.image_ids)
            missing = selected - metadata["images"].keys()
            if missing:
                raise InphoError(f"subset IDs missing from source: {', '.join(sorted(missing)[:5])}")
            metadata["images"] = {key: value for key, value in metadata["images"].items() if key in selected}
        metadata["provenance"] = {"sourceFormat": "INPHO PRJ", "sourceFileName": args.input.name,
                                  "sourceSha256": hashlib.sha256(source).hexdigest()}
        write_atomic(args.output, metadata)
        views = Counter(metadata["cameras"][record["cameraId"]].get("view", "unspecified") for record in metadata["images"].values())
        print(json.dumps({"seriesId": args.series_id, "sourceCounts": counts, "outputImages": len(metadata["images"]),
                          "views": dict(sorted(views.items())), "verticalDatum": args.height_datum,
                          "sourceSha256": metadata["provenance"]["sourceSha256"]}, sort_keys=True))
        return 0
    except (InphoError, OSError, UnicodeError, csv.Error, ValueError) as error:
        print(f"INPHO import failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
