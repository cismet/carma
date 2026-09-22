# Tile diagnostics: library service, lazy story UI

**ID / date / status:** TILE-DIAGNOSTICS-WEBGPU-20260916 / 2026-09-16 /
implemented; focused tests and bounded Chrome interaction checks, not a full-app FPS guarantee.

## Context and constraints

The tile manager is a scene-data service, not story or React application logic.
Diagnostics must not change its request decisions, delay input with drawing work,
or create an unbounded queue. The display target is 60 Hz; source observations
need not run at 60 Hz. User interaction takes priority over diagnostic freshness.

## Decision

- The library owns the explicit `runtime.debug.readState()` contract, bounds,
  quality/queue/coverage derivation, snapshot capture, reusable 3D extent buffers,
  transferable protocol, scheduling, and TypeGPU worker renderer.
- Stories own only diagnostic presentation and interaction: windows, controls,
  legends, charts, and attachment to their map. No global runtime-registry lookup.
  Follow viewport is the default, with adjustable follow padding: 100% fits the
  projected viewport footprint, 200% doubles its extent (default). The former
  fixed 40-overview-unit floor is removed so high-zoom following does not stop.
  The focused overview window (floating or external) supports left-drag pan,
  Ctrl+left-drag/right-drag orthographic orbit around the clipped content-bearing
  frustum volume, wheel zoom, and double-click reset. Pan or zoom detaches the
  crop into free view; orbit keeps the focused crop. The map overlay never
  intercepts pan/zoom; returning
  from a free window view to the overlay selects Full extent.
- `loadTileDiagnostics()` is the only value export at the library root for the
  new diagnostic implementation. The remaining public diagnostic exports are
  types. The closed story imports neither its panels nor the diagnostic entry.
  TypeGPU 0.12.5 is pinned and imported only inside the dedicated worker.
- Live Tile/Three objects stay on their owning thread. Capture yields between
  batches and serializes numeric arrays, not scene objects. It reads the compiled
  camera union; it never calls the vendor traversal callback to estimate SSE.
- Tile-state snapshots default to a 10 Hz cap. The overview legend also offers
  **Every render frame**: each scene render requests capture in a deferred
  user-visible task without the cap or idle wait. At most one capture runs;
  intermediate requests coalesce into one latest follow-up. Unchanged snapshots
  still reuse buffers, statistics retain their sampling interval, and diagnostics
  never start a scene repaint loop. This opt-in mode can consume more CPU.
  Camera matrices have a separate latest-wins mailbox, independent of capture
  scheduling and tile-frame completion. The scene callback only records the
  latest camera references and schedules at most one user-visible task. That
  task dispatches camera matrices and projects DOM labels outside scene rendering;
  the worker clips the current
  frustum into the resident snapshot's coordinate frame and draws on demand at
  display refresh. No camera interpolation, 100 ms capture gate, or idle wait.
  Camera motion updates only the small frustum buffer tail and view uniforms,
  not resident tile geometry. Load states and coverage claims are never interpolated.
- **Window isolation (2026-09-16):** tile snapshots publish directly to the
  overlay component, not React state in the window container. New snapshots
  therefore cannot recompose every toolbar, panel and options section. React
  snapshot/statistics updates use interruptible transitions; window interactions
  remain urgent. Panel dragging measures bounds once and uses `translate3d`
  until release, avoiding per-pointer layout reads and React updates.
  A focused UI regression publishes 60 snapshots and verifies one chrome render,
  one worker controller, latest snapshot delivery and subscription disposal.
  This proves update isolation, not 60 FPS: scene rendering and DOM interaction
  still share the browser main thread. No end-to-end speedup measurement yet.
- One frame/GPU completion is in flight. Pending updates replace each other;
  changed snapshots encountered during serialization are discarded. Unchanged
  models retain GPU storage and render bundles. Stationary views have no worker
  animation loop. Worker failure disables the overlay, not the map.
