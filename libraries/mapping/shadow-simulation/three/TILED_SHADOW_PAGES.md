# World-fixed shadow pages: shared reference implementation

## MESH-FIRST-20260908 — surface ownership and resource priority

- **ID / date / status:** MESH-FIRST-20260908 / 2026-09-08 / implemented; live budget-stall resolution remains open.
- **Context and constraints:** A terrain-providing photogrammetric mesh replaces the Three raster surface, unlike building-only LoD2. Visible mesh precision has priority over finite-disc integration. Native MapLibre basemap texture production must remain available.
- **Decision:** Skip/remove the raster runtime when a registered surface mesh owns the scene. Reference-count shared decoded raster sources; abort and clear their RAM buffers when the final consumer releases them, including disposal before asynchronous acquisition completes. Keep persistent disk components reusable. Surface-provider identity changes dispose tiled depth/visibility buffers and mono accumulation/depth targets once; ordinary tile arrivals do not. Wait for visible mesh error targets before adding shadow-only selection or new sun-disc integration. Do not relax surface-mesh error targets to accommodate shadow mode. Existing finished shadow presentation remains eligible while mesh refinement proceeds.
- **Alternatives and disposition:** Keeping inactive raster sources forever: incompatible by inspection with bounded resident memory. Clearing caches on every tile event: incompatible with stable soft-shadow retention. Raising the mesh ceiling to 8 GiB: not evaluated, not implemented; this change does not increase the existing 2 GiB device ceiling or solve incomplete replacement-family admission at a full cache. Browser-wide memory budgeting remains separate work.
- **Evidence:** Focused tile-source, raster-runtime, mesh-runtime and shadow-scene regressions cover shared-source retention/final release, cache reset only on provider change, target preservation under pressure and integration gating without hiding retained presentation. Playwright confirms the live mesh-only scene and new readiness signal. No end-to-end speed or memory-size benchmark claimed.
- **Revisit when:** A source is shared by consumers outside the runtime lease contract, storage rather than RAM is constrained, or mesh refinement needs a larger measured resident budget.

## Regression review: corridor-stage publication

**ID / date / status:** CORRIDOR-STAGES-20260908 / 2026-09-08 / locally implemented;
Geoportal cold-start acceptance still under investigation. No merge-ready claim.

**Contract:** native receiver IDs own corridors. Compatible binary cache first;
complete receiver + direct sunward caster cut at each error stage; synchronous
hard shadow before displaying that stage; progressively refine per corridor;
integrate the finite disc only at its final/source-limited error. Intersection,
not containment, makes a volume a caster. Never promote casters to receivers
and recursively extend the dependency corridor. No bare-mesh fallback.

**Diff review and corrections:**

- Replacing the discovery-camera envelope with an empty committed receiver cut
  cleared `setShadowView`, disabled the publication barrier, exposed bare meshes,
  then re-enabled the barrier on the next frame. Keep discovery coverage alive
  independently of renderable source pages; the tiled host also handles an empty
  frame without falling through to the unshaded renderer.
- A native receiver's complete bounds are for its page projection, not an
  instruction to expand the global discovery envelope to offscreen caster boxes.
  Only explicit receiver-cut volumes create pages.
- Returning from an offscreen target restored MapLibre's depth range but not its
  framebuffer until the callback ended. The bridge now restores both immediately,
  using Three's state cache where available; nested calls/exceptions retain scope.
- Atomic mesh-family admission must retain pending demand across skipped
  traversals and discover independently complete coarse child families beneath
  an unusably coarse ancestor. Displayed children cannot be a prerequisite for
  enabling the caster selection needed to display those children.
- Captured visibility must bypass tone mapping, colour conversion, fog and
  dithering. The scalar output override is last; alpha/discard remain intact.
- Review baseline is `f251fd0ab` (dataset 2024 colour correction), followed only
  by committed `cc38f6d65` (layer opacity), then the open corridor work. The
  dataset correction itself is unchanged. A finished capture's display
  compatibility is independent of new compute readiness. Empty startup cuts
  keep nonempty fetch coverage but must not report simulation completion.
- Fetch bounds cover each full visible native receiver page, not just its
  screen intersection. Pending receivers and their casters share explicit
  16/8/4/2/1/... px stages; e.g. an 11.72 px receiver must accept a 13.15 px
  caster in the same 16 px stage. Final receiver-relative error remains strict.
