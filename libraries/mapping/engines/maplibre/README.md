# engines/maplibre

## Consumers must build workers as ES modules

The engine lazy-loads its terrain worker client, so any app or playground that
bundles it gets a code-split worker chunk. Vite refuses to emit that with the
default `iife` worker format. Every Vite config that depends on this package
needs `worker: { format: "es" as const, ... }`; the geoportal, belis desktop,
the Storybook playgrounds, the ng-topicmap and measurements playgrounds all set
it. A new consumer without it fails its production build with
`Invalid value "iife" for option "output.format"`.

## Style contract for `metadata.carmaConf["3d"]`

A tileset is declared by a style's `3d` block. The legacy shape, still served
by `tiles.cismet.de` and still valid, names only `renderMode: "tiles3d"`, the
`tilesetUrl` and `terrainMandatory`. `resolveTiles3dConfig` in the layer
manager completes every block with the same defaults, so a legacy style loads
the way a fully declared one does:

| Field | Absent means | Note |
| --- | --- | --- |
| `version` | `1` | Optional contract version, `TILES3D_STYLE_VERSION`. Never required, so served styles need no lockstep edits. |
| `providesTerrain` | derived | The host sets it from the `Mesh` tag or a `mesh*.style.json` URL before the block reaches the manager. |
| `errorTarget` | 4 px, 6 px for terrain-providing tilesets | Idle refinement target; the shadow simulation may override it per view (`setErrorTargetOverride`). |
| `baseErrorTarget` | 16 px, terrain-providing only | First-pass target and the mesh loading strategy; other tilesets refine straight to the error target. |
| `tilesetMinResolutionPx` | 1024 px, terrain-providing only | Whole-extent residual resolution. An explicit `0` defers to the `entry` hint instead. |
| `hierarchyCache` | true | Worker-built static hierarchy index instead of native tileset JSON paging. `false` loads pages natively; kept after measurement, see TILES_COVERAGE.md, tileset hierarchy cache kept. |
| `basemap` | `labels` | Drape the map labels and keep MapLibre terrain; `none` shows the tileset alone. |
| `outline` | on | `CESIUM_primitive_outline` edges. |
| `diagnostics` | off | Never ship it on; the stories switch it on themselves. |
| `shadowBuildingStyle` | off | Let the shadow simulation restyle the tileset as a building layer while shadows are on. Off keeps the declared appearance; outlines always follow `outline`. |
| `entry` | none | Per-level `geometricError` and `bytes` size the resident extent within the memory share; `prefetch` names hierarchy files to warm. |
| `colorCorrection`, cache budgets | none | Colour grading and memory stay as the runtime decides. |

The bundled `mesh2024-cesium-parity.style.json` copies in the geoportal and the
stories are the reference for the 2024 mesh. They declare only what differs
from the defaults or carries data: the tuned base target of 12 px, the
standalone basemap, the colour grading and the entry hint.

## Shared-canvas camera views — SHARED-CANVAS-VIEWS-20260916

- **ID / date / status:** SHARED-CANVAS-VIEWS-20260916, 2026-09-16;
  implemented, uncommitted. Embedded camera windows and panorama observed in
  the internal browser; no comparative performance benchmark.
- **Context:** Embedded camera windows/strips copied rendered images from GPU
  to CPU and back into separate canvases despite sharing one scene and renderer.
- **Decision:** The shared scene layer owns post-MapLibre screen passes.
  `createSharedThreeSceneCameraPreview` clips CSS regions onto the existing
  drawing buffer using viewport/scissor, preserving DPR, full camera projection,
  clipping planes, framebuffer and host render state. `present` chooses that path
  for embedded windows and async image transport for an adopted popup canvas.
  Embedded strip regions must lie inside the map canvas; the stories now dock
  the interactive strip there. The shared UI strip accepts an alternate presenter,
  retaining pan/zoom, wrap and keyboard interaction without a 2D context.
  The library renders only visible strip segments, shares repeated meridian
  demand, and updates requested resolution with strip display scale. Optional
  image-plane textures stay on the GPU; explicit pixel export remains supported.
- **Replaces:** Per-window and embedded panorama pixel readback/Canvas2D
  presentation. Existing readback APIs remain only for detached documents and
  pixel-export consumers, not a second tile loader or scene.
- **Alternatives:** Separate WebGL contexts rejected by inspection because they
  duplicate GPU tile resources. Cross-document direct scissoring is impossible;
  popups retain the bounded asynchronous transport. A shared texture atlas and
  GPU copy for repeated seam images are deferred; repeated segments currently
  cost another draw, but neither another tile load nor another readback.
- **Evidence:** Focused tests cover clipped regions/DPR/state restoration,
  exception cleanup, screen-pass removal, detached presentation lifetime,
  wrapped segments, GPU-only plane captures and alternate UI strip navigation.
- **Revisit:** This is not proof of 60 fps under loading. GPU fill/draw work
  remains per camera; optional image planes retain one render target per segment.
  Loader coverage gaps and scene lighting correctness are separate concerns.

## Consolidated tile manager

