#!/usr/bin/env python3
"""Read-only INPHO delivery inventory and TIFF structure audit (stdlib only)."""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys


IMAGE_SUFFIXES = {".tif", ".tiff", ".jpg", ".jpeg", ".png", ".webp"}
TIFF_SUFFIXES = {".tif", ".tiff"}
MANIFEST_SUFFIXES = {".md5", ".sha256", ".sha512", ".sfv"}
TYPE_LAYOUT = {3: (2, "H"), 4: (4, "I"), 16: (8, "Q"), 13: (4, "I"), 18: (8, "Q")}


def emit(stage, **values):
    print(json.dumps({"stage": stage, **values}, sort_keys=True), flush=True)


def expected_images(prj):
    data = prj.read_bytes()
    text = data.decode("latin-1").replace("\r\n", "\n")
    dimensions = {}
    for body in re.findall(r"^\$CAMERA_DEFINITION[^\n]*\n(.*?)^\$END[ \t]*$", text, re.M | re.S):
        camera_id = re.search(r"^\s*\$ID\s*:\s*(\S+)", body, re.M)
        width = re.search(r"^\s*\$CCD_COLUMNS\s*:\s*(\d+)", body, re.M)
        height = re.search(r"^\s*\$CCD_ROWS\s*:\s*(\d+)", body, re.M)
        if not all((camera_id, width, height)):
            raise ValueError("camera definition lacks ID or dimensions")
        if camera_id[1] in dimensions:
            raise ValueError(f"duplicate source camera ID {camera_id[1]}")
        dimensions[camera_id[1]] = (int(width[1]), int(height[1]))
    images = {}
    source_ids = []
    for body in re.findall(r"^\$PHOTO(?:[ \t]+[^\n]*)?\n(.*?)^\$END[ \t]*$", text, re.M | re.S):
        identity = re.search(r"^\s*\$PHOTO_NUM\s*:\s*(\S+)[ \t]*$", body, re.M)
        camera = re.search(r"^\s*\$CAMERA_ID\s*:\s*(\S+)[ \t]*$", body, re.M)
        if not identity or not camera or camera[1] not in dimensions:
            raise ValueError("PHOTO lacks source ID or known camera")
        source_id = identity[1]
        source_ids.append(source_id)
        key = source_id.casefold()
        if key in images:
            raise ValueError(f"duplicate/case-colliding source image ID {source_id}")
        images[key] = {"sourceId": source_id, "cameraId": camera[1], "dimensions": dimensions[camera[1]]}
    if not images:
        raise ValueError("PRJ contains no PHOTO blocks")
    return images, {"sourceSha256": hashlib.sha256(data).hexdigest(), "photos": len(source_ids), "cameras": len(dimensions)}


def inventory(root):
    files, manifests, errors = [], [], []
    groups = defaultdict(lambda: {"files": 0, "bytes": 0, "formats": Counter()})
    def failed(error):
        errors.append(str(error))
    for directory, _, names in os.walk(root, followlinks=False, onerror=failed):
        for name in names:
            path = Path(directory) / name
            suffix = path.suffix.lower()
            if suffix in MANIFEST_SUFFIXES or name.upper() in {"MD5SUMS", "SHA256SUMS", "SHA512SUMS", "CHECKSUMS"}:
                manifests.append(str(path))
            if suffix not in IMAGE_SUFFIXES:
                continue
            try:
                size = path.stat().st_size
            except OSError as error:
                errors.append(f"{path}: {error}")
                continue
            files.append((path, size))
            relative = path.relative_to(root)
            folder = str(relative.parent)
            group = groups[folder]
            group["files"] += 1
            group["bytes"] += size
            group["formats"][suffix] += 1
    return files, groups, sorted(manifests), errors


def read_exact(stream, offset, size, file_size):
    if offset < 0 or size < 0 or offset + size > file_size:
        raise ValueError(f"metadata range [{offset},{offset + size}) exceeds file size {file_size}")
    stream.seek(offset)
    data = stream.read(size)
    if len(data) != size:
        raise ValueError("truncated TIFF metadata")
    return data


