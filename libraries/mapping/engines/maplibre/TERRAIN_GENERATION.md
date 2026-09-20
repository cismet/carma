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
| Mesh | `buildGridTile`: indexed regular grid, two triangles/cell; native pixel centres plus a bilinearly sampled boundary ring | Linear construction; preserves every interior source sample. A 512² raster produces 514² vertices and 526,338 triangles. |
| Projection | `createMercatorTerrainProjector`: cache longitude columns / latitude rows in each tile | O(width + height) MapLibre coordinate evaluations; still writes every vertex. Keeps existing local-Mercator frame and MapLibre drape alignment. |
| Normals | Three-primitives `mesh-normals.wat`: indexed, area-weighted `(C−B) × (A−B)` accumulation; f64 intermediates, f32 rounding after each face, then normalization | Exact Three-compatible output on regression fixtures. One async WASM instance per worker, reusable bounded scratch memory; JS fallback if compilation/CSP/memory fails. No GPU readback or new runtime dependency. |
| NoData / seams | `terrain-no-data.ts` removes incomplete faces; `terrain-boundary-stitch.ts` reconciles shared/mixed-LOD edges and recomputes normals in workers | No skirts or zero-plane fill. Full settled boundary processing remains; progressive arrivals can precede final stitching. |
| Scheduling | Adaptive Commons worker-throughput controller; non-preemptive stable priority: partition → project → decode → stitch | Starts conservatively, compares total work/s, cruises with 20% worker-count headroom, and backs off under main-thread pressure. Same-priority FIFO and running work are preserved; no moving-camera detail reduction. See `libraries/commons/worker-scaling/README.md`. |
| Publication | Coarsest viewport stage satisfying the **16 px raster-spacing target**, then final selection; omit all intermediate stages | Publish non-overlapping startup tiles as they arrive. Retain detailed meshes on pan. Complete replacement coverage is published immediately; optional mixed-LOD stitching follows after foreground work settles. Content/shadow invalidations are combined once per render frame. |
| Cache | Decoded-source/in-flight caches and versioned IndexedDB edge-topology atlas | The shadow runtime no longer reads or writes full prepared meshes. Only reusable edge topology is persisted; positions and normals always come from current raster-derived geometry. |

The pixel criterion is `sampleSpacingMetres × focalLengthPixels / distanceToTileBounds`.
It is **not a certified vertical-error bound** against unfetched higher-resolution
terrain. Final target remains the configured value (Geoportal: 0.5 px); source
maxzoom and tile-budget caps can prevent either target being met. At a cap, use
the finest selected source geometry, not a still coarser preview. No height-field
shadow renderer, angle-dependent normal quantization or mesh replacement was added.

## Benchmarks (2026-09-05)

Actual integrated helper, DGM z15/17022/10926, one Chromium 152 worker,
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

Same Chromium browser / Vite, view 51.2976909, 7.0273392, z18.08, pitch55,
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
| Prepared relief cache | 22.78 → 4.13 ms per DGM tile | Historical component result, superseded by the edge-only persistence decision below. Warm post-cache preparation with structured-clone read proxy and actual Node worker; **not native IndexedDB latency**. |
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


## Responsive time changes and bounded working sets (2026-09-20)

Time-animation stop now applies the latest requested shadow view, including the
last throttled sun update. Terrain selection remains throttled during playback;
the current sun is rendered directly while expensive convergence is deferred.

- Terrain workers reclaim one optional cache slot for foreground computation
  even when another slot is already computing terrain. Active terrain work is
  never preempted by this decision; late replies from retired cache workers are
  ignored.
- Native row-major projection reuses the last latitude record without another
  hash lookup. The vendor projection, column cache, and numerical output stay
  unchanged.
- Large boundary-stitch preparations and output batches use at most two workers.
  Their normal per-message allowance is halved; individual oversized tiles and
  irreducible boundary context still set a lower bound. The global probe remains
  a dependency barrier, output order stays deterministic, and publication waits
  for the entire current cut. Parent coverage remains until complete child
  coverage and seam preparation are ready, matching the 3D-tile frontier rule.
