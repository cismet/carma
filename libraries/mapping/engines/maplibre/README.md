# engines/maplibre

## Published corridor invalidation — CORRIDOR-PUBLICATION-20260909

- **Status / scope:** Implemented, uncommitted; mesh publication and soft-shadow
  liveness, not a new loader or a change to solar-disc quality.
- **Cause:** Model decoding and selection into the rendered tile cut are separate
  events. A regional readiness query between them can cache a negative result.
  Publication previously invalidated neither that proof nor an already captured
  depth buffer, so a corridor could keep waiting or reuse outdated casters.
- **Decision:** Compare the previous/current committed caster sets. Transform the
  symmetric difference's native bounds into scene coordinates and invalidate only
  intersecting regional proofs; notify the existing coalesced content-change path
  for the same bounds. Unknown bounds conservatively invalidate all. An unchanged
  cut emits nothing. Keep per-corridor completion and retained scalar/depth replay;
  a ready corridor does not wait for siblings and never exposes partial samples.
- **Alternatives:** Rejected retaining coarse ancestor families across both view
  and sunward demand: the live scene regressed to eight coarse surfaces despite
  loaded detailed children. That experiment is not retained. A global queue-idle
  gate would unnecessarily block otherwise complete corridors.
- **Evidence:** 67 focused publication/frontier/architecture tests and 89 focused
  accumulation/presentation/adapter tests pass. The new tests cover publication
  after decode, unchanged-cut reuse, unaffected regional proofs and a ready
  corridor completing while its sibling remains blocked. In the existing MeshX
  2024 chimney view, all 107 corridors became ready and completed 512-sample
  publications increased from 3 to 7; offscreen shadows were visible. Full-set
  completion and startup performance are not yet acceptance-tested. Debug now
  exposes ready-corridor count and maximum sample progress separately.
- **Revisit:** Measure cold-load convergence and full-set completion before
  claiming production acceptance. Keep publication invalidation even if decoding
  or traversal moves to another worker; decoding alone is not scene membership.

## Runtime composition — RUNTIME-SPLIT-20260909

### Scoped public API — RUNTIME-API-20260909

- **Status / date:** Implemented, 2026-09-09. Replaces the flat
  `ThreeTilesRuntime` control surface, without compatibility aliases.
- **Decision:** `runtime.scene` is the existing `SharedThreeSceneRuntime`
  adapter registered with the renderer. UI controls use `runtime.appearance`
  (materials, opacity, visibility and texture projection), `runtime.loading`
  (SSE, cache and concurrency), `runtime.placement` (origin and height offset),
  and `runtime.debug` (tile visualization). Shared host capabilities point at
  the same owner functions; they do not introduce forwarding wrappers.
- **Identity / frequency:** All groups are constructed once per runtime.
  `scene.update` is the frame callback, not a React state update. The mutable
  engine state remains instance-owned with typed owner slices; splitting or
  copying it into React contexts would not reduce renderer work. Debug geometry
  is absent while disabled and refreshes at most once per second while enabled.
- **Alternatives:** Nesting every shared-scene provider was deferred: it would
  widen this refactor to raster, point-cloud and generic scene integrations.
  Memoization or separate React providers were rejected by inspection because
  this factory is imperative and already held in refs, not recreated per frame.
- **Evidence / limits:** Consumer managers register only `.scene`; API tests
  assert stable group and update references after appearance changes. This is
  an ownership/API refactor, not a measured frame-rate or shadow-speed gain.
- **Revisit:** Split a debug subscription from the frame loop if profiling
  finds material diagnostic overhead; do not add duplicate state preemptively.

### Runtime owners

- **Status / date:** Implemented, 2026-09-09; behavior-preserving extraction of
  the existing 3D Tiles runtime, not a replacement loader or a caster fix.
- **Context:** The 3,585-line closure mixed engine lifetime, loading, materials,
  spatial queries, shadow corridors and diagnostic rendering.
- **Decision:** `three-tiles-runtime.ts` only constructs the instance and wires
  its public methods. `three-tiles-runtime-lifecycle.ts` owns engine attachment,
  events, frame updates and disposal; `-loading.ts` owns queues, memory and SSE;
  `-shadows.ts` owns receiver/caster selection and corridor revisions;
  `-spatial.ts` owns bounds, frustums and screen errors; `-appearance.ts`,
  `-projection.ts` and `-surfaces.ts` own materials, projection and topology;
  `-debug.ts` observes their state.