- One analytic instance draws an entire concentric circle/square stack.
  TypeGPU schemas define CPU/WGSL layout; native WebGPU encodes the draw.
  Progress is a clipped left-to-right phase fill (not a download percentage).
  Separate transparent canvases implement the narrow darken contrast stroke,
  foreground, and worker-rendered text. Only the external overview has tile fills.
- Disposal releases GPU resources, removes canvases/observers, cancels pending
  capture work, and terminates the worker, with a bounded fallback timeout.

### Replacement

Replaces the per-tile SVG tree and story-owned geometry/state derivations in
`TileLoadingDebug.tsx`. Its former glyph module is removed, not retained as a
second drawing pipeline. The UI now lazy-loads `TileLoadingDebugContent.tsx`.
The earlier SVG-specific notes in `TILES_COVERAGE.md` describe historical evidence,
not the active implementation.

## Alternatives and evidence

Standalone experiments were intentionally outside CARMA:
`carma-overlay-bench.ENkk7u/` (README, scripts, results.json,
stress-results.json). Chrome 152, Apple M4 Max; Three 0.186.0 versus custom WebGPU,
3840×2160, analytic lines/circles/squares, one draw, matching scene/matrix.
Main GPU matrix: three rotated-order repeats, 20 warm-up + 80 paced frames and
20 timestamp draws. Heavy follow-up: three repeats, 20 warm-up + 120 frames,
at most two outstanding completions, 20 timestamps. Initial uploads excluded.

| Workload | Three GPU p50 | WebGPU GPU p50 |
|---|---:|---:|
| 100k fixed-size primitives | 2.04 ms | 1.18 ms |
| 1M fixed-size primitives | 8.03 ms | 6.42 ms |
| 1M bounded-queue follow-up | 8.19 ms | 7.08 ms |

Heavy follow-up GPU p95: 8.88 / 7.60 ms; submission interval p95:
10.40 / 7.70 ms. These are standalone results, not production-map gains.
Its 32-byte primitive layout differs from the integration's 64-byte instance
containing style data; the integration uses one instance for all concentric rings.

- **Measured rejection for this workload:** scalar WASM rasterizer and Canvas2D
  per-primitive drawing, materially slower in the 1k–10k/4K matrix.
- **Viable, not rejected:** separate Three/WebGL2 instance. WebGPU won the
  measured high-overdraw GPU cases; initial pacing-only results were a tie.
- **Not evaluated:** bare WebGL and Slug/forks. General curve/font tessellation
  is unnecessary for these analytic primitives.
- **Accepted early-adopter tradeoff:** TypeGPU remains pre-1.0. Schema generation,
  typed buffers and isolated adoption justify the explicit pin for debug only.

Integration check: 746 instances, 128 KiB allocated geometry storage, synthetic
120-frame overview wheel loop: browser rAF interval p50 6.9 ms, p95 7.5 ms,
max 7.7 ms (119 intervals), and zero geometry uploads during interaction.
Worker acknowledgement wall time was about 2.7 ms including completion wait.
This is not input-to-photon latency or a GPU timestamp measurement. Three
viewport-sized canvases, uniforms, CPU snapshots and driver allocations are
additional memory; no claim of measured peak process memory.

23 focused tests cover projection, symbology, read-only capture,
latest-wins updates, GPU-buffer reuse on pan, failure handling and disposal.
These include perspective/orthographic live-camera projection and immediate
matrix delivery while a tile frame is still unacknowledged, without tile repacking.
A bounded one-second MapLibre ease produced 107 camera messages versus four tile
snapshots (camera delivery interval median 8.1 ms, p95 17.7 ms). The live follow
overview rendered without console errors. These are message-delivery intervals,
not input-to-photon latency or proof of sustained 60 FPS.
Frame-mode smoke test on the same Chrome client: 108 scene renders produced 108
camera messages and 33 changed tile snapshots during a bounded camera ease.
No console errors. This demonstrates per-render notification and coalescing,
not one full tile audit per displayed frame; expensive capture remains cooperative.
A fresh `debug:false` story loaded only the tiny lazy-loader module, no
diagnostic implementation or TypeGPU. Disabling debug removed the overlay and
registry entry and terminated the tracked worker while the map canvas remained.
Wireframe proxies share source geometry and release only owned diagnostic
resources; hover boxes are disposed on teardown. The external-window canvas
also rendered successfully with its own viewport dimensions.
A load-time traversal exception from unprepared child metadata was also guarded:
unknown children are not treated as proven non-renderable floor leaves.