- Hard capture admission checks material/float-target support. Retained
  publication budgets charge the replacement's final footprint, with a bounded
  synchronous copy reserve; otherwise a full hard cache can permanently block
  every soft replacement. Failed copies retain the previous capture, with
  bounded retries and scheduling fairness rather than an endless render loop.
- Project native oriented tile bounds directly into the light frame. Expanding
  them to an ECEF AABB and then rotating that AABB enlarged five measured
  footprints by 2.09–2.34 times. Keep the far-end solar-disc envelope for BVH
  broad-phase only; the leaf test uses the actual sunward separation. A distant
  possible blocker must not enlarge the search for a nearby blocker.
- A necessary parent split must request its intersecting children even when a
  child's own, less strict corridor budget would accept the parent. A second
  regional proof may discover finer receiver descendants; preserve their staged
  demand until the required caster arrives. Neither demand is permission to
  publish an incomplete receiver. Overlapping offscreen casters never relax a
  receiver's stage through their unrelated observer-space error.
- Plan retained capture sizes across all visible pages before allocation, not
  independently against the same budget. Same-ID downsizing precedes new-page
  admission when pinned pages exhaust that budget. Display resolution and mesh
  geometry are unchanged.

**Representation and alternatives:** one independent full-receiver orthographic
visibility/depth capture, one active soft scratch, bounded retained captures;
quantized allocation classes avoid translation-driven resets. A single depth
layer cannot invent newly exposed walls after rotation: direction changes create
a new capture while reprojection rejects uncovered surfaces. The former global
screen atlas and its 64-page cap are not a world-fixed cache. Persistent records
reuse the existing worker-backed derived-storage manager, producer epochs and
typed binaries; never persist baked basemap RGB. HMR storage is disabled rather
than trusting mutable module URLs. Storage failure is optional, not a render gate.
The old coordinate-grid neighbor shadow prewarm is suspended for native IDs;
terrain sibling prefetch remains active. Source-native shadow prewarm needs its
own follow-up, not parsing tile IDs as viewport-grid coordinates.

**Evidence / limits:** focused host, bridge, frontier, accumulator and cache tests
cover the listed transitions. An isolated Apple M4 Max / ANGLE Metal GPU probe
compares direct and retained hard shadows at three poses: finite visibility 0–1,
no GL errors, mean RGB error below 0.012/255; translation keeps the same capture.
Individual edge differences remain (see `output/playwright/receiver-gpu-parity.md`).
This proves neither mesh-loader completion nor absence of full-app regressions.
Live Geoportal initially showed dark meshes with zero depth passes; after the
discovery fix it held incomplete geometry instead. A frozen reload before the
OBB/cone correction still had zero committed tiles after 43 seconds, over 2,000
loaded payloads and 105 required parses paused near 3.5 GB JS heap. The next
frozen reload showed 142 active volumes at its first 12-second observation,
161 at 55 seconds, a drained queue and under 1.1 GB sampled heap. These are
browser-observed intervals, not a controlled cold-network speedup benchmark.
That intermediate result still had nine blocked receiver families and missing
screen regions, leading to the subsequent parent-split/demand corrections.
Its 137 regional audits were ready with no missing published or out-of-envelope
selected volumes; exact traversal visited 117–208 nodes per page. First soft
integration was still prohibitively slow, with repeated hard-depth work during
retained display. Full-screen reload and final soft-shadow acceptance remain
open until the final unchanged-browser run succeeds.

**Audit:** more than ten selected volumes above a 10-degree solar elevation is
only a review flag, never a cap. Diagnostics separate broad-phase visits and
prism rejection, list selected IDs, and compare loaded positions to the corridor.
Queries reuse regional results and world-space bounds; debug snapshots collect
provider volumes once, not once per receiver. Revisit additional acceleration
only from actual traversal counts, not the heuristic count alone.

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

## MESH-BOOTSTRAP-20260909 — keep rendering from starving caster loads

**Decision.** During the first load of each terrain-providing mesh runtime,
draw the current scene with the existing common centre-sun shadow pass. Start
the retained per-corridor hard/finite-disc path once that runtime has renderable
content and its shared request demand is empty. Demand includes metadata queues
and the pending sunward traversal. This is a one-way, runtime-identity latch:
new demand on pan/refinement never discards an existing tiled presentation.
Do not use `isMainViewReady` as the latch: an above-target/source-limited cut can
have no further requests, while the regional proof must still decide soft readiness.
Map/style colour resolution, receiver/caster SSE, final page sizes and sample
counts are unchanged. The temporary common hard pass is not the final tiled
texel-resolution guarantee. It includes all geometry currently published.

