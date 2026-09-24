# Mesh reference comparisons

## Anchored elevation differences (2026-09-15)

Elevation Stripes now keeps the mesh-root coordinate fixed while the camera
visits the presets. The colour modes distinguish relative normal height
`ΔH`, relative ellipsoidal height `Δh`, their difference
`Δh − ΔH = ζ(P) − ζ(anchor)`, and the naive ECEF tangent-mount sag. The
adjustable anchor H is an explicit diagnostic assumption, not a surveyed height.
Raster bending remains independent of colour interpretation. Residual modes
use metre-scale colours and restrained normal shading; direct coefficient
readouts are the numerical reference, not colour matching.

Bundled GCG2016 evaluations and exact WGS84 zero-height predictions:

| Site | Δζ from mesh root | Tangent drop |
| --- | ---: | ---: |
| Rathaus Barmen | −0.042 m | −1.468 m |
| Paul-Flocke-Weg | −0.106 m | −8.041 m |
| Cronenberg | +0.013 m | −1.697 m |
| Stoffelsberg | +0.244 m | −7.325 m |
| Nordhelle (outside mesh) | +1.076 m | −142.000 m |

The selected city sites span about 35 cm in Δζ, not 2 m. This is not an
exhaustive extrema search over city boundaries. The roughly 8 m geometric
drop is a separate effect and does not establish an observed mesh error or
certify its source datum. GPU sag uses a quadratic local approximation;
five focused tests include agreement within 1 cm at three city-scale points.
Half-float GCG texture encoding and texel-centred sampling avoid the prior
8-bit field steps. Existing bounded scene budgets and disposal safeguards remain.

Follow-up: the story uses one datum-separation selector with absolute/anchor-relative
reference, not two competing ζ entries. Both readouts and the GPU LUT already
call `getGcg2016HeightAnomalies` from `@carma-geo/proj`, which consumes the shared
`@carma-commons/resources/gcg2016` grid and BKG-compatible interpolation. No
independent coefficients or interpolation model were added to the story.
Datum/sag colours now fit a 17×17 viewport-ground-footprint sample range on
moveend/resize; this is labelled sampled coverage, not exact triangle extrema.
No tile traversal, download or GPU readback is needed for range updates.
A minimum 1mm range prevents division by zero. All three scalar variants use
thin 0.1m and stronger 1m contours, with independent subpixel fade.

## Approved consolidation and bounded comparisons (2026-09-15)

**ID / status:** MESH-STORY-REVIEW-20260915 / implemented, uncommitted.
Supersedes the pending choices in MESH-STORY-CONSOLIDATION-20260915 below.

- C1: SingleView removed. TransformStrategies retains a single opaque mesh and
  all existing projection methods, no visible basemap by default.
- C2: one Shared Views story remains at the existing
  `tile-loading-manager-multi-camera-overlap--orbit-and-overlap` ID. Duplicate
  SharedViews export removed. MapLibre globe/axis-fit controls and all native
  globe experiments/probes/configuration are removed; general mesh-to-plane
  sphere/ellipsoid methods remain. Globe findings below are historical only.
- C3: keep Horizon and Reference Surfaces. They and Elevation Stripes already
  compose MapLibreThreeReferenceSurfacesDemo, using the same
  patchTerrainReferenceShader / projectGeodeticToScene implementation in
  maplibre-three-reference-surfaces.ts. GCG2016 and geo primitives are shared
  libraries; shader orchestration still lives in stories, not a production API.
  WebGPU reuses the geographic helper but has its own experimental ray model.
- C4: Cached Lighting kept.
- C5: DatumSuperzoom story removed; WebGPU refraction kept.
- C6: standalone HTML globe diagnostics removed, recoverable from b1fee7fa7.
- C7: remove the newly added MeshProjectionPair and SyncedComparison story.
  Existing engines-interop ViewState and existing map-view-sync consumers are
  unchanged. No speculative sync-engine migration.

**Memory decision:** Elevation Stripes defaults to one corrected DSM over a
broader Barmen view (zoom16, pitch45), with at most two panels on demand. Each
bounded raster runtime selects at most16 tiles, retains at most24 cached meshes,
uses a32MiB source cache and two concurrent requests. Optional mesh budget384MiB.
Existing long-range consumers keep their defaults. Hidden tabs unmount the
comparison. Late content callbacks ignore disposed runtimes. Terrain and mesh
shader bindings now unregister on material disposal instead of accumulating
in long-lived update sets. These are scoped limits, not a total browser/GPU cap;
frontier transitions, workers and other open tabs still need memory.

**Performance evidence:** Chrome152 desktop, existing shared browser, no CPU
throttling; stationary 5s DevTools trace, no navigation insights. Before the
preview change, camera configuration0–0.4ms and blit typically0–0.1ms, while
render+async-readback samples ranged roughly4.6–125ms. These are wall waits, not
isolated CPU or GPU execution. Secondary rendering and readback are the costly
stages, not the coordinate math. Preview now admits at most one outstanding
render, at most10 starts/s, with at most262144 output pixels and latest dirty
pose coalescing. After navigation to the retained preset,24 samples measured
37.2ms median /92ms P95 /137.4ms maximum wall wait; configuration median0.1ms,
blit P95 0.1ms. Different load state/pose: **not a before/after speedup claim**.
The change bounds interference; a shared GPU presentation path would be a
separate optimization. Existing6GiB pool unchanged.

