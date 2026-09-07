# Raster terrain generation and startup

## Implementations and choices

Geoportal uses the shared NRW Terrarium DGM resource through z16 for both
MapLibre draping and Three terrain (DOM remains independently selectable for
shadows, also through z16). The raster runtime defaults to the source's maxzoom;
an explicit lower maximum still applies. Existing z15 benchmark fixtures below
remain historical measurements, not the current source-resolution limit.

| Stage | Implementation / algorithm | Reason and limits |
| --- | --- | --- |
| Elevation | `raster-dem-tile.ts`: browser image decode with no color conversion, Terrarium RGB → float metres | Lossless payload decoding; native Terrarium quantization is 1/256 m, not source survey accuracy. |
| Mesh | `buildGridTile`: indexed regular grid, two triangles/cell; native pixel centres plus a bilinearly sampled boundary ring | Linear construction; preserves every interior source sample. A 512² raster produces 514² vertices and 526,338 triangles. This is **not** MARTINI, Delatin or adaptive TIN simplification. |
| Projection | `createMercatorTerrainProjector`: cache longitude columns / latitude rows in each tile | O(width + height) MapLibre coordinate evaluations; still writes every vertex. Keeps existing local-Mercator frame and MapLibre drape alignment. |
| Normals | Three-primitives `mesh-normals.wat`: indexed, area-weighted `(C−B) × (A−B)` accumulation; f64 intermediates, f32 rounding after each face, then normalization | Exact Three-compatible output on regression fixtures. One async WASM instance per worker, reusable bounded scratch memory; JS fallback if compilation/CSP/memory fails. No GPU readback or new runtime dependency. |
| NoData / seams | `terrain-no-data.ts` removes incomplete faces; `terrain-boundary-stitch.ts` reconciles shared/mixed-LOD edges and recomputes normals in workers | No skirts or zero-plane fill. Full settled boundary processing remains; progressive arrivals can precede final stitching. |
| Scheduling | Adaptive Commons worker-throughput controller; non-preemptive stable priority: partition → project → decode → stitch | Starts conservatively, compares total work/s, cruises with 20% worker-count headroom, and backs off under main-thread pressure. Same-priority FIFO and running work are preserved; no moving-camera detail reduction. See `libraries/commons/worker-scaling/README.md`. |
| Publication | Coarsest viewport stage satisfying the **16 px raster-spacing target**, then final selection; omit all intermediate stages | Publish non-overlapping startup tiles as they arrive. Retain detailed meshes on pan. Final replacement is stitched; content/shadow invalidations are combined once per render frame. |
| Cache | Existing decoded-source/in-flight caches and versioned IndexedDB prepared-geometry cache | Revision v6 stores final NoData-filtered geometry and relief masks, including empty coverage. Source, NoData policy and exact scene origin remain in the key. Older unprepared entries regenerate automatically. |

The pixel criterion is `sampleSpacingMetres × focalLengthPixels / distanceToTileBounds`.
It is **not a certified vertical-error bound** against unfetched higher-resolution
terrain. Final target remains the configured value (Geoportal: 0.5 px); source
maxzoom and tile-budget caps can prevent either target being met. At a cap, use
the finest selected source geometry, not a still coarser preview. No height-field
shadow renderer, angle-dependent normal quantization or mesh replacement was added.

## Benchmarks (2026-09-05)

Actual integrated helper, DGM z15/17022/10926, one Codex Chromium 152 worker,
8 warmups + 21 calls; median projection + normals + bounds **17.1 ms JS →
15.5 ms WASM (9.4% less)**; P95 18.1 → 16.8 ms, WASM setup 0.3 ms.
Normal arrays exactly match an independent Three reference. Excludes download,
image decoding, messaging, stitching and GPU rendering; sequential JS/WASM order
and uncontrolled host load limit inference. This is not an app FPS improvement.

The earlier three-fixture, counterbalanced normal-only comparison measured
**8.7–8.8 ms JS / 2.5–2.6 ms WASM including copies**. Full geometry stage was
45.4–45.6 / 39.3–39.5 ms in that different harness. Do not combine absolute timings
across runs. Warm WebGPU readback did not consistently beat WASM for that stage;
CSR setup cost 21–27 ms. The exact CPU/WASM path keeps the existing WebGL2 consumer.

- [Integrated benchmark, source and raw trials](../../../../output/playwright/terrain-startup-wasm-20260905/)
- [Earlier backend/parity comparison](../../../../output/playwright/normal-production-parity-20260905/README.md)

### App startup experiment

