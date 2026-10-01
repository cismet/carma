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

From the repository root, using a verified local copy of the source project:

```sh
python3 scripts/oblique-viewer/import-prj.py \
  --input /path/to/ImageOrientation_MatchAT.prj \
  --output output/oblique-viewer/2026/orientation.json \
  --series-id wuppertal-2026 \
  --expected-images 30172 --expected-cameras 5 --expected-stations 7351

python3 scripts/oblique-viewer/import-prj.py \
  --input /path/to/ImageOrientation_MatchAT.prj \
  --image-ids /path/to/orientation.test.csv \
  --output output/oblique-viewer/2026/orientation.rathaus.json \
  --series-id wuppertal-2026-rathaus \
  --expected-images 30172 --expected-cameras 5 --expected-stations 7351
```

`--image-ids` accepts one source ID per line or the supplied semicolon CSV's
`photo` column. Full-source counts and rotations are checked before filtering.
Use `--height-datum dhhn2016` or `--height-datum ellipsoidal` only after verifying
the source Z convention. Output order and provenance are deterministic; no
execution timestamp or absolute local path enters the output.

The verified 2026 source has 30,172 images: 23,823 oblique and 6,349 nadir, five
cameras, and 7,351 stations. The Rathaus subset has 41 oblique images. Matching
CSV/PRJ image names do not imply matching positions: the observed median 3D
position difference is 29.18 m, maximum 62.39 m. This importer uses PRJ poses
consistently and never combines CSV positions with PRJ matrices. CSV may select
IDs only; its camera poses are not imported.

The 2026 calibration declares 124 mm oblique lenses (the system name says f120)
and 80 mm nadir. LE/RI's principal y differs from the portrait image centre by
3,202.847 pixels; mount metadata and the NA comment also disagree. These source
values remain visible for later alignment checks. No source-value correction
is guessed here.

Original PRJs and generated full-flight JSON stay outside committed sources.
Generation alone does not make TIFFs browser-viewable: the currently supplied
test imagery is TIFF and the served 2026 image directory has no viewer JPEGs.
Publishing metadata or imagery is a separate operation.

## Tests

```sh
python3 -m unittest discover -s scripts/oblique-viewer -p 'test_*.py'
```

Small synthetic fixtures cover named block ends, scientific notation, malformed
rotations, ID/reference collisions, nadir retention, subsets, failure exit codes,
output preservation, deterministic reruns, Classic TIFF/BigTIFF truncation and
GDAL errors that occur despite exit code zero. The committed 41-image Rathaus catalog is the only delivery-data fixture; full-flight metadata and TIFFs stay external.

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


## Reproduce the local originals demo

From the repository root, with repository dependencies installed, run the UI
and bridge in separate terminals:

```sh
npx vite --config apps/geoportal/vite.config.mts \
  --host localhost --port 4201 --strictPort
```

```sh
python3 scripts/oblique-viewer/serve-originals.py \
  --allow-origin http://localhost:4201 \
  --additional-metadata output/oblique-viewer/2026/orientation.json \
  --optimistic-series wuppertal-2026
```