- Prepared terrain has a default 256 MiB estimated CPU/GPU cache budget in
  addition to the mesh-count limit. Accounting includes source sample storage,
  unique immutable/current geometry buffers, and projected GPU attributes.
  Eviction runs during request reconciliation, preparation and publication, and
  after optional zoom warming. Active and requested coverage remains pinned:
  this is a cache limit, **not a hard bound on total application memory**.
- Shadow accumulation has a finite desktop pixel ceiling and a 256 MiB working
  set estimate for two scene/depth targets, their MSAA storage, and three
  accumulation targets. Above that budget the existing direct, full-resolution
  shadow path is used; soft accumulation is skipped, not downsampled. Obsolete
  mono targets are released during interaction. A failed accumulation self-check
  releases all five targets and the broken instance cannot allocate again.

Measured on this workstation with warm alternating runs (not end-to-end network
load times): four 514×514 raster projections, 30.63 → 26.53 ms median (~13%);
eight 514×514 terrain tiles stitched using real Node worker threads and transfer
of output buffers, 267.67 → 189.65 ms median (~29%). The stitch benchmark used six
measured runs per variant after warm-up and observed one versus two busy workers.
Geometry/seam parity and stale-generation rejection are separately covered by
regression tests. Further unbounded worker fan-out or relaxing publication gates
was deliberately excluded because it increases memory or breaks coverage.

## Optional mixed-LOD seams (2026-09-20)

Mixed-LOD refinement runs after 500 ms of quiet with no foreground mesh/selection
work. New selection, movement or disposal aborts it. Equal-level boundary repair
is handled separately before publication (below). The general mixed-LOD solve
also changes equal-level junction normals, so its result now republishes the
whole coherent cut atomically rather than only tiles touching a different LOD.
This increases optional output work but prevents one-sided seam updates. Detail
selection and error limits are unchanged.

The shell boundary solve now runs once. Its existing boundary-state payload
contains pre-normal heights, final positions/normals and edge subdivisions.
Independent output tasks apply that result to full tile meshes, recompute their
interior normals, and refine only their own triangles. They no longer clone and
solve the entire cut for every output tile. Exact mixed-LOD geometry/normal/index
parity is covered against the original full-cut implementation.

A replenished batch queue exposes up to the existing hardware-aware probe limit
(maximum eight) to the adaptive terrain worker pool. The pool chooses actual
capacity using throughput and responsiveness; the stitch scheduler no longer
limits it to two jobs. Aggregate nominal input allowance remains 16 MiB, divided
across lanes; indivisible oversized tiles remain the existing exception.

Live verification at 51.2538583,7.295833, zoom17.932, pitch59.5: 49 active tiles at
2.028 s, 103 at 4.007 s, all 113 requested active by 5.003 s. Optional stitching
was active at 6.002 s and complete by 8.001 s, with zero tiles waiting for display.
The view differs from the original profile location, so these are not a controlled
speedup ratio against the earlier >52 s wait. A separate two-Node-worker warm
component benchmark, 52 grids of 129² vertices, measured medians 167.65 ms for the
HEAD full-context path and 74.52 ms for solve-once/apply (three alternating measured
runs after warmup). This is a component result, not app/network/GPU timing.


## Equal-level edge ownership

**ID / date / status:** TERRAIN-EQUAL-LEVEL-EDGES / 2026-09-20 / implemented.

**Context:** independent raster clamping and per-tile normals can leave seams even
at equal LOD. Hidden boundary triangles would leave holes when parent coverage
is retired. Retain the previous complete cut until the new edge bands are ready.

**Decision:** north-then-west ownership provides deterministic shared sample and
corner reduction. Average original clamped heights once per shared sample; sum
unnormalised area-weighted face normals across neighbours before normalising.
Retain interior samples and triangle topology. This repairs the erroneous border
surface rather than claiming the old clamped boundary geometry was correct.
Two-ring mesh shells retain all incident faces for corrected inner-ring normals.
Workers extract each shell once, with at most four preparations in flight. Shells
are evictable with the tile and included in CPU memory accounting. Subsequent
solves use shells; neighbourhood signatures restrict outputs to changed tiles,
with two neighbouring tile rings as context. Sparse attribute updates reuse GPU
buffers. View coverage is rechecked after asynchronous work before publication.

