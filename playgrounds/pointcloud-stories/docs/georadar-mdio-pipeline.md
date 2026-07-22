# Georadar LAZ-to-MDIO pipeline and publication readiness

Status reviewed: 2026-07-22

## Decision

The amplitude dataset is technically stable enough for an internal or explicitly experimental preview. It is **not ready for an authoritative public release**. The conversion is lossless, chunk access works, and a clean rebuild reproduces the binary arrays. The remaining blockers concern spatial provenance, interpretation metadata, publication rights, and release packaging rather than storage integrity.

In particular, the delivered LAZ files declare `EPSG:32632`, while the current derived manifests declare `EPSG:25832`. No absolute vertical datum, GNSS quality record, sensor lever arm, boresight, timestamps, or independently surveyed control points were supplied. The surface trajectory can deviate by more than 2 m in narrow street spaces and also appears to contain a systematic offset. Consequently, the current pose arrays must not be presented as evidence of decimetre accuracy.

## What was converted

The delivered Georadar data uses LAS/LAZ as a container for a regularly ordered radar tensor. The conversion does not voxelise an ordinary spatial point cloud. It reconstructs the original tensor from record order:

```text
Configured local source delivery
  -> 27 volume LAZ files plus 27 delivered surface-trajectory LAZ files
  -> lossless R16 tensor and JSON metadata for each capture
  -> MDIO v1 dataset backed by sharded Zarr v3
```

For every capture, the LAZ `Intensity` field becomes an unchanged `uint16` amplitude value. The fixed logical cross-section is 25 traces by 136 depth samples. The longitudinal slice count varies with the length of the capture. The intermediate R16 order is `[depth, trace, slice]`; MDIO exposes the same values as `[slice, trace, depth]` for Xarray-style access.

Spatial placement is kept separate from amplitude. The Zarr store contains:

- `anchor_horizontal_m`: one horizontal anchor per slice;
- `basis_frd_enu`: one orthonormal Forward/Right/Down basis per slice;
- `elevation_offset_m`: currently `NaN`, explicitly unresolved;
- `pose_status`: currently `horizontal-anchor-and-heading-only`.

No alignment correction, terrain snapping, noise gate, resampling, or display transfer function is baked into the amplitude array.

## Reproducible build

The reviewed pipeline was introduced in Git commit `e2f30863461e315f300f10b8e23317d1cc812ac7`. Source locations and delivery identifiers stay outside the repository. Configure an extracted local source directory through `.env.local` or pass it directly to the derivation scripts.

The tested environment was:

| Component       | Reviewed version or pin                       |
| --------------- | --------------------------------------------- |
| Node.js         | 24.14.0 tested; not yet repository-pinned     |
| Node dependency | `copc` 0.0.8, resolved by `package-lock.json` |
| uv              | 0.11.29 tested                                |
| Python          | `>=3.12,<3.13`                                |
| multidimio      | 1.2.0                                         |
| NumPy           | 2.4.6                                         |
| Zarr            | format 3 through MDIO/Xarray                  |

Python and the two direct dependencies are declared in the PEP 723 header of `derive-georadar-mdio.py`, so `uv run --script` creates the environment automatically. For release-grade bit reproducibility, the Node version and all transitive Python dependencies still need a lock or a container image digest.

From the repository root:

```bash
pnpm install --frozen-lockfile

export GEORADAR_SOURCE_ROOT=.data/source-inputs/georadar
export POINTCLOUD_DATA_ROOT=.data

node playgrounds/pointcloud-stories/scripts/derive-georadar-survey.mjs \
  --source-root "$GEORADAR_SOURCE_ROOT" \
  --output-root "$POINTCLOUD_DATA_ROOT/derived/georadar-survey"

POINTCLOUD_DATA_ROOT="$POINTCLOUD_DATA_ROOT" \
  playgrounds/pointcloud-stories/scripts/build-georadar-mdio-survey.sh
```

The first command reconstructs `capture-001.r16` through `capture-027.r16` and their metadata. The second command creates `capture-001.mdio` through `capture-027.mdio`. Each MDIO directory is a normal Zarr-v3 store. Amplitude is stored in one physical shard per capture with independently range-readable 128-slice inner chunks. The data is uncompressed to keep decoding simple and byte comparison direct.

## File sizes

These values were recalculated from the current local artifacts, not copied from nominal estimates.

| Artifact                                 |    Exact size | Binary MiB |
| ---------------------------------------- | ------------: | ---------: |
| Source ZIP                               | 696,074,162 B | 663.83 MiB |
| 27 selected volume LAZ files             | 596,388,559 B | 568.76 MiB |
| 27 selected surface-trajectory LAZ files |   3,962,726 B |   3.78 MiB |
| Selected LAZ inputs in total             | 600,351,285 B | 572.54 MiB |
| 27 lossless R16 masters                  | 570,730,800 B | 544.29 MiB |
| 27 complete MDIO/Zarr stores             | 590,065,191 B | 562.73 MiB |
| Zarr/axes/pose overhead over R16         |  19,334,391 B |  18.44 MiB |

