#!/usr/bin/env python3
"""Loopback-only development bridge for unchanged remote oblique TIFF originals."""

from __future__ import annotations

import argparse
from collections import OrderedDict
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import threading
from typing import Iterator
from urllib.parse import unquote, urlsplit

ALLOWED_ORIGIN = "http://localhost:4200"
LEVEL_EDGES = {1: 4096, 2: 2048, 3: 1024}
MAX_RENDER_BYTES = 32 * 1024 * 1024
MAX_CACHE_BYTES = 64 * 1024 * 1024
ID_PATTERN = re.compile(r"[A-Za-z0-9_.-]+\Z")

INVENTORY_SCRIPT = r'''
import json, os, stat, sys, time
root = os.path.realpath(sys.argv[1])
if not os.path.isdir(root):
    raise SystemExit("TIFF image root does not exist")
images = []
old_enough_ns = time.time_ns() - 120 * 1000000000
for directory, directories, files in os.walk(root, followlinks=False):
    directories[:] = sorted(name for name in directories
                            if not os.path.islink(os.path.join(directory, name)))
    for name in sorted(files):
        if os.path.splitext(name)[1].lower() not in (".tif", ".tiff"):
            continue
        path = os.path.join(directory, name)
        if os.path.islink(path):
            continue
        try:
            before = os.stat(path, follow_symlinks=False)
            if (not stat.S_ISREG(before.st_mode) or before.st_size <= 0
                    or before.st_mtime_ns > old_enough_ns):
                continue
            after = os.stat(path, follow_symlinks=False)
        except FileNotFoundError:
            continue
        fingerprint = lambda info: (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)
        if fingerprint(before) != fingerprint(after):
            continue
        images.append({"id": os.path.splitext(name)[0], "path": path,
                       "size": after.st_size, "modified_ns": after.st_mtime_ns})
        if len(images) > 50000:
            raise SystemExit("Development bridge is limited to 50000 TIFF originals")
print(json.dumps(images))
'''

ORIGINAL_SCRIPT = r'''
import os, sys
path, start, length, size, modified = sys.argv[1:]
start, length, size, modified = map(int, (start, length, size, modified))
with open(path, "rb") as source:
    info = os.fstat(source.fileno())
    if info.st_size != size or info.st_mtime_ns != modified:
        raise SystemExit("Original changed; restart the development bridge")
    source.seek(start)
    remaining = length
    while remaining:
        chunk = source.read(min(65536, remaining))
        if not chunk:
            raise SystemExit("Original ended before the requested range")
        sys.stdout.buffer.write(chunk)
        remaining -= len(chunk)
'''


class BridgeError(RuntimeError):
    pass


def validated_origin(origin: str) -> str:
    """Accept one exact loopback HTTP origin, without a path or credentials."""
    try:
        parsed = urlsplit(origin)
        port = parsed.port
        if (parsed.scheme not in ("http", "https")
                or parsed.hostname not in ("localhost", "127.0.0.1", "::1")
                or parsed.username is not None or parsed.password is not None
                or parsed.path or parsed.query or parsed.fragment
                or origin != f"{parsed.scheme}://{parsed.netloc}"
                or (port is not None and not 1 <= port <= 65535)
                or parsed.netloc.endswith(":")):
            raise ValueError("not a loopback HTTP origin")
    except ValueError as error:
        raise BridgeError("Allowed origin must be an exact loopback HTTP(S) origin without a path or credentials") from error
    return origin


@dataclass(frozen=True)
class Original:
    id: str
    path: str
    size: int
    modified_ns: int

    @property
    def etag(self) -> str:
        return f'"{self.size:x}-{self.modified_ns:x}"'


def original_index(rows: list[dict]) -> dict[str, Original]:
    result = {}
    for row in rows:
        original = Original(**row)
        if not ID_PATTERN.fullmatch(original.id) or original.id in (".", ".."):
            raise BridgeError("Unsupported original image ID")
        if original.id in result:
            raise BridgeError(f"Duplicate original image ID: {original.id}")
        if original.size <= 0 or not original.path.startswith("/"):
            raise BridgeError(f"Invalid original inventory entry: {original.id}")
        result[original.id] = original
    return result


