# World-fixed shadow pages: shared reference implementation

## MESH-FIRST-20260908 — surface ownership and resource priority

- **ID / date / status:** MESH-FIRST-20260908 / 2026-09-08 / implemented; live budget-stall resolution remains open.
- **Context and constraints:** A terrain-providing photogrammetric mesh replaces the Three raster surface, unlike building-only LoD2. Visible mesh precision has priority over finite-disc integration. Native MapLibre basemap texture production must remain available.
- **Decision:** Skip/remove the raster runtime when a registered surface mesh owns the scene. Reference-count shared decoded raster sources; abort and clear their RAM buffers when the final consumer releases them, including disposal before asynchronous acquisition completes. Keep persistent disk components reusable. Surface-provider identity changes dispose tiled depth/visibility buffers and mono accumulation/depth targets once; ordinary tile arrivals do not. Wait for visible mesh error targets before adding shadow-only selection or new sun-disc integration. Do not relax surface-mesh error targets to accommodate shadow mode. Existing finished shadow presentation remains eligible while mesh refinement proceeds.
- **Alternatives and disposition:** Keeping inactive raster sources forever: incompatible by inspection with bounded resident memory. Clearing caches on every tile event: incompatible with stable soft-shadow retention. Raising the mesh ceiling to 8 GiB: not evaluated, not implemented; this change does not increase the existing 2 GiB device ceiling or solve incomplete replacement-family admission at a full cache. Browser-wide memory budgeting remains separate work.
- **Evidence:** Focused tile-source, raster-runtime, mesh-runtime and shadow-scene regressions cover shared-source retention/final release, cache reset only on provider change, target preservation under pressure and integration gating without hiding retained presentation. Playwright confirms the live mesh-only scene and new readiness signal. No end-to-end speed or memory-size benchmark claimed.
- **Revisit when:** A source is shared by consumers outside the runtime lease contract, storage rather than RAM is constrained, or mesh refinement needs a larger measured resident budget.

## Required contract: persistent soft-shadow presentation (2026-09-07)

**Status: required, NOT fully implemented.** This contract supersedes the motion
preview exception in CORRIDOR-RGB-20260907 below. Per-page sample counters in a
camera-registered RGB atlas do not satisfy world-fixed soft-shadow caching.

- Camera translation/rotation and unrelated tile arrivals MUST NOT discard a
  corridor's completed finite-disc result or replace it with a point-sun shadow.
- Cache identity belongs to world receiver/corridor bounds, sun configuration,
  effective buffer resolution and relevant caster/receiver geometry revisions.
  Camera pose and basemap colour/style are not shadow-visibility cache keys.
- A requested quality change keeps the published result while a separate pending
  generation is built. Publish the replacement atomically, not a running mean.
- Begin expensive integration only when the corridor's required caster tiles and
  receivers reach the requested target resolution. First-fill previews may precede
  this, but MUST NOT overwrite an already published soft result.
- Relevant geometry/source changes legitimately require a replacement even with
  unchanged time/resolution. Unrelated arrivals do not. Reject stale asynchronous
  completions by generation identity; retain old geometry/results consistently
  until the replacement can be published.
- Keep directional visibility separate from view-dependent BRDF, basemap and
  tone mapping. Do not reuse old screen RGB at a new camera, blur a hard shadow,
  or synchronously reintegrate every sample on each pointer event.

**Regression acceptance:** converge, hold mouse down, translate, rotate and return
with unchanged effective page resolutions: overlapping pages retain their sample
completion and softness. Add/remove an unrelated page: existing pages retain
their result. Refine one corridor or change time: old result remains until one
atomic replacement. Delay one required caster and complete obsolete workers:
no premature integration/publication. Cover terrain, roofs, walls and floating
casters, not just a ground-plane screenshot. Verify native map pixel resolution
and bounded memory; measure input latency separately from convergence time.

**Current implementation:** completed per-corridor R32F visibility and depth are
reprojected onto live receiver surfaces. Pending integration remains
camera-registered; see RETAINED-VISIBILITY-20260907 below for the limits. The
full contract is not yet validated for every drag/disocclusion case.

## Decision: retained scalar visibility

**ID / date / status:** RETAINED-VISIBILITY-20260907 / 2026-09-07 /
implemented locally, complete interaction acceptance still pending.