- **Access:** Import types directly from `three-tiles-runtime-types.ts` and
  tuning constants from `three-tiles-runtime-config.ts`. The package root keeps
  its existing public exports, pointing directly at these owners. Internal
  factories remain private to the package. Vendor compatibility lives in
  `-vendor.ts`, not in the public configuration module.
- **Ownership:** `-state.ts` allocates per-instance state; `-context.ts` declares
  its contracts. Each owner receives explicit typed state slices and callbacks.
  Factories must stay inert; engine subscriptions begin only in `onAdd`.
  This preserves callback identity without circular runtime imports.
- **Alternatives:** Rejected a second loader, global mutable services and an
  untyped catch-all context. A new package or new alias adds no useful boundary.
- **Evidence:** The before/after focused runtime/frontier run has the same
  73 passing and seven failing cases. The known reload/offscreen-chimney and
  convergence failures remain open; this refactor does not claim to fix them.
  The architecture test enforces at most 1,000 lines per runtime module and
  no type/configuration re-exports from the entry file.
  Final scoped runtime/frontier, architecture and layer-manager verification:
  93 passing tests, the same seven pre-existing failures; no TypeScript
  diagnostics in the extracted runtime modules. The facade is 189 lines;
  the largest owner is 995 lines. No full build or browser acceptance claimed.
- **Revisit:** Split a concern again when its responsibility or line budget
  grows; do not move traversal or shader algorithms back into the facade.

## Shared caster volumes — TERRAIN-VOLUMES-20260908

- **Status / scope:** Implemented, uncommitted. Native mesh bounds and raster
  terrain now use `core/shadow-receiver-mask.ts`, the same light-space receiver
  BVH and sunward sweep test, including the finite solar-disc angular margin.
  Loader ownership, decoding and publication remain source-specific.
- **Decision:** Keep observed native raster min/max per source and exact z/x/y
  independently of resident geometry. Reconstruct horizontal bounds from the
  tile address; project the resulting 3D volume into the current local frame
  only for selection. Cache hits and normal foreground/idle tile loads populate
  the index. No separate speculative raster download or conversion is needed
  just to rediscover an already known vertical extent.
- **Persistence:** Use the existing derived-buffer cache through the terrain
  worker pool, with a separate `terrain-height-metadata` asset registration.
  Source/configuration/revision and no-data identity isolate records; immutable
  main + worker asset hashes and the metadata schema version invalidate them.
  Bounded Float64 rows `[z,x,y,min,max]` cost 40 bytes per tile, at most 640 KiB
  for 16,384 observations per source, before storage overhead. Source-scoped
  Web Locks serialize conservative read/merge/write across workers and tabs.
  Changed values batch for one second; foreground-preempted writes retry up
  to three times. No write is required for an unchanged observation.
- **Responsiveness / fallback:** Initial metadata lookup waits at most 50 ms;
  a late successful restore invalidates selection and requests repaint. Reads
  and storage/merge operations use existing workers. Missing, malformed,
  evicted, denied or too-slow metadata does not prevent terrain loading.
  RAM observations remain useful. Persistence deliberately fails closed in
  unbundled HMR, where no immutable producer graph is available. A service
  changing bytes at a stable URL must change the resource `revision` (or use
  immutable URLs); no client-only index can certify silent source changes.
- **Rejected alternatives / safety:** Do not copy the mesh corridor algorithm,
  retain large meshes just for bounds, or persist origin-dependent boxes.
  Coarse raster extrema are **not** certified descendant bounds: resampling
  can hide peaks. Unknown child traversal retains the configured conservative
  height envelope; final selected payloads are filtered against receiver prisms
  before download. This is not a precomputed complete dataset hierarchy, and
  genuinely required caster geometry still has to load.
- **Verification:** Focused tests cover known-height rejection versus unknown
  conservative selection, mesh/terrain corridor queries, finite-disc margins,
  binary validation and conservative merges, producer/source isolation,
  bounded startup, late restore/disposal and worker preemption: 146 engine
  tests and 45 shadow-scene tests passed. Existing
  Playwright MeshX view retains mesh and caster shadows at 2400 × 2398 physical
  pixels with no new page errors; capture: `output/playwright/terrain-volume-smoke.png`.
  Production persistence is covered by focused tests, not a new production
  build or device storage benchmark; no measured end-to-end speedup is claimed.