**Verification:** four focused elevation shader tests pass, including40
material create/dispose cycles without binding accumulation. Browser default
Stripes: one canvas,15 visible meshes,~159MiB geometry arrays; heap counter at
one sample~963MiB, not a retained-heap measurement. Simulated visibilitychange
unmount: zero canvases, terrain diagnostic deregistered, old root empty.
Screenshot shows the area contours; no source-datum certification. Story index
confirms selected removals and retained WebGPU/Shared Views/transform methods.
No broad build, commit, push or server restart. Long-duration panning/heap
plateau acceptance remains open; do not claim all memory leaks eliminated.

## Story consolidation review

**ID / date / status:** MESH-STORY-CONSOLIDATION-20260915 / 2026-09-15 /
implemented cleanup; remaining removals require individual user confirmation.

**Context and constraints:** WIP checkpoint `b1fee7fa7` preserves the previous
projection/globe investigation. The user rejected translucent mesh/aerial
comparison and the three separate accuracy-preset stories. Numerical tests are
not evidence of functional visual comparison or source datum correctness.

**Decision:** Mesh Alignment uses opaque Mesh 2024 or LoD2, a topo basemap and
the existing addon style projection by default. Remove the aerial source,
alpha/blend controls and their material overrides from this comparison runtime.
Original model texture remains available by disabling style projection; that
is not an aerial basemap. Shared Views uses topo rather than aerial, but retains
original model material: the main-camera capture is not a valid independent
texture for an arbitrary secondary view. Do not claim drape parity there.
Remove Accuracy1cm/Accuracy10cm/Accuracy1m exports; retain their accuracy control,
numerical methods/tests and benchmark. Remove WholeTownNightTraffic, which was
only a disabled explanatory page. Existing dev stories are not removed.

**Alternatives and disposition:** translucent aerial overlay rejected by user;
not a measured performance rejection. Wider removals below are deferred, not
certified non-functional. Projected topo is useful for surface inspection, but
is not an independent imagery residual measurement.

**Evidence:** running Storybook synchronized pair loads both native runtimes,
reports instance 1, opaque mesh and enabled style projection, and requests no
aerial resources after fresh navigation. Full source/geometry alignment and
all-story runtime acceptance remain unverified. No shared loader code changed.

**Revisit when:** an independent image-registration test is required, or a
surface-bound style texture is available to both cameras.

### Candidates — no removal without confirmation

| ID | Candidate | Evidence and proposed action | What must remain |
| --- | --- | --- | --- |
| C1 | `SingleView` in MeshMount | Same MeshMountDemo and controls as the synchronized pair, with only one panel. Remove the separate export if the pair is sufficient. | Four-location Reference, synchronized A/B, geometry methods. |
| C2 | `MeshOverlapStress` / `OrbitAndOverlap` | Renders MeshMountSharedViews, also used by SharedViews; different defaults enable globe/axis fit already exposed there. Fold the preset into SharedViews, remove the duplicate story file. | Shared pool and interactive secondary camera; Coverage Camera Windows is a different test. |
| C3 | Reference Surfaces `LongHorizon` and `Sunset` versus TerrainHorizon | Both compose MapLibreThreeReferenceSurfacesDemo and the Toelleturm/Nordhelle poses. Preserve comparison/atmosphere controls in TerrainHorizon before removing duplicate exports. | Sunrise, atmospheric depth and source/coverage caveats are not automatically redundant. |
| C4 | `CachedLighting` story | Separate RGB/scalar experiment explicitly not using the accepted addon modes. Move out of the normal story list or remove the new export. | Underlying dev-origin implementation and production Sun Disc/Corridor stories. |
| C5 | AtmosphericRefractionWebGPU and DatumSuperzoom | Experimental refraction/datum workloads, separate from first-merge coverage and camera work. Extract to a separate branch rather than call them redundant or delete them. | Reproducible models, tests, terrain limits and experimental evidence. |
| C6 | Native-only public HTML diagnostics | Standalone CDN MapLibre reproduction and redirect duplicate a discovery path outside Storybook; the repro intentionally includes the broken direct projection. Archive the reproduction after the upstream issue has enough evidence. | NativeGlobe and LoD2 native-terrain-reference; documented composite projection fix. |
| C7 | Lightweight map-view-sync versus engines-interop ViewState | Both coordinate comparison cameras. Consolidate only after terrain target, physical range/FOV and globe semantics have focused tests. | Shared tile pool is independent; no replacement of multi-camera demand management. |

Branch inventory against the local `origin/dev` reference at checkpoint:
270 changed files, 42,655 additions / 1,632 deletions, 13 added story modules.
This is a merge-base diff, not a freshly fetched upstream status. These review
candidates are source-based; a `review` label alone is not a failed runtime test.

## Native globe + bare-earth DEM follow-up (2026-09-15)

