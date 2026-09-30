"""Contract tests for the local originals bridge, without SSH or delivery TIFFs."""

import http.client
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("serve_originals", Path(__file__).with_name("serve-originals.py"))
bridge_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = bridge_module
spec.loader.exec_module(bridge_module)


class Backend:
    def __init__(self):
        self.renders = []
        self.original_calls = []

    def render(self, image, edge):
        self.renders.append((image.id, edge))
        return b"\xff\xd8preview\xff\xd9"

    def original(self, image, start, length):
        self.original_calls.append((image.id, start, length))
        yield b"0123456789"[start:start + length]


class BridgeTests(unittest.TestCase):
    allowed_origin = bridge_module.ALLOWED_ORIGIN

    def setUp(self):
        self.image = bridge_module.Original("BW_25_4049", "/data/BW_25_4049.tif", 10, 1234)
        self.metadata = {"schemaVersion": 1, "seriesId": "wuppertal-2026-rathaus", "conventions": {"verticalDatum": "unknown"},
                         "cameras": {"BW": {"focalLengthMm": 124}},
                         "images": {self.image.id: {"cameraId": "BW"}, "missing": {"cameraId": "BW"}},
                         "provenance": {"sha256": "source-checksum"}}
        self.backend = Backend()
        self.bridge = bridge_module.Bridge(self.metadata, {self.image.id: self.image}, self.backend, self.allowed_origin)
        self.server = bridge_module.ThreadingHTTPServer(("127.0.0.1", 0), bridge_module.create_handler(self.bridge))
        self.server.daemon_threads = True
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join()

    def request(self, path, headers=None, method="GET"):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=2)
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_available_subset_preserves_unknown_height_and_source_provenance(self):
        code, headers, data = self.request("/metadata.json", {"Origin": bridge_module.ALLOWED_ORIGIN})
        metadata = json.loads(data)
        self.assertEqual(code, 200)
        self.assertEqual(list(metadata["images"]), [self.image.id])
        self.assertEqual(metadata["seriesId"], "wuppertal-2026-rathaus")
        self.assertEqual(metadata["conventions"], self.metadata["conventions"])
        self.assertEqual(metadata["provenance"], self.metadata["provenance"])
        self.assertEqual(headers["Access-Control-Allow-Origin"], bridge_module.ALLOWED_ORIGIN)

    def test_preview_levels_use_bounded_edges_and_cache(self):
        for level, edge in bridge_module.LEVEL_EDGES.items():
            code, headers, data = self.request(f"/{level}/{self.image.id}.jpg")
            self.assertEqual(code, 200)
            self.assertEqual(headers["Content-Type"], "image/jpeg")
            self.assertTrue(data.startswith(b"\xff\xd8"))
            self.request(f"/{level}/{self.image.id}.jpg")
        self.assertEqual(self.backend.renders, [(self.image.id, edge) for edge in bridge_module.LEVEL_EDGES.values()])

    def test_original_bytes_and_range_are_unchanged(self):
        code, headers, data = self.request(f"/original/{self.image.id}.tif", {"Range": "bytes=2-5"})
        self.assertEqual((code, data), (206, b"2345"))
        self.assertEqual(headers["Content-Range"], "bytes 2-5/10")
        self.assertEqual(headers["Content-Length"], "4")
        self.assertEqual(self.backend.original_calls, [(self.image.id, 2, 4)])
        code, _, data = self.request(f"/original/{self.image.id}.tif")
        self.assertEqual((code, data), (200, b"0123456789"))

    def test_invalid_ranges_and_nonwhitelisted_paths_never_reach_backend(self):
        for value in ("bytes=999-", "bytes=0-1,3-4", "bytes=-0"):
            code, headers, _ = self.request(f"/original/{self.image.id}.tif", {"Range": value})
            self.assertEqual(code, 416)
            self.assertEqual(headers["Content-Range"], "bytes */10")
        for path in ("/3/missing.jpg", "/3/..%2Fsecret.jpg", "/original/%2Fetc%2Fpasswd.tif"):
            self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(self.backend.original_calls, [])
        self.assertEqual(self.backend.renders, [])

    def test_head_and_etag_do_not_transfer_original(self):
        path = f"/original/{self.image.id}.tif"
        code, headers, data = self.request(path, method="HEAD")
        self.assertEqual((code, data), (200, b""))
        self.assertEqual(headers["Content-Length"], "10")
        self.assertEqual(self.request(path, {"If-None-Match": headers["ETag"]})[0], 304)
        self.assertEqual(self.backend.original_calls, [])

    def test_cors_rejects_other_origins_before_remote_work(self):
        self.assertEqual(self.request(f"/3/{self.image.id}.jpg", {"Origin": "https://example.com"})[0], 403)
        self.assertEqual(self.backend.renders, [])

    def test_existing_tiff_page_selection_avoids_large_base_decode(self):
        info = {"size": [19136, 12736], "metadata": {"SUBDATASETS": {
            "SUBDATASET_3_DESC": "Page 3 (4784P x 3184L x 3B)",
            "SUBDATASET_4_DESC": "Page 4 (2392P x 1592L x 3B)",
            "SUBDATASET_5_DESC": "Page 5 (1196P x 796L x 3B)"}}}
        source, width, height = bridge_module.render_source(info, self.image, 1024)
        self.assertEqual((source, width, height), ("GTIFF_DIR:5:/data/BW_25_4049.tif", 1196, 796))
        self.assertEqual(bridge_module.render_source(info, self.image, 4096)[1:], (4784, 3184))

    def test_gdal_decode_error_rejects_even_success_exit_and_jpeg_markers(self):
        class Process:
            stdout = io.BytesIO(b"\xff\xd8partial\xff\xd9")
            stderr = io.BytesIO(b"ERROR 1: TIFF strip decode failed\n")

            def wait(self):
                return 0

            def poll(self):
                return 0

            def kill(self):
                pass

        backend = bridge_module.RemoteBackend("amy.cismet.de", "existing-gdal", "/data/test")
        with patch.object(bridge_module.subprocess, "Popen", return_value=Process()):
            with self.assertRaisesRegex(bridge_module.BridgeError, "strip decode failed"):
                backend.execute(["gdal_translate"])

    def test_inventory_duplicate_ids_fail_instead_of_guessing_source(self):
        row = {"id": self.image.id, "path": self.image.path, "size": 10, "modified_ns": 1}
        with self.assertRaises(bridge_module.BridgeError):
            bridge_module.original_index([row, {**row, "path": "/other/BW_25_4049.tif"}])