def tiff_structure(path, expected=None):
    """Inspect IFD and payload ranges only; this does not decode image pixels."""
    size = path.stat().st_size
    with path.open("rb") as stream:
        header = read_exact(stream, 0, min(size, 16), size)
        if len(header) < 8 or header[:2] not in (b"II", b"MM"):
            raise ValueError("invalid or truncated TIFF header")
        endian = "<" if header[:2] == b"II" else ">"
        magic = struct.unpack(endian + "H", header[2:4])[0]
        if magic == 42:
            offset_bytes, count_bytes, entry_bytes, offset_type = 4, 2, 12, "I"
            first = struct.unpack(endian + "I", header[4:8])[0]
        elif magic == 43 and len(header) == 16:
            if struct.unpack(endian + "HH", header[4:8]) != (8, 0):
                raise ValueError("unsupported BigTIFF offset format")
            offset_bytes, count_bytes, entry_bytes, offset_type = 8, 8, 20, "Q"
            first = struct.unpack(endian + "Q", header[8:16])[0]
        else:
            raise ValueError("unsupported TIFF magic")

        def values(entry):
            tag, kind = struct.unpack(endian + "HH", entry[:4])
            number = struct.unpack(endian + ("I" if magic == 42 else "Q"), entry[4:8] if magic == 42 else entry[4:12])[0]
            if kind not in TYPE_LAYOUT or number > 1000000:
                raise ValueError(f"unsupported/oversized TIFF numeric tag {tag}: type={kind}, count={number}")
            width, form = TYPE_LAYOUT[kind]
            slot = entry[8:12] if magic == 42 else entry[12:20]
            length = width * number
            raw = slot[:length] if length <= offset_bytes else read_exact(stream, struct.unpack(endian + offset_type, slot)[0], length, size)
            return list(struct.unpack(endian + form * number, raw)) if number else []

        queue, visited, ifds = [first], set(), []
        first_data_offset = size
        while queue:
            offset = queue.pop(0)
            if offset == 0:
                continue
            if offset in visited or len(visited) >= 64:
                raise ValueError("cyclic or excessive TIFF IFD chain")
            visited.add(offset)
            count_raw = read_exact(stream, offset, count_bytes, size)
            count = struct.unpack(endian + ("H" if magic == 42 else "Q"), count_raw)[0]
            if count > 4096:
                raise ValueError("excessive TIFF IFD tag count")
            entries = read_exact(stream, offset + count_bytes, count * entry_bytes + offset_bytes, size)
            tags = {}
            for index in range(count):
                entry = entries[index * entry_bytes:(index + 1) * entry_bytes]
                tag = struct.unpack(endian + "H", entry[:2])[0]
                if tag in {256, 257, 259, 274, 273, 279, 322, 323, 324, 325, 330}:
                    tags[tag] = values(entry)
            if not tags.get(256) or not tags.get(257) or tags[256][0] <= 0 or tags[257][0] <= 0:
                raise ValueError("IFD has no positive image dimensions")
            payloads = 0
            for offsets_tag, counts_tag in ((273, 279), (324, 325)):
                offsets, byte_counts = tags.get(offsets_tag), tags.get(counts_tag)
                if offsets is None and byte_counts is None:
                    continue
                if offsets is None or byte_counts is None or len(offsets) != len(byte_counts) or not offsets:
                    raise ValueError("TIFF strip/tile offsets and byte counts disagree")
                for payload_offset, byte_count in zip(offsets, byte_counts):
                    if payload_offset <= 0 or byte_count <= 0 or payload_offset + byte_count > size:
                        raise ValueError(f"truncated/invalid TIFF payload range offset={payload_offset} bytes={byte_count} file={size}")
                    first_data_offset = min(first_data_offset, payload_offset)
                payloads += len(offsets)
            if not payloads:
                raise ValueError("IFD has no strip/tile payload ranges")
            ifds.append({"width": tags[256][0], "height": tags[257][0], "tiled": 324 in tags,
                         "compression": tags.get(259, [1])[0], "orientation": tags.get(274, [1])[0],
                         "ifdOffset": offset, "payloadRanges": payloads})
            queue.extend(tags.get(330, []))
            queue.append(struct.unpack(endian + offset_type, entries[-offset_bytes:])[0])
        if not ifds:
            raise ValueError("TIFF contains no IFD")
        main = ifds[0]
        if expected and (main["width"], main["height"]) != tuple(expected["dimensions"]):
            raise ValueError(f"dimensions {main['width']}x{main['height']} disagree with PRJ {expected['dimensions']}")
        return {"path": str(path), "bytes": size, "bigTiff": magic == 43,
                "dimensions": [main["width"], main["height"]], "orientation": main["orientation"],
                "compression": main["compression"], "tiled": main["tiled"],
                "overviewDimensions": [[item["width"], item["height"]] for item in ifds[1:]],
                "ifdCount": len(ifds),
                "ifdsBeforePayloads": all(item["ifdOffset"] < first_data_offset for item in ifds),
                "cogConformanceVerified": False}


