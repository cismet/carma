import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch


MODULE = runpy.run_path(str(Path(__file__).with_name("import-prj.py")))
parse_document = MODULE["parse_document"]
normalize = MODULE["normalize"]
InphoError = MODULE["InphoError"]
AUDIT = runpy.run_path(str(Path(__file__).with_name("audit-delivery.py")))


def camera(camera_id, focal):
    return f"""$CAMERA_DEFINITION
  $ID : {camera_id}
  $CCD_COLUMNS : 100
  $CCD_ROWS : 80
  $PIXEL_REFERENCE : CenterTopLeft
  $CAMERA_MOUNT_ROTATION : 270
  $ACTIVE_CALIBRATION : 1
  $CALIBRATION_SET :
    $ID : 1
    $CCD_INTERIOR_ORIENTATION :
      10 0 49.5
      0 -10 39.5
    $FOCAL_LENGTH : {focal}
    $PRINCIPAL_POINT_PPA : 0 0
    $END
  $END
$END
"""


def photo(image_id, camera_id, focal):
    return f"""$PHOTO
  $PHOTO_NUM : {image_id}
  $CAMERA_ID : {camera_id}
  $EXT_ORI : 12:00:00 01/01/2026
    {focal} 380000 5680000 1000
    1 0 0
    0 1 0
    0 0 1
$END
"""


def fixture():
    return ("""$PROJECT 15.0.0
  $ANGULAR_UNITS : deg
$END
$COORDINATE_SYSTEM_SET
  $ID : ETRS89 UTM32 GCG2016
  $COORDINATE_SYSTEM : PROJCS["UTM32",AUTHORITY["EPSG","25832"]]
$END_COORDINATE_SYSTEM
""" + camera("O42_LE", 124) + camera("O42_NA", 80)
        + photo("LE_01_7420", "O42_LE", 124) + photo("NA_01_7420", "O42_NA", 80)
        + """$STATION
  $STATION_ID : _01_7420
  $IMAGES : { LE_01_7420 NA_01_7420 }
$END
$MULTIHEADSYSTEM
  $HEAD_DATASET :
    $ID : 1
    $HEADS :
      O42_LE 1 left LE
      O42_NA 1 nadir NA
    $END_HEADS
  $END
$END
""")