class AdditionalPortTests(BridgeTests):
    allowed_origin = "http://localhost:4201"

    def test_configured_port_is_allowed_and_default_port_is_rejected(self):
        code, headers, _ = self.request("/metadata.json", {"Origin": self.allowed_origin})
        self.assertEqual(code, 200)
        self.assertEqual(headers["Access-Control-Allow-Origin"], self.allowed_origin)
        self.assertEqual(self.request("/metadata.json", {"Origin": bridge_module.ALLOWED_ORIGIN})[0], 403)

    def test_available_subset_preserves_unknown_height_and_source_provenance(self):
        code, headers, data = self.request("/metadata.json", {"Origin": self.allowed_origin})
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(data)["conventions"], self.metadata["conventions"])
        self.assertEqual(headers["Access-Control-Allow-Origin"], self.allowed_origin)


class MultipleCatalogTests(BridgeTests):
    def setUp(self):
        super().setUp()
        self.extra = bridge_module.Original("LE_01_7420", "/data/LE_01_7420.tif", 10, 1234)
        full = {**self.metadata, "seriesId": "wuppertal-2026", "images": {
            self.image.id: {"cameraId": "BW"}, self.extra.id: {"cameraId": "BW"}, "missing": {"cameraId": "BW"}}}
        unused = bridge_module.Original("unused", "/data/unused.tif", 10, 1234)
        catalogs = bridge_module.Bridge(self.metadata, {entry.id: entry for entry in (self.image, self.extra, unused)}, self.backend,
                                        additional_metadata=[full])
        self.bridge.metadata_by_series = catalogs.metadata_by_series
        self.bridge.metadata = catalogs.metadata
        self.bridge.originals = catalogs.originals

    def test_preserves_generic_full_id_and_each_available_catalog_subset(self):
        code, _, data = self.request("/metadata/wuppertal-2026.json")
        full = json.loads(data)
        self.assertEqual(code, 200)
        self.assertEqual(full["seriesId"], "wuppertal-2026")
        self.assertEqual(set(full["images"]), {self.image.id, self.extra.id})
        primary = json.loads(self.request("/metadata.json")[2])
        self.assertEqual(primary["seriesId"], "wuppertal-2026-rathaus")
        self.assertEqual(set(primary["images"]), {self.image.id})
        self.assertEqual(self.request(f"/3/{self.extra.id}.jpg")[0], 200)
        self.assertEqual(self.request("/3/unused.jpg")[0], 404)
        self.assertEqual(self.request("/metadata/unknown.json")[0], 404)

    def test_rejects_invalid_or_duplicate_series_ids(self):
        for series_id in ("", "../escape", None):
            with self.subTest(series_id=series_id):
                with self.assertRaises(bridge_module.BridgeError):
                    bridge_module.filter_metadata({**self.metadata, "seriesId": series_id}, self.bridge.originals)
        with self.assertRaisesRegex(bridge_module.BridgeError, "Duplicate"):
            bridge_module.Bridge(self.metadata, self.bridge.originals, self.backend, additional_metadata=[self.metadata])