def filter_metadata(metadata: dict, originals: dict[str, Original]) -> dict:
    if (not isinstance(metadata, dict) or metadata.get("schemaVersion") != 1
            or not isinstance(metadata.get("images"), dict)):
        raise BridgeError("Expected schemaVersion 1 oblique metadata with source-keyed images")
    series_id = metadata.get("seriesId")
    if (not isinstance(series_id, str) or not ID_PATTERN.fullmatch(series_id)
            or series_id in (".", "..")):
        raise BridgeError("Metadata requires a nonempty route-safe seriesId")
    images = {key: value for key, value in metadata["images"].items() if key in originals}
    # Preserve series identity, cameras, conventions, provenance and the unknown height datum.
    return {**metadata, "images": images}


def requested_range(value: str | None, size: int) -> tuple[int, int]:
    """Return inclusive bounds; accept one byte range and reject malformed ranges."""
    if value is None:
        return 0, size - 1
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
    if not match or not any(match.groups()):
        raise ValueError("Only one bytes range is supported")
    lower, upper = match.groups()
    if not lower:
        count = int(upper)
        if count <= 0:
            raise ValueError("Empty suffix range")
        return max(0, size - count), size - 1
    start = int(lower)
    end = min(int(upper), size - 1) if upper else size - 1
    if start >= size or start > end:
        raise ValueError("Range is outside the original")
    return start, end


def render_source(info: dict, original: Original, max_edge: int) -> tuple[str, int, int]:
    """Use the smallest already-delivered TIFF page that avoids upscaling."""
    width, height = info["size"]
    candidates = [(original.path, width, height)]
    pages = info.get("metadata", {}).get("SUBDATASETS", {})
    for key, description in pages.items():
        page_match = re.fullmatch(r"SUBDATASET_(\d+)_DESC", key)
        size_match = re.search(r"\((\d+)P x (\d+)L x 3B\)", description)
        if page_match and size_match:
            page_width, page_height = map(int, size_match.groups())
            if abs(page_width / page_height - width / height) < 0.01:
                candidates.append((f"GTIFF_DIR:{page_match[1]}:{original.path}", page_width, page_height))
    sufficient = [entry for entry in candidates if max(entry[1:]) >= min(max_edge, max(width, height))]
    return min(sufficient, key=lambda entry: entry[1] * entry[2])