**Evidence/method.** Local Chrome/ANGLE Metal, Apple M4 Max, 2400×2286 physical
canvas pixels, Mesh2024, tiled 512-sample configuration, warm reload (existing
HTTP/local caches), 2026-09-09. The initial reference view was
`lat=51.2702198&lng=7.200346&zoom=20.911&b=20.09&p=47.99&shadow=765%3B325`.
Receiver/caster counts were sampled about once a second. Wrapped runtime calls
measure synchronous CPU/driver submission, **not GPU execution time**.

| Experiment | Offscreen cut first observed | Demand drained | Interpretation |
| --- | ---: | ---: | --- |
| Per-page startup reference | 21.12 s, 119 casters | 22.35 s | 8.0 s synchronous render submission by 23.54 s; regional revision/readiness calls together only 0.17 s |
| Diagnostic: suppress Three draws while loading | 7.50 s, 119 casters | 7.50 s | Diagnostic only; blank output is not a shippable solution |
| Common hard startup, same nearby view | 6.30–7.39 s, 119 casters | 7.39–7.61 s | Real scene remains visible; eight-second capture contains chimney shadows |
| Final exact requested URL (`lat=51.2702238&lng=7.2003258`, other fields identical) | 6.90 s, 151 casters | 8.27 s | Captured at **8.23 s**: chimney shadows visible; 53 receivers |

The few-metre camera difference changes selected source boxes; do not quote the
last row as an identical-cut A/B speed ratio. These are warm development reloads,
not a cold-network guarantee or a claim that 512-sample convergence takes <10 s.
The internal browser tab reported a crash when selected; the timings above are
Chrome measurements, not a successful internal-browser validation.

**Alternatives.** Loading already traverses the tree against one shared receiver
BVH/union (`createReceiverSnapshot` + `applyShadowReceiverMask`). Replacing the
cached regional proof with a new global/worker search cannot recover the observed
~14 s delay when that proof costs ~0.17 s. Avoided a new queue/worker algorithm;
the dominant interference was rendering during load. Requiring target viewport
SSE before leaving preview was tested and rejected: the exact view could drain
all requests while that flag remained false, permanently preventing soft work.

**Hard-cache correctness.** A complete regional caster fingerprint change also
invalidates that page's hard depth/capture identity. A null proof during refinement
retains the previous publication; unchanged fingerprints and unrelated pages are
not invalidated. This prevents an early incomplete hard mask from surviving until
the much later finite-disc publication. Hard refresh and soft readiness share the
final-error proof key rather than doubling entries in the bounded proof cache.

**Reproduce/verification.** Use
`../benchmarks/mesh-shadow-reload.browser.js` as a DevTools navigation `initScript`
with Mesh2024 already selected. Read `window.__carmaMeshShadowReloadBenchmark`:
`samples` contains costs/counts and `captures` has actual timestamps and canvas
images at 5/8/10 s. Instrumentation removes its hooks after 40 s (or call `stop`).
Focused tests: 50 renderer/bootstrap tests plus one scene integration test pass.
They cover pending caster demand, empty startup, one-way completion on later
requests, common-pass fallback, and selective complete-cut invalidation.
Remaining: optimize post-load per-page colour/replay cost and separately measure
finite-disc convergence; neither is established as solved by this decision.
At 206 s in the final exact-view run, 43/77 pages had published soft shadows and
45/77 passed regional readiness. Full soft coverage is still unresolved; the
<10 s result above concerns the visible hard chimney shadows only.

## SOFT-BASELINE-20260909 — receiver roles and stalled convergence

### CAMERA-REQUEST-PREEMPTION-20260909 — prioritize changed-view hard coverage

- **ID/date/status:** CAMERA-REQUEST-PREEMPTION-20260909, 2026-09-09, implemented;
  follows checkpoint `791c13e4d`, not yet committed.
- **Context and constraints:** pending work from an old camera competes with
  newly exposed viewport coverage. Preserve loaded receiver/caster payloads and
  completed baked masks; cancellation must not traverse geometry on input events.