The default diagnostic link now opens `native-terrain-reference`: a synchronized
LoD2/topo/native-DEM pair, Mercator reference on the left and all-zoom globe on
the right. Both reuse MeshMountDemo's production tile runtime, shared Three
renderer and optional addon map-style projection; shadow simulation is not
enabled. Both default views display loaded LoD2 and terrain. Close-camera globe
elevation/framing differs from Mercator and remains a visible review issue,
not corrected imagery alignment. Globe selection now uses the composite
constant expression in initialization and live switches; source mesh stays off
all flattening paths. The original intentionally blank native-only A/B is
preserved at `/diagnostics/native-globe-terrain-repro.html`, not the default link.

**Cause isolated after the initial observation below:** direct
`type: "vertical-perspective"` supplies the globe matrix as its fallback even
when the terrain drape pass requests planar tile projection. `GlobeTransform`
supplies the Mercator fallback required for that intermediate texture pass.
A constant interpolation expression with vertical-perspective at both stops
selects that composite transform while keeping the visible view spherical at
all zooms. In fresh native-only 6.9.0 maps at [7.16346, 51.24111], zoom 15,
both report 317.63 m from our DEM; direct projection is blank, constant-expression
projection displays the aerial terrain. No Three/custom layer is involved.
The earlier low-zoom regional checks are not evidence for local DEM coverage.
Reproduction: `/diagnostics/native-globe-terrain.html` (same local DEM and aerial
on both sides, synchronized cameras, no mesh; source under stories/public).
Edge/skirt artifacts remain separate from the missing-drape diagnosis. This
does not certify ECEF-to-spherical mesh alignment or implement the story fix yet.

The story now couples Mesh 2024 with aerial imagery and LoD2 with the topo map,
enables the existing DGM1 Terrarium source as native terrain by default, and
exposes terrain and shared-addon basemap projection toggles. Basemap projection
is still view-dependent, not a persistent bake. An explicit building-only
`providesTerrain: false` no longer clears native ground merely because it receives
the map style; 35 focused shared-scene tests pass. End-to-end draping acceptance
is pending.

**Blocking observation:** forced `vertical-perspective` plus this raster style
and DEM renders a blank native ground surface. Reproduced in the installed
MapLibre 5.18.0, with the Three layer paused, with all custom layers removed,
and in a fresh native-only Map. Also reproduced using the released 6.9.0 ESM
bundle loaded temporarily in Chrome, without changing package dependencies.
Both report loaded terrain and a plausible approximately 317 m elevation at
the root-area test center; switching the 6.9.0 map to Mercator restores the topo
surface. This isolates the symptom from our mesh drawing but does not yet prove
which upstream shader, projection, source configuration or GPU behavior causes it.

Upstream source check: 6.9.0 and main have the same terrain fragment shader;
main changes terrain projection acquisition to `getProjectionDataForTile`
through a render context. No confirmed fix for this reproduction was found;
main was inspected, not built or runtime-tested. The old issue #4792 was fixed
by #4825 before our installed version and is not evidence of a new available fix.
6.9.0 includes projection-switch/terrain interaction fix #8351 and drape scheduling
improvements #8368, neither establishes that this blank-surface case is fixed.

Sources: https://github.com/maplibre/maplibre-gl-js/releases/tag/v6.9.0,
https://github.com/maplibre/maplibre-gl-js/issues/4792,
https://github.com/maplibre/maplibre-gl-js/blob/main/src/render/render_context.ts.

## MESH-NATIVE-GLOBE-20260915

**Date/status:** 2026-09-15, experimental native-projection story, not global
geometric or shadow/drape acceptance.

**Context:** keep a camera-independent scene so changing the view does not
reproject resident mesh vertices or invalidate surface-bound artifacts merely
because their reference frame moved.

**Decision:** add `terrain-and-atmosphere-mesh-mount--native-globe` alongside the
existing projection comparisons. It uses the same MeshMountDemo, original 2024
mesh/native tile manager and shared Three custom layer. Mesh conversion and all
camera-local fits are forced off. The native MapLibre projection radio switches
between Mercator, automatic Globe, and constant `vertical-perspective`.
The latter keeps the spherical renderer active at building zoom. Installed
MapLibre 5.18.0's automatic Globe interpolates between globe at zoom 11 and Mercator
at zoom 12; a story only calling `setProjection({type: "globe"})` would not test
the spherical render path at our normal comparison scales.

A no-draw custom-layer probe reports the actual `projectionTransition` path,
updating UI only when the categorical path changes. It is not frame telemetry.
Projection switches do not recreate the scene runtime, mutate geometry/UVs or
apply a fit to the root. The existing shared layer changes its scene-to-clip
matrix. Fixed projection modes no longer execute the camera-fit callback on
every map move; camera-fit modes retain that callback.

**Evidence:** 32 focused shared-scene tests pass. The extended test switches
globe/planar clip matrices while preserving the scene root, geometry attributes,
UV values, materials and texture version. Chrome 152, M4 Max, live Storybook
4400: pan/zoom, Mercator, automatic Globe at high zoom, and forced Globe retained
the same runtime generation/world matrix and eight sampled resident mesh
attribute/material/texture objects. Actual path reported globe / mercator /
mercator / globe as expected. Local artifact:
*unpublished validation artifact*. Loading new coverage/LOD tiles
is still permitted; this is not a guarantee that all source requests stop.