class RemoteBackend:
    def __init__(self, host: str, container: str, image_root: str):
        if not re.fullmatch(r"[A-Za-z0-9_.@-]+", host) or host.startswith("-"):
            raise BridgeError("Invalid SSH host")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", container) or container.startswith("-"):
            raise BridgeError("Invalid container name")
        if not image_root.startswith("/"):
            raise BridgeError("The container image root must be absolute")
        self.host, self.container, self.image_root = host, container, image_root
        self.info: dict[str, dict] = {}
        self.info_lock = threading.Lock()

    def command(self, arguments: list[str], stdin: bool = False) -> list[str]:
        remote = ["docker", "exec"]
        if stdin:
            remote.append("-i")
        remote += ["-e", "PYTHONDONTWRITEBYTECODE=1", "-e", "GDAL_PAM_ENABLED=NO",
                   "-e", "GDAL_CACHEMAX=64", "-e", "GDAL_DISABLE_READDIR_ON_OPEN=TRUE",
                   self.container, *arguments]
        return ["ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", self.host,
                shlex.join(remote)]

    def execute(self, arguments: list[str], script: str | None = None,
                limit: int = MAX_RENDER_BYTES) -> bytes:
        process = subprocess.Popen(self.command(arguments, script is not None),
                                   stdin=subprocess.PIPE if script else subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        timer = threading.Timer(90, process.kill)
        errors = bytearray()

        def read_errors():
            while chunk := process.stderr.read(4096):
                errors.extend(chunk[:max(0, 65536 - len(errors))])

        reader = threading.Thread(target=read_errors, daemon=True)
        timer.start()
        reader.start()
        try:
            if script:
                process.stdin.write(script.encode())
                process.stdin.close()
            chunks, size = [], 0
            while chunk := process.stdout.read(65536):
                size += len(chunk)
                if size > limit:
                    raise BridgeError("Remote response exceeded the development bridge memory limit")
                chunks.append(chunk)
            code = process.wait()
            reader.join()
            error_text = errors.decode(errors="replace").strip()
            if code or re.search(r"(?im)^ERROR(?:\s+\d+)?\s*:", error_text):
                raise BridgeError(error_text or "Remote command failed or timed out")
            return b"".join(chunks)
        finally:
            timer.cancel()
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()
            process.stderr.close()

    def inventory(self) -> dict[str, Original]:
        rows = json.loads(self.execute(["python3", "-", self.image_root], INVENTORY_SCRIPT, 32 * 1024 * 1024))
        return original_index(rows)

    def render(self, original: Original, max_edge: int) -> bytes:
        with self.info_lock:
            if original.id not in self.info:
                self.info[original.id] = json.loads(self.execute(["gdalinfo", "-json", original.path], limit=1024 * 1024))
            info = self.info[original.id]
        source, width, height = render_source(info, original, max_edge)
        scale = min(1, max_edge / max(width, height))
        output_width, output_height = max(1, round(width * scale)), max(1, round(height * scale))
        data = self.execute(["gdal_translate", "-q", "-of", "JPEG", "-co", "QUALITY=85",
                             "-outsize", str(output_width), str(output_height), "-r", "bilinear",
                             source, "/vsistdout/"])
        if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
            raise BridgeError("GDAL did not return a complete JPEG")
        return data

    def original(self, image: Original, start: int, length: int) -> Iterator[bytes]:
        arguments = ["python3", "-", image.path, str(start), str(length), str(image.size), str(image.modified_ns)]
        process = subprocess.Popen(self.command(arguments, True), stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        timer = threading.Timer(180, process.kill)
        timer.start()
        try:
            process.stdin.write(ORIGINAL_SCRIPT.encode())
            process.stdin.close()
            remaining = length
            while remaining:
                chunk = process.stdout.read(min(65536, remaining))
                if not chunk:
                    raise BridgeError("Could not read the original TIFF; restart if its inventory changed")
                remaining -= len(chunk)
                yield chunk
            if process.wait():
                raise BridgeError("Reading the original TIFF failed")
        finally:
            timer.cancel()
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()


class Bridge:
    def __init__(self, metadata: dict, originals: dict[str, Original], backend,
                 allowed_origin: str = ALLOWED_ORIGIN,
                 additional_metadata: list[dict] | None = None):
        self.allowed_origin = validated_origin(allowed_origin)
        self.metadata_by_series: dict[str, bytes] = {}
        available = set()
        for catalog in [metadata, *(additional_metadata or [])]:
            filtered = filter_metadata(catalog, originals)
            series_id = filtered["seriesId"]
            if series_id in self.metadata_by_series:
                raise BridgeError(f"Duplicate metadata seriesId: {series_id}")
            self.metadata_by_series[series_id] = json.dumps(filtered, sort_keys=True).encode()
            available.update(filtered["images"])
        if not available:
            raise BridgeError("Metadata and available TIFF originals have no common image IDs")
        self.metadata = self.metadata_by_series[metadata["seriesId"]]
        self.originals = {key: value for key, value in originals.items() if key in available}
        self.backend = backend
        self.cache: OrderedDict[tuple[str, int], bytes] = OrderedDict()
        self.cache_bytes = 0
        self.cache_lock = threading.Lock()
        self.workers = threading.BoundedSemaphore(2)

    def preview(self, original: Original, level: int) -> bytes:
        key = (original.id, level)
        with self.cache_lock:
            if key in self.cache:
                self.cache.move_to_end(key)
                return self.cache[key]
        with self.workers:
            data = self.backend.render(original, LEVEL_EDGES[level])
        if len(data) > MAX_RENDER_BYTES:
            raise BridgeError("JPEG exceeds the memory limit")
        with self.cache_lock:
            previous = self.cache.pop(key, b"")
            self.cache_bytes -= len(previous)
            while self.cache and self.cache_bytes + len(data) > MAX_CACHE_BYTES:
                self.cache_bytes -= len(self.cache.popitem(last=False)[1])
            self.cache[key] = data
            self.cache_bytes += len(data)
        return data


def create_handler(bridge: Bridge):
    class Handler(BaseHTTPRequestHandler):
        def end_headers(self):
            if self.headers.get("Origin") == bridge.allowed_origin:
                self.send_header("Access-Control-Allow-Origin", bridge.allowed_origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, ETag")
            self.send_header("X-Content-Type-Options", "nosniff")
            super().end_headers()

        def allowed(self) -> bool:
            if self.headers.get("Origin") not in (None, bridge.allowed_origin):
                self.send_error(403, "Origin is not allowed by this development bridge")
                return False
            return True

        def do_OPTIONS(self):
            if not self.allowed():
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Range, If-None-Match")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_HEAD(self):
            self.serve(True)

        def do_GET(self):
            self.serve(False)

        def respond(self, data: bytes, content_type: str, head: bool, etag: str | None = None):
            if etag and self.headers.get("If-None-Match") == etag:
                self.send_response(304)
                self.send_header("ETag", etag)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "private, max-age=60" if etag else "no-store")
            if etag:
                self.send_header("ETag", etag)
            self.end_headers()
            if not head:
                self.wfile.write(data)

        def serve(self, head: bool):
            if not self.allowed():
                return
            try:
                path = unquote(urlsplit(self.path).path, errors="strict")
                if path == "/metadata.json":
                    self.respond(bridge.metadata, "application/json", head)
                    return
                catalog_match = re.fullmatch(r"/metadata/([A-Za-z0-9_.-]+)\.json", path)
                if catalog_match:
                    catalog = bridge.metadata_by_series.get(catalog_match[1])
                    if catalog is None:
                        self.send_error(404, "Unknown image series")
                    else:
                        self.respond(catalog, "application/json", head)
                    return
                match = re.fullmatch(r"/(1|2|3)/([A-Za-z0-9_.-]+)\.jpg", path)
                original_match = re.fullmatch(r"/original/([A-Za-z0-9_.-]+)\.tif", path)
                image_id = (match or original_match)[2 if match else 1] if match or original_match else None
                image = bridge.originals.get(image_id)
                if image is None:
                    self.send_error(404, "Image ID is not in the available TIFF metadata whitelist")
                    return
                if match:
                    level = int(match[1])
                    self.respond(bridge.preview(image, level), "image/jpeg", head, image.etag[:-1] + f'-{level}"')
                    return
                self.serve_original(image, head)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except (BridgeError, ValueError, KeyError, TypeError) as error:
                self.send_error(502, str(error))

        def serve_original(self, image: Original, head: bool):
            if self.headers.get("If-None-Match") == image.etag:
                self.send_response(304)
                self.send_header("ETag", image.etag)
                self.end_headers()
                return
            value = self.headers.get("Range")
            try:
                start, end = requested_range(value, image.size)
            except ValueError:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{image.size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            length = end - start + 1
            with bridge.workers:
                chunks = None if head else bridge.backend.original(image, start, length)
                first = None if head else next(chunks)
                self.send_response(206 if value else 200)
                self.send_header("Content-Type", "image/tiff")
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("ETag", image.etag)
                self.send_header("Cache-Control", "private, max-age=60")
                if value:
                    self.send_header("Content-Range", f"bytes {start}-{end}/{image.size}")
                self.end_headers()
                if not head:
                    try:
                        self.wfile.write(first)
                        for chunk in chunks:
                            self.wfile.write(chunk)
                    finally:
                        chunks.close()

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, default=Path(__file__).resolve().parents[2] / "apps" / "geoportal" / "public" / "oblique" / "2026-rathaus" / "metadata.json", help="Local schemaVersion 1 importer JSON; defaults to the committed Rathaus catalog")
    parser.add_argument("--additional-metadata", type=Path, action="append", default=[], help="Additional schemaVersion 1 catalog; repeatable, served by its preserved seriesId")
    parser.add_argument("--ssh-host", default="amy.cismet.de")
    parser.add_argument("--container", default="gdal36_gdal3-6-environment_1")
    parser.add_argument("--image-root", default="/data/wupp2026/schraeg/_test-rathaus", help="Path in the existing container")
    parser.add_argument("--port", type=int, default=8926)
    parser.add_argument("--allow-origin", default=ALLOWED_ORIGIN, help="Exact loopback HTTP(S) browser origin; no path or credentials")
    args = parser.parse_args()
    try:
        origin = validated_origin(args.allow_origin)
        backend = RemoteBackend(args.ssh_host, args.container, args.image_root)
        additional = [json.loads(path.read_text()) for path in args.additional_metadata]
        bridge = Bridge(json.loads(args.metadata.read_text()), backend.inventory(), backend, origin, additional)
        server = ThreadingHTTPServer(("127.0.0.1", args.port), create_handler(bridge))
        server.daemon_threads = True
        print(f"Development originals bridge: http://localhost:{args.port} ({len(bridge.originals)} TIFFs)", flush=True)
        print("Height datum remains unverified; no permanent image derivatives or watermark are produced.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
        return 0
    except (BridgeError, OSError, ValueError, TypeError) as error:
        print(f"Originals bridge: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