- **Revisit:** A server-published, versioned min/max hierarchy with certified
  descendant bounds would additionally prune traversal before reaching the
  final payload LOD. Optional storage must remain recoverable, never authoritative.

## Local mesh refinement — MESH-PROGRESSIVE-20260908

- **Decision:** Request coarse coverage first (16px bootstrap), then release the next generation independently beneath each loaded local fallback. Display a complete loaded cut per camera-intersecting REPLACE family; ready grandchildren can coexist with a coarse sibling. Keep the existing no-downgrade frontier and request deduplication. Recompute the cut only after an actual traversal, not every idle frame.
- **Cause / alternatives:** The global admission stage waited for the whole view; a separate upstream ancestor fallback also waited for offscreen sibling content. Removing only the admission gate still reproduced a single coarse tile until about 14.7s in the original Playwright view. Do not overlay a partial child group on its parent (double surfaces), or treat failed/unknown content as loaded coverage. Local family replacement remains atomic where clipping would otherwise be required.
- **Validation:** Focused policy, frontier, runtime liveness and error-target tests cover independent ready branches, pending offscreen metadata, incomplete visible children, unchanged retry/deduplication and target limits. Browser timing is diagnostic, not a controlled throughput benchmark; network/cache state and the interactive camera can change during inspection.

## Mesh layer opacity — MESH-OPACITY-20260908

- **Decision:** Full-opacity shadow styling normalizes authored material opacity only. Apply the layer/modal opacity afterward as the final multiplier; enable transparency and disable depth writes below full layer opacity. Restoring full layer opacity restores the appropriate opaque/source render flags. No terrain visibility changes.
- **Cause / rejected alternative:** The previous full-opacity branch forced material opacity to 1 and ignored the correctly forwarded layer slider. Disabling shadow styling or recreating the runtime was unnecessary; the existing opacity setter refreshes materials and projection caches in place.
- **Evidence:** 34 focused runtime/manager tests pass, covering opacity during shader changes and restoration. Existing Playwright MeshX session: modal values 0.1/0.5/1 reach material opacity directly, retain the sampled material UUID, and restore transparency=false/depthWrite=true at 1. Screenshot: `output/playwright/mesh-layer-opacity-half.png`.

## Dataset texture correction — MESH-ALBEDO-20260908

- **Decision:** Store gamma, black/white point and saturation on the Mesh 2024 resource's `colorCorrection` metadata, including its explicit MeshX delivery URL. Catalog-authored profiles override this resource fallback; unrelated URLs get no calibration. `Tiles3dConfig` passes the profile into generic Three runtime uniforms. Cesium's existing `UNLIT_ENHANCED_2024` reads the same resource values. The shadow UI enables the stage by default, retains a toggle and all existing controls, and defaults color replacement to 0%.
- **Lighting:** `core/mesh-surface-shader.ts` corrects texture/vertex RGB, applies saturation, then mixes the chosen albedo after `color_fragment`, before physical lighting. Three's real-normal diffuse response, sky lighting and occlusion shade the color contribution exactly once. The toggle updates shared uniforms without replacing loaded mesh materials.
- **Alternatives:** Mixing after lighting would overwrite directional shading and shadows. An extra cosine multiplication would double-darken grazing faces. Dividing baked photography by the current solar cosine cannot recover capture-time illumination or occlusion and amplifies noise. This profile is a display correction, not genuine de-lighting; no claim of recovered physical albedo.
- **Evidence:** 82 focused runtime/metadata/state/scene/UI tests pass. Playwright confirms the active MeshX profile reaches the shader (gamma 1.25/1.25/1.23), correction on, mix 0; on/off/on preserves the sampled material UUID. Paired screenshots under `output/playwright/mesh-color-correction-{off,on}.png`. Existing Matomo/style metadata/AntD diagnostics remain outside this change.
- **Revisit:** Calibrate against neutral reference surfaces/capture illumination before claiming photometric accuracy; publish `colorCorrection` in the remote tiles3d style metadata to remove the local-resource fallback.

## Adjusted basemap policies — MAP-STYLE-POLICY-20260908

