import contextlib
import io
import json
from pathlib import Path
import runpy
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch


VERIFY = runpy.run_path(str(Path(__file__).with_name("verify-tiffs.py")))


def tiny_tiff(pages=2):
    directory_length = 2 + 4 * 12 + 4
    payload = 8 + pages * directory_length
    data = b"II" + struct.pack("<HI", 42, 8)
    for page in range(pages):
        tags = [(256, 2), (257, 1), (273, payload + page * 2), (279, 2)]
        data += struct.pack("<H", 4)
        data += b"".join(struct.pack("<HHII", tag, 4, 1, value) for tag, value in tags)
        data += struct.pack("<I", 8 + (page + 1) * directory_length if page + 1 < pages else 0)
    return data + b"\1\2" * pages


class VerifyTiffsTests(unittest.TestCase):
    def test_all_pages_are_discovered_and_payload_truncation_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "two pages.TIFF"
            path.write_bytes(tiny_tiff())
            self.assertEqual(VERIFY["inspect_tiff"](path), [{"offset": 8, "size": [2, 1]}, {"offset": 62, "size": [2, 1]}])
            path.write_bytes(tiny_tiff()[:-1])
            with self.assertRaisesRegex(ValueError, "payload"):
                VERIFY["inspect_tiff"](path)

    def test_gdal_all_bands_and_overviews_require_checksums(self):
        directory = {"offset": 8, "size": [2, 1]}
        for bands in ([{}], [{"checksum": 1}, {}], [{"checksum": 1, "overviews": [{}]}], [{"checksum": -1}]):
            completed = subprocess.CompletedProcess([], 0, json.dumps({"size": [2, 1], "bands": bands}), "")
            with patch.object(VERIFY["subprocess"], "run", return_value=completed), self.assertRaises(ValueError):
                VERIFY["decoded_page"]("gdalinfo", Path("image with spaces.tif"), directory, 10)

    def test_zero_exit_with_gdal_error_fails(self):
        completed = subprocess.CompletedProcess([], 0, '{"size":[2,1],"bands":[{"checksum":1}]}', "ERROR 1: truncated JPEG\n")
        with patch.object(VERIFY["subprocess"], "run", return_value=completed), self.assertRaisesRegex(ValueError, "gdalinfo failed"):
            VERIFY["decoded_page"]("gdalinfo", Path("image.tif"), {"offset": 8, "size": [2, 1]}, 10)

    def test_jpeg_warning_with_success_exit_and_checksums_requires_review(self):
        completed = subprocess.CompletedProcess([], 0, '{"size":[2,1],"bands":[{"checksum":1234}]}',
                                                "Warning 1: Premature end of JPEG file\n")
        with patch.object(VERIFY["subprocess"], "run", return_value=completed), self.assertRaisesRegex(ValueError, "diagnostics require review"):
            VERIFY["decoded_page"]("gdalinfo", Path("image.tif"), {"offset": 8, "size": [2, 1]}, 10)

    def test_command_is_filename_safe_and_disables_pam(self):
        completed = subprocess.CompletedProcess([], 0, '{"size":[2,1],"bands":[{"checksum":0}]}', "")
        with patch.object(VERIFY["subprocess"], "run", return_value=completed) as run:
            VERIFY["decoded_page"]("gdalinfo", Path("image $x; with spaces.tif"), {"offset": 62, "size": [2, 1]}, 10)
        self.assertEqual(run.call_args.args[0][-1], "GTIFF_DIR:off:62:image $x; with spaces.tif")
        self.assertNotIn("shell", run.call_args.kwargs)
        self.assertEqual(run.call_args.kwargs["env"]["GDAL_PAM_ENABLED"], "NO")

    def test_all_pages_decoded_but_base_mode_covers_only_first(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "two.tif"; path.write_bytes(tiny_tiff())
            before = VERIFY["signature"](path)
            with patch.dict(VERIFY["verify_file"].__globals__, {"decoded_page": lambda *args: {"offset": args[2]["offset"]}}):
                all_result = VERIFY["verify_file"](path, before, "gdalinfo", True, False, 10)
                base_result = VERIFY["verify_file"](path, before, "gdalinfo", False, False, 10)
            self.assertEqual(all_result["decodedIfdCount"], 2)
            self.assertEqual(base_result["decodedIfdCount"], 1)

    def test_change_during_failed_decode_is_deferred_not_corrupt(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "upload.tif"; path.write_bytes(tiny_tiff())
            before = VERIFY["signature"](path)
            def changes_then_fails(*args):
                path.write_bytes(tiny_tiff() + b"new upload bytes")
                raise ValueError("read failed")
            with patch.dict(VERIFY["verify_file"].__globals__, {"decoded_page": changes_then_fails}):
                result = VERIFY["verify_file"](path, before, "gdalinfo", True, False, 10)
            self.assertEqual(result["status"], "deferred")

    def test_recent_upload_and_empty_inventory_are_incomplete(self):
        with tempfile.TemporaryDirectory() as folder:
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(VERIFY["main"](["--root", folder, "--headers-only", "--stable-seconds", "0"]), 2)
            (Path(folder) / "new.tif").write_bytes(tiny_tiff())
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                result = VERIFY["main"](["--root", folder, "--headers-only", "--stable-seconds", "0"])
            self.assertEqual(result, 2)
            summary = json.loads(output.getvalue().splitlines()[-1])
            self.assertEqual(summary["deferred"], 1)
            self.assertFalse(summary["allSelectedPixelsDecoded"])

    def test_corruption_is_nonzero_and_header_mode_cannot_claim_pixels(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "old.tif"; path.write_bytes(tiny_tiff())
            args = ["--root", folder, "--headers-only", "--stable-seconds", "0", "--min-age-seconds", "0"]
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(VERIFY["main"](args), 0)
            self.assertFalse(json.loads(output.getvalue().splitlines()[-1])["allSelectedPixelsDecoded"])
            path.write_bytes(tiny_tiff()[:-1])
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(VERIFY["main"](args), 1)
            self.assertEqual(json.loads(output.getvalue().splitlines()[-1])["failedPaths"], [str(path.resolve())])


if __name__ == "__main__":
    unittest.main()
