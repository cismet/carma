# INPHO oblique metadata importer

`import-prj.py` is the canonical metadata conversion entrypoint for the oblique
viewer. It replaces the external prototype's `parse_prj.py` →
`simplify_photos.py` workflow for viewer metadata. Originals and imagery remain
untouched. Python 3.10+ and its standard library are sufficient; no installation
or image-processing command is required.

## Provenance and parser boundary

`vendor/parse_prj.py` is the reference parser snapshot, SHA-256
`3a0fa654c0910427fb78bf0f605bf682d191f9e14fdc7b8111c6d779beda37bd`.
The canonical reader reuses its comment/braced-list preprocessing and number
conversion. Run `import-prj.py`, rather than the reference snapshot, for imports.

The strict reader recognizes top-level blocks and matching named ends, including
`$END_COORDINATE_SYSTEM`, `$END_POINTS` and `$ENDNAV`. It reads PROJECT,
COORDINATE_SYSTEM_SET, CAMERA_DEFINITION, MULTIHEADSYSTEM, PHOTO and STATION
fields. Other project blocks are checked for their boundaries and omitted from
viewer metadata. This is not a lossless archive of an INPHO project.

The supported calibration case is one explicitly active calibration per camera,
`CenterTopLeft` pixels, explicitly zero `PRINCIPAL_POINT_PPA`, and nonsingular CCD affine.
Multiple calibrations and unsupported conventions fail instead of selecting an
arbitrary calibration. The current horizontal CRS is explicitly source-declared
EPSG:25832; height datum remains `unknown` unless supplied by the operator.

## Output contract

The JSON contains `schemaVersion: 1`, `seriesId`, `conventions`, source-camera-ID
keyed `cameras`, source-image-ID keyed `images`, and source checksum provenance.
Camera fields are `sourceId`, `widthPx`, `heightPx`, `focalLengthMm`,
`imageMmToPixelAffine`, `mountRotationDeg` and, when the HEADS table supplies it,
`view` (`left`, `right`, `front`, `back`, `nadir`). Missing mount metadata is
represented as zero additional mount rotation; the importer applies no rotation.
All camera definitions remain present in a subset import.

Image fields are `cameraId`, `positionM: [x,y,z]`, `rotationMatrixRows`, and
`stationId` when declared by a source STATION. Known 2024/2026 numeric ID formats
also supply `lineIndex` and `waypointIndex`. Unknown naming schemes retain their
source IDs without inventing station/group information. Series-qualified
runtime identity is the viewer's responsibility; the source names stay intact.

`--image-root` and `--image-base-url` optionally inventory uploaded originals
without decoding pixels. Each matching source image receives
`assets.original: {href, type: "image/tiff", roles: ["data"]}` using the actual
relative folder and filename. These asset fields follow STAC conventions;
the catalog remains the normalized INPHO format. Missing uploads retain their
orientation without an invented asset URL. `--compact` removes JSON whitespace
for a served catalog.

Conventions declare `positionUnit: m`, `worldAxes: [easting,northing,up]`,
`rotationLayout: row-major`, `rotationTransform: world-to-camera`, and
`opticalAxis: -z`. The source matrix rows and their image-mm frame are preserved;
`cameraAxes: source-image-mm` does not assert an independently verified physical
sensor mounting. Pixel convention is top-left origin, x right, y down, and
`pixelReference: pixel-center`: `[0,0]` identifies the first pixel's centre.
The affine maps image millimetres to those pixel coordinates.

`CAMERA_MOUNT_ROTATION` is retained but not folded into either matrix or affine.
The INPHO source convention and CARMA's established decoder use world-to-camera
rows with optical `-z`; physical TIFF rotation, sensor/up alignment, and ground
registration still need verification. The EXT_ORI timestamp is omitted: it is
not verified acquisition time. No lens-undistortion or footprint synthesis is
performed. Every NA record remains available; callers choose whether to offer
nadir navigation.

Validation rejects duplicate IDs, missing camera references, nonfinite numbers,
non-rotation matrices, focal inconsistencies, duplicate station assignments,
unknown subset IDs, and mismatched expected source counts. Validation completes
before an atomic output replacement; errors produce a nonzero exit code.

## Reproducible import

Run the canonical importer beside the server-owned imagery directory:

```sh
python3 scripts/oblique-viewer/import-prj.py \
  --input /path/to/flight.prj \
  --output /path/to/imagery/catalog.json \
  --series-id flight-id --height-datum unknown \
  --image-root /path/to/uploaded-originals \
  --image-base-url https://images.example/flight/tiff \
  --compact
```

Supply `--expected-images`, `--expected-cameras` and `--expected-stations`
when source counts are known. `--image-ids` accepts one source ID per line or
the semicolon CSV's `photo` column for a subset. Full-source counts and
rotations are checked before filtering; all camera definitions remain present.
The CSV selects IDs only and never supplies poses.

Use `--height-datum dhhn2016` or `--height-datum ellipsoidal` after verifying
the source Z convention. Source positions, matrices and camera calibration
remain unchanged. Output order and provenance are deterministic; no execution
timestamp or absolute local path enters the catalog.