- **Decision:** Configure textured-mesh paint, sprite tint, contour opacity and default house-number visibility in `src/lib/core/mesh-map-style.ts`. Configure terrain/LoD2 albedo, relief removal, elevation visibility and sun-colored label halos in `src/lib/core/terrain-map-style.ts`. The latter absorbs the former `style-composition/terrain-drape-style.ts`; existing public preparation exports remain unchanged.
- **Runtime boundary:** The shared scene registry owns reversible MapLibre writes, capture ordering and change detection, not style values. One visibility decision combines mesh suppression, point-label visibility and independent elevation-line/elevation-label gates. Defaults hide both elevation details; textured meshes additionally hide house numbers. Terrain/LoD2 keeps its authored house-number visibility.
- **Alternatives:** Separate visibility controllers per toggle were rejected by inspection: one controller could restore a layer that another still needs hidden, or capture that hidden state as its authored value. The combined decision changes only differing properties and restores the authored style on release.
- **Evidence:** 79 focused registry, drape preparation, shadow-scene, state and UI tests pass. Existing Playwright mesh session: all 9 contour-line layers and 5 contour-label layers independently toggle without camera movement; the house-number layer stays hidden. No build/lint run or commit.

## Mesh memory and shadow casting — MESH-BUDGET-20260908