- **Decision:** snapshot the pending 3D Tiles requests at movestart. Abort that
  generation asynchronously, at most 16 entries per task, through native LRU
  removal (AbortController, parse/download queue cleanup and accounting together).
  Skip payloads that completed or became visible before cancellation. Once the
  batch sequence finishes, wake the latest-camera coverage traversal. Later move
  events keep the existing 180 ms coverage cadence rather than repeatedly aborting
  newly requested work. Disposal cancels the outstanding callback.
- **Soft scheduling:** inactive tiled frames also cancel unpublished scratch
  integration. Ready hard publications are presented before another soft batch;
  corridors still waiting for data do not impose a viewport-wide soft barrier.
  Existing per-corridor readiness and completed-mask replay remain in place.
- **Alternatives and disposition:** aborting on every move event is rejected by
  inspection because it can starve useful requests. Direct queue mutation is
  rejected by inspection because it bypasses native abort/accounting. Workers
  cannot own the existing renderer's request objects; moving this orchestration
  into a worker is not evaluated. Raster DEM source-request cancellation and
  physically interrupting already submitted GPU work are not implemented here.
- **Evidence:** one focused old/new/completed-generation test and 41 tiled/
  receiver tests pass. Internal Codex browser, Mesh2024 at the supplied Wuppertal
  view, one drag: mesh and visible cast shadows remain in the post-drag screenshot.
  No instrumented frame trace, first-new-tile latency, soft-convergence timing or
  comparative performance claim. The checkpoint has 93 shadow tests and 61 mesh
  tests passing; four previously recorded mesh liveness tests still fail.
- **Revisit when:** extend to independently owned raster request generations or
  measure cancellation/download churn during long continuous drags. GPU work
  already submitted can finish; cancellation stops subsequent submissions.

### BAKED-LOD-REUSE-20260909 — separate buffer demand from baked visibility

- **Cause:** observer rotation changed the receiver capture key; any allocation
  change and traversal revision required another integration despite compatible
  baked visibility being available.
- **Decision:** preserve the receiver capture orientation across camera updates.
  A full-receiver soft capture with compatible receiver/solar presentation identity
  and sufficient samples satisfies equal or smaller buffer demand. Larger demand
  continues replaying the old capture while scheduling the finer replacement.
  Hard captures retain exact revision checks while caster LOD improves.
- **Persistence:** restored captures compare source, date/time, corridor, geometry
  fingerprint and samples independently of resolution demand. No cache format
  change. This permits reuse of a finer capture already restored; it does not add
  a cross-resolution persistent-cache index.
- **Alternatives:** observer-oriented recapture on every rotation is unnecessary
  under the accepted baked-projection contract. Keep the finer allocation instead
  of copying to a smaller texture when it fits the budget: no extra GPU copy or
  sample integration. Under actual memory pressure the existing hard replacement
  path still applies; downsample-only budget reclamation remains open. Different
  mesh parent/child IDs do not yet inherit each other's captures.
- **Validation:** 51 focused presentation/accumulator tests pass, including rotation,
  equal/smaller/larger demand, sample increases, solar identity and restored geometry
  identity. No new live drag benchmark or end-to-end speedup claim. Main framebuffer
  resolution, disc sample count and receiver-depth guard removal are unchanged.

### HARD-STAGE-ADMISSION-20260909 — post-motion receivers need their casters

- **Cause:** `isPageReady(id, true)` returned true unconditionally, a diagnostic
  bypass that let new receivers draw hard shadows with incomplete caster sets.
- **Decision:** hard capture and first page draw now require regional readiness
  at `receiverStageError(receiverBounds)`. Soft integration still requires final
  readiness. Do not gate a coarse complete corridor on final SSE or on siblings.
  Compatible baked captures bypass only presentation waiting, not new capture
  readiness, and remain displayed while replacement caster content arrives.
- **Scope/validation:** focused adapter tests cover rejection without casters,
  coarse hard versus final soft readiness, and continued compatible replay.
  This does not restore the unused runtime stage-gate API or change bootstrap
  preview, mesh selection, buffer precision or baking policy. Existing source
  bootstrap is latched and does not re-enable on a later drag. Browser drag
  validation of all LOD-family retention paths remains separate.

### BAKED-VISIBILITY-20260909 — retain baked masks without depth matching