Publish catalogs, camera calibrations and series configuration on the imagery
server. The viewer host supplies `seriesConfigURI` to a JSON document containing
`schemaVersion: 1` and a `series` array. Neither production catalogs nor
delivery-specific configuration belongs in committed sources. Publishing
metadata does not create JPEG pyramids; the client can use range-readable TIFF
pages. Image processing and watermarking are separate operations.

Filename coverage and TIFF directory checks do not establish pixel integrity
or certified COG conformance.

## Tests

```sh
python3 -m unittest discover -s scripts/oblique-viewer -p 'test_*.py'
```

Small synthetic fixtures cover named block ends, scientific notation, malformed
rotations, ID/reference collisions, nadir retention, subsets, failure exit codes,
output preservation, deterministic reruns, Classic TIFF/BigTIFF truncation and
GDAL errors that occur despite exit code zero. Unit tests use synthetic fixtures; delivery catalogs, configurations and TIFFs stay on the server.

## Read-only delivery audit

`audit-delivery.py` checks a PRJ against image basenames, case-insensitively. It
reports missing/duplicate IDs, formats/bytes, free disk space, checksum-manifest
paths, and TIFF dimensions, IFDs, strip/tile payload bounds and source-camera
dimensions. No remote or local output files are written by this audit script.
An incomplete delivery or failed validation returns nonzero.

It can run via SSH stdin without installing a remote script:

```sh
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes amy.cismet.de \
  'python3 - --prj /mnt/7TB/wupp2026/schraeg/metadata/ImageOrientation_MatchAT.prj --root /mnt/7TB/wupp2026 --expected-count 30172 --validate-gdal-info --gdal-container gdal36_gdal3-6-environment_1' \
  < scripts/oblique-viewer/audit-delivery.py
```

`--validate-gdal-info` adds a header/metadata read using an installed GDAL CLI.
`--gdal-container` uses an existing container and `/mnt/7TB` → `/data` mount;
it never creates or restarts one. Mount paths are overridable. GDAL PAM writing
is disabled and its cache is limited to 512 MB per worker.

`--full-read` requests checksums for base bands and GDAL-visible overviews.
Ordinary additional TIFF pages are not necessarily recognized as GDAL overviews:
use `--read-pages 2,3` to additionally decode those exact 1-based TIFF directories.
Checksums test decoder reads; they are not cryptographic comparison with a
supplier's manifest. Header checks alone do not validate pixels. The audit
reports COG layout indicators but does not certify COG conformance.

## Verify TIFFs during a delivery upload

`verify-tiffs.py` is a standalone stdlib checker, independent of the PRJ and
delivery completeness. It walks `.tif`/`.tiff` files recursively, checks Classic
TIFF/BigTIFF directory and payload ranges, and asks GDAL to decode every band.
`--all-pages` additionally checks every linked IFD/SubIFD by its actual byte
offset; it does not assume ordinary TIFF pages are GDAL overviews.

With GDAL installed on the machine holding the files:

```sh
python3 scripts/oblique-viewer/verify-tiffs.py \
  --root /mnt/storagebox/luftbildschraegaufnahmen2026 \
  --workers 4 --all-pages > tiff-verification.jsonl
```

On amy, the existing long-running GDAL container does not mount this new upload
directory. Run the cached image with an explicit read-only bind instead. From
the checkout, this saves only a local JSONL report and removes its temporary
container when finished; it installs nothing and writes no source or PAM files:

```sh
ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes amy.cismet.de \
  'docker run --rm --pull=never --read-only --network=none -i -e PYTHONDONTWRITEBYTECODE=1 -e GDAL_PAM_ENABLED=NO -e GDAL_CACHEMAX=512 -v /mnt/storagebox/luftbildschraegaufnahmen2026:/input:ro --entrypoint /usr/bin/python3 osgeo/gdal:ubuntu-full-3.6.3 - --root /input --workers 4 --all-pages' \
  < scripts/oblique-viewer/verify-tiffs.py > tiff-verification.jsonl
```

The default age threshold is 120 seconds since the latest mtime/ctime change;
a five-second stability window and before/after stat checks defer changing
files. Deferred files are not labelled corrupt. Repeat after the upload has
finished: pauses and preserved timestamps cannot prove that an uploader has
finished a file. New files arriving after the inventory need another run.

The report contains an inventory, one JSON record per file, and a final summary
with `failedPaths` and `deferredPaths`. Exit codes are 0 for a completed pass,
1 for verification/inventory errors, and 2 for an empty inventory or deferred
files. GDAL read errors fail even if its process returns exit 0; every decoded
band/overview must return a valid checksum. GDAL warnings require inspection
and fail this conservative check even when decoded checksums exist. A failed
check is not an instruction to delete the original. Checksums demonstrate decoding,
not cryptographic equality with a supplier's originals.

`--headers-only` checks structure quickly without GDAL or pixel decoding.
`--limit 1` is a smoke test and explicitly marks limited inventory coverage.
Neither mode proves the full delivery valid or complete.


## Local viewer

Open the Geoportal oblique route with the oblique feature flag enabled. Local
development uses the same public imagery configuration as published previews.
The server configuration determines the available and initially enabled series.
Import and verification scripts above do not require a local image server.