- **ID / date / status:** MESH-BUDGET-20260908 / 2026-09-08 / implemented, no universal OOM guarantee.
- **Context and constraints:** Surface meshes must reach requested visible LOD before optional sun-disc refinement. The former device ceiling silently rejected larger explicit budgets. Photogrammetric meshes are not single-valued raster heightfields: back-facing triangles must also occlude sunlight.
- **Decision:** Explicit mesh cache budgets override conservative device defaults, up to the user-requested 24 GiB maximum. The shadow display panel exposes GiB; blank restores device defaults. Admission uses predicted/resident tile costs including CPU overhead, with bounded accounting drift; this is not a measurement of total process RAM or GPU VRAM. Optional Chromium heap telemetry pauses admission/download/parse at 80% of the reported heap limit and resumes below 65%. Check at most once per second, reclaim unused cache entries and unfinished loads while preserving visible replacements. No render loop for paused queues. WebGL context loss pauses loads until restoration; reported allocation failure latches the pause until explicit budget reconfiguration. Missing telemetry retains the finite admission budget, not unlimited growth. Surface 3D meshes cast with `DoubleSide`; visible render side is unchanged and the separate raster heightfield remains `FrontSide`.
- **Alternatives and disposition:** Unbounded automatic growth: incompatible by inspection with the absence of portable available-RAM/VRAM telemetry. CPU Compute Pressure and storage quota: incompatible as RAM/VRAM availability signals. Raising the global default to 24 GiB for all devices: rejected by safety constraints; only explicit overrides change it. Front-only photogrammetric casters: excludes away-facing triangles. Full saturation/OOM stress testing: deliberately not performed on the user's active session.
- **Evidence:** Focused runtime/policy/UI tests cover 24 GiB acceptance/clamping, pressure hysteresis, context pause/recovery, budget propagation and double-sided shadow materials. Live Playwright selection reaches 24 GiB; at one later snapshot the cache accountant reports 23.996 GiB (including reservations), 726 visible tiles, requested error 1px, with download/parse limits zero at heap usage 3.38/4.09 GiB. No context loss/error page observed. All 286 mesh materials in an earlier loaded snapshot used double-sided shadow casting. Full LOD convergence and visual elimination of every reported halo are not established by these snapshots.
- **References:** [Three.js material shadow-side semantics](https://threejs.org/docs/pages/Material.html#shadowSide), [WebGL memory-budget limitations](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#estimate_a_per-pixel_vram_budget).
- **Revisit when:** Portable total-memory pressure signals become available, a supported device cannot sustain an explicit budget, or loaded replacement families themselves pin excessive heap after unfinished loads are canceled.

## Build

```sh
nx build engines/maplibre
```

## Test

```sh
nx test engines/maplibre
```

## Lint

```sh
nx lint engines/maplibre
```

## Shared Three.js scene

`buildSharedThreeSceneLayer` creates one MapLibre custom layer whose Three.js
scene can host multiple `SharedThreeSceneRuntime` roots. Point clouds, 3D Tiles,
and simulation geometry can therefore share one renderer and scene graph.
`buildThreeTilesRuntime` adds a streamed Cesium 3D Tiles tileset to that scene;
callers can retain its `root` or use the layer's `getScene()` accessor for
custom shadow or simulation passes.

Existing `carma3d` building and vegetation layers still own their established
custom scenes for selection and overlays. Their generic-layer registry emits
lifecycle and geometry changes so simulation addons can discover and light
that content consistently while it is visible.

MapLibre raster-DEM terrain is not Three.js geometry in this scene. The shared
layer currently queries its elevation only to align the frame camera target.
A simulation that needs terrain as a shadow receiver must add an explicit
terrain-mesh runtime to the shared scene.

### Mesh loading decision: MESH-ADMISSION-20260908 (validation incomplete)

- **Observed:** the live Mesh2024 view used the 2 GiB automatic ceiling with
  319 resident/used entries and no downloads, despite a 1 px target and visible
  parent errors above 100 px. The explicit UI ceiling previously reset to Auto
  on a new shadow state. Geoportal's shadow state now starts at 24 GiB; this is
  an accounting ceiling, not a promise of available RAM/VRAM. Each tileset has
  its own LRU/download/parse resources. Global heap pressure remains a safety
  stop (80% pause, 65% resume); a live 3.34 GiB heap paused admission even with
  the larger mesh allowance. Do not remove that stop to claim target precision.
- **Changed:** mesh admission/download/parse priorities use observer distance,
  with visible work before corridor work. Upstream's admission sorts using the
  LRU comparator, whereas job queues use the opposite sort direction; changing
  job queues alone therefore did not fix admission. Already requested/loaded
  content and duplicate admissions in a traversal are excluded. Offscreen
  deferral sentinels are reset on view changes and explicit error-target changes;
  real network retry/backoff state is preserved.
- **Progressive policy:** new requests start with 16 px coverage and halve the
  admission error toward the requested target. Renderer error remains at the
  requested value so this policy never explicitly lowers already loaded detail.
  Broad parent boxes with all known child boxes outside the current main frustum
  no longer prevent convergence; unknown child bounds still block it.
- **Preserved:** mesh caster selection uses the existing light-space BVH of
  visible receiver boxes extruded sunward, matching caster geometric error to
  the finest intersected receiver. No whole shadow camera is registered for this
  path. Raster geometry and previous surface shadow buffers are released by the
  shadow scene's existing provider-switch lifecycle; mesh-relevant shading and
  basemap-transfer buffers remain necessary.
- **Verification/open:** 51 focused loading/priority tests pass. A live UI
  change from 1 to 4 px changed the renderer target and traversal frame without
  moving the camera. Full live convergence is still not established. Direct
  runtime frustum classification versus upstream traversal classification needs
  further isolation. Proposed replaced-parent LRU release and frame-scoped
  unification of visibility were blocked by automated safety review and are
  **not implemented**. In particular, upstream `allChildrenLoaded` includes
  finished failures, so it alone is not proof of a safe replacement. No manual
  active/used-set eviction should be added without real replacement-coverage
  regression tests. Do not present this checkpoint as a complete stall fix.

### Mesh detail retention: MESH-FRONTIER-20260908

- **Invariant:** moving the camera never restarts the 16 px admission pass or
  replaces visible detail with a bootstrap ancestor. Coarsening requires one
  direct `REPLACE` parent, its four previously displayed and successfully loaded
  children, and a finite parent SSE at or below the requested display target.
  Unknown metadata, failed downloads and skipped generations are not coverage.
- **Cause / alternatives:** upstream `loadAncestors` may activate a coarse
  ancestor while children are incomplete, even with an unchanged `errorTarget`.
  Fixing only that number is insufficient. Disabling ancestor loading would
  remove bootstrap coverage; forcing children out of the LRU is not a solution.
- **Implementation:** the pure mesh-frontier policy reconciles the proposed cut
  before drawing, retains existing detail and marks it used through the renderer.
  It suppresses the rejected ancestor rather than drawing two overlapping
  surfaces. Normal refinement and newly entering branches remain progressive;
  entirely new areas still require downloads. No historical camera cuts are kept.
  The adapter synchronizes upstream's untyped `wasSetActive/wasSetVisible`
  notification state; dependency upgrades must retain the drag regression tests.
  Unchanged visible sets skip reconciliation. This is mesh-only; raster terrain
  and shadow accumulation resolution are not changed.
- **Validation:** 65 focused runtime, admission and frontier tests pass, including
  repeated fallback, drag-end, failed children, multi-generation rejection and
  the permitted atomic quartet exchange. Playwright in the existing Mesh2024
  session at hash zoom 17.606 / pitch 60 recorded 432 rendered frames over a
  pan and return: zero invalid ancestor substitutions, target 1 px throughout,
  332–355 visible meshes, no app error. No allowed coarsening occurred in that
  live sample; that branch is covered by tests. This verifies retention in this
  view, not universal target convergence or a GPU-memory guarantee.

### MESH-SETTLED-DEMAND-20260908 / implemented, live convergence not guaranteed

- **Context:** in the reported hash zoom 19.252 view, the requested error was
  1 px but heap pressure had set download concurrency to zero (3.45 GiB JS
  heap, 2.96 GiB accounted tile cache). 85 visible, non-leaf tile bounds exceeded
  the target. A 24 GiB configured tile allowance does not enlarge Chromium's
  roughly 4.09 GiB JS heap limit. Bound overlap / coarse parent SSE alone does
  not prove that finer content actually exists or intersects the current view.
- **Decision:** move-end / resize request target-resolution admission immediately.
  A non-converged settled mesh view rechecks at most once per second, recomputing
  cached main-view SSE and distance with the current renderer camera. Real retry
  limits, existing request deduplication and retained visible detail still apply.
  Audits stop on movement/disposal or convergence; they do not force 60 Hz work.
  The native camera/OBB result now also governs main-view membership, and the
  shadow-mask hook only extends native visibility. Previously a second frustum
  could disagree and a non-matching shadow mask overwrote native `inView=true`.
  A regression test supplies this exact disagreement and preserves native SSE.
- **Cancellation / storage:** refresh conservative receiver-prism demand from
  currently available mesh coverage before removing anything. Abort requests
  outside both the view and current prisms via upstream LRU removal (which also
  cancels fetch, removes queued jobs and disposes content). Under pressure, drop
  unneeded loaded payloads and hidden REPLACE parents only when every direct
  child is successfully loaded and drawn. Keep metadata and unknown coverage.
  Reclamation is bounded to 16 tiles per frame and stops if movement resumes.
  Prevent loadAncestors from immediately re-requesting a proven replaced parent.
  Settled meshes do not retain the prefetch-margin download exception.
- **Bootstrap:** a coarse conservative mask may protect potentially needed
  casters before target quality is reached; new offscreen caster requests wait
  for the initial 16 px coverage, not the final target. Otherwise a city-wide
  root receiver can start excessive offscreen work before the main view fills.
- **Alternatives:** blindly clearing unusedSet or treating failed children as
  replacement coverage is incompatible with detail retention. Canceling all
  pending requests on heap pressure also cancels needed visible/corridor work,
  so mesh pressure now uses the same geometric demand test. Raising/removing
  the heap stop is not a safe fix. No forced GC or browser-memory limit change.
- **Evidence:** 81 focused runtime/frontier/admission/prism tests pass, including
  move-end cancellation, retained wanted requests and offscreen casters, pressure
  release, covered-parent readiness and audit disposal. The running Playwright
  session was checked before/after edits; HMR retains old heap allocations, so
  fresh reload checks are distinct from warm-cache performance. No latency/FPS
  speedup or universal target convergence is claimed. Network failure/retry,
  source leaf resolution and genuinely required resident memory can still limit
  achieved quality. Revisit when profiling shows remaining required memory is
  dominated by decoded meshes or when the source supplies finer descendants.
  Final live drag smoke check (user had moved to hash zoom 19.047 / pitch 41):
  target remained 1 px, 578 native-visible tile bounds, 6 active requests,
  download concurrency 48, 2.50 GiB heap, no app fallback. This demonstrates
  resumed admission, not an all-tiles-at-target result or a controlled timing
  comparison with the initially reported camera.

### MESH-CORRIDOR-20260908 — missing casters and stalled disc integration

- **ID/date/status:** MESH-CORRIDOR-20260908 / 2026-09-08 / implemented fixes,
  partial performance validation; atomic mesh/corridor publication remains open.
- **Context/constraints:** User's MeshX 2024 view near 51.27049/7.20080,
  hash zoom20.577, bearing15.26, pitch9.34, Nov24 13:32. Retain native display
  resolution, reached visible LOD and complete finite-disc shadows during input.
- **Decision:** Resolve loose external metadata bounds through known child
  bounds, memoize intersection results until camera/content/traversal changes,
  and keep the caster-required frontier when refining visible families. Use
  the terrain-owning runtime's current receiver elevation range instead of
  unioning unrelated retained city-wide ancestors. Scalar visibility buffers
  use one channel (same configured component precision); live basemap paint
  cannot reset them. RGB accumulation retains its existing format semantics.
  Mesh coverage traversal is limited to once per120ms during motion, admitting
  missing coarse coverage but postponing new sub16px refinement until moveend.
  Tiled shadow coverage obeys the same minimum motion cadence as mono.
- **Evidence:** Before: zero selected offscreen casters, idle queues but demand1;
  inherited external metadata kept coarse offscreen parents unconverged. After
  reload:144 selected offscreen casters, ready=true/demand0. A second failure
  retained five512-sample captures then exceeded the512MiB working+capture limit
  and fell back after >80,000 repeated depth draws. Independently, a read-only
  probe counted80 style-epoch changes with one camera and one page revision;
  scalar integration restarted each time. After fixes the current view reported
  four pages at512/512, no fallback,205,832,256 total accumulator/capture bytes
  instead of15 oversized pages. Screenshot: output/playwright/mesh-soft-corridors-restored.png.
- **Measurements:** Playwright CLI, existing headed Chromium session, Vite dev
  build,2400x2398 physical pixels. CDP CPU profiler at1ms sampling plus timed
  runtime wrappers;1.5s idle,40 pointer steps with35ms delays,4s settle. Runs are
  diagnostics, not a controlled speedup benchmark: restored caster geometry and
  user camera/time changes alter work. The final instrumented run starts303
  visible meshes/260 casters and ends319/260;134 drag updates perform45 traversals,
  median48.5ms/p95 131.6ms frame intervals. Three attribute-binding/render work
  dominates; offloading pure terrain conversion cannot remove shared-context GL
  work. No React commit instrumentation or full network/DevTools trace yet.
  Raw runs and reproduction: output/playwright/shadow-drag-20260908/.
- **Alternatives/disposition:** Removing offscreen casters or lowering visible
  mesh/display quality: incompatible with requirements. Bigger cache alone:
  does not fix style-reset feedback (inspection). GPU/worker rendering migration:
  deferred, not benchmarked. Missing child metadata still fails closed.
- **Validation:**45 focused mesh/runtime tests and64 shadow scene/accumulator
  tests. Native-resolution scalar allocation and paint-independent progression
  have regressions. No broad build/lint, commit or push.
- **Revisit/open:** Atomically publish each coarse/refined mesh family only with
  its complete same-LOD hard-shadow corridor; integrate soft shadows only at
  stable per-corridor target error. Replace mesh global readiness/invalidation
  with spatial dependencies, prove retained-result reuse/disocclusion on drag,
  and add stable binary persistence keys. These are not completed by these fixes.

### CORRIDOR-COMPLETION-20260908 — publication is part of loading

- **Status/context:** Implemented, uncommitted. Accumulation previously ignored
  `presentation.publish()` rejection and marked that page published anyway.
  It also counted an unready page's first preview as completion in one-sample
  mode. The inactive mesh-quality gate was missing from loading `pending`.
- **Decision:** A visible corridor finishes only when ready, fully sampled and
  successfully published for the current atlas/revision. Retain the previous
  presentation on failure; retry the copy with 250–4000 ms backoff, without
  repeating disc integration. Dispose cancels retries. A readiness transition
  refreshes the first sample; screen-overlap invalidation clears publication
  bookkeeping as well. Debug page records expose readiness and publication.
- **Alternatives:** Counting submitted samples, increasing the cache blindly,
  or spinning failed copies at frame rate does not establish visible completion.
  No cache budget, sample count or display resolution was lowered. A persistent
  GPU/storage admission failure deliberately remains pending, never false 100%.
- **Validation:**67 focused accumulator/scene tests and15 shared-layer tests.
  Playwright in the existing mesh session:8/8 pages at512/512, ready and published.
  A bounded injected rejection leaves7/8 published with loading active at99%;
  retry publishes8/8 at1431ms and only then reports100%. All eight captured
  scalar buffers contained fractional coverage (not empty/hard-only buffers).
  This is not a per-pixel proof of correct reprojection for every mesh surface.
  Evidence: `output/playwright/corridor-completion-20260908/`.
- **Open:** Spatial mesh readiness/invalidation and atomic same-LOD mesh/hard
  shadow publication remain separate work, as listed above. No broad build/lint.
