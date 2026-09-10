# Corridor presentation — measured regression and disposition

Decision ID: `CORRIDOR-PRESENTATION-20260909`.
Status: small fixes implemented; complete-view latency and GPU-worker work remain open.

## 2026-09-10 — MESH-SHADOW-FRUSTUM / NATIVE-MASK-BATCH / SCRATCH-REUSE

- **Status:** implemented locally, uncommitted. Full-view completion and main-thread
  isolation remain **unaccepted**, not fixed by the following microbenchmarks.
- **Context:** Mesh appearance explicitly disabled Three's mesh frustum culling.
  Completed receiver masks each required a separate scene replay. Each completed
  integration also destroyed its four working attachments before the next page.
- **Decision:** Terrain-providing mesh payloads use Three's independent observer
  and light frustums. Native receiver object IDs propagate into accumulation
  descriptors; distinct material owners replay their retained scalar masks in
  the common colour pass. Shared material owners still use separate passes:
  stock Three uniforms upload at material/program changes, not every object.
  One bounded working allocation survives between ready corridors of matching
  dimensions/format; integration state resets, not its attachments. Idle, failed,
  resized and disposed workloads release them. No geometry/material clones.
- **Alternatives:** Disabling offscreen casters is rejected for incorrect chimney
  shadows. Blindly sharing material uniforms across owners failed code-level
  upload semantics and is explicitly excluded. Private renderer APIs and material
  clones are unnecessary. Raising main-thread sample budgets is not accepted as
  a responsiveness fix. Independent OffscreenCanvas GPU workers remain proposed
  in `CORRIDOR_WORKERS_REVIEW.md`, not implemented by this change.
- **Measured evidence:** Internal Codex browser WebGL2, PCF1024 depth,256² colour,
  two receivers, one actual offscreen chimney and128 distant casters. Five paired,
  alternating runs after warm-up, eight samples with GPU-completing readback:
  culling disabled median2.7ms/2,096 calls; enabled median1.4ms/48 calls. Zero
  differing pixels in the capture/replay reference; the offscreen chimney affects
  1,603 pixels. Distinct-material presentation:5→3 draws, zero pixel differences;
  shared-material control:5→5 draws, zero differences. This is a synthetic local
  comparison, **not** an app latency or GPU-timer result. Scratch reuse is covered
  by attachment-identity/reset tests; no device speedup is claimed for it yet.
- **Validation:**154 focused shadow tests and one focused runtime appearance
  test pass. The live user view at51.2716319/7.1995346,z18.035,b180.23,p37.28,
  shadow830;19 retains Mesh2024. Reload was attempted with a30-second observation
  target, but internal CDP focus commands timed out under load. That run did not
  establish complete soft-shadow publication or responsive interaction. Earlier
  stall reports contain both ready queued pages and pages waiting for caster
  readiness; no blind readiness bypass was introduced. Watchdog reports now also
  include total/ready/completed/sample counts.
- **Revisit:** Require full reload and drag acceptance on this view, then move
  geometry-only setup/integration off the main thread with pixel-parity and
  readback/transfer/upload-inclusive timings. Do not call this worker-parallel.

The disposable WebGL fixture is `output/shadow-native-owner-check-20260910.html`
in the shadow worktree; this ignored local artifact is not a CI regression test.

## Reproduction and method

Internal Codex browser only, MeshX 2024 plus tiled shadows, 64 solar samples.
Reference navigation: `lat=51.2702419&lng=7.2006725&zoom=19.256&b=11&p=37.28&shadow=806;19`.
Temporary adapter instrumentation measured synchronous CPU wall time with
`performance.now()`, renderer counters, publication counts and Long Tasks.
It was removed after measurement. These are **not GPU timer queries or a DevTools
CPU trace**; the internal connector did not expose trace capture. No Playwright
or separate browser session was used.

Each timer ran for 30 seconds **after adapter construction**, not navigation.
The adapter started at 17.25 s / 16.74 s after navigation in the two runs.
Timer delivery drifted with main-thread contention. Dev-server startup time,
network/cache warmness and evolving committed cuts are not controlled variables.
The user subsequently moved the camera/changed the sun; further runs were not
treated as same-view comparisons.