The 27 stores contain 594 physical files. Total storage overhead is 3.388%. Individual R16 masters range from 673,200 B to 66,415,600 B; complete stores range from 700,691 B to 68,001,306 B.

Capture 026, the principal viewer example, contains a `3515 x 25 x 136 uint16` tensor. Its R16 master is 23,902,000 B and its complete MDIO/Zarr store is 24,739,383 B. A full 128-slice amplitude chunk is 870,400 B.

## Integrity and quality metrics

### Storage and conversion integrity

| Metric                                                |                   Result |
| ----------------------------------------------------- | -----------------------: |
| Captures                                              |                       27 |
| Aggregate recorded trajectory length                  |               6,244.33 m |
| Longitudinal slices                                   |                   83,931 |
| Traces per slice                                      |      25 for all captures |
| Depth samples per trace                               |     136 for all captures |
| Amplitude samples                                     |              285,365,400 |
| Stored amplitude bytes                                |              570,730,800 |
| Current R16 hashes matching Zarr source metadata      |                  27 / 27 |
| Samples different from the assumed centre code 32,768 | 285,350,264 / 99.994696% |

The exporter reopens every completed store through MDIO, restores the source axis order, and compares every amplitude and pose value. `fill_value=None` is required because 65,535 is a valid source code and must not be masked.

As a fresh reproducibility check on 2026-07-20, Capture 022 was rebuilt from the original volume and surface LAZ files. The rebuilt R16 was byte-identical with SHA-256 `ebb010274cd297045bf4aaa6e53bfc1ec945ba20209e1cea7e7c919ec63c09e0`. The Zarr rebuild had the same 22-file layout, size, amplitude, axes, and pose chunks; 21 of 22 files were bit-identical. Only root `zarr.json` differed due to its generated `createdOn` timestamp.

### Retrieval metrics

The local five-run Capture-026 benchmark compares the previous complete-R16 startup with one cold, full-resolution 10 m MDIO segment:

| Metric                   | Complete R16 | Cold MDIO segment | MDIO share |
| ------------------------ | -----------: | ----------------: | ---------: |
| HTTP transfer            | 23,902,000 B |       1,748,476 B |      7.32% |
| Prepared CPU working set | 71,706,000 B |       3,576,800 B |      4.99% |
| GPU amplitude texture    | 47,804,000 B |       1,836,000 B |      3.84% |
| Local retrieval median   |     19.55 ms |           1.34 ms |      6.88% |
| Preparation median       |     49.20 ms |           6.97 ms |     14.17% |

The adjacent segment needs only one additional 870,400 B chunk when the shared chunk is warm. A complete MDIO amplitude fetch is 24,378,876 B, about 2.0% more than R16; the benefit comes from spatial selection and bounded working sets, not compression.

### Scientific and spatial quality boundary

The following are strong structural checks, but not calibration certificates:

- all 27 captures reconstruct to exactly 25 equal-length surface traces;
- every volume point count is an integer multiple of the corresponding surface point count;
- five delivered reference levels (`0`, `25`, `75`, `150`, and `250 mm`) consistently imply `DepthMm = -Z * 20` across all 27 files;
- the full 16-bit amplitude carrier is preserved without filtering.

No defensible horizontal RMSE, CE90, vertical accuracy, signal-to-noise ratio, physical depth accuracy, or material-classification accuracy can be reported. The required reference data and instrument metadata were not supplied. The 32,768 signal centre and the 50:1 stored-Z-to-depth scale remain well-supported inferences, not provider-confirmed calibration.

## Publication gates

Do not publish the present stores as an authoritative geospatial dataset until all of the following are resolved:

1. Obtain provider confirmation of the horizontal CRS and correct the `EPSG:32632` versus `EPSG:25832` contradiction.
2. Document the vertical reference and replace unresolved or manually anchored heights with a provenance-backed placement, or publish the data explicitly as a non-spatial/local tensor.
3. Obtain original GNSS logs, fix quality, timestamps, lever arm, boresight, and independently surveyed control points; then report actual accuracy metrics.
4. Obtain confirmation of the depth scaling, signal offset, antenna and acquisition parameters, time zero, processing chain, and velocity or permittivity assumptions.
5. Record an explicit licence and publication authorization for source and derivatives.
6. Extend `derived/provenance.json` with all 27 R16 and MDIO/Zarr outputs, immutable checksums, the conversion commit, and the environment lock or container digest.
7. Publish immutable versioned objects and manifests through HTTPS with working `Range`, `Content-Range`, `Accept-Ranges`, and CORS headers.

Until then, a staging release is acceptable only if it is labelled **experimental**, makes the unresolved pose status visible, avoids any decimetre-accuracy or physical-layer claim, and is not treated as a reference dataset by downstream systems.