The initial close, tilted z=0 camera could enter the elevated mesh. An extreme
0.1-degree telecamera also showed depth/overlay artifacts on the forced globe
path; their exact numerical cause remains unverified. Default is an opaque-mesh
overview (zoom 14.5, pitch 25, FOV 36). Camera controls and opacity/blend controls
remain available to expose those limits. No terrain collision or automatic
mesh-surface camera elevation is added. This is a diagnostic, not a repaired
high-zoom globe renderer.

**Alternatives/disposition:** automatic Globe alone is incompatible by inspection
with testing the native globe at high zoom. A fixed global ellipsoid→sphere
correction is deferred: MapLibre's sphere is not WGS84, and an unchanged ECEF
mesh mounted at one tangent origin is not a global geodetic solution. Existing
once-per-tile Mercator conversion also retains geometry on map moves; no need
to replace that with camera-dependent conversion.

**Cache boundary:** this story uses original mesh imagery and an independent
MapLibre raster background, not baked shadows or map-style draping. The existing
`shared-three-map-style-projection.ts` captures a view-dependent framebuffer/depth
pass. Switching to Globe does not make that capture view-independent. Reusing
surface-bound shadows/style textures needs stable receiver UVs/world coordinates
and separate invalidation for sun, style, geometry and coverage changes. That
consumer work is not implemented or proven by this story.