**Alternatives:** dropping edges without retained coverage creates caster holes
(rejected); shifting render tiles across four source rasters changes the existing
LOD partition (deferred); a general full-mesh pass at every same-level publication
is superseded. No extra raster downloads, TIN conversion or package dependency.

**Evidence:** the opt-in benchmark in
`src/lib/runtime/integrations/terrain-equal-level-boundaries.spec.ts` compares four
synthetic nonlinear grids with mismatched border heights on Node 22.15.1,
macOS arm64 (CPU model not freshly recorded), five alternating timed
runs after one excluded run per variant. At 514² vertices/tile, full general
stitch median39.48 ms versus cached shell solve4.93 ms; initial four-shell
extraction17.81 ms. At129²,6.15 versus5.63 ms, extraction2.16 ms: no substantial
warm gain on the smaller fixture. Four large shells use1,144,768 bytes for their
positions, normals, indices, source-index maps and normal targets, excluding edge
arrays/base-height arrays. These Node component timings exclude worker transfers,
publication, GPU upload, network and shadow presentation. They are not full-app
speedups or identical-normal comparisons with the previous averaging algorithm.
Reproduce with `TERRAIN_EDGE_BENCHMARK=1 npx nx run engines-maplibre:test --watch=false --testFile=terrain-equal-level-boundaries.spec.ts`.
Tests compare corrected normals to a welded monolithic Three mesh, full-versus-
shell patches, four-way corners, arrival order, incremental context and missing
faces. Existing runtime tests verify publication and mixed-LOD behaviour.

In the live development browser, a growing84-tile participating cut had53,426
shared sample occurrences with no height/normal mismatch above1e-6. Its last
incremental update took24.6 ms preparation,12.5 ms worker roundtrip and3.9 ms
application. A43-tile cold burst took177.1/57.2/37.3 ms respectively; cold batches
can still exceed one frame. After optional mixed-LOD refinement,86 active tiles
retained zero mismatches across the same53,426 shared sample occurrences. These
are individual observations under loading, not a controlled full-app A/B.

**Revisit when:** initial shell extraction/copy or large atomic publication
becomes the dominant cost; move extraction into original mesh preparation or
prepare staged GPU buffers before committing the cut. Preserve equal-level
position/normal equality and existing coverage throughout such changes.

## Persistent edge atlas

**ID / date / status:** TERRAIN-EDGE-ATLAS / 2026-09-20 / implemented; browser speedup unmeasured.

**Context and constraints:** Terrarium remains the network ground truth. Preserve
reusable edge work across sessions without storing complete prepared meshes.

**Decision:** persist only the two-ring shell topology (triangle indices, source
vertex mapping, boundary indices and normal targets) in the shared IndexedDB
derived-buffer cache. A SHA-256 key covers the actual mesh indices, edge layout
and vertex count, including NoData topology. The producer epoch hashes the pure
extraction function and schema version. Positions and normals are gathered from
the current mesh on every restore, so neither scene origin nor old elevations
can leak into a new tile. Identical topology is shared across raster tiles.

Reads fall back to extraction after an 8 ms wait; writes run in the background.
Per worker, resident topology is bounded to 8 MiB/64 entries and pending writes
to 2 MiB. Persistent storage uses the shared 256 MiB derived-cache policy. The
runtime requests browser storage persistence after readiness; retention remains
subject to browser permission, quota and user deletion. Full prepared-mesh disk
reads, writes and codec calibration are disconnected from the shadow runtime.
Existing source caches and RAM terrain eviction remain in use.

**Alternatives:** complete mesh persistence is superseded for this runtime;
persisting projected shell attributes is rejected because they depend on current
heights and scene origin. Cached topology still requires input hashing and fresh
attribute gathering; a disk hit is not automatically faster than extraction.

**Evidence:** 106 focused cache, edge, runtime and worker-client tests pass. Cache
tests exercise reload through a mocked persistent store, topology invalidation,
fresh attributes, detached transfer buffers, corrupt payloads, quota failures,
stalled storage and unavailable WebCrypto. Native IndexedDB roundtrip speed and
retention across a real browser restart remain unmeasured. The earlier shell
benchmark measures in-memory solves, not this persistent cache.

**Revisit when:** native browser measurements show hashing or storage overhead
outweighs extraction; tune admission using measured total preparation cost.