| Metric | Before | After removing redundant presentation depth passes |
| --- | ---: | ---: |
| Observation window | 32.17 s | 30.60 s |
| Receiver pages at endpoint | 281 | 221 |
| Ready pages | 280 | 221 |
| Completed 64-sample pages | 0 | 1 |
| Sum of retained/current solar sample counts | 20 | 88 |
| Depth renders | 5,449 | 176 |
| Colour passes | 5,660 | 4,092 |
| Presentation CPU wall time | 25.33 s | 9.11 s |
| Hard-capture CPU wall time | 3.22 s | 8.06 s |
| Caster-proof CPU time, included in hard time | 0.95 s | 3.10 s |
| Soft submission CPU wall time | 1.12 s | 3.62 s |
| Long-task total | 30.39 s | 30.42 s |
| Longest task | 1.86 s | 0.638 s |

The remaining long-task total is unacceptable for an interactive renderer.
These observations prove resumed soft publication and removal of repeated depth
work, **not** complete-view convergence within 30 seconds, unchanged-cut speedup,
absence of all chimney flicker, or satisfactory drag responsiveness.

## Cause and implemented changes

1. Presentation drew the common hard-shadow scene, then regenerated every ready
   uncaptured page's hard depth and colour on each frame. The bounded depth cache
   could not retain hundreds of maximum-sized pages. `captureHard` was already
   publishing reusable hard buffers independently. Ordinary presentation now
   draws the common hard scene and replays available retained buffers only.
   Explicit diagnostic sample rounds remain possible. Pending local captures
   temporarily use the existing common hard shadow, not an unlit surface; their
   final per-page allocation, solar samples and rendered display resolution are
   unchanged. This is not a claim of identical transient local shadow resolution.
2. Explicit empty geometry deltas only prepare arriving materials and repaint.
   They no longer schedule a global geometry/light refresh. Actual atomic
   receiver/caster publications still invalidate their affected bounds.
3. Hard provenance uses the same current receiver-stage error as hard readiness.
   Caster revisions are rechecked on changed page plans or published geometry,
   not for every unchanged solar sample. Readiness remains independently checked
   so metadata or payload completion can wake pending corridors.
4. Mesh request order is metadata, missing visible coverage, proven sun-corridor
   dependencies, visible detail, unrelated work. Existing shared queue limits
   and nearest-first ordering within each lane remain. This priority correction
   has unit coverage, but no isolated network-latency benchmark yet.
5. Camera receivers and depth casters have independent atomic cuts. A retained
   caster parent writes no display colour/depth and receives no shadows while
   visible children can improve. Partial children do not cast on top of that
   parent. Known empty leaves do not block replacement; unknown/external JSON
   and pending/failed payloads still do. See `CASTER-FAMILY-HANDOVER-20260909`.

## Alternatives, limits and follow-up

- Raising main-thread submission budgets was rejected in the earlier experiment:
  it trades away interaction latency and does not remove duplicate work.
- Increasing download concurrency cannot fix thousands of presentation depth
  renders. Download/parse queues remain bounded; their worker protocol is separate.
- Holding visible receiver LOD behind an incomplete caster family was reverted
  after a live coarse-surface stall. Retain depth-only parents instead.
- Current soft integration still has **one main-context scratch accumulator**.
  This change does not claim parallel GPU contexts or worker-based corridor setup.
- Next large item: geometry-only worker setup/rendering with transferred scalar
  publications and measured output parity. See `CORRIDOR_WORKERS_REVIEW.md`.
- Further profiling must examine receiver-footprint fragmentation and repeated
  retained-colour draws. Do not reduce sample count, native map resolution or
  silently switch to mono to conceal these costs.

## Focused validation

141 mesh/frontier/role/request tests pass, including loaded-child/pending-chimney
atomic replacement, independently progressing families, empty versus unknown
children, metadata/coverage/caster priority, and request retention during movement.
The obsolete move-start cancellation expectation now follows the existing pause
contract; move-end eviction is covered by corridor-demand tests.