def gdal_audit(executable, path, full_read, container=None, host_mount=None, container_mount=None, directory=None):
    if container:
        path = container_mount / path.relative_to(host_mount)
        command = [executable, "exec", "-e", "GDAL_PAM_ENABLED=NO", "-e", "GDAL_CACHEMAX=512", container, "gdalinfo"]
    else:
        command = [executable]
    command.extend(["--config", "GDAL_PAM_ENABLED", "NO", "--config", "GDAL_CACHEMAX", "512", "-json"])
    if full_read:
        command.append("-checksum")
    command.append(f"GTIFF_DIR:{directory}:{path}" if directory is not None else str(path))
    result = subprocess.run(command, capture_output=True, text=True, timeout=300 if full_read else 30,
                            env={**os.environ, "GDAL_PAM_ENABLED": "NO", "GDAL_CACHEMAX": "512"})
    if result.returncode:
        raise ValueError(f"gdalinfo failed: {result.stderr.strip()[:500]}")
    if re.search(r"^ERROR(?:\s|\d)", result.stderr, re.M):
        raise ValueError(f"gdalinfo reported a read error: {result.stderr.strip()[:500]}")
    data = json.loads(result.stdout)
    bands = data.get("bands", [])
    if full_read and (not bands or any(not isinstance(band.get("checksum"), int) or band["checksum"] < 0 for band in bands)):
        raise ValueError("gdalinfo did not return valid decoded-band checksums")
    return {"size": data.get("size"), "layout": data.get("metadata", {}).get("IMAGE_STRUCTURE", {}).get("LAYOUT"),
            "bands": [{"checksum": band.get("checksum"), "overviews": band.get("overviews", [])} for band in data.get("bands", [])]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prj", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--expected-count", type=int)
    parser.add_argument("--expected-sha256")
    parser.add_argument("--workers", type=int, default=4, choices=range(1, 9))
    parser.add_argument("--validate-gdal-info", action="store_true")
    parser.add_argument("--full-read", action="store_true", help="GDAL checksums decode pixels; not cryptographic source integrity")
    parser.add_argument("--read-pages", help="Comma-separated 1-based TIFF directories to decode with GDAL checksums")
    parser.add_argument("--gdalinfo", default="gdalinfo")
    parser.add_argument("--gdal-container", help="Existing read-only GDAL container; never creates or restarts it")
    parser.add_argument("--host-mount", type=Path, default=Path("/mnt/7TB"))
    parser.add_argument("--container-mount", type=Path, default=Path("/data"))
    args = parser.parse_args(argv)
    try:
        pages = [int(value) for value in args.read_pages.split(",")] if args.read_pages else []
        if any(page < 1 for page in pages) or len(pages) != len(set(pages)):
            raise ValueError("read-pages must contain distinct positive TIFF directory numbers")
        expected, source = expected_images(args.prj)
        files, groups, manifests, inventory_errors = inventory(args.root)
        matches = defaultdict(list)
        for path, size in files:
            if path.stem.casefold() in expected:
                matches[path.stem.casefold()].append((path, size))
        missing = sorted(set(expected) - set(matches))
        tiffs = [(path, size) for path, size in files if path.suffix.lower() in TIFF_SUFFIXES]
        missing_tiffs = sorted(key for key in expected if not any(path.suffix.lower() in TIFF_SUFFIXES for path, _ in matches.get(key, [])))
        duplicates = {expected[key]["sourceId"]: [str(path) for path, _ in paths] for key, paths in matches.items() if len(paths) > 1}
        disk = os.statvfs(args.root)
        emit("inventory", source=source, root=str(args.root), groups=dict(sorted(groups.items())),
             imageFiles=len(files), imageBytes=sum(size for _, size in files), tiffFiles=len(tiffs), tiffBytes=sum(size for _, size in tiffs),
             matchedSourceIds=len(matches), missingSourceIds=len(missing), missingSourceIdsSample=[expected[key]["sourceId"] for key in missing[:20]],
             missingTiffSourceIds=len(missing_tiffs), missingTiffSourceIdsSample=[expected[key]["sourceId"] for key in missing_tiffs[:20]],
             duplicateSourceIds=len(duplicates), duplicatesSample=dict(list(sorted(duplicates.items()))[:10]),
             manifests=manifests[:25], manifestCount=len(manifests), inventoryErrors=inventory_errors[:20],
             disk={"totalBytes": disk.f_blocks * disk.f_frsize, "availableBytes": disk.f_bavail * disk.f_frsize, "freeBytes": disk.f_bfree * disk.f_frsize})

        failures, samples, dimensions, overview_counts, compression_counts, orientation_counts = [], {}, Counter(), Counter(), Counter(), Counter()
        gdal = shutil.which("docker" if args.gdal_container else args.gdalinfo)
        want_gdal = args.validate_gdal_info or args.full_read or bool(pages)
        def check(item):
            path, _ = item
            try:
                result = tiff_structure(path, expected.get(path.stem.casefold()))
                if want_gdal and gdal:
                    result["gdal"] = gdal_audit(gdal, path, args.full_read, args.gdal_container, args.host_mount, args.container_mount)
                    if result["gdal"]["size"] != result["dimensions"]:
                        raise ValueError("gdalinfo dimensions disagree with TIFF IFD")
                    if any(page > result["ifdCount"] for page in pages):
                        raise ValueError("requested TIFF directory exceeds known IFD count")
                    result["gdalPages"] = {
                        str(page): gdal_audit(gdal, path, True, args.gdal_container, args.host_mount, args.container_mount, page)
                        for page in pages
                    }
                return result, None
            except (OSError, ValueError, struct.error, subprocess.SubprocessError) as error:
                return None, {"path": str(path), "error": str(error)}
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for index, (result, failure) in enumerate(pool.map(check, tiffs), 1):
                if failure:
                    failures.append(failure)
                else:
                    key = Path(result["path"]).stem.split("_", 1)[0].upper()
                    samples.setdefault(key, result)
                    dimensions["x".join(map(str, result["dimensions"]))] += 1
                    overview_counts[len(result["overviewDimensions"])] += 1
                    compression_counts[result["compression"]] += 1
                    orientation_counts[result["orientation"]] += 1
                if index % 1000 == 0:
                    emit("header-progress", checked=index, total=len(tiffs), failures=len(failures))
        emit("tiff-structure", checked=len(tiffs), failures=len(failures), failuresSample=failures[:20],
             dimensions=dict(dimensions), overviewCounts=dict(overview_counts), compressionCounts=dict(compression_counts),
             orientationCounts=dict(orientation_counts), samples=dict(sorted(samples.items())[:10]),
             pixelDecodingVerified=bool(args.full_read and gdal and not failures and tiffs),
             additionalDirectoriesDecoded=pages if gdal and not failures else [],
             decodingScope="base bands and GDAL-visible overviews when full-read; extra requested TIFF directories only",
             gdalExecutable=gdal, gdalRequested=want_gdal, gdalUnavailable=bool(want_gdal and not gdal),
             gdalContainer=args.gdal_container,
             note="IFD/payload ranges and dimensions checked; header pass alone does not validate pixels or prove COG conformance")
        source_error = ((args.expected_count is not None and source["photos"] != args.expected_count)
                        or (args.expected_sha256 is not None and source["sourceSha256"] != args.expected_sha256))
        return 1 if source_error or missing or inventory_errors or failures or (want_gdal and not gdal) else 0
    except (OSError, ValueError) as error:
        emit("audit-error", error=str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
