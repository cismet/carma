# Shadow quality and responsiveness

## Policy

The UI labels **120 FPS / 60 FPS / 30 FPS** are motion budgets, not guaranteed
application frame rates. The reference viewport is **2560 × 1440 physical
pixels**. Canvas resolution, MapLibre color capture and labels keep their native
physical pixel density in every profile. Only the shadow depth buffer, sample
count, MSAA and Three terrain/mesh detail change. The MapLibre DEM remains pinned.

| Profile | Depth texel budget at 1440p | Three terrain target / grid ceiling / tile ceiling | Sun samples / MSAA |
| --- | --- | --- | --- |
| 120 FPS | 2048² | 2 px / 128² cells / 96 | 128 / 0 |
| 60 FPS | 3072² | 1 px / 256² cells / 144 | 256 / 2 |
| 30 FPS | 4096² | 0.5 px / 512² cells / 192 | 512 / 4 |
| Ultra | Requested 16384², clipped by existing device caps | 0.25 px / source grid, at most 512² cells / 256 | 8192 / format-supported maximum |

Budgets scale with physical viewport area; ground-texel fitting may choose a
rectangular depth map. Explicit source limits remain authoritative. Targets are
not error guarantees when source resolution or tile budgets are exhausted.
Mesh screen-space targets are respectively 4 / 1 / 1 / 0.25 px.

Selecting a preset resets manual render overrides; advanced controls may then
override the preset. All presets use linear FP16 scene color and an FP32 average
by default. Full FP32 color has no MSAA; it is not simultaneously superior in
every quality dimension. Color/depth MSAA support is intersected once per renderer.

During motion, sustained over-budget frames first reduce shadow fitting cadence,
then depth-map density (down to half the axis density). A reduction is retained
only if the next measurement window improves frame throughput by at least 5%.
Otherwise the prior setting is restored and probing pauses until the next
gesture. This avoids permanent quality loss on a refresh-rate-limited display
or a non-shadow bottleneck. Terrain is not downgraded during movement. At rest,
full depth density and progressive finite-sun convergence resume. Ultra disables
this motion adaptation. Frame cadence is a feedback heuristic, not GPU attribution.

Existing memory safeguards were **not removed**: desktop depth maps remain
capped at 4096 per axis, phones at 2048. Consequently Ultra does not yet allocate
the raw reported maximum texture size. Raising these caps requires explicit
approval and memory-pressure validation. On devices whose native color target
exceeds the existing accumulation-pixel cap, direct native-resolution shading
is used instead of downsampling; finite-disc accumulation is unavailable there.

## Loading indicator

The 2 px map-edge bar combines content, terrain preparation/publication, and sun
sample convergence. Cold duration priors are 600 / 1800 / 1200 ms; these are
heuristics, not measured constants. Completed phase wall times update an EWMA
with 25% new-sample weight, clamped to 50–60000 ms. Weights are frozen for each
loading cohort, with learning used in the next cohort. A shadow-only refresh
receives the whole bar. Content readiness is not invented byte progress.
Notifications are coalesced at 100 ms; idle rendering does not poll. Explicit
teardown completions are excluded from learning. Estimates are map-local and
not persisted as cross-machine calibration or presented as a precise ETA.

## Worker boundary

Raster decode, grid generation, projection/normals, NoData partition and edge
stitching already use the adaptive terrain worker pool. The viewport/shadow
quadtree selection now joins that pool: serializable camera matrices, source
metadata and known height ranges are sent, not scene objects or geometry arrays.
One request runs at a time per terrain runtime, with only the latest pending
view retained. A useful in-flight cut may publish while panning; disposed results
cannot publish. An unchanged view does not repeat the walk. Source switching
retains the preceding terrain presentation until replacement tiles are ready.
The same pure selector supports the no-Worker fallback. The old inline algorithm
was removed after the existing 18 lifecycle/LOD tests passed with the extraction.

GPU uploads, draw submission and shared MapLibre framebuffer operations still
belong to the owning WebGL context. This is not a wholesale OffscreenCanvas
renderer migration.

### Tilt-path fixes — 2026-09-06

The full Chrome DevTools traces identified branch-specific work, not a lack of
terrain compute workers:

- Coverage fitting called `map.unproject` four times per update. With terrain,
  this performs synchronous depth rendering/readback. Reuse the existing CPU
  camera/elevation-envelope fit instead; retain its receiver-radius and caster
  guards. No terrain picking is needed in the shadow render loop.
- The private terrain quality offset used center zoom when no source callback
  existed. That accidentally replaced MapLibre's adaptive horizon LOD. Obtain
  the upstream function once via `setSourceTileLodParams(9.314, 3, sourceId)`,
  add the existing quality offset, and restore the original hook on release.
  Existing custom callbacks retain all five arguments. At the test camera's
  75-degree pitch this reduces RTT terrain tiles from 811 to 52. This repairs
  erroneous over-refinement; it is not pixel-identical to the broken horizon LOD.
  Three geometry, source resolution, native color capture and labels are unchanged.
- Prepared geometry cache reads/deserialization and full index validation now
  execute in the existing worker pool. Only a cache key crosses to the worker;
  validated array buffers transfer back. Revision preparation and pending-write
  ordering remain coordinated by the caller; the persisted format is unchanged.
  Storage tasks cannot count as successful geometry-throughput calibration.