**Context and constraints:** finished soft shadows disappeared at drag end when
terrain revisions or requested sample counts changed. Keeping a texture allocated
was insufficient: the presentation path rejected it with the recompute key.
Basemap colours must remain live and native-resolution. The user rejected
speckled low-resolution/low-sample stages.

**Decision:** maintain separate recompute and presentation identities. Recompute
tracks geometry, projection and quality; presentation tracks receiver X/Z bounds
and sun configuration, excluding geometry refinement and sample-budget changes.
Keep the last completed corridor until an atomic target-quality replacement.
Receiver-depth reprojection rejects newly disoccluded or changed surfaces. A sun
change rejects the old mask. There are no 1/8-resolution or 32/128-sample preview
publications: integrate directly at the requested target and publish only when
that corridor is complete and ready, without waiting for unrelated corridors.

Store cropped R32F visibility plus depth32 (8 bytes/pixel), not basemap RGB.
An explicit scalar copy draw converts the accumulation texture; materials are
shaded live using retained visibility. The current in-memory limit is 256 MiB /
64 captures. Persistent binary storage is not implemented for these captures.
Admission protects currently visible completed corridors, including the page
being replaced. If a new capture cannot fit without evicting them, skip admission
and retain the old result; offscreen captures remain LRU-evictable.

**Alternatives and disposition:** full RGBA32F colour/depth captures superseded
(20 bytes/pixel and view/style-dependent colour). Direct RGBA32F to R32F/FP16
texture copying: measured rejection, WebGL error 1282; use a conversion draw.
Partial running means and coarse preview accumulators: removed per visual
rejection, not a performance conclusion. Full world-space multi-surface visibility
storage: deferred; camera-registered capture cannot cover newly exposed surfaces.

**Evidence:** focused regressions distinguish stale-for-recompute from eligible
for-display, retain finished output across geometry/sample-budget changes, reject
changed sun, replace atomically, and prohibit intermediate publications. A local
320x240 WebGL2 Lambert fixture, one box/ground, 64 samples, gave linear-light
RMSE 0.00000939 and maximum error 0.000489 against full-RGB accumulation over
31,311 valid pixels; GL error 0. This single parity probe has no timing repetitions
and does not establish parity for glossy/grazing materials or a performance gain.
Geoportal drag-end visual acceptance remains separate from these unit checks.

**Revisit when:** newly exposed surfaces, memory-pressure eviction or changed
receiver depth still lose softness; target-resolution integration is repeatedly
restarted by camera movement; or glossy material parity exceeds the error target.

Story: **Mapping / Shadows / Tiled Corridors**. `Reference` defaults to extruded
LOD digits and a translating/rotating camera tour. `Columns`, `Floating Casters`
and `Cache Reuse` isolate geometry and caching. Controls can pause the tour.

Geoportal exposes the same renderer in the movable **Schattendarstellung** panel
after the main intensity control as **Schattenpuffer → Einzelpuffer / Gekachelt
(experimentell)**. Tiled is the requested default (including Reset); mono stays
selectable. Selecting a quality preset preserves the layout. The display panel
also owns the visible Debug opener; the time header never wraps.

## Shared implementation, not a second shader

`TiledShadowRenderer` uses the production `ShadowController` for camera fitting,
PCF depth rendering and every deterministic finite-disc sample. The DOM host uses
the same corridor-owned FP16-scene / FP32-average implementation as Geoportal.
The optional cold/warm depth-cache benchmark retains the global accumulator only
as a reference oracle, not as the interactive story path. Story files only
mount the library and expose inputs/status. Three's `TextGeometry`, `FontLoader`
and bundled Helvetiker font supply the digits; the font JSON retains its license.
One geometry per digit is reused by all its instances. Columns remain selectable.

Level 0 means the **effective maximum axis size**, after hardware/cache caps.
Level 1 halves that axis, level 2 quarters it. Rectangular buffers can have
different axis classes; the status also reports actual width/height. Changing a
digit changes a real caster, so its old/new bounds invalidate downstream pages.
This deliberate diagnostic geometry change is not a terrain LOD simplification.

## Algorithm and ownership

- Caller supplies disjoint, fixed metre-space X/Z cells with conservative height
  bounds covering **every visible receiver**, including roofs. Frustum tests
  retain all intersecting cells. This first adapter assumes a fixed world origin.