class OptimisticCatalogTests(BridgeTests):
    def test_full_catalog_retains_missing_nadir_pose_without_widening_original_access(self):
        full = {**self.metadata, "seriesId": "wuppertal-2026", "images": {
            self.image.id: {"cameraId": "BW"}, "NA_01_0001": {"cameraId": "NA"}}}
        optimistic = bridge_module.Bridge(self.metadata, self.bridge.originals, self.backend,
            additional_metadata=[full], optimistic_series=["wuppertal-2026"])
        self.bridge.metadata_by_series = optimistic.metadata_by_series
        self.bridge.originals = optimistic.originals
        self.assertEqual(set(json.loads(self.request("/metadata/wuppertal-2026.json")[2])["images"]),
                         {self.image.id, "NA_01_0001"})
        self.assertEqual(set(json.loads(self.request("/metadata.json")[2])["images"]), {self.image.id})
        self.assertEqual(self.request("/3/NA_01_0001.jpg")[0], 404)
        self.assertEqual(self.request("/original/NA_01_0001.tif")[0], 404)
        self.assertEqual(self.backend.renders, [])
        self.assertEqual(self.backend.original_calls, [])

    def test_optimistic_series_must_match_a_configured_catalog(self):
        with self.assertRaisesRegex(bridge_module.BridgeError, "configured metadata catalog"):
            bridge_module.Bridge(self.metadata, self.bridge.originals, self.backend,
                                 optimistic_series=["unknown-series"])


class OriginValidationTests(unittest.TestCase):
    def test_rejects_non_loopback_paths_credentials_and_invalid_ports(self):
        for origin in ("https://example.com", "http://localhost:4201/", "http://user@localhost:4201", "http://localhost:4201?q=x", "http://localhost:4201?", " http://localhost:4201", "http://localhost:abc"):
            with self.subTest(origin=origin):
                with self.assertRaises(bridge_module.BridgeError):
                    bridge_module.validated_origin(origin)


class StableInventoryTests(unittest.TestCase):
    def test_includes_only_nonempty_old_regular_originals(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            old = root / "BW_25_4049.tif"
            old.write_bytes(b"original")
            age = time.time() - 180
            os.utime(old, (age, age))
            (root / "uploading.tif").write_bytes(b"incomplete")
            (root / "empty.tif").touch()
            (root / "alias.tif").symlink_to(old)
            result = subprocess.run([sys.executable, "-", folder], input=bridge_module.INVENTORY_SCRIPT,
                                    text=True, capture_output=True, check=True)
            self.assertEqual([row["id"] for row in json.loads(result.stdout)], [old.stem])


if __name__ == "__main__":
    unittest.main()