- **Decision:** user confirmed that bypassing receiver-depth matching removed
  the hard fragments and explicitly accepted world-projected mask reuse for the
  handled geometries. Remove the mismatch test and its derivative/texel-plane
  arithmetic permanently. Keep receiver bounds, UV bounds, captured coverage
  (`depth < 1`), solar identity and existing cache/revision checks.
- **Replaces:** the receiver-plane rejection in RETAINED-VISIBILITY. That check
  fell back to hard shadows within otherwise soft areas. Frustum-culling and
  receiveShadow-role rollbacks did not resolve the reported fragments.
- **Tradeoff:** no per-pixel same-surface/disocclusion validation is promised.
  This is explicitly accepted for this viewer; do not reintroduce that guard or
  a replacement surface-classification system without a new requirement.
- **Scope:** camera movement retains the existing baked capture. This change
  does not alter integration scheduling, sample counts, publication cadence or
  geometry revision policy. The user reports faster rendering; no timed speedup
  is claimed. Capture data format is unchanged; shader program key advances to v4.

### TERRAIN-BIAS-20260909 — keep mesh contact limits off raster terrain

- **Rollback:** reverted at user request for stepwise visual comparison. The
  findings and prior test evidence below describe the experiment, not active code.

- **Cause:** the Geoportal tiled host returned the 1 cm mesh contact limit when
  `resolveMeshReceiverBiasLimit` returned undefined for raster terrain. This
  truncated both existing texel-sized depth and sun-angle-dependent normal bias.
- **Decision:** allow the per-receiver callback to return undefined explicitly.
  Raster terrain keeps the controller's existing footprint bias; mesh contact
  and progressive mesh SSE limits are unchanged. No extra blur or sampling cost.
- **Validation:** 94 controller/tiled-renderer tests pass, including mesh-cap →
  uncapped terrain → mesh-cap transitions. Playwright terrain-only view at
  51.2976909, 7.0273392, URL zoom18.08, bearing35, pitch55, shadow660;345:
  confirmed raster runtime without Mesh2024, non-centimetre page bias and visible
  cast shadows without widespread acne in the inspected final screenshot.
  This is a spot check, not a universal grazing-angle/contact-error guarantee.
- **Alternative:** do not increase the shared bias constants; their terrain
  policy already existed and only the erroneous mesh fallback bypassed it.

### REPLAY-20260909 — reject idle colour-only replay

- **Status:** rejected optimization; original idle page-light rendering restored.
- **Attempt:** use `renderPageColor` for every completed retained mask, including
  idle frames, to avoid repeated page depth renders. This bypassed the common
  hard-light fallback setup that only the motion replay path establishes.
- **Evidence:** the exact Mesh2024 chimney view became blank despite 45/77 pages
  reporting published. After rollback and reload the mesh and chimney shadows
  were visible again. GPU readback of 25 resident capture middle rows found 12
  with fractional visibility, including 64-sample captures. This proves those
  buffers contain soft visibility, not that every page has converged. Five zero
  rows alone do not prove empty tiles: they may be outside receiver coverage or
  fully shadowed. Regional readiness remains 45/77 and needs a separate fix.
- **Guard:** idle retained presentation must use the page-light pass; colour-only
  motion replay remains allowed after the common fallback pass. A focused test
  checks both the draw route and common-light visibility. Do not retry the idle
  optimization without pixel-level coverage/fallback validation.
- **Other measurement:** before this rejected change, one warm nearby-view mono
  64-sample run at 2400 × 2286 took 1.539 s through the last offscreen draw and
  0.906 s summed GPU queries. Geometry was already loaded. This is not a cold-load
  benchmark, repeated result, or proof of equal tiled/mono ground-texel quality.

- **Date/status:** 2026-09-09; implementation candidates, live comparison incomplete.
- **Context/constraints:** same Mesh2024 chimney URL as MESH-BOOTSTRAP above;
  native canvas resolution, offscreen casters retained, no extra soft integration
  for caster-only tiles. All automatic profiles now use 64 samples by request.
- **Decision:** explicitly assign `receiveShadow` only to the committed visible
  receiver cut; payloads in the caster union retain `castShadow`. Remember roles
  per payload/mesh so appearance refreshes preserve them and unchanged traversal
  does not walk their meshes again. Enable native geometry-frustum culling for
  terrain-providing meshes instead of submitting the entire union to each camera.
  Loaded external JSON routing boxes are followed to their actual children when
  deciding visible refinement readiness; unknown bounds still block readiness.
  Cancel unfinished scratch integration on motion/time changes, keep completed
  captures. Submit up to 64 samples per frame within the existing 2 ms CPU budget.
