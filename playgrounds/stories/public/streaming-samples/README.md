# Streaming image diagnostics

`resolution-chart-16k-v1.avif` is a deterministic synthetic 16384 × 16384
sRGB test chart. A single file contains independent levels L0–L8, 512-pixel
AVIF Grid cells, 10-bit full-range 4:4:4 data, and the same range index as the
oblique viewer's production files. Encoder quality is q90, not a measured
fidelity percentage. Quality and exhaustive file QA remain deferred.

The numbered panels contain line pairs, checkerboards, 5-degree slanted edges,
sinusoidal chirps, a Siemens star, neutral and RGB ramps, chroma line pairs,
diagonal lines, thin strokes, fine grids, tile-boundary markers, a radial zone
plate, and a 1024-step precision ramp. The adjacent JSON lists their source boxes.

This contains no photographs, people, properties, camera metadata or location
data. Its RGB16 source is mathematically generated. Lower levels use a floating
linear-sRGB Mitchell-Netravali buffer cascade with B=C=1/3 and no sharpening.

The shared dev-local script `scripts/oblique-viewer/streaming-samples/create-streaming-resolution-chart.mjs`
reproduces the asset with the existing native libavif/AOM encoder and repacker.
Generated assets are local diagnostics and are intentionally ignored by Git.

The complete 2026 photograph `BW_34_2712-L0-q90-v1.avif` is served from `https://wupp-oblique.cismet.de/2026/avif-fullres-samples/`. Native L0 is 19136×12736, encoded once at q90/10-bit/4:4:4 with 512px cells; original production L1–L8 encoded payloads are copied unchanged. Woodland, meadow and surfaced park paths are visible; no buildings/private yards or vehicles were observed in reviewed overviews/details. A few distant pedestrians are present, with no facial detail observed in native L0 crops. The separate JSON sidecar records provenance and the specific review. This is a full frame, not a 1024px crop, and production files remain independent.
