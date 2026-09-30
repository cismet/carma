"""Contract tests for the local originals bridge, without SSH or delivery TIFFs."""

import http.client
import importlib.util
import io
import json
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
    def setUp(self):
        self.image = bridge_module.Original("BW_25_4049", "/data/BW_25_4049.tif", 10, 1234)
        self.metadata = {"schemaVersion": 1, "seriesId": "wuppertal-2026", "conventions": {"verticalDatum": "unknown"},
                         "cameras": {"BW": {"focalLengthMm": 124}},
                         "images": {self.image.id: {"cameraId": "BW"}, "missing": {"cameraId": "BW"}},
                         "provenance": {"sha256": "source-checksum"}}
        self.backend = Backend()
        self.bridge = bridge_module.Bridge(self.metadata, {self.image.id: self.image}, self.backend)
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
        for level, edge in ((1, 4096), (2, 2048), (3, 1024)):
            code, headers, data = self.request(f"/{level}/{self.image.id}.jpg")
            self.assertEqual(code, 200)
            self.assertEqual(headers["Content-Type"], "image/jpeg")
            self.assertTrue(data.startswith(b"\xff\xd8"))
            self.request(f"/{level}/{self.image.id}.jpg")
        self.assertEqual(self.backend.renders, [(self.image.id, edge) for edge in (4096, 2048, 1024)])

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


if __name__ == "__main__":
    unittest.main()
