# Oblique imagery viewer

This project continues Thorsten’s MapLibre/Three.js oblique viewer originally implemented inside `mapping/addons/src/addons/ObliqueViewer`. Pure camera/data/selection logic lives in `src/lib/core`; React, image loading and camera flights live in `src/lib/runtime`. The mapping-addons package owns the route registry and persistent state adapter and mounts this feature through its public API. This project does not import the addon registry.

The Cesium viewer is the legacy implementation. This change does not update its runtime.

## Imagery series

The host declares a list of series. The panel's multiple-selection dropdown enables each independently: 2024, the full 2026 delivery, the 41-image 2026 Rathaus sample, any combination, or none. Enabled series participate in one geometric selection. Source image names are opaque asset identifiers; a series-qualified key identifies records in state and indexes. A filename shared by two years therefore remains two separate records and URLs always use the original source name.

The list names the acquisitions as 03/2024 and 04/2026, with a Sample suffix for the independent Rathaus subset. The 2024 month follows the published March 14/17 flight description in the Geoportal background configuration; the 2026 delivery's Aufnahmeorte.shp records April 11 in ATTR_6 for all 7,436 capture points. Short footprint labels are `2024`, `2026`, and `2026Test`, and are shown only while more than one series is enabled.

Each series owns its metadata URI, asset base URL, camera calibrations, source conventions and height datum. 2024 has no nadir assets. 2026 includes all five Osprey heads; camera-relative labels LE/RI/FW/BW/NA do not define fixed north/east/south/west eligibility.

Metadata and asset availability are separate. The 2026 preset prepares the viewer for the metadata/derivatives endpoint; it does not create JPEG derivatives. A failed series load is reported independently and does not disable a successfully loaded series. An unknown vertical datum prevents an aligned camera flight until the operator declares the verified source datum. The explicit local-development Rathaus configuration can use unverified source Z; this does not change the source datum or enable this exception in production.

## Selection and navigation

Best-fit selection evaluates the requested ground target and continuous camera bearing/pitch against the poses and camera field of view of enabled series. Geographic cardinal sectors are presentation/navigation hints, not candidate bins. Enabling the full 2026 series offers a Nadir button. It locks browsing at zero pitch and selects calibrated nadir cameras only, including on subsequent pan requests; the compass or the same button returns to oblique browsing. Removing the last nadir-capable series returns to oblique mode. Orbit requests change the desired view direction; pan requests change the target in the current image-view frame. Both requests search enabled series and may choose a different year. No-enabled-series and no-candidate results are valid empty states.

A delivered footprint is optional. Core selection can use calibrated camera rays and a target/reference-height plane; an approximate center/coverage test is not a terrain-occlusion check or a surveyed footprint. Terrain-derived polygons can be added later without changing the authoritative pose source.

The selected footprint carries an open two-line caret with a 120-degree tip at
the image-bottom boundary, pointing toward image up, and its series'
short label at the polygon centroid when multiple series are enabled. The caret shares the outline's colour
and line width; the year uses that colour at 50% opacity, weight 800 and no stroke. Camera roll and the projected image-up axis determine orientation;
polygon start corner and winding do not. Both markers follow sampled terrain
heights, draw above 3D layers and share the outline's preview fade. A single
enabled series produces no superimposed label.

## Data contract

The old `image-name -> [x,y,z,row0,row1,row2]` feed remains an ingestion format for 2024. New imports use the typed version-1 INPHO envelope with `seriesId`, explicit conventions, camera definitions and a map of source image names to camera poses. Keep calibration and pose together; do not reconstruct the camera from a filename prefix.

Positions use named horizontal CRS and declared vertical datum, in metres. Matrix layout is row-major; the world-to-camera rotation applies to world coordinates relative to the perspective center. The optical axis is camera negative Z. Camera focal length and the image plane use millimetres; dimensions and principal points use pixels. Pixel origin, axis signs and pixel-center reference are explicit. The INPHO image-plane-to-pixel affine is a camera calibration, not a raster-to-world geotransform.

A source mount rotation is preserved for provenance. The calibrated pixel axes drive image orientation so that mounting is not applied twice. Processing timestamps are not acquisition timestamps. Missing acquisition time or height reference stays unknown. The format is designed to permit a later STAC mapping; it does not claim STAC conformance or publish a catalog.

## Metadata import

The canonical INPHO importer and reproducible commands live in [scripts/oblique-viewer](../../../scripts/oblique-viewer/README.md). It performs metadata conversion only. The delivery PRJ is authoritative; the footprint-derived CSV is diagnostic reference and is not mixed into camera poses.

The 2026 delivery contains 30,172 images (23,823 oblique and 6,349 nadir). Its 41 Rathaus TIFFs contain no nadir. The sample catalog is committed separately from the full-flight metadata. A loopback development bridge reads the original TIFFs on amy and renders requested views in memory, using their embedded reduced pages. It writes no image derivatives and applies no watermark. Browser alignment and the source height convention still need to be checked against buildings and terrain.

## Run the Rathaus sample

The local-development route `#/oblique?ff=ng` starts the addon and loads the
existing Mesh 2024 style by default. Its layer visibility is remembered in the
route's own storage namespace.

From this worktree, with SSH access to `amy.cismet.de`:

```sh
python3 scripts/oblique-viewer/serve-originals.py
```

The local-development Geoportal addon connects to `http://127.0.0.1:8926`. Use the Geoportal dev server for this branch at its normal `http://localhost:4200` URL and enable the MapLibre and oblique addon flags (`ng` and `oblqml`). The bridge serves the committed 41-image sample catalog, JPEG views generated on demand and original TIFF downloads. The multiple-selection dropdown keeps the Rathaus sample separate from the full 2026 delivery. See the [script guide](../../../scripts/oblique-viewer/README.md) for options and delivery validation.

The full 2026 upload is being placed under `/mnt/storagebox/luftbildschraegaufnahmen2026`. It is not the Rathaus bridge source and must be inventoried and validated after transfer before enabling the full-flight asset configuration.