class ImportPrjTests(unittest.TestCase):
    def test_named_coordinate_end_preserves_first_station_and_nadir(self):
        result, counts = normalize(parse_document(fixture()), "flight-2026")
        self.assertEqual(counts, {"images": 2, "cameras": 2, "stations": 1})
        self.assertEqual(result["images"]["LE_01_7420"]["stationId"], "_01_7420")
        self.assertEqual(result["cameras"]["O42_NA"]["view"], "nadir")
        self.assertEqual(result["conventions"]["verticalDatum"], "unknown")
        self.assertEqual(result["conventions"]["pixelReference"], "pixel-center")
        self.assertNotIn("acquisitionTime", result["images"]["LE_01_7420"])

    def test_scientific_notation_is_numeric(self):
        text = fixture().replace("1 0 0\n", "+1e0 0.0E-2 -0e1\n").replace("380000", "3.8e5")
        result, _ = normalize(parse_document(text), "flight")
        self.assertEqual(result["images"]["LE_01_7420"]["positionM"][0], 380000)

    def test_duplicate_source_ids_fail(self):
        variants = {
            "image": fixture() + photo("LE_01_7420", "O42_LE", 124),
            "camera": fixture() + camera("O42_LE", 124),
            "station": fixture() + "$STATION\n  $STATION_ID : _01_7420\n  $IMAGES : { LE_01_7420 }\n$END\n",
        }
        for label, text in variants.items():
            with self.subTest(label=label), self.assertRaisesRegex(InphoError, "duplicate"):
                normalize(parse_document(text), "flight")

    def test_invalid_pose_or_camera_reference_fails(self):
        variants = {
            "rotation": fixture().replace("1 0 0\n", "2 0 0\n", 1),
            "missing_camera": fixture().replace("$CAMERA_ID : O42_LE", "$CAMERA_ID : MISSING"),
            "focal_mismatch": fixture().replace("124 380000", "120 380000", 1),
            "nonfinite": fixture().replace("380000", "1e999", 1),
            "singular_affine": fixture().replace("10 0 49.5", "0 0 49.5", 1),
        }
        for label, text in variants.items():
            with self.subTest(label=label), self.assertRaises(InphoError):
                normalize(parse_document(text), "flight")

    def test_missing_or_wrong_named_end_fails(self):
        for text in (fixture().removesuffix("$END\n"), fixture().replace("$END_COORDINATE_SYSTEM", "$END_PHOTO")):
            with self.subTest(text=text[-25:]), self.assertRaises(InphoError):
                parse_document(text)

    def test_unrecognized_horizontal_crs_fails(self):
        with self.assertRaisesRegex(InphoError, "EPSG:25832"):
            normalize(parse_document(fixture().replace('"25832"', '"25833"')), "flight")

    def test_ambiguous_calibration_and_nonzero_principal_point_fail(self):
        variants = (
            fixture().replace("$FOCAL_LENGTH : 124", "$FOCAL_LENGTH : 124\n    $FOCAL_LENGTH : 120", 1),
            fixture().replace("$PRINCIPAL_POINT_PPA : 0 0", "$PRINCIPAL_POINT_PPA : 0.1 0", 1),
            fixture().replace("    $PRINCIPAL_POINT_PPA : 0 0\n", "", 1),
        )
        for text in variants:
            with self.assertRaises(InphoError):
                normalize(parse_document(text), "flight")

    def test_cli_subset_and_bytes_are_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output, ids = root / "flight.prj", root / "orientation.json", root / "ids.csv"
            source.write_text(fixture())
            ids.write_text(";photo;x;y;z\n;LE_01_7420;0;0;0\n")
            args = ["--input", str(source), "--output", str(output), "--series-id", "flight",
                    "--image-ids", str(ids), "--expected-images", "2", "--expected-stations", "1", "--expected-cameras", "2"]
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(MODULE["main"](args), 0)
                original = output.read_bytes()
                self.assertEqual(MODULE["main"](args), 0)
            self.assertEqual(original, output.read_bytes())
            metadata = json.loads(original)
            self.assertEqual(set(metadata["images"]), {"LE_01_7420"})
            self.assertEqual(len(metadata["cameras"]), 2)
            self.assertEqual(metadata["provenance"]["sourceSha256"], hashlib.sha256(source.read_bytes()).hexdigest())

    def test_cli_failure_keeps_existing_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output = root / "bad.prj", root / "orientation.json"
            source.write_text(fixture() + photo("LE_01_7420", "O42_LE", 124))
            output.write_text("existing-output")
            with contextlib.redirect_stderr(io.StringIO()):
                status = MODULE["main"](["--input", str(source), "--output", str(output), "--series-id", "flight"])
            self.assertEqual(status, 1)
            self.assertEqual(output.read_text(), "existing-output")

    def test_subset_missing_id_or_count_mismatch_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output, ids = root / "flight.prj", root / "out.json", root / "ids.txt"
            source.write_text(fixture())
            ids.write_text("DOES_NOT_EXIST\n")
            basic = ["--input", str(source), "--output", str(output), "--series-id", "flight"]
            for extra in (["--image-ids", str(ids)], ["--expected-images", "1"]):
                with contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(MODULE["main"](basic + extra), 1)
                self.assertFalse(output.exists())

    def test_cli_refuses_to_replace_source(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "original.prj"
            source.write_text(fixture())
            original = source.read_bytes()
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(MODULE["main"](["--input", str(source), "--output", str(source), "--series-id", "flight"]), 1)
            self.assertEqual(source.read_bytes(), original)

    def test_2024_head_aliases_preserve_declared_view(self):
        result, _ = normalize(parse_document(fixture().replace("O42_LE 1 left LE", "O42_LE 1 left _1760")), "flight-2024")
        self.assertEqual(result["cameras"]["O42_LE"]["view"], "left")

    def test_prototype_snapshot_has_recorded_checksum(self):
        source = Path(__file__).parent / "vendor" / "parse_prj.py"
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),
                         "3a0fa654c0910427fb78bf0f605bf682d191f9e14fdc7b8111c6d779beda37bd")

    def test_tiff_and_bigtiff_ranges_detect_truncation(self):
        for big in (False, True):
            with self.subTest(big=big), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "source.tif"
                payload_offset = 16 + 8 + 6 * 20 + 8 if big else 8 + 2 + 6 * 12 + 4
                tags = [(256, 4, 2), (257, 4, 1), (259, 3, 1), (274, 3, 1),
                        (273, 16 if big else 4, payload_offset), (279, 16 if big else 4, 6)]
                header = b"II" + struct.pack("<HHHQ", 43, 8, 0, 16) if big else b"II" + struct.pack("<HI", 42, 8)
                entries = b"".join(struct.pack("<HHQQ", tag, kind, 1, value) if big else struct.pack("<HHII", tag, kind, 1, value)
                                    for tag, kind, value in tags)
                data = header + struct.pack("<Q" if big else "<H", 6) + entries + struct.pack("<Q" if big else "<I", 0) + b"\0" * 6
                path.write_bytes(data)
                self.assertEqual(AUDIT["tiff_structure"](path)["dimensions"], [2, 1])
                path.write_bytes(data[:-1])
                with self.assertRaisesRegex(ValueError, "payload"):
                    AUDIT["tiff_structure"](path)

    def test_gdal_read_error_is_failure_even_with_exit_zero(self):
        result = subprocess.CompletedProcess([], 0, '{"size":[2,1],"bands":[{"checksum":12}]}', "ERROR 1: JPEG data truncated\n")
        with patch.object(AUDIT["subprocess"], "run", return_value=result), self.assertRaisesRegex(ValueError, "read error"):
            AUDIT["gdal_audit"]("gdalinfo", Path("image.tif"), True)

    def test_gdal_checksum_absence_cannot_claim_pixel_decoding(self):
        result = subprocess.CompletedProcess([], 0, '{"size":[2,1],"bands":[{}]}', "")
        with patch.object(AUDIT["subprocess"], "run", return_value=result), self.assertRaisesRegex(ValueError, "checksums"):
            AUDIT["gdal_audit"]("gdalinfo", Path("image.tif"), True)


if __name__ == "__main__":
    unittest.main()