- Bound the main-camera projection Jacobian over each complete cell, including
  elevated corners. Convert physical-screen-pixel demand into ground spacing.
  Solve independent light-space dimensions with finite-disc/filter guards;
  power-of-two classes stabilize allocation and projection across small moves.
  Ground isotropy is a horizontal-surface reference, **not** a grazing-slope
  precision proof. Hardware-clamped pages explicitly report unmet demand.
- Each cell owns a production light controller. Global receiver clipping plus
  a conservative framebuffer scissor partition colour rendering; Three's depth
  pass is not globally clipped/scissored. Offscreen geometry, all roofs and walls
  remain available to cast into a visible page. No near/mid caster simplification
  is implemented. Fixture wall/roof materials explicitly cast both sides;
  terrain retains its separate single-sided policy.
- Terrain and mesh occlusion combine in the same directional depth render,
  **before** finite-disc averaging. No central-ray substitute, multiplication of
  averaged masks, depth mip averaging or fixed penumbra blur.
- Cache exact per-direction targets by page, projection and sample sequence.
  Retain exact prior projection/resolution variants under the same GPU budget;
  a variant mismatch is a miss, not permission to reuse an incompatible depth map.
  Colour/intensity changes do not invalidate
  depth. Geometry changes invalidate intersecting finite-disc-widened corridor
  AABBs; callers must notify old-union-new bounds, including missing-data arrival.
  Exact prism/BVH narrowing remains future work. Bounded idle raster preparation
  now uses that same finite-disc-widened dependency envelope.
- Count RGBA8 **and** depth32 attachments (8 bytes/texel in the installed Three
  renderer). Reserve the largest transient page inside the configured depth-cache
  budget. Keep a bounded subset of samples when the full disc cannot fit, then
  stream the rest using a scratch target. This avoids cyclic-LRU all-miss scans.
  HDR accumulators, geometry and driver overhead are additional memory.
- All GPU work belongs to one renderer. No workers or background GPU parallelism
  are claimed. Context loss disposes the cache; the reference then requires reload.

The camera tour advances after each complete solar-disc frame. This is progressive
reference motion, **not a 60/120 FPS camera claim**. It never averages different
observer poses. Disable the tour for reproducible timing or manual inspection.

## Contact gaps and limitations

Pages use the same stock Three PCF and achieved-texel-size-dependent normal/depth
bias as mono. Very coarse/capped maps can detach shadows or lose thin contact
detail; hardware-limited pages report unmet resolution demand. Foundations extend
below the fixture terrain; `casterLiftMeters` explicitly tests floating geometry.
Do not hide limitations by disabling wall/roof casting.

### Decision SHADOW-PCF-PARITY-20260907

Mesh receiver offsets are superseded by **MESH-CONTACT-BIAS-20260908** below;
the heightfield policy and the recorded PCF limitations still apply.

**Context.** The former 1 cm cap confused terrain reconstruction error with depth
rasterization/filter error. A receiver-plane PCF experiment extrapolated each
triangle's plane to neighbouring depth texels; a terrain fold violates that
single-plane assumption. It produced black facets absent in mono.

**Evidence.** Browser GPU oracle: a single-valued heightfield under vertical sun
cannot self-shadow. At 512² the former path falsely darkened 21.53% of the
triangulated-relief pixels (minimum visibility 0.0643); the same filter with
texel-scaled depth bias and small/zero normal bias still failed at coarser 256².
Stock PCF plus the existing mono bias removed false self-shadows in all 12
terrain/demand configurations of the comparison. Large real blockers retained
their shadows. The separate thin-contact fixture demonstrates the cost: a 4 cm
plate very close to ground can lose its shadow, also in mono. This is explicitly
not a centimetre-accurate shadow guarantee.

**Decision.** Restore filter **and** bias parity with mono in production. Keep
world-fixed depth pages, finite-disc directions and corridor-owned accumulation.
No new blur, missing caster faces, canvas downscaling or terrain simplification.
The receiver-plane helper is audit-only and is not imported by the runtime.

**Rejected for now.** Disabling only receiver-plane PCF worsened acne with the
1 cm cap; removing only that cap left relief failures with receiver-plane PCF.
Neither a flat-plane test nor a comparison between two accumulators using the
same flawed filter is a sufficient oracle. Revisit with non-planar receivers,
grazing sun, false-light/contact metrics and measured achieved texel demand.

