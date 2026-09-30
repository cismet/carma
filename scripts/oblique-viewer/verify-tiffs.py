#!/usr/bin/env python3
"""Read-only TIFF verification, without PRJ metadata or image processing.

Stdlib only; full decoding requires gdalinfo. Emits inventory, one JSONL record
per file, and a summary. Exit 0 = selected files passed, 1 = verification error,
2 = incomplete (empty inventory or files deferred while an upload is active).
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import re
import shutil
import stat
import struct
import subprocess
import sys
import time


NUMERIC_TYPES = {3: (2, "H"), 4: (4, "I"), 13: (4, "I"), 16: (8, "Q"), 18: (8, "Q")}


def emit(stage, **values):
    print(json.dumps({"stage": stage, **values}, sort_keys=True), flush=True)


def signature(path):
    info = path.stat()
    if not stat.S_ISREG(info.st_mode):
        raise ValueError("not a regular file")
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def inspect_tiff(path):
    """Check all linked IFDs and payload bounds, without decoding pixels.

    This bounded scanner shares the audit-delivery.py structure-check approach.
    Zero/zero strip ranges are valid sparse TIFF blocks and are left to GDAL.
    """
    size = path.stat().st_size
    with path.open("rb") as stream:
        def read(offset, length):
            if offset < 0 or length < 0 or offset + length > size:
                raise ValueError(f"truncated TIFF range [{offset},{offset + length}) exceeds {size}")
            stream.seek(offset)
            data = stream.read(length)
            if len(data) != length:
                raise ValueError("truncated TIFF read")
            return data
        header = read(0, min(size, 16))
        if len(header) < 8 or header[:2] not in (b"II", b"MM"):
            raise ValueError("invalid or truncated TIFF header")
        endian = "<" if header[:2] == b"II" else ">"
        magic = struct.unpack(endian + "H", header[2:4])[0]
        if magic == 42:
            count_bytes, entry_bytes, offset_bytes, count_type, offset_type = 2, 12, 4, "H", "I"
            first = struct.unpack(endian + "I", header[4:8])[0]
        elif magic == 43 and len(header) == 16 and struct.unpack(endian + "HH", header[4:8]) == (8, 0):
            count_bytes, entry_bytes, offset_bytes, count_type, offset_type = 8, 20, 8, "Q", "Q"
            first = struct.unpack(endian + "Q", header[8:16])[0]
        else:
            raise ValueError("unsupported TIFF magic or BigTIFF offset layout")
        def values(entry):
            tag, kind = struct.unpack(endian + "HH", entry[:4])
            number = struct.unpack(endian + offset_type, entry[4:8] if magic == 42 else entry[4:12])[0]
            if kind not in NUMERIC_TYPES or number > 1000000:
                raise ValueError(f"unsupported/oversized numeric tag {tag}")
            width, form = NUMERIC_TYPES[kind]
            slot = entry[8:12] if magic == 42 else entry[12:20]
            length = number * width
            data = slot[:length] if length <= offset_bytes else read(struct.unpack(endian + offset_type, slot)[0], length)
            return list(struct.unpack(endian + form * number, data)) if number else []
        queue, visited, directories = [(first, frozenset())], set(), []
        while queue:
            offset, ancestors = queue.pop(0)
            if not offset:
                continue
            if offset in ancestors:
                raise ValueError("cyclic TIFF IFD links")
            if offset in visited:
                continue
            if len(visited) >= 4096:
                raise ValueError("excessive TIFF IFD count")
            visited.add(offset)
            count = struct.unpack(endian + count_type, read(offset, count_bytes))[0]
            if count > 4096:
                raise ValueError("excessive TIFF IFD tag count")
            entries = read(offset + count_bytes, count * entry_bytes + offset_bytes)
            tags = {}
            for index in range(count):
                entry = entries[index * entry_bytes:(index + 1) * entry_bytes]
                tag = struct.unpack(endian + "H", entry[:2])[0]
                if tag in {256, 257, 273, 279, 324, 325, 330}:
                    if tag in tags:
                        raise ValueError(f"duplicate TIFF tag {tag}")
                    tags[tag] = values(entry)
            if not tags.get(256) or not tags.get(257) or min(tags[256][0], tags[257][0]) <= 0:
                raise ValueError("IFD lacks positive image dimensions")
            payloads = 0
            for offsets_tag, counts_tag in ((273, 279), (324, 325)):
                offsets, lengths = tags.get(offsets_tag), tags.get(counts_tag)
                if offsets is None and lengths is None:
                    continue
                if offsets is None or lengths is None or len(offsets) != len(lengths) or not offsets:
                    raise ValueError("TIFF strip/tile offset and byte-count lengths disagree")
                for start, length in zip(offsets, lengths):
                    if (start, length) != (0, 0) and (start <= 0 or length <= 0 or start + length > size):
                        raise ValueError(f"truncated TIFF payload: offset={start}, bytes={length}, file={size}")
                payloads += len(offsets)
            if not payloads:
                raise ValueError("IFD lacks strip/tile payloads")
            directories.append({"offset": offset, "size": [tags[256][0], tags[257][0]]})
            links = tags.get(330, []) + [struct.unpack(endian + offset_type, entries[-offset_bytes:])[0]]
            queue.extend((link, ancestors | {offset}) for link in links)
        if not directories:
            raise ValueError("TIFF contains no image directory")
    return directories


def decoded_page(executable, path, directory, timeout):
    source = f"GTIFF_DIR:off:{directory['offset']}:{path}"
    command = [executable, "--config", "GDAL_PAM_ENABLED", "NO", "--config", "GDAL_CACHEMAX", "512",
               "--config", "GTIFF_IGNORE_READ_ERRORS", "FALSE", "-json", "-checksum", source]
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout,
                            env={**os.environ, "GDAL_PAM_ENABLED": "NO", "GDAL_CACHEMAX": "512"})
    # Some GDAL releases report a read error with exit 0. Do not trust exit code alone.
    if result.returncode or re.search(r"(?:^|\n)\s*(?:ERROR|FAILURE)(?:\s|\d|:)", result.stderr):
        raise ValueError(f"gdalinfo failed ({result.returncode}): {result.stderr.strip()[:2000]}")
    # A libjpeg warning can accompany valid checksums after incomplete decoding.
    # Conservatively require review of all diagnostics; this does not establish
    # that the original is corrupt (unknown TIFF tags can also produce warnings).
    if result.stderr.strip():
        raise ValueError(f"gdalinfo diagnostics require review: {result.stderr.strip()[:2000]}")
    data = json.loads(result.stdout)
    bands = data.get("bands", [])
    if data.get("size") != directory["size"] or not bands:
        raise ValueError("GDAL dimensions/bands disagree with TIFF IFD")
    checksums = []
    for band in bands:
        checksum = band.get("checksum")
        if type(checksum) is not int or not 0 <= checksum <= 65535:
            raise ValueError("GDAL did not return a valid decoded checksum for every band")
        for overview in band.get("overviews", []):
            value = overview.get("checksum")
            if type(value) is not int or not 0 <= value <= 65535:
                raise ValueError("GDAL did not return a decoded overview checksum")
        checksums.append(checksum)
    return {"offset": directory["offset"], "size": directory["size"], "bandChecksums": checksums,
            "warnings": result.stderr.strip()[:2000]}


def verify_file(path, before, executable, all_pages, headers_only, timeout):
    try:
        if signature(path) != before:
            return {"path": str(path), "status": "deferred", "reason": "changed before verification"}
        directories = inspect_tiff(path)
        decoded = []
        if not headers_only:
            for directory in directories if all_pages else directories[:1]:
                decoded.append(decoded_page(executable, path, directory, timeout))
        result = {"path": str(path), "status": "passed", "bytes": before[2],
                  "ifdCount": len(directories), "decodedIfdCount": len(decoded),
                  "directories": directories, "decoded": decoded, "pixelsDecoded": not headers_only}
    except (OSError, ValueError, struct.error, subprocess.SubprocessError) as error:
        result = {"path": str(path), "status": "failed", "error": str(error)}
    try:
        if signature(path) != before:
            return {"path": str(path), "status": "deferred", "reason": "changed during verification"}
    except (OSError, ValueError):
        return {"path": str(path), "status": "deferred", "reason": "removed during verification"}
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=4, choices=range(1, 9))
    parser.add_argument("--all-pages", action="store_true", help="Decode every linked TIFF IFD, including SubIFDs")
    parser.add_argument("--headers-only", action="store_true", help="Check structure only; no pixel decoding")
    parser.add_argument("--min-age-seconds", type=float, default=120)
    parser.add_argument("--stable-seconds", type=float, default=5)
    parser.add_argument("--timeout-seconds", type=float, default=600, help="Per-IFD decoding timeout")
    parser.add_argument("--gdalinfo", default="gdalinfo")
    parser.add_argument("--limit", type=int, help="Smoke test only the first N TIFFs (summary marks limited coverage)")
    args = parser.parse_args(argv)
    try:
        if args.min_age_seconds < 0 or not 0 <= args.stable_seconds <= 60 or args.timeout_seconds <= 0 or (args.limit is not None and args.limit < 1):
            raise ValueError("invalid age/stability/timeout/limit option")
        root = args.root.resolve(strict=True)
        if not root.is_dir():
            raise ValueError("root must be a directory")
        executable = shutil.which(args.gdalinfo)
        if not args.headers_only and not executable:
            raise ValueError("gdalinfo unavailable; install nothing implicitly or use --headers-only")
        files, inventory_errors = [], []
        for folder, directories, names in os.walk(root, followlinks=False, onerror=lambda e: inventory_errors.append(str(e))):
            directories.sort()
            for name in sorted(names):
                path = Path(folder) / name
                if path.suffix.lower() not in {".tif", ".tiff"}:
                    continue
                if path.is_symlink():
                    inventory_errors.append(f"skipped symlink TIFF: {path}")
                    continue
                try:
                    files.append((path, signature(path)))
                except (OSError, ValueError) as error:
                    inventory_errors.append(f"{path}: {error}")
        selected = files[:args.limit] if args.limit else files
        emit("inventory", root=str(root), tiffFiles=len(files), tiffBytes=sum(info[2] for _, info in files),
             selectedFiles=len(selected), coverageLimited=len(selected) < len(files), errors=inventory_errors,
             allPages=args.all_pages, headersOnly=args.headers_only, workers=args.workers)
        if selected and args.stable_seconds:
            time.sleep(args.stable_seconds)
        counts, failures, deferred = Counter(), [], []
        ready = []
        for path, before in selected:
            try:
                if time.time() - max(before[3], before[4]) / 1e9 < args.min_age_seconds or signature(path) != before:
                    result = {"path": str(path), "status": "deferred", "reason": "too recent or changed in stability window"}
                    counts["deferred"] += 1; deferred.append(str(path)); emit("file", **result)
                else:
                    ready.append((path, before))
            except (OSError, ValueError) as error:
                counts["deferred"] += 1; deferred.append(str(path)); emit("file", path=str(path), status="deferred", reason=str(error))
        emit("ready", stableFiles=len(ready), deferredFiles=counts["deferred"])
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            results = pool.map(lambda item: verify_file(item[0], item[1], executable, args.all_pages, args.headers_only, args.timeout_seconds), ready)
            for result in results:
                counts[result["status"]] += 1
                if result["status"] == "failed": failures.append(result["path"])
                if result["status"] == "deferred": deferred.append(result["path"])
                emit("file", **result)
        exit_code = 1 if failures or inventory_errors else (2 if deferred or not selected else 0)
        emit("summary", **dict(counts), selectedFiles=len(selected), inventoryFiles=len(files),
             coverageLimited=len(selected) < len(files), failedPaths=failures, deferredPaths=deferred,
             allSelectedPixelsDecoded=bool(selected and not args.headers_only and not failures and not deferred and not inventory_errors),
             allSelectedIfdsDecoded=bool(selected and args.all_pages and not args.headers_only and not failures and not deferred and not inventory_errors),
             exitCode=exit_code, note="Decode check, not supplier checksum comparison or delivery completeness proof")
        return exit_code
    except (OSError, ValueError) as error:
        emit("verification-error", error=str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
