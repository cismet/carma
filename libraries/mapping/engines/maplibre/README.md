# engines/maplibre

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
