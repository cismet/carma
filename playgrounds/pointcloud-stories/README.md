# Pointcloud Investigation Stories

Focused Storybook for the data and integration questions in wupp#4064 and wupp#4089. It reuses the real `ng-topicmap-playground` point-cloud viewer and organizes it as executable documentation for point clouds, elevation calibration, panoramas, and MapLibre integration. Canvas stories intentionally hide the general playground scene panel: each dataset gets a bare map, while focused adjustments such as elevation datum and offset live in Storybook Controls.

## Run

```bash
cp playgrounds/pointcloud-stories/.env.example \
  playgrounds/pointcloud-stories/.env.local
# Fill local source paths and deployment URLs in .env.local.

playgrounds/pointcloud-stories/scripts/build-tool-images.sh
playgrounds/pointcloud-stories/scripts/build-derived.sh
pnpm exec nx storybook pointcloud-stories
```

Open `http://localhost:4440`.

All scripts resolve paths from this project root. Machine-specific connection details and remote source roots live only in the ignored `.env.local`. The default `.data/` workspace contains the source mirror, derived COPCs and verification reports and is also ignored.

During local development, `vite.config.mts` serves `.data/derived/` with HTTP Range support and exposes one representative delivered GeoJSON file from `.data/source-inputs/`. No point-cloud or volume binaries enter version control or the Storybook build.

## Annotated source catalog

Cross-provider data from wupp#4068 and the reviewed provider deliveries belongs in a separate annotated catalog, not in the worktree. Set `TWIN4ROAD_CATALOG_ROOT` to that catalog and use `scripts/catalog/` to mirror, hash, and index immutable provider files. The catalog groups data by campaign and asset, with `source/`, `annotations/`, and `derived/` directly below the closest parent asset. Machine-specific source mounts stay in the catalog's private `.local/roots.json`.

The ignored `.data/` directory remains a compatibility view for Storybook. It may use symlinks or checksum-verified hard links into the catalog; it must not become a second owner of source data. See `scripts/catalog/README.md` for the portable commands and provenance rules.

The German [data and Georadar overview](docs/datenuebersicht.md) records the available provider assets, exact source/derivative boundary, inferred depth scale, missing instrument metadata, and reproducibly rendered reference cuts. It also documents the interactive structured volumes, their straight, surface-aligned and surface-plus-curve modes, the DSM-2024-relative height profiles, overlap diagnostics, and the compact filter contact sheet. The German [spatial-reference and scene-transformation register](docs/raumbezug-und-szenentransformation.md) records every native CRS/height datum, source and grid hash, transformation, local correction, remaining assumption, and guarantee boundary. The shared [`@carma-geo/proj` GCG2016 tile method](../../libraries/commons/resources/src/lib/de/gcg2016/README.md) documents the lossless 2° Float32 tiles, lazy loading, strict support region and direct numerical validation against GDAL. The [GPU compute note](docs/gpu-compute.md) records the bounded TypeGPU adoption decision and the proposed 0.5 m point-cloud plus mesh occlusion method. The German [LAZ-to-COPC process](docs/laz-copc-pipeline.md) summarizes source mirroring, dataset-specific derivation, spatial registration, validation, publication, and the provenance boundary between supplier and derived assets. The [Georadar LAZ-to-MDIO pipeline](docs/georadar-mdio-pipeline.md) records the current lossless survey packaging, Range retrieval, integrity checks, and the remaining publication blockers.

## Published scripts

- `scripts/build-tool-images.sh`: builds the repo-defined untwine and PDAL/Python tools.
- `scripts/build-derived.sh`: extracts sources and builds the four surface COPCs plus the focused Georadar volume artifacts when their source is configured.
- `scripts/build-pointcloud-aos.sh`: streams all four non-Georadar clouds through their best-known registrations, bakes 256-direction ambient occlusion over 50 m with the same Mesh 2024 selection halo, removes unpopulated optional payloads, and writes one `AO:uint8` COPC per source.

The 969-million-point Oelberg packaging pass uses a Docker volume for its roughly 75 GiB temporary pyramid. This keeps Untwine's mmap-heavy scratch IO off macOS bind mounts; only the finished COPC is written back to `.data`. The pinned Untwine 1.5.1 source build defaults its memory-intensive bottom-up pyramid to four workers. `POINTCLOUD_UNTWINE_PYRAMID_THREADS` may override that limit when the host has enough free memory. All clouds remain memory-bounded by chunked IO and sparse point-voxel arrays.