- **Evidence:** single warm development reloads, Chrome on this M4 Max device;
  CPU hooks, NOT GPU execution timings. Committed baseline first caster membership
  6.49 s, demand drained 7.71 s. Resident-payload/metadata-cut candidate: first
  caster membership 4.08 s, demand drained 8.34 s. Counts are NOT timestamps of a
  verified correct chimney shadow. Candidate reached 45/77 regional ready pages;
  the remaining regional completeness problem is not solved by these timings.
  Tiled paths allocate 77 receiver pages for 53 visible mesh tiles in this view;
  caster-only volumes are filtered before page creation. Page count is not mesh
  count. Repeated page renders still traverse shared scene geometry.
- **Single-buffer baseline attempt:** with loaded geometry, 53 viewport tiles,
  141 caster tiles and request demand zero, `isMainViewReady()` was false.
  During the 20 s observation, 44 renderer calls used only the default framebuffer
  (156.7 ms summed CPU submission); NO soft accumulation target was rendered.
  This is a readiness failure, not a successful fast benchmark. DevTools transport
  closed when stopping the trace; no raw trace or validated screenshot was saved.
  Do not quote a mono speedup, visual parity or a measured Friday regression factor.
- **Alternatives/disposition:** whole-view 64-sample integration remains the
  requested baseline, **not evaluated successfully**. It replaces up to 77 sets
  of sample draws by one set, but a common buffer may have coarser ground texels;
  draw-count ratios do not prove time or quality equivalence. More GPU-context
  workers are **deferred**: they duplicate geometry and do not eliminate redundant
  scene draws. No new flag duplicates the existing viewport/shadow load role.
- **Verification/revisit:** focused role transitions, scratch cancellation,
  profiles and routing-metadata readiness tests. The readiness fixture now mocks
  the actual native `intersectsFrustum` contract; it still rejects unknown child
  bounds. Four other liveness assertions failed; their baseline status has not
  been established in this run. Reconnect browser,
  verify culling visually, compare hard/64-sample screenshots and measure at least
  three warmed mono/tiled runs at recorded depth dimensions before changing the
  default strategy. Cache restores already in flight are not physically aborted
  by scratch cancellation; do not describe this as cancellation of all I/O.

### Decision MESH-DRAG-REPLAY-20260909

- **Scope:** keep completed corridor visibility masks during camera motion;
  coalesce latest-camera coverage audits at 180 ms without trailing-debounce
  starvation. Input handlers schedule work rather than traversing immediately.
- **Implementation:** one common hard fallback plus colour-only retained-mask
  replay during motion. Replay disables shadow-map updates and restores renderer
  state even on failure. Stationary integration and final disc samples are unchanged.
- **Evidence:** Apple M4 Max, Chrome/Metal, 2400 × 2286 physical pixels, Mesh2024
  chimney area. Synthetic 24-move test: elapsed 9.76 → 5.59 s; synchronous render
  time 7.66 → 4.20 s; median frame interval 185.7 → 86.9 ms. Mesh update time
  142 → 78 ms. These are preliminary warm-session CPU measurements, not GPU
  timings or an INP benchmark; refinement state was not identical between runs.
- **Alternatives / remaining:** per-page depth regeneration while replaying is
  unnecessary; drawing the whole scene for each colour page remains expensive.
  Do not claim smooth 30 FPS or complete soft coverage. Fifty focused tests pass.
- **Visual investigation:** bypassing retained-mask depth rejection in a temporary
  browser diagnostic restored contiguous soft chimney shadows. This bypass is
  NOT shipped: it would permit disocclusion leaks. Investigate reprojection depth
  validation separately; the finite solar-disc integration remains in place.
# IDLE-REPLAY-20260909 — avoid rebuilding retained corridor depths

- **Context:** Mesh-LOD UI -> runtime state -> `updateMeshErrorTarget` -> native
  tile loading is wired. The initial default is already 1 px (now asserted by a
  regression test). Presets can deliberately select other targets. Caster demand
  and regional final-readiness derive from that target; hard bootstrap stages
  use the current coarser receiver stage.