55 scheduler/presentation/watchdog tests plus the focused scene-content test
cover hard-before-soft scheduling, independent readiness, unchanged capture reuse,
no redundant presentation depth, current-stage provenance, empty-delta handling,
solar transitions and movement retention. These mocks do not establish GPU parity
or live chimney continuity; keep those acceptance checks open.

## Follow-up: native receiver ownership and bootstrap (2026-09-10)

Decision ID: `NATIVE-RECEIVER-OWNERSHIP-20260910`.
Status: implemented and focused-tested; full-view latency acceptance remains open.

Overlapping world AABBs were partitioned into artificial receiver rectangles even
though the mesh already supplies non-overlapping surface ownership. A later live
view produced 864 stalled pages. Native mesh descriptors now carry the ephemeral
Three object ID; one native tile is one receiver, with its existing per-page
projection/anisotropic allocation. Generic/raster cells retain spatial partitioning.
The ID never enters persistent identity; `shared-scene-corridor-v2` and explicit
receiver-mode keys prevent reuse of old AABB-owned masks.

During depth-and-colour capture, per-draw colour/depth write suppression restricts
receivers but leaves every caster visible to Three's earlier shadow traversal.
During retained colour replay, shadow updates are disabled and unrelated mesh
draws are temporarily hidden/restored, including on errors. Receiver ancestors,
lights and originally hidden state are preserved. This avoids shading invisible
fragments merely to suppress their writes; no caster is removed during capture.

A second, independent global blocker survived the earlier scheduler changes:
`shadow-bootstrap-preview` waited for **all mesh request demand to reach zero**
before constructing the tiled renderer. It now latches completion at the first
renderable mesh. A pending second source cannot block an available corridor.
Regional readiness still certifies each individual hard/soft capture.

Internal-browser 30-second observations, unchanged follow-up camera
`lat=51.2718342&lng=7.1997918&zoom=18.281&b=180.23&p=37.28&shadow=814;19`:

| Metric | Native ownership + bootstrap fix | Also colour-only replay exclusion |
| --- | ---: | ---: |
| Adapter construction after navigation | 2.766 s | 2.926 s |
| Adapter observation window | 30.176 s | 30.321 s |
| Receiver pages / ready pages | 105 / 25 | 187 / 46 |
| Completed 64-sample pages | 2 | 2 |
| Retained/current solar samples | 151 | 166 |
| Depth / colour pass counts | 428 / 8,025 | 524 / 12,277 |
| Capture fallback | none | none |

Progressive cuts and cache warmness differ, so these are not an isolated speedup
factor. Colour pass counts are not geometry draw counts. They prove that tiled
soft integration starts and publishes before global request idleness, but still
show unacceptable queue latency. The watchdog still reports ready pages waiting
over 20 seconds and other pages waiting for regional readiness. One main-context
scratch integration and repeated scene traversals remain unresolved costs.

Actual internal-browser WebGL2 parity test (256² output, 1024² PCF depth): two
adjacent receivers sharing a material and a chimney outside the observer frustum.
Both native capture and colour-only replay match the full-scene reference with
**zero differing pixels**; removing the offscreen chimney changes 1,603 pixels.
Artifact: `output/shadow-native-owner-check-20260910.html`. This verifies the small
opaque reference scene, not arbitrary transparent geometry or all Geoportal LODs.
Temporary 30-second instrumentation was removed; the permanent stall watchdog
remains. No full DevTools trace, GPU-worker implementation, or full-view 30-second
convergence is claimed.

Final follow-up validation: 112 tests across bootstrap, native receiver ownership,
renderer, receiver grid, tiled adapter, accumulator and watchdog pass. This includes
renderer wiring that excludes other objects only with shadow updates disabled,
preserves all casters during sampling and refuses capture of a disposed receiver.
The earlier 141 mesh tests and focused scene-content test remain the separate
validated scopes. No broad build/lint/typecheck was run.

## Receiver draw elision

**ID / date / status:** RECEIVER-DRAW-ELISION-20260910 / 2026-09-10 /
implemented; GPU performance and output parity pending.