- `scripts/build-georadar-volume.sh`: produces the POC's 10 m structured-volume comparison from the mirrored LAZ sources.
- `scripts/build-georadar-mdio-survey.sh`: packages and independently verifies all 27 Survey captures as MDIO stores. The multimodal viewer maps every selected capture to its store, reads the shard index once and streams only the amplitude chunks required by visible, projectively sampled 10 m segments into a 32 MiB CPU cache.
- `scripts/verify-georadar-mdio-http.mjs`: fetches the MDIO shard index and one inner chunk via Storybook HTTP Ranges, checks exposed CORS headers and compares the transposed chunk value-for-value with the R16 master.
- `scripts/build-capture-026-variants.sh`: builds the selectable 5-, 11-, 21- and full-capture lossless radar strips plus their collocated scene manifests. The full option is named `27x10m` but is truncated at the delivered trajectory end to 258.25 m.
- `scripts/derive-georadar-survey.mjs`: builds one lossless, independently loadable R16 volume and scene manifest for each of the 27 delivered runs plus a shared T0 centerline index. Pass the extracted source root and the ignored `.data/derived/georadar-survey` output root explicitly; generated metadata contains source file names but no machine paths. The viewer keeps the complete labeled street graph resident and loads only the selected volume.
- `scripts/derive-niv-ecef.mjs`: transforms an immutable `nivP.json` snapshot offline from `EPSG:25832+7837` through the complete GCG2016 grid into `EPSG:4978`. The derived artifact records source, PROJ and grid provenance plus per-point status and numerical roundtrip validation. The browser loads only this ECEF artifact; it never downloads a vertical grid.
- `scripts/build-capture-026-image-textures.sh`: keeps every Capture-026 source JPEG unchanged and derives one display JPEG whose maximum edge is the next lower power of two plus one maximum-512 px preview. Display images use Lanczos downsampling, a mild luminance contrast curve and restrained sharpening; they are never upscaled. The runtime keeps previews for visible camera poses and decodes only the single focused display image. Panorama sources are mirrored from the public endpoint through the repo-owned resumable downloader; the output manifest contains only source-relative paths or public URLs.
- `scripts/derive-georadar-volume.py`: writes the lossless little-endian R16 `[depth, trace, slice]` master plus noise-gated R16 and bit-packed 10-bit derivatives. Metadata records the spatial-MAD gate estimate, removed fraction, histograms, and quantization error. The raw master always retains every source sample.
- `scripts/render-georadar-overview.mjs`: renders the documented Capture 026 cuts and records their source hashes and robust slice-selection parameters.
- `scripts/fetch-georadar-roads.mjs`: regenerates the committed named-road snapshot used by survey navigation from the official basemap.de vector tiles.
- `scripts/verify-pointcloud-http.mjs`: verifies Range requests, CORS headers and content-versioned publication metadata for the four public COPCs.
- `scripts/inventory/scan-fields.sh`: samples populated LAS/COPC dimensions.
- `scripts/inventory/copc-field-stats.mjs`: scans one local COPC and reports per-dimension minima, maxima, and non-zero counts; the AO build itself performs the exact source-wide audit used for field pruning.

The viewer exposes every scalar field through a canonical lowercase identifier (`classification`, `intensity`, `userdata`, `ao`, ...). Native LAS/COPC standard dimension names remain unchanged inside the binary container; the loader normalizes them at its boundary. RGB is published only where all three channels contain varying source data.

- `scripts/verify-elevation.sh`: runs DGM1 calibration and writes JSONL under `.data/reports/`.
- `scripts/catalog/`: inventories cross-provider sources, mirrors public issue assets resumably, indexes archive members, and verifies large files by expected size and SHA-256 without embedding private connection details.

For a static deployment, all four surface point-cloud stories use the content-versioned Mesh-2024 AO COPCs at `https://wupp-3d-data.cismet.de/mesh2024/pointclouds/`. Override `VITE_POINTCLOUD_DATA_BASE_URL` only for a compatible Range/CORS data origin and `VITE_GEORADAR_VOLUME_BASE_URL` to the public structured-volume base URL during the build. Publish the derived NIV artifact as well and set `VITE_NIV_ECEF_URL` when it is not available at `/niv-control-points/niv-points-ecef.json`.

The point-cloud publication set deliberately excludes Georadar. Its relative depth semantics and separate volume-streaming representation remain independent from the four georeferenced surface COPCs.