## Remaining boundary / revisit when

### TILE-DIAGNOSTIC-CADENCE-20260916

**Date/status:** 2026-09-16; retain both cadence options. An A/B benchmark is required before deleting the 10 Hz path. Per-render display and camera delivery
must not be confused with completion of per-tile quality snapshots.

**Method:** actual Mesh Coverage story on local macOS Chrome 152; 982 × 1061 CSS
pixels, DPR 2 (1964 × 2122 map framebuffer). No separate GPU/CPU model query or
GPU timestamp measurement. HEAD `1b219d568` plus the current uncommitted diagnostics
implementation. Three roughly four-second runs per mode in A/B/B/A/A/B order;
eight seconds of path warm-up, with another six-second settle after the reload
for the priority trial. Center `[7.2186755489, 51.2692149846]`, zoom 16.2413,
pitch 60.2732°, bearing -104.6396°. Four 950 ms eases with small center, zoom and
bearing offsets, separated by 50 ms. Counts include page rAF, map render events,
worker mailbox snapshots/camera messages, worker acknowledgements and long tasks.
The trial also wraps scheduler callbacks to measure synchronous task CPU and wait.
These wrappers have overhead; there is no input-to-photon or isolated GPU timing.

| Workload | 10 Hz map FPS (three runs) | Frame mode map FPS (three runs) | Snapshot delivery |
| --- | --- | --- | --- |
| Original scheduler | 83.9 / 73.4 / 85.9 | 71.7 / 86.6 / 74.2 | Only four total across all six runs |
| User-visible continuation trial | 73.9 / 71.0 / 74.3 | 51.6 / 56.1 / 52.6 | Only one total across all six runs |

Original-mode rAF p95 ranged 14.6–21.3 ms versus 14.6–21.5 ms in frame mode.
The trial's rAF p95 was 20.8–27.7 ms versus 27.7–28.5 ms. Zero observed long-task
entries do not establish smoothness: the trial had one 63.2 ms rAF interval.
Worker acknowledgement samples were sparse (5–8 ms), not evidence of overall
snapshot throughput. A separate six-second tiny-bearing probe on loaded tiles
found one background continuation waiting **4577.9 ms**. Stationary visible tasks
were cheap: p95 0.5 ms over 64 callbacks. The limiter is not demonstrated to be
raw overlay rasterization alone.

**Parity/memory limits:** initial resident pool was about 613–661 tiles and
3.76–4.17 GB. The reloaded trial oscillated around 589–955 tiles, 3.57–6.44 GB,
with parsing backlogs of 100+ and effective error switching between 4 and 6 px.
Thus warm-up did not achieve a steady loaded pool, output/quality/cache parity
was NOT established, and these numbers are not an isolated causal speed ratio.
They do expose a real under-load case below the 60 FPS target, with stale diagnostic
snapshots. Peak process/driver memory and fully offscreen window behavior were not
measured. No production bundle, broad tests or cold-load performance acceptance.

**Decision:** do not delete the 10 Hz path on this evidence. A trial promoting
all cooperative capture/serialization continuations to user-visible priority
passed its three targeted scheduler tests, but was **reverted** after the runtime
comparison: greater CPU activity without sufficient snapshot completion is not
an acceptable responsiveness tradeoff. Keep the latest-wins/coalescing safeguards.
Next investigate bounded quality-estimation work and snapshot completion while
the tile pool changes, then repeat on a stable pool and the loading workload.
Deleting the cadence path is deferred, not rejected permanently.