Reproduction and raw GPU evidence: `output/tiled-shadow-acne-20260907/`.
Underlying plane-bias reference: David Tuft,
[Plane-Based Depth Bias for PCF](https://media.gdcvault.com/GD_Mag_Archives/GDM_May_2010.pdf),
Game Developer May 2010, pp.35–38. No performance gain is claimed by this audit.

## Geoportal adapter

### Decision MESH-CONTACT-BIAS-20260908

- **ID / date / status:** MESH-CONTACT-BIAS-20260908 / 2026-09-08 / implemented,
  visual acne regression unresolved; not production-quality acceptance.
- **Context and constraints:** In the live MeshX 2024 facade view at
  `lat=51.2537718&lng=7.1449423&zoom=20.579&p=60&shadow=1023%3B141`,
  corridor offsets were 0.499 m normal and 1.027 m light-depth. The user requires
  near-zero bias rather than sacrificing contact shadows to hide raster errors.
- **Decision:** Cap both offsets at 0.005 m when a shared terrain-providing mesh
  owns the surface, in both mono and tiled shadow controllers. Normalize the
  depth cap by the actual light-camera depth range. Raster DEM retains its
  existing policy. Meshes use the existing receiver-plane PCF correction in both
  buffer layouts and retain their actual geometry normals instead of a synthetic
  up-normal texture. Casting sides and sun-disc integration remain unchanged.
  Install the receiver flag before the first draw of newly arrived meshes, not
  after the 120 ms coverage debounce. Changing that flag invalidates the material
  and selects a distinct program key; the mesh/stock policy must not inherit a
  stale compiled variant. Bias participates in each depth-page key.
  Loaded mesh bounds replace rotated metadata AABBs for active tile volumes;
  metadata is only the fallback when no geometry bounds exist.
- **Alternatives and disposition:** Original metre-scale offsets: rejected by
  live contact-edge comparison. Both offsets exactly zero: measured severe acne.
  Near-zero offsets alone: measured rejection (stripes). Receiver-plane PCF
  alone: removes planar stripes but leaves false bright facets with synthetic
  up-normals. Correct geometry normals remove those sun-away highlights.
  Applying this correction to raster heightfields remains rejected by the earlier
  fold oracle; the mesh result does not overturn that evidence.
- **Evidence:** Same live Playwright camera, separate normal/depth-zero ablations:
  removing normal bias substantially shrinks the bright facade rim; depth alone
  has little effect on that rim. Both zero introduce severe rooftop/pavement
  stripes. Production 1 mm cap verified on all 11 live directional lights and
  likewise exhibits stripes. The mesh-only correction plus actual normals removes
  the regular stripes and large facade rim in the inspected close-up, including
  a second bearing. At zoom 19.8 coarse mesh folds still show thin lines; a 5 mm
  cap reduces them compared with 1 mm but does not establish universal acne-free
  rendering. Metadata volumes spanned -7384..7887 m versus actual visible geometry
  at 50..360 m; geometry bounds reduced a page fit from ~1051 m to ~563 m height.
  Screenshots in `/private/tmp/mesh-contact-*.png` are local diagnostic artifacts.
  This is a visual comparison, not a speed benchmark. Broad mesh LOD/angle/fold
  acceptance remains open; do not report this as universally acne-free.
- **Follow-up verification:** Fresh page reload and a 40 px pan/back in the
  close-up retained contact at the facade corner without the repeated planar
  stripes. Controller tests (62), scene/material tests (47), mesh runtime tests
  (22) pass, including immediate policy installation on arriving meshes and
  material-program invalidation on flag changes. Final close-up capture:
  `output/playwright/mesh-contact-after-fix.png`.
- **Revisit when:** Improve depth footprint fitting/comparison; validate both
  contact loss and false self-shadowing on mesh and non-planar heightfield
  receivers before declaring the shadow quality fixed.

- `ShadowTiledScene` renders the atmosphere/debug overlay once, then delegates
  every colour/depth page to the same library used by the Story. The shared
  MapLibre layer still owns native-pixel capture, drape, depth-range restoration
  and HDR composition. The center-sun preview also uses pages while moving or
  when point-light mode is selected; stationary soft shadows integrate every
  configured disc sample.
- Scene-origin-aligned X/Z receiver cells use power-of-two spacing and quantized
  height bounds covering the existing receiver envelope, including roofs.
  The current view envelope bounds the grid to 25 cells. This limits pass count,
  not error: hardware-limited page targets can still miss the requested spacing.
- Quality targets are 2/1/0.5/0.25 physical pixels for 120/60/30 FPS/Ultra. Ground
  fitting is mandatory in paged mode; the disabled checkbox retains the mono
  preference. Canvas and label resolution do not change.
- Retained plus scratch depth targets share the existing mono maximum allocation
  ceiling (`maximumMapSize² × 8` bytes). Switching mode/renderer or disposing the
  simulation releases old page buffers. Unchanged matrices/bounds/lighting reuse
  the plan; camera-only changes do not clear all depth pages.
- Caster fetch/retention still uses one conservative envelope from the existing
  viewport controller. Raster-terrain publication now reports old-union-new
  geometry bounds (including normal/index revisions); only intersecting shadow
  corridors invalidate. Unknown external mesh changes remain conservative and
  invalidate all pages. Exact per-page fetch/BVH dependency wiring, parent
  fallback, persistent GPU pages and origin rebasing are **not implemented**.

## Component retention and idle preparation (2026-09-07)

The depth cache retains exact prior sun/sample/resolution variants and bounded
offscreen page controllers (`max(32, 2 × active pages)`). These share the existing
retained-plus-scratch GPU budget; inactive variants cannot evict the protected
current sample subset. Only active pages participate in colour rendering. Changed
geometry invalidates every retained variant whose conservative corridor can
intersect it, including variants from prior sun directions.

This depth cache is **not a view-independent integrated soft-shadow field**.
The separate corridor RGB integrator below now owns per-page progress, but
dragging can still require a centre-sun preview and camera-registered reintegration.
Persisting those large final RGB images has not been selected.
Reusable terrain buffers instead register with the provisional, worker-accessed
[derived-component cache](../../../commons/utils/src/lib/collections/DERIVED_CACHE_DECISIONS.md).

After a complete visible finite-disc result and complete viewport/caster terrain
coverage, one native background-scheduler task prepares at most 16 outside-view
neighbours, one source LOD coarser, sequentially. The visible frontier, active
meshes and loading bar are unchanged. Movement, source/time/content changes or
disposal cancel remaining speculative work; one already shared source fetch may
finish. There is no idle repaint loop, and unsupported schedulers skip speculation.
Point-light/non-accumulating fallback modes currently do not initiate this task.

Neighbour **directional depth** computation is implemented through the same page
engine. The eight-connected receiver ring keeps foreground world IDs; demand is
twice the normal ground-texel target, while the terrain runtime offers one source
LOD coarser. At most 16 receiver offers share the existing spare GPU budget,
distributed fairly across directions. A partial cached sequence keeps the full
sequence identity and is never labelled a finished soft-shadow result.

Each page needs a complete finite-sun caster lease first: max.16 terrain tiles,
32 MiB retained geometry, one lease at a time. A just-decoded rejected tile is a
temporary additional peak. Source limits, missing data, partial fine/coarse
overlap and budget excess fail closed. The group is attached only for one
synchronous depth pass and detached before every background-scheduler yield;
no speculative geometry appears in the map. A warm terrain ring still exposes
regions on revisit. Unknown offscreen coverage of an external LoD2/mesh provider
currently skips GPU speculation, **not** ordinary terrain warming or rendering.

The engine's `runIdleRender` boundary feature-checks and documents MapLibre's
private `painter.context.setDirty()`/`setBaseState()` completion path. This is
necessary outside `draw_custom.ts`: Three's reset alone cannot invalidate
MapLibre's cached VAO/program/texture bindings. Unsupported hosts skip optional
idle GPU work. The renderer restores its framebuffer/depth/scissor state and
draws no colour cameras using an empty Three `ArrayCamera` plus a 1×1 sink.

**TSP-07 / 2026-09-07 / measured component parity, no total-work speedup claim.**
The [reproducible GPU audit](../../../../output/shadow-prewarm-20260907/README.md)
compares 16 directions: all 4,194,304 RGBA8 bytes match, the same roofs/walls and
floating objects cast, idle makes zero colour draws, and a compatible revisit
makes zero new depth renders. CPU submission was 0.80 ms cold foreground,
8.90 ms idle preparation and 0.40 ms warm foreground in the final five-trial run.
GPU medians varied strongly between runs; this is work moved off the interaction
path, **not** proven net CPU savings or a Geoportal FPS result. New foreground
terrain publications still invalidate affected shadows even when geometry came
from local storage. Persisting GPU readbacks or final RGB masks is not justified
by these results. Revisit with measured real-navigation reuse before expanding
budgets or adding per-page integrated visibility buffers.

Host diagnostics include `tiledStats.idlePrewarm` with offered/completed/skipped
coverage/sample counts, budget limitation and cancellation. Missing coverage and
unretained samples are visible limitations, never a substitute for accuracy.

The 2026-09-07 resting Geoportal check at 4600×1800 physical pixels had eight
4096² visible pages, a 128 MiB scratch allocation and no spare retained depth
space. Diagnostics reported 12 neighbour offers, zero speculative depth renders
and `budgetLimited: true`; the terrain runtime had 16 prepared neighbour regions.
This confirms safe budget gating, not an app-level prewarm gain. Do not raise
the budget merely to make the component benchmark's reuse case fit.

Tiled is the user-requested default, not a claim of a measured equal-quality
speedup. Multipass colour cost and finite-disc storage remain limitations.

## Coverage and interaction priority

- Load/publish a bounded coarse viewport cut first (four ancestors where the
  coverage root allows it), even if its error exceeds the 16 px preview target.
  Then publish the 16 px cut, intermediate refinement cuts and final detail;
  offscreen-only caster requests come after visible receivers. Network/worker
  results are cached, stages are deduplicated, and each publication yields before
  starting the next stage. Existing detailed coverage is never replaced by a
  preview on a pan; coarse tiles fill previously uncovered areas instead.
- Native terrain, basemap/label framebuffer resolution and selected final error
  targets are unchanged. Incomplete terrain retains visible coverage. Tiled
  finite-disc integration can continue after the initial ready frame while new
  terrain arrives: affected pages reset, other pages keep their samples. The mono
  fallback still waits for terrain loading to finish and resumes via the existing
  notification, without requiring camera movement.
- Pending finite-disc rounds display their normalized running HDR mean with the
  matching current-camera depth. A matching settled frame may still be retained.
  This removes the second full central-sun preview render per pending round;
  it does not reduce final sample count or blur the penumbra.

## CORRIDOR-RGB-20260907 — per-corridor finite-disc integration

**Status:** implemented in the shared Three runtime, Geoportal adapter and story;
supported path is opaque depth-writing receivers, geometry MSAA 0. This is not a
world-space scalar visibility cache or a claim of faster complete cold renders.

**Decision.** `ShadowCorridorAccumulator` owns a sample count and content revision
for each visible receiver page. The central first sample fills the complete view;
subsequent calls advance at most four page samples, yielding after at least one
when CPU submission exceeds 4 ms. That CPU gate does not measure pending GPU work.
One shared native-resolution HDR atlas is updated with independent running means,
not with one counter for the whole viewport. No extra full-screen target is
allocated for each page. FP16 scene captures plus FP32 ping-pong means and depth
use 56 bytes per physical pixel, capped at 512 MiB for the atlas attachments.
Directional depth buffers have their separate existing page budget.

The nearest reference depth reconstructs the world receiver position. Half-open
world X/Z bounds determine its owning page; sample depth must agree before its
colour can update that pixel. Screen rectangles are only conservative bounds,
never proof of ownership. This preserves foreground walls and floating roofs when
page rectangles overlap. Complete PBR RGB samples are averaged in linear HDR;
there is no central-light-only BRDF approximation, fixed blur or raised acne bias.

**Invalidation.** Local caster changes reset intersecting corridors and screen-
overlapping pages conservatively for possible disocclusion. Unaffected counts
survive. Sun configuration and page projection revisions invalidate their own
samples. Camera or map-style changes reset camera-dependent RGB/depth, while
compatible directional depth pages remain reusable. During dragging the direct
preview remains available. Pan-invariant soft-shadow RGB is **not** implemented:
view-dependent materials, map draping and newly exposed surfaces forbid blindly
reprojecting a baked colour mean.

**Limits and diagnostics.** More than 64 pages, unsupported float/depth targets,
transparent or non-depth-writing receivers, nonzero geometry MSAA and insufficient
native-pixel budget use the existing global/direct fallback. No silent downscale
is introduced. Tiled UI therefore reports effective MSAA 0; mono keeps the user's
MSAA setting. `tiledStats.corridorAccumulation` exposes page counts, atlas bytes
and a fallback reason. This distinction must remain visible rather than claiming
all configurations integrate independently.

**Measured alternatives.** The [GPU audit](../../../../output/corridor-accumulation-20260907/README.md)
compares HDR/depth against the global reference, local changes, camera changes,
real shadow negative controls and timings. A public-API partial-texture-copy /
dirty-rectangle prototype passed parity but regressed the small fixture (cold
CPU 5.8 → 13.9 ms; local CPU 0.9 → 6.4 ms; local GPU 2.71 → 2.99 ms). It was
removed; fewer submitted pixels alone do not prove a speedup. Other dispositions:

- Per-page full-screen targets: rejected by memory scaling; shared atlas instead.
- Ground-only scalar masks: insufficient for arbitrary walls/roofs/overhangs.
  A general receiver-surface representation remains a separate design problem.
- Retaining every full-resolution directional depth map: 128 × 4096² × 4 bytes
  is 8 GiB **per page**, before colour/depth overhead; retain the bounded cache.
- Persisting final RGB: rejected for camera/style dependence and readback/storage
  costs. Recompose from reusable geometry and compatible directional components.

**Acne regression.** Receiver-plane PCF correction now uses the actual clamped
tap position at shadow-map boundaries. The [isolated audit](../../../../output/receiver-plane-acne-20260907/README.md)
removes false edge shadowing without changing the real blocker shadow. A separate
extreme 32²-map diagonal-gradient precision case remains documented there;
this fix is not a proof that all shadow-acne configurations are eliminated.

**Revisit when:** dense-terrain GPU measurements justify further atlas or receiver
representation work, or transparent material support is required. Preserve the
same finite-disc reference and depth/contact tests before changing the algorithm.

## Measurements

2026-09-06, local desktop Chromium/WebGL2 on Apple M4 Max (ANGLE Metal),
GPU timer queries, five interleaved
repetitions after warm-up; complete disc plus final HDR composition:

These measurements predate the receiver-plane PCF extension and the Geoportal
adapter; they are not speed measurements of the newly integrated app mode.

| Diagnostic | Cold | Warm | Scope |
| --- | ---: | ---: | --- |
| 2560×1440, 50 pages, 4 samples, 256² cap | 18.76 ms | 5.95 ms | Full retained depth set: 100 MiB + 0.5 MiB scratch. Deliberately coarse, not a fidelity pass. |
| 2560×1440, 50 pages, 128 samples, requested 0.5px, 2048² cap | 543.53 ms | 537.99 ms | 96 MiB retained + 32 MiB scratch; only a tiny sample subset fits. 48/50 pages miss the requested target. |

The 68% GPU reduction above proves reusable directional work for a fitting set;
it is **not** a Geoportal FPS gain or a comparison with the viewport algorithm.
An independent repeat gave 18.84/5.94 ms; cold versus reused linear RGB was
bit-identical (RMS/max 0 over 8,209,968 non-background colour components).
The 128-sample case gains only about 1%, within the run-to-run variation. This
representation does **not** yet justify replacing the viewport path: reduce colour
pass overhead and investigate a more compact representation before rollout. Neither
case proves continuous-disc convergence or certified screen-space fidelity. The
benchmark also compares linear HDR images outside the timed section.
Unit regressions cover coverage/demand, size classes, warm pans, sun versus colour
invalidation, selective caster changes, bounded streaming, cleanup, contact bias
and digit/column geometry reuse.

Browser inspection also verified the default translating/rotating tour: successive
completed poses changed both the target position and the camera's relative heading.
Digit levels 0/1 and the sloping ground with cross-cell shadows were inspected.
In the fitting-set story at 1280×720, a 0.377 m camera pan kept all 50 pages and
200 directional depth renders unchanged; cache hits increased from 50 to 300.
The required final camera colour passes still ran (250 to 500).
Focused shadow validation passes 238 tests in 29 files. The broader Storybook
typecheck still reports 529 transitive diagnostics outside the changed files;
this reference is not a branch-wide merge-readiness claim.