- **Observation:** Internal-browser Mesh2024 inspection at approximately
  51.2703/7.2003, z21, pitch48 found 49/75 finished corridors, no running samples,
  and an empty tile queue at effective16/requested1. One retained receiver
  `mesh_4000.b3dm` reported 44.83 px with loaded child JSON but unloaded mesh
  descendants. This is not evidence of cache saturation. The remaining regional
  stall is unresolved; changing to a nearby view reached effective1/requested1.
- **Decision:** Viewport convergence uses the loaded receiver frontier, not the
  render union with retained caster parents. Regional caster-completeness gates
  are unchanged. Expose requested/effective target and convergence in the
  existing runtime diagnostic so UI wiring and progress can be distinguished.
- **GPU work:** Idle presentation previously rendered page-light depth again for
  each retained mask. A 4096-square page consumes 128 MiB; the observed cache
  retained just one of dozens of pages. Replay now establishes common lighting
  once and renders retained pages colour-only, like motion replay. Pages without
  captures still use their own page-light pass with the common light disabled.
  No resolution/sample reduction and no receiver-depth rejection were added.
- **Alternatives:** Colour-only replay without a common light was rejected
  earlier because it did not establish lighting. More workers/independent GPU
  contexts were not added: they do not parallelize this shared WebGL context and
  would require duplicated geometry/resources; no measured gain justifies that.
  GPU submissions remain CPU-budgeted and yield to input.
- **Validation:** 56 focused default/scene/renderer tests and 3 viewport
  convergence tests pass. Internal-browser telemetry observed 69/69 completed
  corridors at 64 samples without fallback and visible mesh/shadows. Camera/time
  were changed during testing, so cumulative pass counts are NOT a controlled
  wall-time speedup benchmark. Temporary logging has been removed. No DevTools
  trace was taken on the unrelated browser target.
- **Open:** Stable-view reload A/B timing, remaining regional readiness/LOD
  stall, and receiver-footprint fragmentation (up to 237 pages observed after
  movement) still need investigation. Do not label the 30-second complaint fully
  resolved based on this run.

# SOLAR-HANDOVER-20260909 — retain shaded meshes during time changes

- **Context:** A changed solar identity immediately invalidated the previous
  mask for display as well as computation. Geometry could remain resident while
  its receiver page disappeared before the new corridor was ready.
- **Decision:** Cancel unfinished integration and pending persistence work on
  solar change. Retain existing capture objects as display-only fallbacks until
  each replacement is published. No extra GPU texture copy is allocated. Strict
  `canReplay`/`has` checks still require the current solar identity, even when
  geometry/content keys are unchanged; `canPresent` alone allows handover.
  Repeated time changes retain the last publication. Late restore/readback jobs
  fail their generation check; terminating an obsolete storage worker does not
  disable future cache use. Already submitted GPU work cannot be preempted.
- **Retrieval:** Refresh the current sunward mask and use the existing bounded
  native-LRU demand sweep to cancel obsolete caster requests. Keep in-view mesh
  payloads; do not reset their LOD or downloaded textures for a time change.
- **Alternatives:** Immediate removal rejected (coverage gaps); treating old
  masks as current rejected (false readiness/no recompute); duplicating all
  meshes/textures rejected (unnecessary memory). No new worker pool or rendering
  backend is introduced. This is continuity, not a frame-time speedup claim.
- **Validation:** 65 presentation/cache/scene tests pass, including repeated time
  changes, same-geometry/different-sun validity and late cache replies. Internal
  Codex browser, Mesh2024 at 51.2703894/7.2007926, z21.989, bearing255.74/pitch60:
  13:21 -> 12:00 screenshots retained mesh coverage immediately and afterward.
  This is a visual spot check, not frame-by-frame proof or a soft-finish timing
  benchmark. Subsequent user-requested test cleanup replaced the obsolete
  acknowledgement-gate fixtures (which also failed against `6bb83b01d`) with
  current receiver/caster and atomic-family contracts. The final focused set is
  115 mesh/runtime/transport assertions plus 65 shadow/cache assertions, all
  passing. See CURRENT-MESH-CONTRACT-TESTS-20260909 in engines/maplibre/README.md.
- **Open:** End-to-end LOD liveness, receiver-page fragmentation and reliable
  full soft convergence still need a separate scoped investigation.