`?` is drawn when a non-ancestor, non-baseline tile has no finite quality-step
estimate and no active processing symbol. It is not a download failure. A tile
retained outside all requesting cameras can have no required screen-space error;
missing bounds/error metadata or invalid targets can also leave its estimate null.
`≈` denotes an estimate, rather than a missing value.

The original comparison and reverted priority trial are retained as local raw
evidence; only the portable browser harness is published.
Manual browser harness: [debug-cadence-browser.js](benchmarks/debug-cadence-browser.js).
Run the function in the Storybook console while the actual runtime and cadence
controls are available; it restores camera/control settings. Re-running on current
source uses the restored original scheduler, not the rejected priority experiment.

Live scene observation, React controls, CSS labels and optional 3D helpers still
use the application thread. Cooperative capture is not a zero-cost guarantee;
tile hierarchy traversal and individual quality calculations are not preemptible.
Review those capture slices if representative motion exposes long tasks.
Main-scene tile preparation and GPU contention remain independent bottlenecks.
Revisit on a TypeGPU upgrade, device loss, GPU-less browsers, very large diagnostic
pools, or measured application-frame interference. Do not restore a second SVG
pipeline to conceal a renderer failure.

## Debugger UI and runtime handles

The tile manager debugger (toolbar, panels, overlays) lives in
`libraries/mapping/tile-diagnostics-ui`; the stories and the geoportal mount
the same component. It needs the full runtime handle, which
`Tiles3dLayerManager` registers per map: `getTiles3dRuntimeHandles(map)` and
`subscribeTiles3dRuntimeHandles(map, listener)` from
`@carma-mapping/engines/maplibre`. The geoportal shows the debugger only with
the development UI (localhost or the developer-mode flag), through
`TileLoadingDebugHost`; the debugger switches runtime diagnostics on itself
(`runtime.debug.setDiagnosticsEnabled`) when it opens, so a style does not
need `diagnostics: true` for it.

The expanded shared toolbar exposes each diagnostic panel directly in both
hosts. The overview `kB` button toggles the square resident-size grid and
rounded size labels; `ms` independently toggles processing-time pies. Size
marks are enabled by default, time pies are opt-in. Both mesh and terrain
records use the same worker renderer and square-grid primitives.

## Frustum markers

**ID / date / status:** FRUSTUM-MARKERS-20260920 / 2026-09-20 / implemented.

**Context and constraints:** At high zoom, an extra centre cross grew with the
inverse footprint size into a long horizontal stroke. Separately, vertical
frustum edges disappeared because the shader used only `dpdx(p.x)` and
`dpdy(p.y)` in the rotated segment frame: both vanish at 90 degrees.

**Decision:** Draw the intersections of frustum planes with every reported tile
bounding box, without bridging gaps between tiles or adding a centre cross.
Keep the convex extent outline separately for framing. The light uses all12
edges unprojected from the actual addon orthographic camera matrices, drawn in
faint lemon. A fixed-size filled triangle at the near-plane centre points along
the projected light rays. This replaces the footprint-clipped chevron (2026-09-22). Derive the pixel footprint from the lengths of both full
local coordinate gradients, preserving stroke width under segment rotation.

**Alternatives and disposition:** More hull-area/sliver filtering is incompatible
by inspection with these causes: neither originates in the intersection hull.
Keeping a screen-sized centre cross is not evaluated; it adds an unnecessary
mark alongside the light triangle.

**Evidence:** Chrome WebGPU, a 100 x 100 offscreen canvas, a square cut from
(20,20) to (80,80), DPR 1. Summed alpha over the middle 50 pixels of each edge:
before, top/bottom 20400 each and left/right 0; after, all four 20400.
The focused scene regression checks that a small footprint emits only its
boundary segments, and an empty cut emits no centre marks. Live high-zoom
Geoportal validation uses the existing localhost:4200 server.

**Revisit when:** Adding another marker or a nonuniform/sheared diagnostic
projection; retain rotation-independent stroke-width coverage.


### Readable IDs and native mesh presentation phases (2026-09-20)