- Worker dispatch yields after a 2 ms *batch* budget, avoiding chains of large
  synchronous `postMessage` clones in a completion/render callback. A single
  native copy is not interruptible: an intermediate test still measured 22.4 ms
  for one stitch request. No transfer detaches live/cache-owned input geometry.
- Shadow depth allocation stays stable through a camera gesture while the
  receiver frustum/guards still refit. Idle, quality or device-limit changes
  restore the appropriate allocation. No extra render targets or larger budgets.
- MapLibre light/label publication is throttled during camera movement as during
  time animation; the final value flushes on moveend. Three lighting stays live.

The loading bar matches the white navbar at 75% alpha, reaches 100%, then fades
over 300 ms; new loading is visible immediately. No animation polling was added.

Full trace artifacts and reproduction details: local
`output/shadow-tilt-trace-20260906/README.md`. Same 120-FPS profile, 2560×1440
physical canvas and camera path; isolated Chrome 152, DevTools MCP/CLI 1.8.0.
No CPU/network throttling. rAF interval timings include browser/trace overhead.

| Motion | Before median / p95 / max, ms | Final median / p95 / max, ms |
| --- | ---: | ---: |
| Tilt 48.55° → 75° | 90.8 / 409.8 / 424.0 | 35.1 / 48.3 / 56.2 |
| Tilt 75° → 30° | 35.1 / 118.0 / 486.2 | 34.2 / 47.9 / 56.2 |
| Pan out at 30° | 20.4 / 27.0 / 34.7 | 14.5 / 27.7 / 48.8 |
| Pan back | 20.3 / 21.6 / 27.7 | 14.7 / 28.1 / 34.9 |

These are diagnostic runs, **not** a controlled speedup percentage or a guarantee
of 120 FPS. Cache warmth, tile arrivals and separate HMR/browser generations
differ. The intermediate CPU+LOD trace still had a 730 ms worker-completion task
and expensive main-thread cache validation; the final tilt-up trace's longest
task is 50.5 ms. A separate A/B/B/A experiment lost its DevTools connection and
is excluded. Final panning tails are not uniformly better than the first run.
Remaining main-thread costs include native MapLibre RTT/draw submission,
individual stitch-input copies, geometry publication and cache writes. No
wholesale renderer migration or unbounded RTT-pool increase was attempted.

Validation: 279 engine tests, 225 shadow tests and 3 loading-indicator tests;
engine typecheck and scoped engine lint pass. Strict shadow typecheck retains
307 transitive diagnostics outside the changed shadow files. Drape/shadows and
bar completion visually checked. Full-app/other-device 120-FPS acceptance and
long-session/HMR memory validation remain open.

## Measurements — 2026-09-06

Artifacts: `output/shadow-fps-profiles-20260906/` and
`output/terrain-selection-worker-benchmark-20260906/` (local, not packaged).

Native Codex browser, Chromium 152, 14 reported logical CPUs. GPU identity was
masked as WebKit WebGL. Synthetic sloped-terrain fixture uses production shadow
controller, accumulator and profile policy, exact native 2560×1440 targets.
Asynchronous disjoint-checked GPU queries; one warm-up block excluded; median
of five eight-draw blocks; no `gl.finish`. Geometry construction excluded from
render timings. These figures are **not end-to-end Geoportal FPS**.

| Profile | Terrain triangles | Motion GPU ms/draw | Eight sun samples + composite, GPU ms |
| --- | ---: | ---: | ---: |
| 120 FPS | 32,768 | 0.349 | 11.835 |
| 60 FPS | 131,072 | 0.560 | 21.630 |
| 30 FPS | 524,288 | 0.980 | 31.164 |
| Ultra | 524,288 | 0.981 | 30.938 |

The measured Ultra block contains eight samples from its configured 8192-sample
sequence, **not full convergence**. Effective MSAA was 0 / 2 / 4 / 4. The 60 FPS
depth fit used 3136×3008; other measured targets were 2048² / 4096² / 4096².

Real local-meter/Mercator selection fixtures, pitched 55°, Node worker, 20 warm-up
requests excluded, median of five blocks of twenty; complete result deep-equality
checked for every request:

| View | Sync compute ms | Main-thread postMessage ms | Worker compute ms | Total latency ms |
| --- | ---: | ---: | ---: | ---: |
| Zoom 15 | 0.726 | 0.011 | 0.881 | 1.050 |
| Zoom 18 | 0.376 | 0.007 | 0.501 | 0.637 |

Worker startup was 18.906 / 17.240 ms and is not included in warm timings.
The gain is freed main-thread time, **not faster total completion**. Snapshot
construction and production pool queue contention are outside these figures.
An earlier 4.35 ms synthetic result used inconsistent coordinate units and
included worker startup; it was discarded, not used to calibrate presets.

Remaining validation: real full-app pan/frame traces, sustained foreign load,
and long-session/HMR memory behavior. A long-lived HMR tab failed with ArrayBuffer
allocation errors; a fresh tab was used for UI validation. No DevTools trace
provider was available in this session, so no stable application-FPS or
long-session memory-safety claim follows from the isolated benchmarks.