**Context and constraints:** Material write masking still submits unrelated
receiver triangles on every sun sample. All light-camera caster draws, including
offscreen geometry, must remain available. Keep 64 samples and physical resolution.

**Decision:** Temporarily intercept `renderer.renderBufferDirect` during a receiver
capture and skip meshes outside its subtree only for the capture camera. Restore
the original method in `finally`. Colour-only replay retains its separate visibility
filter with shadow updates disabled. Three's installed renderer and shadow-map
implementation both dispatch through this public draw entry.

**Alternatives and disposition:** Material write masking is the frozen benchmark
baseline, not a measured rejection. Hiding unrelated casters during combined
passes is incompatible by inspection. Shared depth passes and GPU workers remain
deferred; this change does not remove scene traversal or main-thread submission.

**Evidence:** Receiver tests cover camera separation, all casters, shared resources,
exception restoration and missing receivers. The reproducible browser entry is
`test/benchmarks/receiver-draw-elision.html`: 100 spheres and an offscreen chimney,
64 identical sun positions, 512-square R32F capture, 1024-square PCF depth, one warmup
per arm and five alternating pairs. Timing includes integration, publication and
blocking float readback; output reports pixel parity, draw/triangle counts, median
and maximum times, browser and GPU. No GPU result or whole-app speedup is claimed.
Memory cost and interaction latency are not measured by this synthetic benchmark.

**Revisit when:** The browser benchmark fails parity, Three changes its draw entry,
or whole-app traces show that remaining traversal/depth work dominates.

## Frame-local corridor queries

**ID / date / status:** FRAME-CORRIDOR-QUERIES-20260910 / 2026-09-10 /
implemented; whole-app latency measurement pending.

**Context and constraints:** Hard capture, restore preparation, soft scheduling
and retained presentation query the same caster trees before the sample budget
is applied. `isRestorePending` even constructed a persistent identity with no
pending restore. These queries run on the MapLibre rendering thread.

**Decision:** Return immediately for absent or differently sampled restores.
Reuse exact region revisions (including null) and receiver stage errors within
the existing synchronous tile-volume snapshot. Nested draws preserve the enclosing
snapshot; all memoized results expire on exit, including exception paths.

**Alternatives and disposition:** Cross-frame revision memoization is deferred
until all source/metadata invalidation inputs have a proven version contract.
Reducing pixel resolution or sun samples is outside the task's quality constraints.

**Evidence:** The existing scene integration regression repeats the same hard and
soft revision queries for 100 receivers and expects only two provider reads per
draw. Subsequent draws change provider readiness/revision, including null results,
and must observe the new state. The restore regression expects no identity calls
for absent or wrong-sample pending work, and one for a matching pending restore.
This bounds repeated query work; it does not measure GPU or whole-app acceleration.

**Revisit when:** Remaining profile cost is in unique-region queries, descriptor
construction, or depth submissions rather than repeated queries.

## Production preview workflow

The untracked local helper `scripts/geoportal-preview.mjs` is not part of this PR.
Run it with Node from the worktree. The local server uses
port 4300, builds `geoportal:build:production` with Nx, watches app/library/config
changes with a three-second debounce and serializes builds. The existing
`cesium-core -> resources -> cesium-core` task cycle requires
`--excludeTaskDependencies`; Vite still bundles library source normally.

Each successful build has an immutable `/build/<id>/` URL and `build-info.json`
with HEAD, dirty status, tracked diff hash and build times. A build whose sources
changed during compilation is not published. Opening `/` selects the latest build;
an existing tab never reloads automatically. Build logs and artifacts remain in
`dist/preview/geoportal/`; failed builds do not replace the last good one.

Use `kill -USR1 <preview-pid>` to pause rebuilds, then inspect
`/__preview/status` until `building` is null before measuring. Resume with
`kill -USR2 <preview-pid>`. Keep viewport, physical resolution, Mesh2024, sunlight,
64 samples and cache warmness fixed. Build completion alone does not establish
interactive performance or GPU output parity.