Same Codex browser / Vite, view 51.2976909, 7.0273392, z18.08, pitch55,
shadow660;345. Geometry-cache reads bypassed without deleting stored tiles.
The old all-stage/FIFO strategy took **22.0 s from runtime creation to the
qualifying terrain frame**; optimized fast runs took **0.78–1.06 s** (3.03–4.43 s
from navigation). First coarse baseline frames are not equivalent to the 16 px
startup target. Both variants retained WASM to isolate scheduling/stage selection.

**Not yet a robust cold-start guarantee:** another optimized run took 21.6 s
from runtime creation, mostly between first worker dispatch and reply. HTTP
caches, Vite and other host/GPU workloads were uncontrolled; this delay remains
unisolated. Frame marks measure submitted terrain, not GPU presentation or final
sun-disc convergence. The settled app screenshot confirms draped map and shadows.
No full DevTools trace was available. [Raw runs and limits](../../../../output/playwright/terrain-startup-wasm-20260905/startup-results.json).

Regenerate the embedded WASM bytes with
`node libraries/mapping/engines/three/primitives/scripts/build-mesh-normals.mjs /path/to/wabt/index.js`
using **wabt 1.0.39** (Apache-2.0, build-only). The readable WAT source and generated
TypeScript bytes are checked together; no compiler/extra request is needed in the app.

## Four cache/recompute experiments (2026-09-06)

Baseline `8eb7b209f`; individual A/B measurements, not cumulative application FPS.
No source-resolution, normal-precision, sun-disc or draping reduction.

| Change | Representative median before → after | Decision / measured scope |
| --- | --- | --- |
| Prepared relief cache | 22.78 → 4.13 ms per DGM tile | Keep. Warm post-cache preparation with structured-clone read proxy and actual Node worker; **not native IndexedDB latency**. |
| Incremental boundary stitching | 221.52 → 134.02 ms | Keep. Add a native 512-segment tile to a nine-tile cut; real Node worker, full updates 9 → 4. Cold 16×128 case costs 34.81 → 39.16 ms. |
| Reuse idle ground capture | 47.01 → 37.38 ms per 128 samples at 2560×1440 | Keep conservatively. Native WebGL2 GPU queries, source/consumer fullscreen draws included; 128 texture copies → 1. About 0.075 ms saved per sample, **not an app frame-time claim**. |
| Origin-independent persistent geometry | 24.5 → 42.6 ms per DGM tile | Reject production integration. Native IndexedDB + worker, exact new-origin reprojection, equivalent snapshot initiation and separately drained writes. |

Prepared relief avoids repeating partitioning, normal calculation and bounds scans
on a hit. Cold all-valid tiles can skip partitioning only when finite, ordered
Float32 min/max bounds exclude the NoData epsilon; unknown/partial coverage uses
the unchanged worker. This removes about 18 ms of post-projection work in the
three real complete-tile fixtures, not the entire tile-generation cost.

Incremental stitching does not guess a one-ring neighborhood. Worker-built compact
shells retain every face incident on boundary vertices. The same stitching core
first computes exact boundary dependencies, then fully recomputes only affected
tiles. Signatures include pre-normal heights, final positions/normals and ordered
coarse-edge subdivisions. This preserves mixed-LOD and multi-tile corner results;
accepted state follows publication, not cancelled work. Shells are bounded by the
active cut and cleared on disposal. Nine native tiles retain about 1.90 MiB of
extra typed arrays; output upload payload falls 113.47 → 50.43 MB in that case.

Ground capture reuse requires completed MapLibre `idle`, unchanged exact
camera/viewport/depth registration and an active lighting replay. Source, style,
terrain, resize and context events invalidate it. The first idle transition
requests one final faded capture and restarts accumulation. Public layer order
is used because `getStyle()` omits custom layers. Earlier custom passes,
canvas/video sources, animated sprites and feature-state paint conservatively
keep per-frame capture; public image versions catch eventless `updateImage`.
Depth-range bridging remains unchanged. Accumulator-format changes now compare
against the stored key rather than a shadowed local variable.

The origin-neutral prototype retains source-neutral samples and reprojects them
to preserve exact Float32 output. Across three native fixtures its median is
41.6–42.6 ms versus 23.7–24.5 ms rebuilding an already locally available raster.
Its roughly 21 MiB record, restoration, messaging and refreshed snapshot outweigh
the saved decode/grid work here. The corrected `fair-write-drain-v2` run supersedes
an invalid preliminary run with asymmetric/overlapping writes. No lossy inverse
remounting, new dependency or source-neutral production cache was retained.

All A/B geometry/normal/index/mask comparisons are exact; capture output pixels
match byte-for-byte. Different fixtures, runtimes and measurement scopes must not
be added together. Methods, raw paired trials, reproducible harnesses and
validation limitations: [benchmark evidence](../../../../output/terrain-cache-optimizations-20260906/README.md).