Open [the local oblique route](http://localhost:4201/#/oblique?ff=oblique&lat=51.27174&lng=7.20028&zoom=17).
The route starts the viewer and offers independent 03/2024, 04/2026, and
04/2026 Sample sources. Their compact footprint labels are 2024, 2026, and
2026Test; the label is omitted with only one active series. The full 2026
source also enables the Nadir navigation option. Existing 2024 previews and downloads retain their direct
`/2024/{3,1}/{sourceId}.jpg` URLs.

Create the additional catalog with the reproducible full-2026 import above,
or pass another normalized full-2026 JSON path.
By default the bridge intersects each catalog with available stable TIFF IDs.
The explicit, repeatable --optimistic-series option retains every pose for
the named configured series, including originals that have not arrived yet.
It keeps the original-file whitelist limited to stable files actually found.
A missing preview or original returns 404; optimistic metadata does not certify
asset availability. Catalogs not named by that option remain filtered.

The full 2026 catalog includes 30,172 orientations and 6,349 nadir records;
the independently selectable sample catalog contains 41 oblique images.
Audit the actual originals separately before exposing full-flight assets.

This loopback bridge uses SSH access to amy and the existing GDAL container
under `/data/wupp2026/schraeg/_test-rathaus`. Its primary catalog defaults to
the committed `apps/geoportal/public/oblique/2026-rathaus/metadata.json`.
`--metadata`, repeatable `--additional-metadata`, `--ssh-host`, `--container`,
`--image-root`, `--port`, and `--allow-origin` are explicit overrides. The
container must already see the selected image root; the current container's
original image mount does not include the Storagebox upload location.

Each catalog preserves its own validated `seriesId`, source camera poses,
calibration, provenance, and unknown height datum. `/metadata.json` serves the
primary Rathaus catalog; `/metadata/wuppertal-2026.json` serves the additional
available-2026 catalog. Other additional catalogs are addressed by
`/metadata/{seriesId}.json`. The original-image whitelist contains only actual stable originals referenced
by the configured catalogs. Each metadata response preserves its own series ID
and follows that series' explicit availability or optimistic mode. Restart the bridge after uploads or catalog updates to
refresh this inventory.

The scan is bounded to 50,000 originals and a 32 MB inventory response. It
skips symlinks, empty files, files modified within the previous 120 seconds,
and files whose size, modification time, or identity changes between stat
reads. This stability filter does not certify complete pixel decoding.

`/3/{sourceId}.jpg`, `/2/{sourceId}.jpg`, and `/1/{sourceId}.jpg` render requested
views with maximum edges 1024, 2048, and 4096 pixels respectively. Levels
4–6 provide 512, 256 and 128-pixel thumbnails; level 0 reads the original
full-resolution page without upscaling. The viewer requests sharper levels
as the displayed image grows, keeping the decoded preview if an upgrade is
unavailable. These are
development sizes. GDAL selects an existing TIFF page with sufficient
resolution and streams a JPEG into a bounded 64 MB RAM cache; at most two
renders run concurrently. JPEG previews use quality 95 and Lanczos resampling.

`/rgb/{sourceId}.png?x=0&y=0&width=1000&height=500&edge=1000` reads a
native-pixel window from the original TIFF page. The source dataset is opened
with GDAL's `-oo OVERVIEW_LEVEL=NONE` option, hiding every overview before
Lanczos resampling. This works with the existing container's verified GDAL 3.3.0
runtime, which predates `gdal_translate -ovr` (introduced in
[GDAL 3.6](https://gdal.org/en/stable/programs/gdal_translate.html#cmdoption-gdal_translate-ovr)).
The RGB request transfers only its rendered crop to the browser; it does not
download the complete TIFF. Coordinates are top-left origin, x right and y down. Width and height
describe source pixels; edge is the requested maximum output edge. Lanczos
downsampling preserves the crop aspect ratio, and a crop smaller than edge
retains its native dimensions without upscaling. The result is lossless RGB
PNG, with no additional JPEG encoding or chroma subsampling. Native full-page
reads can be requested with the source dimensions when the output fits these
bounds; large full-resolution pages must be requested as visible windows.

All five query fields are required exactly once as nonnegative decimal integers;
width, height and edge must be positive. The crop must fit the native image,
coordinates/dimensions must fit signed 32-bit integers, edge must not exceed
8192, and the computed output must not exceed 8,000,000 pixels. Requests that
exceed these bounds return HTTP 400 instead of a silently smaller preview.
The full source/crop/edge cache key shares the bounded RAM cache and two render
workers with JPEG previews. Source whitelisting and allowed origins apply to
every RGB request before remote work.

The verified delivery contains stripped, JPEG-compressed TIFFs with reduced
pages, rather than COGs. PNG rendering preserves the decoded native RGB values
without adding a second lossy encoding; it cannot recover detail discarded by
the source TIFF's existing JPEG compression.

`/original/{sourceId}.tif` streams unchanged original bytes and supports a single
HTTP byte range. No remote packages, containers,
watermarks, or permanent image derivatives are created.

The server binds to `127.0.0.1:8926`; the command above allows CORS only for the
exact origin `http://localhost:4201`. Omitting `--allow-origin` retains the
`http://localhost:4200` default. Unknown source Z is available only through the
explicit development configuration.
Physical image alignment and ground registration still need verification.