Labels extract the content identity from stable `tilesetUrl#tree:contentUrl`
keys and display compact z/x/y or filename IDs. The ID components occupy three centred rows at 10 CSS px with a 10 px line
height and no extra row spacing. Type-only labels are omitted. Canvas text is fixed-size;
labels that exceed their tile, or overlap another label, are omitted rather than
shrunk or drawn across neighbours. Offscreen status remains a visual property
and no longer inflates every ID with repeated prose.

Native 3D tiles now provide the same step-array contract as raster terrain:
queue waiting, transfer, parsing, scene setup, waiting for the first observed
primary-camera draw, and additional waiting for shadow presentation. Download
and parse timestamps are captured independently of the old bounds-debug toggle.
`onPresented` acknowledges settled mono/progressive shadows or the direct path
when no shadow work is pending. It freezes the initial tile presentation timing;
it is not a per-sun-change benchmark. Queue waits before transfer and parsing
share the Warten wedge; Schatten has its own colour. Actual draw time is never
inferred merely from membership in a visibility set. Retry resets timestamps.

### Reported tile membership and plane cuts (2026-09-20)

The overview is not a list of only currently displayed tiles, nor a complete
memory inventory. Terrain reports visible published meshes, a bounded selection
of resident hidden meshes, and pending mesh bounds. Native 3D tiles report the
runtime active set, including shadow demand; membership alone does not establish
a primary-camera draw. Mesh cuts now use only presented content boxes (see Surface cuts below);
terrain volumes retain their independent reporting contract.
Focused regressions cover gaps between tile boxes, the actual asymmetric
orthographic near plane (WebGL/WebGPU, including reversed depth), parallel
frustum edges, and the fixed-size light-direction triangle.

## Surface cuts share the loader's camera and bounds

**ID / date / status:** TILE-SURFACE-CUTS-20260922 / 2026-09-22 / implemented.

**Context and constraints:** The overview used the render camera while tile
selection uses the LOD camera. Outlining the clipped solid also drew edges
between frustum planes inside a tile. Rotating tile OBBs into enclosing world
AABBs inflated both diagnostic cuts and additional-camera demand.

**Decision:** Publish the loader's LOD camera to diagnostics. Preserve each
tile's native box and local-to-world matrix for demand and diagnostic capture.
Intersect the four side frustum planes with tile faces in 3D, then clip each resulting
line segment against the other frustum planes before projecting. Never close
clipped polygons or draw free-standing frustum edges. A contained tile has
demand but no cut lines; an outside tile has neither. Near/far planes constrain
visibility and clip the segments but never generate lines. Orthographic demand also checks exact convex intersections for partial
boxes; fully contained boxes retain a cheap six-plane acceptance path.

**Alternatives and disposition:** Outlining cap polygons, projecting enclosing
AABBs, and using the render camera are rejected by the geometric counterexamples.
This supersedes the complete light-box outline in Frustum markers above; the
light direction marker remains. Contentless routing nodes are omitted entirely;
cached ancestors retain inspection marks but only presented content and underlay
boxes produce white cuts. This avoids projecting the deep underside of a
non-rendered city-wide ancestor as an apparent ground footprint.

Coverage colors distinguish viewport demand (cyan), offscreen sibling/ring
support (amber), and extent base coverage (pink); retained cache remains muted.
The overview starts top-down. Orbit rotates the worker's world-to-overview
projection around the clipped frustum's bounding-box centre, then reprojects
both oriented tile boxes and exact frustum-plane cuts from their 3D source.
It changes diagnostic presentation only; loader camera demand and FOV are
unchanged. Box glyphs remain projected 2D bounds in the orthographic view.

Mesh triangle intersections are not calculated:
these are the same tile bounding volumes used for selection.

**Evidence:** Tests cover contained/outside/behind/far/enclosing tiles, surface
and plane membership of every segment, and a rotated thin box whose AABB hits
the frustum while the actual box misses. Existing multi-camera, spatial, capture
and viewport regressions exercise the shared contracts.

**Revisit when:** Sources supply tighter content bounds or actual surface cuts
are requested instead of tile-volume cuts.