`buildThreeTilesRuntime` owns mesh loading, selection and residency;
`buildRasterDemTerrainRuntime` adapts raster elevation geometry to the same
shared scene/camera-demand contract. Stories do not own another tile manager.
`Tiles3dLayerManager` and `SharedThreeTilesLayerManager` are host adapters to the
same runtime, not independent loading engines. The unused older
`engines/threejs/src/tiles3d/Tiles3dLayer.ts` implementation has been removed.
See [TILE-CONSOLIDATION-20260914](TILES_COVERAGE.md#tile-consolidation-20260914)
for the single-branch boundary, retained mesh metadata, history and validation.

## Native shadow frustums — MESH-SHADOW-FRUSTUM-20260910

Mesh payloads that provide terrain now retain Three's native observer/light
frustum culling rather than disabling it for every mesh. The shared loaded
geometry remains eligible as an offscreen caster in the sun's frustum.
Decision, synthetic pixel-parity measurements, alternatives and remaining
live-view limitations: [corridor performance report](../../shadow-simulation/three/CORRIDOR_PERFORMANCE_20260909.md#2026-09-10--mesh-shadow-frustum--native-mask-batch--scratch-reuse).

## Linked receiver/caster detail

- **Anchor / date / status:** `#linked-receivercaster-detail`, 2026-09-10;
  implemented, uncommitted; full live-view convergence remains unverified.
- **Context and constraints:** Fine visible mesh tiles could receive shadows
  from a coarser retained parent despite all required children being resident.
  The caster selector stopped at a parent meeting its own SSE, independent of
  the published receiver cut. Completed in-memory solar masks also ignored a
  changed caster geometry revision at unchanged sun/receiver/buffer dimensions.
- **Decision:** The receiver cut now supplies a minimum-detail ancestor closure
  to the existing caster-family selector. Meeting caster SSE cannot terminate
  above displayed descendants. Missing corridor-intersecting children still
  retain the parent atomically; complete families replace it using the same
  native Tile/Object3D/BufferGeometry resources as display. Sets describe roles,
  not separate loaded assets; no new loader, scene clone or geometry cache.
  Captures retain a dedicated committed-caster revision, separate from observer
  allocation. Changed geometry schedules a fresh hard capture and then soft
  integration; the prior mask remains drawable only until that replacement.
  Same-geometry camera movement and smaller buffer demand remain reusable.
- **Alternatives and disposition:** Always casting parent plus partial children
  is **incompatible by inspection** with the no-hybrids/consistent depth rule.
  Removing a parent before its required offscreen siblings load is **incompatible
  by inspection** with chimney continuity. Reloading/cloning visible geometry
  into a second caster pool is **not needed**: both roles reference native tile
  instances already. A separate GPU-worker copy is **deferred**, as described in
  `CORRIDOR_WORKERS_REVIEW.md`; this change does not claim zero-copy GPU contexts.
- **Evidence:** 64 focused frontier/publication/role tests and 98 presentation/
  tiled-renderer tests pass. Regression fixture: parent SSE0.5px, target1px,
  already-displayed children and a pending offscreen chimney; retain parent
  while pending, replace with identical resident child objects when complete,
  issue only the affected publication invalidation. Mask fixture verifies
  camera reuse, geometry-change invalidation, old-mask continuity, hard
  replacement and subsequent new soft completion. Internal browser retains
  Mesh2024 and the shadow addon; only pre-existing Matomo console errors observed.
  No timed before/after or memory benchmark; no end-to-end speedup claimed.
- **Revisit when:** A complete family still keeps a coarse caster or an old
  soft mask; inspect the committed tile cut and geometry fingerprint separately
  from buffer resolution. Atomic fallback rationale remains in the next record.

## Caster replacement investigation — CASTER-FAMILY-HANDOVER-20260909

- **Status / date:** Initial coupled-display attempt rejected and reverted;
  independent colour/depth roles subsequently implemented, uncommitted,
  2026-09-09. Live chimney continuity is not yet fully validated.
- **Context:** At 51.2703852/7.2008024, z19.258, shadow=821;19, the user
  reports two thin chimney shadows appearing early, disappearing during mesh
  refinement, then returning. `advanceMeshShadowCorridors` excludes a prior
  caster as soon as its box intersects the main camera but it is no longer a
  committed receiver. This can discard a shared parent before its offscreen
  chimney child has decoded, despite the existing complete-child frontier logic.
- **Evidence:** An added runtime regression reproduced this with a loaded
  parent, loaded visible child and pending chimney sibling. Retaining the parent
  across the two cuts passed 57 focused tests, but the internal-browser reload
  remained stuck on coarse surfaces at 5.95 and 27.98 seconds. Observation was
  capped at 30 seconds. The experimental code and its acceptance expectation
  were removed; passing unit tests did not establish a valid live fix.
- **Alternatives and disposition:** Holding visible receiver refinement behind
  caster siblings is a **measured rejection** for this implementation, consistent
  with the earlier CORRIDOR-PUBLICATION experiment below. Keeping both parent
  and children as visible surfaces is **incompatible by inspection** (overlap).
  Separate depth-only caster membership from the colour receiver cut is now
  **implemented** with focused role/publication tests. The parent keeps casting
  with display colour/depth writes disabled; partial receiver children do not
  cast until the complete corridor child family replaces the parent.
- **Implemented contract:** Preserve the loaded caster parent in the depth pass
  until all corridor-intersecting child branches provide replacement geometry;
  do not render that parent in colour or as a shadow receiver. Replace the depth
  family atomically, keep its LRU protection until replacement, and invalidate
  only affected shadow pages. A new solar direction or loss of corridor demand
  still invalidates/removes obsolete content; never preserve old-sun masks.
- **Performance evidence:** The independent roles no longer held the observed
  reload on coarse visible geometry. Separate profiling identified redundant
  presentation depth renders as a larger slowdown; see
  [the bounded internal-browser report](../../shadow-simulation/three/CORRIDOR_PERFORMANCE_20260909.md).
- **Revisit / validation:** Test colour/depth membership separately, pending and
  failed children, unrelated-family progress and no depth/colour overlap. Repeat
  the marked chimney reload before calling this bug fixed. Frame intervals do
  not prove absence of shorter flicker; no per-caster live trace was obtained.

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
  its public methods. `three-tiles-runtime-attachment.ts` owns `TilesRenderer`
  construction, queues, plugins, subscriptions and their symmetric teardown;
  `three-tiles-runtime-lifecycle.ts` owns event reactions and frame updates;
  `-loading.ts` owns loading policy, memory and SSE; `-shadows.ts` owns
  receiver/caster selection and corridor revisions;
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
  no type/configuration re-exports from the entry file. Renderer attachment is
  kept separate so queue/plugin teardown cannot drift away from registration.
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

## Mesh memory and shadow casting

- **Anchor / date / status:** `#mesh-memory-and-shadow-casting` / 2026-09-08 / implemented, no universal OOM guarantee.
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

### TILE-METADATA-FAST-LANE-20260909

- **Status/date:** Implemented queue isolation,2026-09-09; persistence remains a
  benchmark candidate. No complete-tree worker discovery implementation claimed.
- **Context/constraints:** External JSON used the same native download and parse
  queues as meshes. Payload backpressure therefore stalled hierarchy discovery.
  Discover required viewport/sunward-corridor metadata before waiting for payload
  processing, without downloading the entire city's unrelated tree speculatively.
- **Decision:** Route native `hasUnrenderableContent` JSON jobs through independent
  eight-download-per-origin/two-parse queues. Preserve native callbacks, tile
  identity, loading statistics and LRU abort ownership; facade `has`/`remove`
  cover both lanes. Metadata parsing wakes on browser tasks independently of
  the mesh limit. Native loadingTiles tracks both lanes for readiness. Existing
  hierarchy expansion/camera traversal remains bounded and main-thread; memory
  safety, retries and view cancellation still apply. No global barrier holds
  mesh work until all metadata is known.
- **Evidence:** Focused queue tests admit/parse metadata with mesh download and
  parse limits both zero and verify metadata cancellation through the native
  facade. Dev browser logs contain four reports with metadata active
  while mesh admission is zero. Some JSON jobs still waited610-1411ms before
  sub-timer-resolution preprocessing: task scheduling remains a bottleneck.
- **Persistence experiment:** Reused `createDerivedBufferCache` in a separate
  internal-browser tab while keeping Geoportal open, Chrome152/macOS/14logical
  cores. Three real Mesh2024 external JSONs11542/16961/11539, encoded sizes
  10851/14316/9708bytes. Nine alternating warm parallel batches after warm-up,
  deep JSON parity checked each time. HTTP `force-cache` fetch+JSON parse median
  1.2ms/p95 1.5ms; derived-cache object reads with touch:false median0.6ms/p95
  1.0ms. Initial fetch7.1ms (not a proven cold download); writes/open8.9ms.
  Baseline raw ms:[1.5,1.5,1,1.1,1.2,0.9,1.2,1.5,1.2]; restore:
  [0.8,0.5,0.6,0.5,0.5,0.4,1,0.6,0.9]. About15 batch reuses amortize preparation.
  Artifact:`output/playwright/tileset-cache-benchmark.html`; temporary isolated
  database deleted after the run. This is not full-tree hydration, worker-transfer,
  production freshness validation, storage overhead or end-to-end load timing.
- **Alternatives/disposition:** Whole parsed-tree persistence: deferred, not
  rejected. The measured raw-object restore saves0.6ms, but native live trees
  contain prototypes, runtime references and cyclic parents; a versioned portable
  descriptor format must reconstruct them. Stable source URLs also need validated
  source revision/freshness and producer invalidation. Do not activate a parallel
  production JSON cache based only on this partial-stage gain. Next benchmark must
  include reconstruction, source validation and worker transfer before admission
  through the existing per-client cache calibration policy.

### TILE-SPARSE-HIERARCHY-INDEX-20260909

- **Status/date:** Historical measured prototype, 2026-09-09; superseded for
  integration by TILE-HIERARCHY-PAGES-PRODUCTION-20260909 below. Supersedes the three-document
  JSON-object cache experiment above as the persistence direction, not as a
  shipped replacement. Geoportal still uses its existing metadata-loading path.
- **Context/constraints:** Persist the integrated static hierarchy for a fixed
  dataset, not 3000 independently re-fetched JSON documents or live renderer
  objects. Stay compatible with `3d-tiles-renderer@0.5.2` and existing corridor
  APIs. Sparse growth, worker execution, at most 512 MiB of accounted resident
  index data; do not reserve that memory or eagerly instantiate the whole tree.
- **Decision:** Prototype typed parent/first-child/next-sibling links, geometric
  errors, sparse Float64 transforms, UTF-8 URI tables and dictionary references.
  Deduplicate tile/content volumes and omit exact zero components via bitmasks;
  retain nonzero IEEE Float64 values, including negative zero, without coordinate
  quantization or potentially lossy subtract/add deltas. Shared metadata occurs
  once (three records in this sample), not once per tile. Rare fields remain
  structured-clone metadata; no JSON parsing is needed on restore.
  Reconstruct native descriptors through `TilesRenderer.preprocessNode` and use
  the existing `readOrientedTileBounds` / `createShadowReceiverMask`. Do not
  substitute an AABB for a native OBB or invent another refinement algorithm.
- **Evidence:** Internal browser Chrome152/macOS, 14 logical cores; bounded real
  breadth-first Mesh2024 hierarchy: 128 JSON documents, 70,202 nodes. The
  preparing worker is terminated; a fresh worker reopens persistent storage and
  restores all nodes with **zero metadata HTTP requests** in 215.4ms, including
  5.5ms database open/read. Nine alternating warm comparisons after one warm-up
  each: HTTP-cache/JSON/native construction median269.9ms versus index/native
  construction198.2ms (26.6% less). p95/max-of-nine324.9ms versus338.4ms: eager
  reconstruction still has worse tail latency. Read-only medians105.7ms versus
  6.2ms must not be advertised as whole-app speedup. Source JSON UTF8 size27.277MB;
  typed data5.844MB plus14.7KB estimated metadata/header payload; database and
  native heap overhead excluded. Packing128.5ms plus writing23.3ms. Exact source
  descriptor roundtrip and native OBB/transform parity; 210,606 existing corridor
  queries, 317 hits, zero mismatches (synthetic light rotations, not current-view
  shadow validation). Reproduce with the running Vite server's `/@fs/` URL for
  `output/playwright/tileset-index-benchmark.html?limit=128`; worker implementation
  alongside it; raw timings in `output/playwright/tileset-index-benchmark-results.json`.
- **Alternatives/disposition:** Dense numeric columns plus per-node metadata:
  measured rejection (larger storage and no full-path win). Sparse/deduplicated
  columns: promising measured median gain, not yet a production admission result.
  Native eager reconstruction: retain as parity baseline, not startup strategy.
  Incremental immutable pages with stable node IDs and atomic manifest updates,
  lazy native hydration, viewport-priority paging and 512MiB resident accounting:
  next implementation, not implemented by this benchmark. Store newly integrated
  subtrees/changed pages only; unresolved external URI references remain holes,
  never falsely marked complete. Keep child sets/refinement identical to native.
  Compression and direct packed-column corridor traversal: not evaluated here.
- **Version/safety contract for integration:** Key by canonical dataset identity,
  explicit immutable dataset revision, codec version and renderer-adapter epoch.
  `mesh2024` or a stable URL alone is not proof of immutable contents; the resource
  currently has no explicit revision. Without one, revalidate a trustworthy
  whole-dataset revision manifest or fall back to ordinary loading. Never infer
  validity of every child from an unchanged root ETag alone. Missing/corrupt
  pages, interrupted writes, schema mismatches and storage failure must fall
  back locally without blocking rendering. Runtime cameras, visibility, pending
  requests, scene/material/texture handles and GPU objects are never persisted.
- **Revisit when:** Lazy/incremental native integration is implemented; compare
  actual application reloads and a known 3000-document workload, include transfer,
  peak heap, source-version validation and tail latency before enabling by default.
  The offscreen geometry-only texture trial remains a separate open benchmark.

### TILE-HIERARCHY-PAGES-PRODUCTION-20260909

- **Status/date:** Integrated, 2026-09-09; incremental successor to the prototype
  above. No package changes or separate cache infrastructure.
- **Decision:** Persist one sparse binary descriptor page per discovered external
  tileset document through the shared derived-buffer cache. Typed parent links,
  dictionary metadata, exact Float64 transforms/volumes/errors and UTF-8 content
  URIs reconstruct native descriptors; no runtime renderer objects are stored.
  Discover only demanded subtrees, write only new pages, and yield during native
  hydration after 2 ms or 2048 nodes. Fetch, JSON parsing and packing run in a
  module worker; native renderer preprocessing remains native, not another tree.
- **Version contract:** Revalidate and hash the full root document at startup.
  Key pages by source URL, root SHA-256, document URL, codec version and producer
  epoch (hashed worker bundle in production, codec fingerprint during HMR).
  This follows the requested fixed-dataset/root-hash contract: a child-only server
  edit with unchanged root is NOT detectable. Mutable datasets without that
  contract must disable `hierarchyCache` or change the root revision. A whole-tree
  manifest would provide stronger validation but is not supplied by this source.
- **Bounds/fallback:** 32 MiB per page, 64 MiB queued optional writes, 256 MiB
  persistent namespace budget; no preallocated city-wide resident index. Schema
  validation precedes publication. Storage errors/corruption/worker failure fall
  back to normal loading. A cache read exceeding 32 ms disables reads for that
  worker lifetime; network and worker requests have deadlines. Writes never gate
  rendering. No per-device calibration sweep on startup.
- **Evidence:** Internal Chrome 152/macOS, 14 logical cores; 24 real Mesh2024
  external documents, concurrency 8, nine alternating warm batches after warm-up.
  A fresh worker restores existing pages: median HTTP-cache/JSON path 90.0 ms
  versus worker/cache/hydration 62.2 ms (31% reduction); p95/max 104.2 versus
  86.9 ms. Root validation 72.7 ms separately; preparation 91.3 ms. 240 hits,
  one root miss, zero fallbacks; descriptor parity for every document. This is
  NOT whole-app reload timing or native OBB/shadow/render time. Reproduce using
  `test/benchmarks/tileset-hierarchy.html` through the running Vite `/@fs/` route.
- **Alternatives/revisit:** Raw JSON/object caches retain parsing or cloning cost;
  the earlier eager full-tree restore had worse tail latency. Incremental native
  hydration avoids that startup barrier. Compression/direct packed-tree traversal
  remain unevaluated. Revisit on renderer upgrades, mutable source publication,
  or client measurements where the read path loses against HTTP cache.

### TILE-RETAINED-COVERAGE-20260909

- **Status/date:** Integrated follow-up, 2026-09-09; separate from cache/material
  checkpoint `927bf4ef5`.
- **Contract:** A new coarse download pass never downgrades visible detail.
  Adjacent tiles may use different LODs, but a REPLACE parent and its descendants
  must never overlap. Coarsening is one complete quartet at a time and only if
  the replacement meets the unchanged requested SSE in the current camera.
  The traversal's progressive/light-camera error is not that display metric.
  Tile loading, restoration and LOD replacement use immediate visibility changes,
  never animated fade-in/out or parent/child crossfades. User-controlled layer
  opacity and progressive solar-disc accumulation are separate concerns.
- **Decision:** Build an ancestor closure from the retained visible cut, not
  another full tileset search. Let native REPLACE traversal reach that cut even
  during 16px bootstrap; admit missing siblings there instead of reloading a
  forbidden coarse parent. Complete local families publish without a global
  viewport barrier. Metadata has an independent queue; payload ordering is
  missing viewport coverage, visible refinement, then caster-only content, with
  camera distance as the tie-breaker. Existing ready geometry is reused.
- **Alternatives/evidence:** Restarting from a coarse parent loses detail; holding
  all refinement behind full-viewport readiness wastes ready families. Neither is
  used for presentation. Focused tests cover mixed 3/2 cuts, stale traversal SSE,
  atomic replacement, ancestor-aware admission and explicit priority lanes.
  This change has no claimed A/B reload speedup. Existing cache and texture
  benchmarks above measure different stages.
- **Revisit:** Native traversal/API changes, non-quadtree coarsening, or measured
  priority starvation. Queued work remains bounded by existing admission limits;
  no new worker, unbounded crawl, or per-frame resident-cache scan is introduced.

### TILE-OFFSCREEN-TEXTURES-20260909

- **Status/date:** Integrated and native-loader tested, 2026-09-09.
- **Decision:** Intercept native GLTF material loading only for wholly opaque
  triangular caster payloads. Keep positions, indices, UVs, native transforms and
  compressed source buffers. Placeholders never write colour/depth in the normal
  colour pass; they still cast via the shadow depth material. Promote at most two
  newly visible payloads concurrently, retry failed images with backoff, and
  publish complete materials atomically before receiver eligibility. Appearance
  changes cannot turn pending placeholders into visible clay. Native engine owns
  promoted textures/disposal and updates its memory estimate after promotion.
- **Safety:** Alpha-mask/blend, unknown material extensions, variants and
  non-triangle primitives remain wholly native; do not change their silhouettes.
  A 30-second promotion deadline/disposal releases admission slots; unabortable
  native image results arriving later are disposed, never published. Private
  native image-cache/byte-accounting seams are documented and regression-tested.
- **Evidence:** Three real Mesh2024 B3DM payloads, nine alternating warm parses
  each on the above client. Full versus geometry-only median: 0.7/0.1 ms,
  4.2/0.3 ms, 4.5/0.3 ms; p95: 1.0/0.2, 5.8/0.4, 6.1/0.4 ms.
  Deferred decoded RGBA estimate: 256 KiB, 4 MiB, 4 MiB respectively. Geometry
  hashes/transforms are identical. Promotion preserves geometry identity and
  native texture ownership; delayed material loads measured 0.6, 5.2, 4.3 ms.
  Reproduce with `test/benchmarks/offscreen-materials.html`. Excludes download,
  GPU upload and shadow drawing; embedded image bytes are STILL downloaded.
- **Alternatives/revisit:** Stripping image bytes from B3DM would add another
  parser and break cheap promotion; not selected. Re-decoding a whole tile on
  camera entry discards reusable geometry; not selected. Already textured tiles
  are not demoted offscreen. Revisit on GLTF loader upgrades and non-opaque
  datasets; preserve native fallback rather than extending heuristic coverage.

### TILE-PIPELINE-TELEMETRY-20260909

- **Status/date:** Partial implementation, 2026-09-09. Checkpoint before this work:
  `f3a686e31`; telemetry and scheduling changes remain separate.
- **Context/constraints:** Diagnose long queue stalls without repeatedly walking
  the resident mesh cache. Keep rendering and requests independent; no geometry
  serialization, texture copies, or per-frame telemetry enumeration.
- **Decision:** Existing runtime console reports now include at most32 distinct
  tile samples per second and an omitted-activity counter. Set runtime option
  `tileTelemetry:false` to disable sample collection/reporting. Samples contain
  URL, `inView`, `shadowOnly`, metadata-vs-payload flag, native loading-state code,
  tree depth (not a raster zoom), geometric error, traversal selection SSE,
  native camera distance and projected centre distance in NDC. Shadow-only SSE
  is receiver-matched selection error, not offscreen observer-pixel error.
  Existing per-tile WeakMap progress holds monotonic page-relative milliseconds:
  discovered/first queued, download started/finished, parse started/finished,
  loaded, publication started/finished, plus bounded error text and iterations.
  Download-finished is parse-queue admission, including response body reading.
  Parse elapsed includes asynchronous decoding/textures, not pure CPU time;
  publication elapsed covers our synchronous load-model handler, not later GPU
  uploads, traversal or shadow rendering. Samples are not a complete request log.
- **Scheduling:** Parse-queue wakeups use coalesced browser tasks instead of rAF;
  parse callbacks yield before work. Concurrency remains2, or1 while moving.
  Disposal cancels wakeups and prevents yielded work from starting. Native
  cancellation checks in the original callback remain intact. This replaces
  rAF-coupled parsing admission, not Three's parser or its Draco worker pool.
- **Evidence:** Dev browser, existing Mesh2024 session: four observed
  payloads spent483-506ms waiting before6-27ms parse calls. This is a small live
  sample, not controlled A/B evidence. Nine focused corridor/scheduling tests
  verify results, independent admission, no-render-frame progress and disposal.
  No end-to-end or telemetry-overhead benchmark is claimed; work is bounded to32
  records/second instead of the former full resident-cache/frustum scans.
- **Alternatives/disposition:** Increasing download concurrency alone: deferred
  while parsing is backed up. Whole-tree worker traversal and geometry-only
  caster GLTF parsing/promotion: still open. Main-thread scene creation remains;
  Draco is already worker-backed. GPU calls cannot simply be sent to a worker
  owning a different WebGL context. Revisit after stage timing isolates the next
  bottleneck; do not interpret timer yielding as actual worker offloading.

### CORRIDOR-REQUEST-CONCURRENCY-20260909

- **Status/date:** Implemented 2026-09-09; focused concurrency regression tests.
- **Context and constraints:** Corridors share a receiver-union spatial index and
  native per-origin download queues. They do not await each other's network or
  shadow completion. Parsing backpressure bounds downloads to 16, then 4 at a
  backlog of 12, and 0 at 24; existing in-flight transfers continue. Main-thread
  metadata traversal is still bounded to 64 nodes per update (8 during motion),
  not moved into a worker by this change.
- **Decision:** When available download concurrency increases, explicitly schedule
  the existing origin queues. The upstream limit setter only changes numbers;
  it does not wake stopped queues. Use the native deferred/coalesced scheduler,
  not synchronous fetch dispatch from a model-publication callback. Keep tile
  identity deduplication and the shared global capacity limit.
- **Alternatives and disposition:** A queue/worker per corridor is not introduced:
  it would duplicate shared requests or multiply capacity unless another global
  scheduler were added (inspection). Whole-tree worker selection remains deferred.
  Earlier small-query worker measurements remain in MESH-CORRIDOR-MEMBERSHIP-20260909;
  they are not a benchmark of whole-tree offloading.
- **Evidence:** `fetch-tile-response.spec.ts` uses the real native download queue
  with two same-origin requests and mocked transport: the second finishes while
  the first remains unresolved. `three-tiles-runtime.corridor-demand.spec.ts`
  verifies asynchronous wakeup on capacity recovery without a new traversal,
  no repeated wakeup at unchanged capacity, parallel admission and deduplication.
  These are deterministic behavior tests, not a throughput benchmark. Internal
  Dev browser spot checks still show four concurrent downloads and a 25-27 tile
  parsing backlog; no end-to-end speedup or settled-scene claim is made.
- **Revisit when:** Parsing throughput, CPU traversal time, or request inventory
  shows the next limiting stage. Raising downloads alone does not clear parsing
  backlog; the reported multi-minute convergence remains under investigation.

### MESH-CORRIDOR-MEMBERSHIP-20260909

- **Status:** Implemented; focused geometry/publication tests and live mesh
  inspection. This is not a replacement of the entire progressive load scheduler.
- **Context/contract:** Caster membership is intersection of the tile metadata
  volume with the union of sunward swept main-camera receiver volumes, including
  the finite solar-disc guard. Content, normals, a previous traversal flag and
  shadow-buffer readiness do not decide geometric membership. Error selects LOD
  only. Existing `createShadowReceiverMask` is the common union/BVH implementation.
- **Decision:** Loading, error queries, eviction and publication pass stable tile
  identities into the same immutable mask. Weakly keyed proofs reuse exact
  results, and child queries restrict their receiver candidates to those hit by
  the enclosing parent. Changed boxes/transforms re-query; non-enclosing metadata
  cannot inherit exclusions. A new union builds new proofs, so sun/receiver changes
  cannot reuse stale negatives. No cross-union/disk membership cache is introduced.
  Publication checks actual intersection instead of `shadowReceiverCurrent`;
  omitted but still-required loaded casters survive transient traversal cuts.
  Parent plus partially loaded children are resolved as one complete local
  REPLACE family, never drawn as overlapping hybrids.
- **Evidence:** Chrome 152/macOS, 14 reported logical cores, existing Geoportal
  mesh session. `benchmarks/corridor-membership.browser.ts` exports the repeatable
  benchmark (import using Vite `/@fs/<checkout>/...`). 64 synthetic receiver
  boxes, 512 candidates, 100 scans per timed batch, 9 repetitions after warm-up;
  cached/uncached output parity asserted. Per 512 queries, uncached median/max
  0.098/0.102 ms; memory 0.043/0.045 ms. Warm worker transfer alone: 6.6/10.6 ms;
  warm Cache Storage read of the final 512-byte answer: 0.20/5.10 ms. Worker
  measurements include event-loop delay on the loaded page, exclude computation
  and startup. No GPU or end-to-end loading improvement is inferred.
  Memory batch raw ms: [.043,.040,.043,.043,.045,.044,.041,.045,.043]; worker
  round-trip ms: [6.5,6.1,6.6,10.6,7.7,8.7,6.6,4.5,8.5]; storage read ms:
  [5.1,.3,.2,.2,.1,.2,.1,.2,.2]. Memory holds per-tile boxes, transform and matched
  receiver references in WeakMaps; no GPU buffers or payload copies are cached.
  Exact chimney view settled with 53 receivers, 151 offscreen casters and zero
  outstanding demand. Full soft-shadow/reprojection correctness remains separate.
  Focused validation: 76 tests pass. Five older atomic-corridor integration
  assertions fail identically on the changed code and the read-only source
  baseline at `9508cb9fc` (`corridor-membership-final-tests.log`,
  `corridor-baseline-tests.log`); no full integration-suite pass is
  claimed. Their staged publication/admission behavior remains open.
- **Alternatives:** Worker dispatch per small query batch and Cache Storage
  answers: measured rejection for this workload. IndexedDB/OPFS: not evaluated.
  Whole-tree worker selection and reusable search frontiers across changing LOD
  unions: deferred; current upstream traversal remains bounded but main-thread.
  Network/DRACO worker concurrency is unchanged, not a new parallel implementation.
- **Revisit:** Large measured metadata-query batches, cross-union candidate reuse,
  or a trace showing traversal rather than page shading dominates. Preserve the
  box-only contract when replacing scheduling; do not add payload-readiness gates
  to spatial intersection.

### TILE-TRANSPORT-DEADLINE-20260909

- **Context:** Fetching headers or reading tile/tileset bodies had no deadline.
  A stalled response could indefinitely occupy a native loading slot. Successful
  reloads also retained their historical retry count, exhausting unrelated later
  failures; cooldown expiry did not reset that count either.
- **Decision:** A 30 s active download deadline composes with the native caller
  abort signal. Wrap only the public `json`/`arrayBuffer` readers consumed by
  TilesRenderer, preserving Response identity, headers and zero extra full-body
  copies. Normalize body timeout AbortErrors to TimeoutError: native traversal
  ignores AbortError and otherwise cannot release/account/retry that failed job.
  Ordinary caller cancellation is preserved. Successful loads and exhausted-key
  expiry reset the consecutive-failure budget; five exponential-backoff retries
  and the existing 120 s exhausted cooldown remain. Permanent failures retain
  their existing no-immediate-retry behavior. Modern AbortSignal APIs required.
- **Alternatives:** Promise.race alone rejected (does not stop network work);
  full-body buffering/stream pumping rejected (copies or per-chunk main-thread
  work). No additional queue, parser worker or throughput claim. Larger genuine
  downloads taking >30 s retry; the plugin exposes requestTimeoutMs for tuning.
- **Validation:** 19 focused transport/retry assertions pass: stalled headers
  and bodies, normalized body cancellation, native caller abort, HTTP failure
  preservation, success resets and cooldown resets. Live connection degradation
  and Safari/Firefox were not tested. Exhaustion expiry remains demand-driven;
  an idle failed root's autonomous recovery is not established by these tests.

### CURRENT-MESH-CONTRACT-TESTS-20260909

- **Context:** Retired integration fixtures silently called removed optional
  acknowledgement APIs, treated offscreen casters as main-view receivers and
  published arbitrary `visibleTiles` without a traversed root. They asserted
  historical global/atomic caster-stage gates no longer used by mesh retrieval.
  Those expectations failed against the committed baseline too.
- **Decision:** Share a test-only fixture outside production `src/`: explicit
  main-view roles, finite SSE/distance, actual traversal frame increments,
  coherent native/local OBB transforms, parent boxes enclosing descendants and
  matching loaded-state/scene data. Replace the combined legacy scenarios with
  focused tests for union membership, sunward-only caster retention, complete
  local child replacement, pending request deduplication/cancellation, near-first
  ordering, no native shadow camera, time-change retention and target-quality
  mesh retention under cache pressure. Native loading/publication runs; network
  and GPU rendering are stubbed. These are not visual correctness benchmarks.
- **Corrections:** A failed child is not strict target-readiness proof. Spatial
  search remains metadata-based after payload geometry arrives. A global heap
  ratio does not pause mesh admission; context loss and finite own-cache limits
  still have dedicated checks. Non-terrain error relaxation remains separately
  tested. The existing pure frontier/parent-child regression suite is unchanged.
- **Rejected:** Skipping/red-marking old tests, lowering assertions to match
  accidental outputs, or restoring dead APIs just to satisfy fixtures. No
  production behavior was changed in this test-cleanup step.
- **Validation:** 115 focused engine tests and 65 shadow/cache tests pass. No
  broad build, lint or full monorepo suite. Real-device soft convergence and
  source anomalies remain distinct from this deterministic contract coverage.

### MESH-COVERAGE-AUDIT-20260909 — missing branches and current camera demand

- **Context:** Testing only displayed leaves could declare a partial viewport
  complete. A retained parent's finite traversal error could still belong to a
  previous camera, incorrectly deferring needed refinement. Global 16/8/4/2px
  completion barriers also held independent receiver families back.
- **Decision:** Reuse `getReadyMeshRegionCut` against the root and actual receiver
  cut to prove coverage of every intersecting branch. Unknown/missing content is
  not coverage. Evaluate native camera errors once per tile per audit, and use
  them for readiness and parent admission. Preserve the existing bounded motion
  checks and one-second settled audit; an incomplete subset cannot stop it.
  Require base coverage before fine admission, then release the requested target
  directly instead of waiting for viewport-wide intermediate LOD levels. Existing
  loaded-family replacement and retained detail policies remain in force.
- **Alternatives:** Another frame-rate tree traversal rejected; existing motion
  and settled scheduling already supplies the wakeups. No new worker, queue,
  manual HTTP downloader or memory heuristic. Do not disable failed-child checks
  or drop visible parents to make loading appear complete.
- **Validation:** 99 focused engine/runtime tests pass, including an unloaded
  visible branch, stale parent error, settled recheck wakeup and 16-to-target
  admission after coverage. Internal browser Mesh2024 at 51.2700831/7.1996327,
  z18.275 ->19.275 ->18.275 retained visually filled coverage in snapshots.
  This is not frame-by-frame mouse-drag proof. Final snapshot still had queued
  requests/parse backlog and target1px not converged; complete target liveness
  and wall-time improvement are not claimed. No build/lint/commit/push.

### SHARED-SCENE-SCOPES-20260909 — layer orchestration only

- **Decision:** `shared-three-scene-layer.ts` coordinates lifecycle, scene placement
  and camera/render dispatch (344 lines). Contracts live in `core/shared-three-scene-types`,
  shader strings in `core/shared-three-map-style-shaders`, and the pure shadow-view
  signature in `core/shared-three-shadow-view`. Runtime integration modules own
  accumulation, map-style projection, material hooks and WebGL render context.
- **Boundary:** Internal consumers import the owning module directly. The package
  root retains explicit public exports; the layer is not a compatibility barrel.
  The offscreen/main-framebuffer depth-range bridge is preserved.
- **Reason:** Shader source and independent mutable resources obscured lifecycle
  review. Splitting by resource owner avoids a flat forwarding monolith. This is
  an imperative Three.js runtime, not a React provider; splitting it alone does
  not reduce React rerenders or prove faster rendering.
- **Validation:** 36 focused layer/registry/camera tests pass against the actual
  split. Internal browser still renders Mesh2024 and hard shadows. No build/lint
  or full performance claim; global barrel-policy findings remain elsewhere.

### LOD2 terrain corridor reuse

- **Anchor / date / status:** `#lod2-terrain-corridor-reuse` / 2026-09-10 /
  user-confirmed working in preview ca9b7a957-1789005533718.
- **Context:** Building-only tilesets do not populate mesh receiver frontiers.
  Using that empty frontier disabled their sunward selection. Independent raster
  terrain can receive building shadows even where no building intersects the view.
- **Decision:** Native tilesets use their visible receiver tiles plus visible
  triangulated-terrain Box3 volumes supplied through the existing shadow view.
  Both use createShadowReceiverMask, the existing finite-sun sweep and hierarchy
  readiness/revision search. Scene-space ground bounds are transformed into tile
  space for loading, and clipped to the requested receiver for regional proofs.
  Terrain outside the observer frustum never seeds recursive caster demand.
- **Alternatives:** A separate LOD2 corridor algorithm is unnecessary; increasing
  texture sizes cannot fix missing casters or readiness stuck at preview quality.
- **Evidence:** Focused native-frontier and open-ground LOD2 regressions pass.
  The wider corridor file has 14 passes and two mesh-selection failures; both
  reproduce with the committed shadow module substituted by a Vite load hook.
  Native regression verifies offscreen caster inView admission, which upstream
  traversal uses for LRU residency. End-to-end eviction retention remains unverified.
  Existing shadow map limits, samples and animation direct-draw policy are unchanged.
  User confirmed the candidate works in the internal browser. No measured speed
  comparison or pixel-level chimney-shadow parity established.
- **Revisit when:** Ground receiver metadata lacks adequate spatial precision,
  bounds changes cause excess proof invalidation, or live resolution remains low
  after corridor coverage is complete.

### Local frame for ECEF tilesets, sun and sky

- **Anchor / date / status:** `#local-frame-for-ecef-tilesets-sun-and-sky` / 2026-09-18 / implemented
  and unit-tested (local-frame group); not yet confirmed in the browser.
- **Context:** The shared scene is one Mercator tangent plane at its origin.
  ECEF tilesets (`cameraLocalMount`) refitted their own mount at the map centre
  behind a hysteresis distance; each refit re-signed the shadow receiver snapshot
  with the mount matrix and requested a shadow selection refresh, which dropped
  caster proofs and could re-request tiles. The atmosphere observer was frozen
  at the map centre of scene creation, so the sun's scene-space direction did
  not follow where the tiles were mounted. Shadows under an orthographic light
  are invariant under an affine transform applied to light, casters and
  receivers together, so a refit must be neutral for them unless time changes.
- **Decision:** The MapLibre wrapper (`SharedThreeSceneLayer`) owns one local
  east/up/south frame at the map centre on the ellipsoid
  (`SharedThreeSceneLocalFrame`) and publishes it on every
  `SharedThreeSceneFrame`. It is refitted when keeping it would show more than
  0.5 px of error in the current view (`localFrameErrorPixels`: Mercator scale
  drift tan(lat)·d/R over the visible half width, surface sag d²/2R·sin(pitch),
  up-vector tilt d/R against 200 m of content height), not after a fixed
  distance; only scalars are compared per frame. The layer also owns a
  local-frame group. Frame-mounted runtimes (`mountsOnLocalFrame`) sit in it,
  mounted once at the frame's reference fit (`referenceLngLat`,
  `sceneFromLocalReference`); the shadow scene's light, sun vector and page
  lights live in it too, and every shadow-facing box (tile volumes, corridors,
  receiver points, cells) is exchanged in that reference space
  (`frameFromTiles` in the runtime, `getFrameCamera` in the shadow scene). A
  refit sets the group's matrix to `referenceToCurrent` and nothing else:
  tiles, light, casters and receivers move by the same affine, so the shadows
  cancel out of it exactly and only a solar change invalidates them. Fits and
  keys are made in host space (`getLightViewMatrix`), so a moved group changes
  no key. Caster selection is keyed on the ECEF sun direction
  (`SharedThreeSceneShadowView.directionToSunECEF`) and the receiver
  signature no longer includes the mount matrix. The sun is fixed in ECEF:
  the retained sample is only re-expressed for the sky dome, drawn in scene
  space (`rebaseAtmosphericSunlightSample`), nothing is re-evaluated. A refit
  stays inside the map render: no demand sweep, no selection refresh, no
  content change, nothing reaches the content registry or React. Page
  identity stays exact: any receiver or sun change re-keys a page and its
  depth, so a solar update from the time controls is never absorbed.
- **Alternatives:** Per-runtime refit behind a hysteresis distance: superseded,
  its error was not tied to the view (incompatible by inspection). Using the
  view-state anchor from `engines-interop/view-state`: incompatible by
  inspection, engines cannot depend on interop. Re-mounting tiles per refit
  with the light in scene space, re-aiming the sun and tolerating sub-texel
  page drift (the previous state of this record): superseded, approximate and
  not neutral; the group is exact by construction. Keeping a page while its
  receiver bounds or sun direction changed by less than half a texel:
  measured rejection, at pitch 52° far receivers have texel targets of metres
  and the retention swallowed whole time steps, so settled soft shadows no
  longer followed the time slider. A fixed 0.02° frame-tilt tolerance before
  re-aiming the light, and re-evaluating the atmosphere on a refit:
  superseded for the same reason. Expressing shadow-facing boxes in
  ECEF instead of the reference fit: rejected by inspection, the page planner
  assumes a Y-up frame and float32 GPU paths need local metres. Re-rooting
  every runtime at the layer origin: not needed, the total ECEF-to-scene fit
  is root-independent (shown algebraically, not measured). A per-frame scalar
  Mercator scale correction instead of refits: not evaluated.
- **Evidence:** engines/maplibre specs pass (701), including
  `shared-three-scene-layer.spec` (frame moves only past the pixel budget; the
  group follows it and carries mounted runtimes) and
  `three-tiles-runtime.liveness.spec` (mount made once at the reference, left
  alone on a refit); shadow-simulation specs pass (557), including
  `atmospheric-sunlight.spec` (re-expression keeps radiance and turns only the
  frame), `shadow-scene.spec` (sun carried by the group on a refit, nothing
  evaluated, no forced shadow-map pass) and `tiled-shadow-renderer.spec` (a
  moved host group leaves fits, keys and depth untouched; any sun turn,
  however small, re-keys every page).
  `shadow-corridor-host-state.spec` and `ShadowSimulationView.spec` fail to load
  the collab geoportal index on dev as well (environment, unrelated). No browser
  or performance measurement yet.
- **Revisit when:** content taller than 200 m or a wider viewport shows drift
  before a refit, Mercator-placed receivers (raster terrain under LOD2, which
  cannot move with the group) show the bounded light offset, or the view-state
  anchor becomes available to the engine layer.
### SHARED-TILE-CAMERA-DEMAND-20260913

- **ID / date / status:** SHARED-TILE-CAMERA-DEMAND-20260913 / 2026-09-13 /
  implemented demand foundation; full coverage-manager acceptance pending.
- **Context and constraints:** A second camera must not instantiate another
  tileset, raster decoder, scene, or WebGL context. Cameras are in the existing
  shared scene's world frame. Perspective, orthographic, off-axis and parented
  Three cameras supply their own physical viewport and pixel error target.
- **Decision:** `SharedThreeSceneLayer.setTileCameraView(view)` upserts demand by
  ID; `removeTileCameraView(id)` removes only that source. The host snapshots all
  live camera matrices once per frame and gives the same snapshot to every
  runtime. `core/tile-camera-demand.ts` compiles frusta only when the camera set
  changes. Mesh and raster selection union demand before one traversal/loading
  generation; overlapping tiles use the maximum normalized error, not the sum.
  Geometry-only demand does not promote color materials. Receiver promotion
  reuses the existing payload. Disjoint raster views enumerate separate regions,
  not the potentially enormous rectangle between their cameras. Loaded terrain
  and mesh frontiers remain owned by their existing publication adapters.
- **Reuse:** This extends `tiles-camera-set.ts`, `terrain-selection.ts` and the
  existing frontier machinery; it does not replace the native observer camera
  with a MapLibre composite projection. The existing finite-sun receiver-prism
  path remains responsible for solar corridor precision. It is not replaced by
  a broad camera frustum. Use `createSharedThreeSceneCameraPreview` to draw a
  diagnostic view through the same renderer; do not create one renderer per view.
- **Alternatives and disposition:** Separate loaders/contexts per camera are
  incompatible with shared GPU residency. Independent per-camera raster
  selection runs are incompatible with the runtime's single generation owner.
  A shared scene-wide floor/admission budget and fully unified sun-demand
  scheduling are deferred to the next manager slice, not claimed here.
- **Evidence:** Colocated camera-demand tests cover projection types, world
  transforms, overlap, role changes, immutable snapshots and removal. Mesh and
  raster runtime fixtures verify reuse/publication, and host tests verify the
  same renderer and snapshots across runtimes. These are deterministic
  selection/payload fixtures, not end-to-end GPU throughput or no-holes evidence.
  Reproduce with `vitest run --config libraries/mapping/engines/maplibre/vite.config.ts`
  and the `tile-camera-demand`, `terrain-selection`, `three-tiles-runtime.camera-demand`,
  `raster-dem-terrain-runtime` and `shared-three-scene-layer` spec paths.
- **Revisit when:** Camera-specific readiness proofs, aggregate byte admission,
  source fallback coverage, offscreen drape readiness, or persistent storage are
  integrated. A geometry query must not interpret an incomplete loaded cut as
  proof of no intersection. Rendering a newly demanded view also requires its
  imagery/color resources; additional camera demand alone cannot synthesize
  basemap textures outside the current MapLibre capture.

## Multi-camera and point-light stress stories

**MULTICAM-STRESS-20260913 / 2026-09-13 / diagnostic implementation; acceptance open**

### Joined orthographic reference walls

**ORTHOGRAPHIC-REFERENCE-SEAMS-20260916 / 2026-09-16 / implemented, visual acceptance partial**

- **Context:** Independent orthographic rectangles overlap on one side of a bend
  and leave wedges on the other. Different parallel-ray directions cannot make
  a seamless unroll at all scene depths simultaneously. This is separate from
  missing tiles and foreground clipping.
- **Decision:** `createSpineCameraRig.referenceSurfaceOffset` offsets the reference
  supporting lines and intersects adjacent lines to obtain shared mitre joints.
  Camera centres, widths, image-plane depth, strip layout and navigation follow
  the same geometry. Scalar metres apply globally; an array configures retained
  segments before subdivision. Zero keeps the spine as the reference. Positive
  values move into the scene. Foreground clipping stays independent. Camera
  matrices remain genuinely orthographic and are also used by tile demand.
  Open caps, closed wrap seams, either side and downward-unfolded views use this
  shared path. No extra render pass, texture copy or per-frame fitting is added.
  All wall panels use one `baselineElevation` (default: first spine vertex), or
  one explicit `verticalRange`. Input vertex heights never stagger the cameras.
  Corridor stories no longer sample terrain heights to recenter each panel;
  vertical navigation moves the entire rig, including the paired street row.
- **Cylinder correction:** Inward object-cover reference panels now lie on an
  inner tangent polygon, not mutually crossing at the cylinder centre. Their
  width uses `radius - referenceDepth`. Depth defaults to half the radius and
  is configurable; perspective panoramas retain their common-eye projection.
- **Safety:** Reject nonfinite/per-segment count mismatches, incompatible parallel
  offsets, reversed panels, reference planes outside near/far and mitres longer
  than four times their requested offset (minimum scale 1 m). Do not clamp joins
  independently and silently reopen cracks. Nonadjacent self-intersections of
  long/concave routes remain a review limitation, not certified volume coverage.
- **Alternatives:** Bisector clipping alone is incompatible with gapless images:
  it removes duplicate geometry but leaves blank screen wedges. Full depth-
  dependent reprojection/blending is deferred; it changes the orthographic
  measurement semantics and requires depth buffers/occlusion policy. Independent
  rectangle translation is rejected by geometry: endpoints no longer coincide.
- **Evidence:** Focused tests check projected reference endpoints, both sides,
  segment-specific depths, subdivision, the closed wrap and cylinder seams,
  invalid offsets and the full sourced route at its zero-offset default. These
  are geometry invariants, not image-quality or frame-time acceptance.
- **Revisit:** Depth-independent seamless imagery requires an explicit nonlinear
  unwrapping mode; arbitrary offset self-intersections require a topology policy.

### Stress-story context

- **Context:** Exercise the camera-demand foundation with real mesh/Terrarium
  sources before claiming a production, hole-free scene manager. Stories live at
  `playgrounds/stories/src/stories/mapping/tile-loading-manager/TileCameraStress.stories.tsx`
  under **MapLibre Playground / Tile Loading Manager / Camera Views**. Lights
  live in `TileLightStress.stories.tsx` under **Lights**; the existing diagnostic
  `MeshCoverage.stories.tsx` is ported under **Coverage**, with a direct MapLibre
  host rather than the Geoportal provider stack. All use this shared engine and
  the same Mesh 2024 metadata entry. See [coverage policy](./TILES_COVERAGE.md).
- **Decision:** Panorama, closed facade, open Wupper north-bank spine, four orbiting
  HKW lights, and public BELIS streetlights at Rathaus Barmen. Additional virtual
  panorama eyes at the chimney top and Rathaus roof carry explicit height evidence.
  All camera views share one scene, renderer/context and loader per data source.
  Panorama cameras share the optical centre; their tangent image planes form the
  cylinder. Object-cover mode looks inward. Spine strips split at retained corners,
  allocate at least one camera per segment and expose the achieved camera count.
  One-dimensional navigation scrolls the strip, not the anchored rig. Per-view
  clipping never changes the primary MapLibre view. Strip widths preserve facade
  proportions, within a 16,384-pixel backing-width ceiling.
- **Vertical framing:** Nominal, zero-shift panorama vertical FOV is independent of camera count.
  A vertical lens shift preserves matching side rays between upright image planes.
  At nonzero shift the angular top/bottom span is not the nominal symmetric FOV;
  endpoint-ray regression tests document this rather than changing seam-safe projection.
  The ALKIS-derived approximate Rathaus perimeter uses a 154–225 m ground-to-tower
  window plus padding. Riverbank strips use a conservative 145–225 m display
  window plus padding; the bank source is 2D, not surveyed facade-height data.
  These are editable visual envelopes, not surveyed building-height guarantees.
- **Bank replacement / 2026-09-13:** The former Schwebebahn centreline fixture is
  replaced by the actual northern boundary of the Barmen Wupper water surface.
  The 64-vertex fixture retains source boundary edges from basemap.de/BKG
  `Gewaesserflaeche`, `name=Wupper`, `kennung=2736000000000000000`. Unioning tiled
  fragments includes under-bridge water; it does not interpolate a railway offset.
  Captured water polygon, source attribution, derivation script and two
  reproducibility/boundary tests live in the common story's `data/` directory.
  The shared rig merges only headings spanning at most 3 degrees (configurable),
  then gives every remaining segment a camera even above the requested minimum
  count. Cumulative gentle turns and sharp corners therefore remain represented.
  Rail-centreline and constant-offset alternatives are incompatible with the
  requested shoreline view. Revisit with a higher-resolution surveyed bank or
  measured facade elevations; the current fixture is cartographic source data.
- **Coverage reuse:** Port the existing floor, cascade, ring and fallback logic
  into this runtime, then retain demand from all cameras during stale-download
  cancellation. `loading.getCoverageStatus()` replaces the fixed coverage-warning
  text with actual floor/missing-root and queue evidence in both diagnostic UIs.
  An unknown or failed root cannot certify coverage. Raster reuses camera demand,
  but scene-wide mesh/raster budget unification remains open.
- **Scheduling:** One asynchronous GPU readback in flight; the shared framebuffer,
  depth range and clipping state are restored before waiting. Completed segment
  pixels stay visible while another segment updates. Camera count changes rebuild
  views, not loaders. Shadowed point lights register six geometry-only frusta each and keep
  their shadow maps between updates. Static unchanged poses do not dirty shadows;
  streamed content revisions do. Light-centric image previews optionally promote
  their selected six faces to color receivers. These are live image observations,
  **not an analytical or certified viewshed**.
- **Point-light budget:** Twelve simultaneously shadowed lights exceeded this
  Chrome client's 16 fragment texture samplers. All requested lights illuminate,
  but a configurable subset casts shadows (default four, also capped by sampler
  headroom). HKW's four moving lights therefore all cast shadows; the default
  twelve BELIS lights use 24 shadow-camera faces, not 72. The HKW normal bias is
  1 m to reduce coarse-LOD self-shadowing; it is editable and not a universal
  acne-free or contact-shadow guarantee.
- **Sources and height evidence:** Mesh URL is the 2024 reference tileset. HKW
  positions use the existing chimney measurement fixture. The Toelleturm virtual
  eye is 3 m above the preserved 358.3477 m reference-surface point to clear the
  mesh parapet; this is not a surveyed camera pose. Open-spine plan coordinates
  now come from the water boundary described above. The closed Rathaus envelope is explicitly
  approximate/editable. Public `https://tiles.cismet.de/leuchten/style.json`
  identifies the `leuchten` MVT source layer, confirmed in a visible Chrome session
  on 2026-09-13. Its locations are retained for the observation lease when MVTs
  unload. Night lights wait for DGM heights; mast height (default 8 m) and photometry
  remain assumptions. Heights use the runtime's existing scene mount. ECEF does
  not establish the authored vertical datum: an initially added GCG2016 offset
  visibly lifted the lights by another 46.55 m and was removed. Sampled local
  mesh bounds start around 152 m while DGM at the centre is 154.88 m; this is
  placement evidence, not proof of exact datum alignment. Exact curved-ECEF/planar
  mount correction is a separate task.
- **Alternatives and disposition:** Separate renderers/loaders are incompatible
  with shared residency. Synchronous per-camera readback is rejected by inspection
  as an unnecessary main-thread wait. GPU-only atlas presentation is deferred:
  these diagnostics intentionally expose image strips for inspection/export.
  Synthetic streetlight placement is not a substitute for missing BELIS data.
- **Evidence / limits:** Colocated tests cover 64-camera demand, six-face lights,
  corner splitting, clipping, strip layout, asynchronous lifetime/state restoration
  and source lease cleanup. The combined extraction validation passes 347 tests
  in 24 files, including vertical windows and panorama seam rays. Static-preview checks with
  the dedicated visible Playwright browser rendered the mesh facade, open-spine
  strip (including midpoint navigation), raster panorama, four-light HKW scene,
  optional light views and twelve public BELIS lights. Async readback exposed a
  shared-context PIXEL_PACK_BUFFER leak; immediate restoration and a pending-read
  regression test fix it. These observations do not prove no holes, sustained
  throughput, all configurations or exact datum alignment. Full Storybook encounters the existing unresolved
  `@carma-collab/wuppertal/geoportal` barrel dependency; a temporary narrow-entry
  preview does not certify that full build. Raster workers require ES-module
  output, now configured in the stories Vite config.
- **Revisit when:** Camera-specific coverage proofs and scene-wide admission/floor
  accounting land. Missing geometry must remain unknown, never become an implicit
  clear ray or a false "ready" state. Measure complete panorama refresh separately
  from the displayed per-segment readback time and point-light update cadence.

### Multicam visual review — 2026-09-13

Zoom focus prefetch and persistent offscreen handoff now extend the same shared
manager; see **ZOOM-PREFETCH-20260913** in [TILES_COVERAGE.md](./TILES_COVERAGE.md)
for admission, cancellation ownership, complete-quartet publication, validation
boundaries and memory-pressure limitations. This supersedes view-only history
pruning, not the existing shared-pool/camera architecture.

Continuation of **MULTICAM-STRESS-20260913**, status: diagnostic, review required.

- **Decision:** Keep plausible virtual viewpoints, but visibly distinguish them
  from surveyed camera poses and certified coverage. Every camera/light demo
  carries a scenario-specific review notice. Rathaus roof, perimeter, riverbank
  and inward object cover are also marked `review` in the sidebar. Custom spines,
  clipped views and DGM-only facade variants carry explicit limitations.
- **Presentation fixes:** Short strips now fill the available width without
  changing aspect ratio; the previous unused dark rectangle was not a missing
  camera. A station slider appears only when there is horizontal overflow.
  Segment labels show camera bearings or cumulative projected spine metres.
  Diagnostic image planes are translucent rather than opaque-looking walls.
  Inward object-cover planes are hidden by default: their intersections at the
  object centre obscure the very object being inspected.
  Invalid camera settings clear the old image instead of presenting stale output.
  Irrelevant controls are scoped away; the story render restores valid inactive
  defaults because Storybook removes conditionally hidden args from rendering.
  Object cover has a separate chimney preset
  centred between fixture foot/top heights with a 220 m vertical window.
- **Checked geometry:** Panorama cameras share an eye and their side rays match;
  cylindrical images remain faceted perspective images, not an equirectangular
  reprojection. Rathaus cameras sit outside and look inward. The west-to-east
  north-bank cameras sit over the river and look north. Fitted orthographic
  windows include the configured padding. Existing seam/demand/clipping tests
  remain the foundation, including pitched angular endpoints.
- **Closed-footprint correction:** `createSpineCameraRig.closedFootprint` moves
  every supporting edge of a convex footprint outward in metric scene space
  (3 m default in the Rathaus story, minimum 2 m). This is a mitred parallel
  offset, not a centroid scale. Source winding is normalized so adjacent inward
  image strips meet left-to-right; duplicate endpoints and collinear edges are
  supported, concave/degenerate envelopes rejected, and hull edges never merged.
  The front clipping plane is on that expanded outline. Each orthographic far
  plane ends 3 m beyond the original hull portion inside its horizontal strip,
  including edge intersections, instead of the previous uniform 300 m depth.
  Margin-only strips are bounded near the front. Tile demand and rendering use
  the same shortened camera. `perimeterClearance` and `backStreetMargin` are
  story controls. The buffer is relative to the ALKIS hull, not a surveyed mesh
  roof boundary; a street gap free of all neighbouring geometry is not inferred
  from the building footprint alone. Open spines retain their existing policy.
  Twenty-seven focused rig tests cover winding, clearance, seams, clipped-edge
  depth, duplicate/collinear vertices, empty margins and invalid envelopes.
- **Review still required:** The Rathaus convex hull omits recesses and courts,
  and does not isolate neighbours. The 2D bank has only an approximate height
  envelope. Object-cover views overlap and are not a metric surface flattening.
  A closed merged ring can acquire a start-dependent extra seam. Clipping removes
  real occluders by design. Virtual eye heights are not accessible-site claims.
  Per-camera geometry completeness is not certified, including when the primary
  map says its visible base is ready. Sequential light frames are not synchronous
  viewsheds. DGM contains no building facades or vegetation.
- **Evidence boundary:** Dedicated user-visible Chrome/Playwright session against
  the static 4300 preview. Final checks of all six presets (Toelleturm,
  chimney-top, Rathaus-roof, closed facade, Wupper bank and inward chimney cover)
  show rendered image strips with plausible orientation and height framing.
  At a 1280 × 900 viewport the bank's station slider reaches its end exactly
  (station 1, scrollLeft 573 = scrollWidth − clientWidth). The 20 focused rig
  tests pass, including pitched seam rays and angular endpoints. The loader
  still reports missing/unknown floor cuts. These are
  visual samples, not a speed benchmark or acceptance of every possible Control
  combination. Captures: `output/playwright/multicam-*.png` in the worktree.
- **Alternatives:** Repositioning the measured/reference cameras just to remove
  all foreground walls is deferred; nearby parapets/mouths can be physically
  plausible. General inverse-surface unwrapping and panoramic reprojection are
  not evaluated here. Review real per-camera coverage before accepting these
  diagnostics for measurement or product-facing export.

### Barmen night demonstrator — NIGHT-BARMEN-20260913

- **ID / date / status:** NIGHT-BARMEN-20260913 / 2026-09-13 / bounded visual
  prototype, review required. Story: `TileNightTraffic.stories.tsx`, alongside
  the shared manager's Lights stories. Keep this optional diagnostic slice
  separate from production coverage-manager acceptance.
- **Context:** Hundreds of fixed street lamps must not become hundreds of live
  Three point lights or shadow cubes. Reuse the same 3D Tiles/raster runtime,
  Three scene and tile pool as the camera/coverage demos. Do not enable a
  city-wide scene without complete source coverage and a measured budget.
- **Decision:** The existing BELIS observer supplies up to 400 loaded lamp
  positions within 900 m of Rathaus by default. Unknown DGM heights withhold a
  lamp/route rather than placing it at zero. A worker generates a bounded
  1024-square RGBA8 projected irradiance atlas (4 MiB retained GPU input; roughly
  44 MiB temporary worker arrays). RGB is additive smooth illumination; alpha
  is weighted ground elevation for vertical attenuation. This is a 2.5D light
  field, **not** a mesh-occlusion or shadow bake. Height and photometry are
  explicitly assumed. Material hooks preserve existing shaders; only content
  revisions reconcile materials. One worker job and the latest pending request
  are retained; a completed prior atlas stays visible until replacement. Each
  result swaps a new DataTexture atomically; resizing the already uploaded 1×1
  placeholder caused a real `glTexSubImage2D` immutable-storage error on reload.
- **Moving sources:** Three cars by default (bounded to eight in the runtime),
  one Schwebebahn and one train. Cars have two actual white SpotLights and two
  visible red tail bulbs plus a red environment light. Rail vehicles have white
  front/red rear lights and warm windows. All use the same renderer; no extra
  shadow maps. Synthetic 30-second signal phases illuminate surroundings; cars
  stop before non-green signals with spaced stop slots. Vehicles fade over the
  first/last 8 m of open data fragments instead of reversing instantly. This is
  not a traffic-flow, car-following, railway timetable or safety simulator.
- **Geometry:** Real OSM road fragments, signal nodes and subsampled railway
  lines; provenance/query in the story's `data/night-traffic-source.md`. Cars
  and national rail use DGM-relative heights; suspension track is assumed 13 m
  above DGM with the vehicle roof 3 m below it. Bridges, rail curvature, overhead
  geometry and exact mounting require review. This local demonstrator does not
  alter the surveyed/timetabled VehicleAnimation addon or certify its geometry.
- **Alternatives:** Full city coverage and geometry-aware light baking are
  deferred, not measured rejections. One real-time shadow cube per lamp is
  incompatible with the bounded sampler/work budget by inspection. Reusing the
  existing public vehicle addon directly would introduce an engine-to-addon
  dependency cycle; this runtime consumes projected paths and compiled segment
  distances instead. A genuine shared vehicle-motion core may replace this
  bounded diagnostic once extracted below the addon/engine boundary.
- **Evidence:** Six atlas math tests, six mocked worker/material lifecycle
  tests (including texture-storage replacement) and five traffic/cleanup tests
  pass (17 total). Static narrow-entry
  Storybook preview on 4300, shared user-visible Chrome/Playwright session:
  400 baked lamps, five vehicles, three signals, all five routes have DGM data.
  Screenshots `output/playwright/night-barmen-first.png` and
  `night-barmen-motion.png` show fixed lighting retained while vehicle positions
  and signal colours change. One warmed four-second rAF sample at 1280×900
  yielded 575 callbacks, median 6.9 ms, p95 8.3 ms. This is **callback cadence,
  not GPU-rendered FPS**; no cold-load, GPU timing, sustained throughput or
  whole-town benchmark was performed. The reference loader still reports one
  missing/unknown fallback cut. The full root-barrel build is not certified by
  this narrow preview; repository-wide barrel-policy violations remain outside
  this slice.
- **Revisit when:** Light/mesh occlusion baking, complete lamp coverage, measured
  bridge/rail elevations and sustained GPU/memory acceptance are available.
  Until then the Whole Town story is explicitly disabled, not partially drawn.

## Shadow activation and declared mesh appearance

**ID / date / status:** MESH-SHADOW-ACTIVATION / 2026-09-20 / implemented.

**Context:** `shadowBuildingStyle` opts a tileset into the shadow controls'
colour and opacity overrides. The early return introduced in `76bfd967d` also
prevented unlit terrain textures from receiving the lit material adapter.
Mesh2024 could load while remaining unable to receive simulated shadows.

**Decision:** always track shadow activation and install/restore the textured
lighting adapter. Gate uniform colour, saturation and opacity overrides on
`shadowBuildingStyle`. Opted-out styles retain their source texture, opacity and
dataset colour correction; outlines follow their declared visibility, including
when new models arrive. The source material is restored when shadows stop.

**Alternatives:** enabling appearance overrides for every style is incompatible
with the explicit opt-out. Removing the unlit material adapter cannot provide
shadow reception. Neither alternative was adopted.

**Evidence:** the added regression test checks an opted-out unlit mesh, declared
texture/opacity/colour correction, outline visibility and adapter disposal. Live
Mesh2024 shows shadows at 10:01 and 15:00. The selected loading tests have the
same nine failing cases before and after this fix (71 versus 72 passing); these
existing failures remain unresolved and are not treated as obsolete.

**Revisit when:** another material extension needs a shadow-capable adapter;
keep lighting participation independent of optional appearance overrides.

## Terrain ownership after runtime registration

**ID / date / status:** MESH-RUNTIME-DRAPE / 2026-09-20 / implemented.

**Context:** shadow-scene startup sets an explicit mesh-label drape override.
Adding an overlay terrain provider later previously left that override at its
initial value, so adding a mesh and reloading with that mesh could produce
different ground rendering.

**Decision:** on terrain-provider membership changes, synchronously reconcile
raster terrain ownership, the MapLibre ground pass and the mesh-label override.
Removing the last provider restores raster ground and its base-map projection.
Keep MapLibre DEM elevation available for labels. Ordinary tile arrivals retain
the bounded content-refresh cadence; they do not repeat the immediate ownership
transition.

**Evidence:** the regression adds and removes a terrain provider without timers
or style/idle events and checks that unchanged membership does not repeat the
immediate transition. All 54 shadow-scene tests pass. Live Mesh2024 removal and
URL-drop addition restore/suppress the base-map ground without reloading.