**Revisit when:** testing fixed ellipsoid/sphere alignment, high-zoom depth
precision, region-wide image residuals, or actual shadow/style-bake reuse.
No production build, commit, push or server lifecycle change.
Native integration reference:
[MapLibre's Three/globe example](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-to-globe-using-threejs/).

## MESH-PROJECTION-TARGETS-20260915

Added selectable 1 cm / 10 cm / 1 m ellipsoid lookup profiles, with 400 / 1200 /
4000 m grids and dedicated stories. Each retains the same native tile-preparation
path. Dense sampled Float32-inclusive maxima are 6.593 mm / 5.699 cm / 63.222 cm
over the declared local Wuppertal domain. Bounds include an interpolation envelope.
These are approximation budgets, not certification of the mesh datum or accuracy.

On the M4 Max reference client, actual conversion of the same 59,931 loaded mesh
vertices takes median active CPU 85.4 / 84.3 / 72.6 ms versus 193.8 ms for direct
projection. Lookup initialization is 28.7 / 4.0 / 0.4 ms separately. Seven samples
show substantial variability; the coarse profile does not establish a repeatable
per-vertex advantage. Loaded-frame CPU timings overlap; no isolated GPU or FPS
speedup is claimed. Prefer 1 cm for quality, with coarser profiles as optional
initialization/memory tradeoffs. No extra per-frame projection path was added.

Full method, limitations, raw artifact paths and reproduction:
[MESH_PROJECTION_BENCHMARK.md](./MESH_PROJECTION_BENCHMARK.md).
Validation: 23 focused geo and 14 native plugin tests pass. No build or commit.

## MESH-PROJECTION-COMPARISON-20260915

**Status:** opt-in comparison implementations; not production geometric acceptance.
Checkpoint before this work: `b5f0aeda5`. No source CRS/datum claim is changed.

### One selector, fixed original anchor

| Mode | Implementation | Camera movement |
| --- | --- | --- |
| Off | Original rigid root tangent | Retain geometry |
| Camera tangent | Tangent frame at map center lon/lat, sec(latitude) scale | Parent matrix only |
| Camera metric | Same, plus ellipsoid R/N east and R/M north | Parent matrix only |
| Fixed sphere | Principal-axis-fitted sphere, nonlinear Mercator unwrap | Retain baked geometry |
| Global-fit sphere | Same plus root-preserving least-squares matrix over ±24 km and 0/500/1000 m local up | Retain baked geometry |
| Local AEQD | Spherical AEQD from geodetic coordinates, camera-local differential fit to Mercator | Retain baked geometry; parent matrix only |
| Ellipsoid LUT | Full ECEF → WGS84 geodetic → spherical Web Mercator, segmented lookup | Retain baked geometry |
| Ellipsoid direct | Same mapping without interpolation | Retain baked geometry |

“Global” means the declared local fit domain, not global Earth coverage. AEQD is
spherical, not ellipsoidal geodesic AEQD. No mode changes vertical datum: the
reference assumes the input Cartesian model belongs to WGS84; that assumption
still requires independent source/control-point verification.

### Loading and GPU cost

All nonlinear modes use **one existing tile-preparation plugin**, not parallel
render pipelines. The direct projector is cached once per plugin. Vertex
positions, normal/tangent Jacobians and native metadata bounds use the selected
mapping. Geometry publication is atomic and cancellable, with a cooperative yield
every 1024 vertices. CPU lookup fields are not GPU render targets. Prepared
geometry then uses the normal mesh render path: no repeated per-frame nonlinear
projection. This does not yet provide a worker or persistent projected-artifact
cache. Explicit method/grid changes rebuild the diagnostic pool; pan/zoom does not.

Additional tests found and fixed a pre-existing precision mismatch: geometry
bounds were computed from double positions before Float32 storage. They now
enclose the rounded uploaded positions, avoiding boundary false-negative culling.

### Initial comparison, not an error certificate

The numerical story samples 603 positions over a 48 km domain, at local up
0/300/600 m, or a 200 m camera neighbourhood. It exposes independent 1 cm and
0.5 CSS-pixel targets. Screen error assumes top-down root-scale map coordinates.
With the 250 m lookup grid, sampled domain errors were 2.51 mm for the full
ellipsoid lookup, 518.67 mm for the fitted sphere, and 497.72 mm with its global
least-squares fit. Fitting the domain can worsen the camera neighbourhood.
The direct reference has zero error by construction. Prefer full ellipsoid LUT
for the present 1 cm experiment; the cheaper geometric hypotheses do not meet
that target across the domain. Lookup spacing cannot fix model error.

CPU position-loop and preparation timings are displayed separately and explicitly
exclude uploads, normals, total tile preparation and GPU frame time. They do not
establish a device throughput winner. Triangle interiors, differently tessellated
LOD boundaries, normal continuity and orthophoto residuals still need visual
acceptance: no “artifact-free everywhere” claim is made from point samples.

### Story consolidation

Related stories now live under **Terrain and Atmosphere / Projections**:
mesh alignment (single, four sites, synchronized off/selected pair, numerical
acceptance, diagram), shared globe, reference surfaces, elevation stripes and
long-axis telelens. Existing explicit IDs remain unchanged. New story IDs are
`terrain-and-atmosphere-mesh-mount--synced-comparison` and `--method-accuracy`.
Old conflicting boolean correction controls are replaced by `reprojectionMode`.
The shared-globe diagnostic retains its own native sphere/axis-fit controls:
it does not pretend that a flat Mercator bake is compatible with globe geometry.

The synchronized A/B pair intentionally has independent geometry/context pools;
both maps are interactive and use the existing native map-sync helper. The
shared-view diagnostic remains the place to test one GPU pool with two cameras.

### Validation of this slice

- 26 focused geo utility tests and 16 projection-plugin/map-sync tests pass.
  Every nonlinear method is exercised with both lookup and direct sampling for
  geometry, normal length, UV preservation and metadata/geometry bounds.
- In the existing Storybook on port 4400, all eight modes received actual mesh
  content with the original root unchanged. Off → camera tangent → camera metric
  retained one runtime generation. Ellipsoid-LUT camera location/zoom changes
  likewise retained the generation.
- In the synchronized pair, right-hand pan and 10-degree keyboard tilt updated
  both maps. Changing only the selected method rebuilt only the right pool.
  AEQD panning retained both pools. Fresh-load and post-Fast-Refresh checks had
  no console errors after guarding effects against retired map instances.
- Story index: 125 entries, including two new comparison stories, 16 entries in
  the projection group, no duplicate IDs. Existing IDs remain unchanged.
- No production build, server restart, GPU throughput claim or visual residual
  certification. Mesh/imagery footprint gaps at the northern acquisition edge
  are not evidence of an interpolation failure by themselves.

## MESH-REFERENCE-20260914

**Date / status:** 2026-09-14 / implementation and numerical checks; visual accuracy and throughput acceptance pending.

### Context and constraints

Use the same 2024 flight imagery for mesh/orthophoto comparisons. Keep the production tile manager and preserve resident geometry on camera-local fitting. Do not equate root-box extent, raster imagery coverage, and actual mesh content. ECEF is curved; a single affine transform cannot flatten a regional ellipsoid into Mercator everywhere, much less globally. Vertical datum and horizontal projection are separate operations.

### Decision

- Shared live orthophoto source: `GIS-102:trueortho2024`, EPSG:3857 WMS, 512 px regular bbox tiles. WMTS advertises only 256 px grids. A 512 px WMS response is **not** a native cached 512 px WMTS tile; ordinary HTTP caching remains available.
- Keep Reference (four sites), Single View (all sites and resize controls), Two Viewports (one scene/renderer/pool), and an explanatory diagram. Remove separate North/South/Resize exports, which repeated the same implementation. Their former IDs are intentionally removed, not silently renamed baseline/dev stories.
- Local affine fit applies a parent matrix to the loaded hierarchy, so native bounds, rendering and picking share the transform. It does not recreate the pool when panning. Uniform latitude scale correction is optional; this is not exact nonlinear flattening.
- Nonlinear candidate: bounded local ECEF→Mercator displacement LUT, two RGBA32F fields, bilinear horizontal/linear vertical interpolation. Keep full coordinates in CPU doubles and store small deltas in Float32. Never treat this local domain as global support or clamp points outside it silently.
- The opt-in `flattenMesh` path now uses that LUT **once during native parse**, yielding every 1024 vertices, rather than adding per-frame shader work. A native plugin also projects metadata bounds, converts positions/normals/tangents and retains UVs before publication. Static box/sphere ECEF content only; no regions, instancing, skins or morphs. Source and camera pans keep the same prepared pool; changing projection mode rebuilds the diagnostic pool. A conservative local bounds envelope is not a global coverage proof.
- MapLibre's metre unit uses mean Earth radius, not the EPSG:3857 semi-major axis. Mixing those units introduces approximately 0.112% horizontal error. The new numerical helpers account for this distinction.
- Multiply/screen blending happens in the mesh material against the previously rendered orthophoto, not CSS blending a canvas with itself. It highlights contours qualitatively; it is not an image-error metric.
- Colour datum is independent of terrain geometry. H/h stripes derive from source height and GCG2016 before bending. Scene-plane colour intentionally changes after bending. Mesh H assumes ellipsoidal input and currently reconstructs h with a local curvature approximation; it is not survey-grade datum validation.

### Alternatives and disposition

- Change only `tileSize` on 256 px WMTS: **incompatible by inspection**, would relabel/rescale pixels rather than request larger imagery.
- 1024 px WMS: **tested response, not selected**; larger uncached server requests, no established throughput benefit.
- Shader-only mesh warp with unchanged native bounds: **incompatible by inspection** for coverage and picking. Rendering and admission must describe the same shape.
- Exact global per-vertex ECEF projection: **not evaluated** for performance; Mercator poles, antimeridian splitting, local float precision and regional source extent remain separate concerns.
- Constant rigid root mount: retained baseline. Camera-local fit relocates the accurate neighbourhood; it cannot make all distant views exact simultaneously.

### Evidence and limits

- GeoServer capabilities: only 256 px `WebMercatorQuad`, trueortho2024 z10–22. Real WMS PNGs: 512² (406730 bytes) and 1024² (1558192 bytes). Both report a GWC grid-alignment cache miss; HTTP max-age=10800. Single request observations (634/1738 ms) are **not a benchmark**. No server configuration changed.
- Affine: six focused tests, including root identity, fit-point location, scale toggle and invalid coordinates.
- LUT: three focused tests; default 193² × two RGBA32F fields = 1191968 bytes. Maximum sampled 3D error 2.552 mm across 401 intermediate points in a 48 km square, local-up 0–600 m, versus double-precision reference. This is neither a global error bound nor a GPU throughput measurement. Construction yields between row batches.
- Native projection plugin: four focused tests cover metadata idempotence, projected geometry, integer attributes and cancellation/reload. Synchronous geometry cloning remains a preparation cost; neither parse throughput nor total memory has been accepted yet.
- Shared browser: one-runtime/two-viewports showed content in both views; readbacks settled (74 initially, 177 after zoom, unchanged over a subsequent 3 s observation). Remote B3DM HTTP/2 errors and exposed north-edge background prevent a complete-coverage claim.
- Camera-local fit + multiply: pan retained runtime generation 1, mesh visible and idle; no exception observed. Screenshot *unpublished browser capture* is qualitative, not a measured orthophoto residual.
- Elevation/telelens browser smoke: all three stripe panels and a long-range urban ridge render without GLSL errors. Both DSMs report 154.3808087 m at 7.2015/51.2705. Mesh colours disagree, so mesh/DSM datum parity is **not accepted**. Approximate JS heaps: 4.88 GB for three stripe panels, 0.73 GB for telelens; white coverage gaps remain. These are snapshots, not a memory benchmark.
- Follow-up at that point: two candidate meshes ray-tested. Reconstructed mesh height 154.3699768 m, GCG 46.5459954 m, former H output 107.8239814 m. Compiled/current inverse matrices agree exactly. The mismatch was caused by treating the encoded mesh height as h and subtracting GCG, not stale placement. Added an explicit encoded-height hypothesis control (H/h); the stripe preset starts with H to match this observation, visibly uncertified. This only changes colour interpretation. It does not establish the source datum or silently move the mesh.
- Final H-hypothesis browser check: broad mesh/DSM colours agree; H→h→H changes the encoded-height uniform 0→1→0 while root UUID and world matrix stay unchanged. An initially coarse curved DSM refined to detailed geometry. The status now explicitly distinguishes initial terrain readiness from completed LOD refinement. Screenshot *unpublished browser capture*.
- Nonlinear browser smoke: north-site mesh visible and requests idle; runtime generation 1 survives pan; no domain/plugin errors. Double contours remain, so the image-error criterion is **not yet accepted**. Final comparison defaults reduce target error from 6 to 2 px to avoid evaluating coarse geometry as projection error; this default change is not an accuracy measurement.

### Revisit when

Do not call the nonlinear path production-ready until every relevant bounding volume and payload follows the same projection, cancellation leaves parent coverage intact, and cold/warm main-thread/GPU measurements show acceptable throughput. Quantify orthophoto contour residuals at all four sites against the mount-origin baseline. The elevation and telelens scenes need visual acceptance, source-coverage checks and actual ridge-clearance evidence.

### Shared-camera interaction and local sphere follow-up

**2026-09-14 / experimental, uncommitted.** Shared Views does not enable the nonlinear mesh plugin: its interaction cost is not LUT conversion. The secondary camera now uses OrbitControls (left pan, right orbit, wheel zoom). A single center-ray intersection with visible resident meshes supplies the surface pivot at gesture start; a miss retains the previous pivot. This is a geometry depth probe, not synchronous GPU depth readback. It is not repeated on pointer moves.

The previous asynchronous frame gate rejected every completed frame whose camera generation had advanced. During dragging this could suppress all visual feedback. Completed frames now publish while one latest request is coalesced. Drag previews use half resolution and restore full resolution at rest. Blitting reuses the typed-array buffer and only resizes the canvas when dimensions change. Camera moves no longer repeatedly call opacity/error-target setters. Removed-map/HMR callbacks are guarded.

**Measured boundary:** Chrome 152, Apple M4 Max / ANGLE Metal, 14 reported logical cores, 600×898 CSS-pixel secondary viewport, DPR 2. Warm scene, three synthetic right-button drags of 15 moves at 25 ms intervals plus 150 ms settle. Each run produced 16 preview frames. Camera configure median 0–0.1 ms, P95 0.1 ms. Render-plus-async-readback wall median 5.2 ms, P95 10.9 / 6.8 / 7.1 ms across runs. Blit P95 0.3 / 0.1 / 0.1 ms. One center probe per run: 2.7 / 1.6 / 2.4 ms. Heap snapshot counter approximately 537 MB.  Stage arrays are available on the secondary canvas as `previewTimings`, pose as `previewPose()`.

These are not isolated GPU timings, a cold-load benchmark, trusted-input latency measurements, or a before/after speedup ratio. The earlier full-resolution/warming sample (79 frames, 15.3 ms median / 30.7 ms P95) had different residency and workload. A five-second idle DevTools trace supplied no actionable performance insights; trace-file export was unavailable through that tool's workspace permissions.

Shared Views exposes `globeView` and optional `globeAxisFit`. The custom layer uses MapLibre's sphere model matrix when the rendered projection is globe; the local scene and pool remain shared. The optional root scale is `(R/N, 1, R/M)` using the root latitude's ellipsoid principal radii. It corrects first-order horizontal scale only, not differing principal curvatures, datum, or global placement. Right-hand view intentionally remains a local orthographic inspection camera. Globe/axis-fit image residuals and globe-specific far-range selection remain unaccepted. Native formula reference: https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-to-globe-using-threejs/ (installed implementation also inspected).

For mesh-to-plane approximation, **1 cm is the world-error target**; do not add higher-order terms just to improve millimetres. The existing LUT retains a 2.551 mm sampled maximum with the test threshold tightened to 1 cm. Scalar interpolation now avoids temporary arrays; no end-to-end speedup claimed. `MeshProjectionAccuracy` also offers a **0.5 CSS-pixel diagnostic target** with zoom-dependent metre conversion. That is a sampled top-down comparison, not adaptive prepared-mesh enforcement or a tilted-frustum guarantee. Analytic LUT derivatives and cached exact-fallback setup remain candidates; no extra polynomial terms added.

Validation: 31 shared-scene tests (including globe matrix/root preservation) and 4 LUT tests passed. Browser synthetic orbit changed the camera pose around a measured surface target and published frames during motion. No build or server restart.

## MESH-ERROR-BUDGET-20260915 — preliminary image/model comparison

Related illustration: MESH-SCALE-ISOLINES-20260915 below distinguishes pure latitude scale drift from the full horizontal residual.

Storybook 4400 was started with explicit approval. Separate native WebP captures of mesh 2024 and true ortho 03/2024 use the same Cronenberg camera: longitude 7.12825, latitude 51.20561, zoom 17, pitch 0, vertical FOV 0.1 degrees, viewport 1966 × 889 CSS pixels, DPR 2, ground scale 0.3737217078 m/CSS pixel. This is narrow perspective, not orthographic. Root: 7.163461249942009, 51.24111123027258. Fixed-root mount, no flattening. Requests reported idle; image inspection nevertheless shows mixed mesh LOD.

Artifacts in *unpublished validation artifact*: *unpublished browser capture*, `measure-mount-images.py`, and `mount-measure-cronenberg-result.json`. Overlay uses the renderer's multiply blend and is illustrative only. Registration uses the two unmodified separate captures, SIFT ratio 0.65 and partial-affine RANSAC at 3 image pixels. 327 inliers: center displacement mesh→ortho (+26.9149, −7.3991) CSS pixels, magnitude 27.9134; median fit residual 0.4759 CSS pixels. The center is inferred from the fitted transform, not a manually identified ground control point.

`mesh-mount-error-budget.spec.ts` computes the corresponding WGS84 h=0 rigid-root ENU versus exact MapLibre Mercator residual. Prediction: (+25.8262, −7.9603) CSS pixels, magnitude 27.0252. Vector disagreement: approximately 1.23 CSS pixels, not the 0.89-pixel difference of magnitudes.

The predicted east/north residual in root metres decomposes into ellipsoid-to-MapLibre mean-sphere metric mismatch (+7.7582, +2.0520), local-frame nonlinearity (+1.8861, −0.6016), and nonlinear Mercator latitude scale (0, +1.5223). Total (+9.6444, +2.9727). Thus vertical sag is not the dominant top-down displacement, but attributing everything to latitude scale drift is also inaccurate. The isolated 1.697 m sag contributes less than 0.01 CSS pixel at this camera distance/viewport; this is not a bound for all relief parallax.

Limitations: h=0 analytical probes do not model actual roof heights; source datum remains uncertified; mixed mesh LOD, lossy captures and the spatial distribution of matches constrain the registration. Fit residual is not absolute geodetic accuracy. A fresh origin baseline and corrected-mode residual comparison remain outstanding. No production acceptance follows from this result.

## MESH-SCALE-ISOLINES-20260915

**Date/status:** 2026-09-15, analytical illustration, not data accuracy acceptance.

**Context:** distinguish the latitude-dependent Mercator term from the full fixed-root mount displacement over the Wuppertal mesh extent.

**Decision:** two north-up maps, both with 0.1 m contours and emphasized 1 m contours, in root-scaled metres. Panel A is the absolute exact Mercator northing minus frozen spherical northing R·Δφ; its easting cancels and contours therefore follow latitude. Panel B is the norm of exact Mercator minus rigid WGS84 ECEF→ENU horizontal coordinates at h=0. Mesh metadata bounds are explicitly not an administrative boundary. No basemap/network source is needed; named locations are orientation markers from the comparison context.

**Evidence/reproduction:** run `node playgrounds/stories/src/stories/mapping/maplibre/render-mesh-scale-isolines.mjs`, then export *unpublished browser capture* with Inkscape to PNG. The generator asserts zero at origin and checks the independently recorded Cronenberg terms (1.522283 m, 10.092104 m). It samples a 520×420 grid and uses d3-contour interpolation, not an exact contour solver. The 10 cm interval is not a claim of survey accuracy.

**Alternatives:** one map conflating both terms rejected as misleading by definition; measured-error contour interpolation not evaluated because sufficient control-point observations do not exist.

**Revisit:** when actual height-dependent mesh displacement or certified control points are available. The graphic does not show the vertical sag term or correction residuals.

**Extension, 2026-09-15:** added the municipal polygon from https://daten.wuppertal.de/Infrastruktur_Bauen_Wohnen/Stadtgebiet_EPSG4326_JSON.json (Stadt Wuppertal, CC BY 4.0; statistical subdivision, not parcel-accurate). Metadata: https://data.gov.de/suche/daten/stadtgebiet-wuppertal9c823 . The reproducible generator downloads/caches the unmodified GeoJSON in output/playwright. All graphics carry attribution; SVG geometry preserves the original polygon vertices.

Separate filled maps now show (1) full 3D fixed-root ENU versus Mercator-plane displacement, including up, at 0.1 m intervals, and (2) the 3D difference between WGS84 ENU and a locally aligned sphere with east/north/up scales N/R, M/R, 1 at 0.01 m intervals. N and M are the root ellipsoid principal radii and R is MapLibre's mean-sphere radius. The second is a first-order axis fit, not an optimized best-fit spheroid or the nonlinear mesh-to-Mercator correction. Both compare identical geodetic lon/lat at h=0; they do not validate actual roof heights, datum or rendered pixel residuals.

Beyenburg check: horizontal 32.356732 m; up −7.325101 m; full 3D 33.175522 m. The axis-fitted sphere differs by 0.033396 m (horizontal 0.024147 m, up −0.023070 m). Maximum sampled sphere-fit residual over the rectangular mesh bounds is 0.104473 m, not a certified city-polygon maximum. The previous 32 m label was horizontal, never vertical. Grid maxima are descriptive, not guaranteed error bounds.

**Grid clarification:** `mesh-latlon-grid-comparison-de.svg/png` overlays identical geodetic grids in the two models. Full-view panel has equal east/north scales; the narrow strip around root latitude compresses east relative to north by approximately 107×, without multiplying residuals. Both panels show horizontal positions, not height. Signed Mercator−ENU error at Beyenburg is east −31.099569 m, north −8.931681 m. Decomposition: metric (−30.490027,+0.166452), local frame (−0.609542,−9.108731), latitude Mercator (0,+0.010598), in metres. R/N = 0.996847282 at root: treating ellipsoid metres as MapLibre mean-sphere metres introduces a first-order scale mismatch even along the same parallel. In addition, at exactly root latitude the ENU north coordinate is N·cos(phi0)·sin(phi0)·(1−cos(deltaLambda)), while Mercator north is zero. Therefore parallel bending explains the north component, but not the dominant east component. This is specific to the documented raw mount convention, not an unavoidable error of every correctly transformed MapLibre mesh.

**Image check, 2026-09-15:** same-camera raw-mount mesh/ortho captures now register at origin and Stoffelsberg near Beyenburg. Measured mesh-relative-to-reference displacement in the east comparison is about +31.38 m east, +9.07 m north (525 SIFT inliers; 0.46 CSS-pixel median fit residual). Origin residual magnitude is about 0.48 m (688 inliers). This supports the existence of the large rendered horizontal offset, not a unique proof of source CRS/datum or processing provenance. LoD2 overlays on the RVR city map show the same qualitative near/far pattern using the same mount, without a quantitative footprint fit. Single-view diagnostic now selects Mesh2024/LoD2 and true-ortho/city-map backgrounds; independent raster sources preserve native tile sizes and attribution without resetting the shared custom layer. Eleven focused model/preset tests pass; no production-loader change or broad build.
