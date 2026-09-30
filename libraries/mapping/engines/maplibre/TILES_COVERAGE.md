# Shared tile coverage policy

Tags: maplibre, 3d-tiles, coverage, shadows, memory
Role: current loading, publication, coverage and recovery contract for the shared MapLibre tile runtime.
Load when: changing mesh or terrain selection, request scheduling, cache policy, shadow retrieval or coverage diagnostics.

The shared runtime owns one native tile pool and one geometry cut for all active cameras. A visible region must keep drawable coverage while quality improves. The observer's quality target is independent of shadows; extra shadow geometry is requested only for offscreen caster corridors. Request admission, publication, draw acknowledgement and coverage proof are distinct events. A queued or decoded tile does not prove that an image has been submitted, and a submitted draw does not prove GPU completion or pixel visibility.

## Complete replacement families and resident base coverage

Resident-base navigation includes external tileset pages and transparent
structural nodes leading to the floor. Unknown routing topology cannot prove a
terminal floor tile. A missing baseline parent retains its background request
even when finer published children cover it; loading that fallback does not
replace the finer cut. Foreground observer views must converge before new idle
base work starts; incomplete offscreen caster coverage has its own completion
proof and does not permanently close that observer gate. Current caster work
still precedes optional base requests in the queues.

For normal observer loading, each drawable REPLACE parent prepares the complete next child family, including offscreen siblings. Routing and external JSON nodes do not count as drawable generations. Native skip traversal continues through routing nodes, but family discovery stops at the next drawable generation while a demanded sibling lacks loaded geometry. A loaded finer cut may prove that child region ready. Unknown topology and pending or failed payloads cannot prove a complete family. ADD content retains its additive semantics.

A parent remains the sole published surface until its complete next family has geometry and required materials. Then the family replaces it in one update. Independent families advance separately. A previously published fine branch is retained when a pan exposes a missing sibling; its ancestor cannot be restored on top of it. A first drawable approximation may fill a truly uncovered region. A proven empty child region can be released; unknown external metadata cannot. Newly exposed gaps take priority over every quality or reserve request.

<a id="persistent-offscreen-lod-gradient"></a>
The normal loader also builds complete sibling-compatible offscreen LOD rings after active views converge and motion stops. Ring frusta widen the actual camera projection with configured tangent multipliers, preserving its principal point and near/far planes. Each REPLACE child inherits the ring of its nearest drawable parent. The error allowance grows outward by approximately a factor of two per ring. Rings remain a background reserve and yield when foreground demand returns. The full-extent coarse floor remains behind the outer ring. Native sibling loading stays disabled because the family planner owns demand.

Loaded base-resolution payloads and owning metadata remain resident until layer disposal, before and after the first idle pass. The floor is selected within the memory budget; a budget too small for even the coarsest source payload cannot guarantee it. A coarse parent is not a valid eviction fallback while finer siblings in that region remain published. Native batch eviction and explicit removal obey the same rule. Base resident bytes count cache-accounted mesh resources at or above the floor, including coarse ancestors; they are not total browser or GPU-driver memory.

## Exclusive mesh publication

All REPLACE receiver and caster publication uses an exclusive cut. There is no hybrid parent underlay or parent/child depth overlap. The published cut only changes after compatible replacement coverage is ready; request priorities and error targets never authorize a coverage hole. Current visible detail does not coarsen merely because motion or memory relaxes new request admission. Ready finer families may still publish. Fully offscreen detail can be reclaimed only under the coverage and cache rules.

A publication transaction reconciles the selected models with attached scene objects and their current shadow roles. Asynchronous hierarchy expansion, material preparation and scene attachment must complete before the cut is acknowledged. A retired model cannot remain attached with an obsolete role. Published receiver and caster geometry is pinned against direct or batch eviction, and pending atomic family members retain their request and cache ownership until publication or invalidation.

## Visible receiver corridors

Each visible mesh receiver casts using its native Tile and scene object; there is no second visible mesh or shadow-driven observer LOD. Additional offscreen mesh demand is limited to the union of parallel sunward corridors from actual camera-clipped receivers. Clip each receiver's conservative volume against the observer's six 3D frustum planes, then project the clipped convex vertices into light space. A fully contained box uses the fast path. Camera identity, tile placement, light projection and content changes invalidate cached masks; a valid empty cut clears old demand.

A terrain-providing mesh uses its visible mesh receivers for this corridor. Independent DEM receivers and finite-sun-disc widening do not enlarge that mesh demand; building-only layers keep their independent terrain receivers. Conservative downstream and range tests prune impossible casters, while partial overlap remains possible. Caster queries do not turn casters into new receivers. The mesh sun camera provides ray direction, not a second screen-error objective or request near/far gate. Raster terrain keeps its own runtime.

<a id="caster-lod-follows-displayed-receivers"></a>
For a candidate offscreen caster, use the strictest drawable content generation among receivers it can affect, or geometric error when content generations are unavailable. Traverse metadata directly to that target and skip coarse intermediate mesh payloads. Off-corridor siblings are not shadow prerequisites. A pure offscreen caster defers texture preparation until it enters a receiver view, except where alpha-dependent material affects the shadow silhouette. Embedded image bytes inside an indivisible geometry payload still transfer with it.

## Exclusive shadow caster handover

The observer publishes its complete receiver families on its own. Its displayed frontier immediately seeds the current sunward corridor; no caster readiness, pending receiver frontier or second shadow selection holds back colour publication. The offscreen caster query traverses that fixed receiver cut and reports requested, blocked and incomplete work separately. Visible tiles cast directly and are excluded from extra caster requests. One union traversal deduplicates offscreen candidates by native Tile identity.

No caster ancestor may overlap a visible receiver or any of its descendants. Recheck this immediately before publication, including for cached selections. Outside those anchors, a caster must be at least the drawable generation required by every receiver its corridor intersects. Structural nodes are not LOD steps; small geometric-error differences within one generation do not reject a matching neighbour. The offscreen query publishes only loaded eligible members of complete relevant REPLACE families; an incomplete family is reported rather than padded with a coarse intermediate payload. A coarser terminal leaf or exhausted source remains incomplete rather than weakening the required LOD.

During viewport recovery, visible gap work keeps the first admission lane. The newly displayed receiver cut then updates offscreen caster demand. Finer offscreen shadow improvement follows visible refinement; caster loading never downgrades or delays the observer. The shadow renderer can capture current eligible caster coverage and refresh it as complete offscreen families improve. A depth submission callback is an acknowledgement, not a proof of final shadow pixels.

A pan can reveal a missing sibling in a previously refined observer family. Preserve ready visible branches, prioritize the gap, and never reinstate the overlapping parent. Current offscreen caster support and admitted requests are protected only while demanded; there is no separate global shadow reserve. On sun-only changes, invalidate the geometric proof while allowing useful admitted work for the same observer to finish into the bounded cache. Observer changes or memory pressure release obsolete work. Current viewport and sun demand outrank prior-sun work.

## Camera-normalized mesh refinement

All active mesh cameras share the tile pool. The main observer fills gaps first, then other active cameras; after coverage, each camera contributes to refinement. Camera snapshots carry finite scheduling ranks: PRIMARY (1) by default, SECONDARY (0) for array strips, and an optional FOCUS (2) for a selected segment. Ranks affect queue order, not geometric error or cache identity. Intersecting cameras contribute their union of roles and the strictest required quality. Priority-only changes refresh demand without rebuilding the scene.

A missing region first admits and publishes its first drawable approximation. Once covered, the observer advances through complete screen-space error waves, halving the threshold toward the requested target. Published coverage, not empty queues or downloaded geometry, proves a wave. Near and distant regions may occupy different tree levels. Finer resident geometry remains visible while other regions catch up. The current relative error band and area-weighted benefit rank work within the wave; a local improvement cannot bypass the observer's active threshold.

Benefit sums each camera's predicted absolute CSS-pixel error reduction multiplied by the candidate's projected convex footprint clipped to that viewport, divided by viewport area. Error and area stay paired per camera. An ordinary footprint clips the camera-facing box faces; near/far cuts, camera-inside volumes and unusual projections use the exact volume-intersection fallback. Only the missing area is scored in a coverage-fill phase. Routing metadata needed for a gap inherits that highest lane. Deeper skip requests can inherit error from the nearest published REPLACE ancestor; obsolete metadata has no demand.

Download, parse, metadata and preprocessing queues use the same camera, coverage, error-band and benefit order. An improvement above the coarse-refinement threshold (20 CSS pixels in the current policy) precedes finer detail within a camera lane. Distance and optional foveation break ties. Scores are bounds estimates, not triangle visibility measurements. Separate per-camera errors and final-target ratios remain available for diagnostics; admission-stage ratios do not certify quality.

## CSS-pixel error targets

Observer screen-space error uses CSS layout pixels. Mesh demand, native traversal, raster selection and terrain error colouring use CSS viewport dimensions separately from framebuffer dimensions. Resizing layout refreshes demand; changing DPR alone does not tighten geometry LOD. Callers without a CSS viewport use their explicitly supplied viewport units.

Offscreen caster geometry uses a CSS-sized texel budget in the actual shadow projection. Shadow texture allocation, hardware caps and stabilization do not multiply caster geometry demand with DPR. Render targets and native pixel-ratio policy remain separate from geometry selection.

## Startup, motion and reserve admission

<a id="configurable-cold-quality-cascades"></a>
<a id="viewport-only-cold-replacement-families"></a>
Startup requests the first drawable coarse surface before final quality. For ordinary mesh startup the first-image ceiling is 64 CSS pixels until the initial base pass; with hard shadows, any complete coarse LOD may publish first. The configured initial, motion/base and final targets then drive later request waves. A renderable coarse mesh may start mono shadow accumulation, with content epochs invalidating its result when geometry changes. This does not certify final mesh or shadow quality.

The public loading API accepts `setErrorTarget(idle, initial?)`, updating a live runtime without rebuilding its pool. The initial target is never finer than idle. `initialPixelError`, `idlePixelError` and `tilesetMinResolutionPx` are forwarded from the style's `metadata.carmaConf["3d"]`; zero residual resolution uses the metadata `entry` hint rather than disabling the floor. Startup orders initial viewport coverage, residual floor preparation and later idle refinement. A blocked floor can release the scheduling phase without claiming floor coverage. Subsequent pans do not restart a global startup pass. A changed target invalidates prior completion proofs.

<a id="motion-preserves-visible-detail"></a>
Motion may use a relaxed request target to fill new regions, but it does not downgrade already visible mesh or terrain. After motion settles, the requested target is restored and cached data can be republished without a fresh download. Prepared camera, demand or motion-state changes wake eligible parked work when slots are free. Optional mesh future-view prediction is bounded, does not create a visible receiver, and yields to current coverage and memory admission. Explicit future views reuse normal camera-demand evaluation. Optional `MESH_REFINEMENT_PREFETCH_LEVELS` counts extra drawable generations, with zero as the normal setting; extra payload lookahead is disabled by default.

## Viewport coverage recovery

After any publication, a newly uncovered observer region immediately re-enters viewport-first fill, including before initial handover. This is a current-camera geometric proof over the published cut, independent of target error or old startup milestones. A covered coarse surface is refinement work, not a hole. The clipped observer-demand test is shared by recovery, cold family selection and startup quality; native volume frustum remains a broad-phase test. Conservative raw hits without clipped intersection do not block handover.

During recovery, missing coverage and its routing metadata outrank replacement support for covered regions. First-image geometry may fill uncovered space; already published detail remains. Noncoverage downloads can park while useful parsing retains independent admission. Each complete family may publish when ready. Once coverage is proved, normal refinement and parked queues resume without waiting for idle or global shadow convergence.

## Queue admission and capacity recovery

`resolveTileRequestAdmission` is the common hard gate for newly requested, queued and preemption-candidate work. It discards unneeded work and parks work disallowed by recovery, pause or capacity. `resolveTileQueueDecision` applies the foreground, motion and idle ranking afterward. Request need is computed once per scheduling pass; no demand snapshot survives the pass. A branch unable to request its required content cannot silently count as covered.

For mesh requests, the published receiver cut is the coverage authority during admission, parsing and cancellation. Native traversal temporarily clears and rebuilds its visible set; that transient state does not invalidate published coverage or justify requesting an already covered ancestor. Actual base-floor residency and current camera/caster prerequisites retain their existing admission rules.

Optional ring refinement and its scheduled wake use the same eligibility predicate, including queue, traversal-time, visibility and memory budgets. A blocked ring waits for a real camera/content or recovery event; it does not keep waking frames without advancing. Scheduled wakes recheck eligibility before dispatch.

Visible work and current camera/corridor prerequisites outrank offscreen floor, reserve and previous-sun requests. A lower-rank buffered request retains its native promise and resumes when stronger eligible work drains. At full cache, a concrete viewport gap or active-camera improvement may reclaim weaker queued or downloading reservations until admission has room. Same-family prerequisites cannot preempt each other; a within-band competitor needs more than 25% greater benefit. Queued work is reclaimed before equally ranked downloads. Metadata, published cuts, loaded content and downloaded admitted parse buffers remain protected. Native tile runtime owns request cancellation and disposal.

The default mesh payload concurrency is six downloads per origin, with separate metadata and parse queues. glTF parsing remains on the main thread; parse backlog and memory guards bound admission rather than assuming extra downloads create parse capacity. Memory and parse backlog may reduce admission. Transport, decoder initialization and retry deadlines release stalled work; exhausted resources wake the runtime after a bounded expiry without a new camera gesture. Allocation failure lowers learned capacity and pauses admission. After backoff and sufficient headroom, one payload per origin and one global parse probe may test recovery. A lost graphics context waits for its restoration event. Running request ownership comes from the native origin map, including during preemption; pending-queue membership alone is insufficient.

## Resident cache ceiling policy

Desktop mesh budgets start at 6 GiB and scale down with smaller reported memory hints. Healthy occupied budgets may grow by at most 20% per ten seconds while active quality or base coverage is unfinished, bounded by the configured 24 GiB desktop maximum, explicit consumer limits and learned failure ceiling. Only loaded scenes count toward the 90% occupancy trigger; queued byte predictions cannot drive growth. iOS remains capped at 384 MiB, other mobile at 512 MiB. These are application accounting limits, not a browser grant or free physical memory measurement. Reapplying identical budget options preserves learned growth, quality and recovery state.

A settled coarse cut may try one finer target when the existing cache has enough headroom for both 10% of the grant and its largest known next active family or predicted tile. This requires converged active cuts, drained queues, no motion, and no context or allocation recovery. The audit uses its existing recovery cadence. Queued byte reservations alone do not count as resident pressure. A failed target records the pre-probe headroom and is not repeated without materially greater capacity. Unfinished visible quality may reclaim unused retention above the LRU floor while keeping current views, casters and coverage pinned.

A genuine allocation failure or eligible context loss learns 80% of the granted budget, subject to a 128 MiB minimum. Hosts opting into `persistCacheCeiling` store confirmed client ceilings in a build-scoped `carma:tiles3d-cache-ceiling` record; concurrent older builds cannot overwrite the current build's lesson. Existing managers adopt lower same-build lessons at their regular audit. Runtime peaks and clean-end probes remain manager-local. An unfinished tab is not evidence of memory failure, and storage failure does not block rendering. A hard browser or OS kill cannot reliably be caught by page code.

## Persistent tileset hierarchy cache

`hierarchyCache` defaults to true. The worker-built static hierarchy index reduces native tileset JSON paging while leaving one native loader and tile pool; `hierarchyCache: false` selects native page loading for comparison or compatibility. The cache does not imply preloaded mesh payloads or prove first-image latency. The style's `metadata.carmaConf["3d"]` remains the shared metadata entry for `tilesetUrl`, `providesTerrain`, basemap, quality targets, colour correction, entry level, level/byte statistics and optional entry prefetch paths. Both React layer adapters use `buildThreeTilesRuntime`; raster DEM keeps its format-specific processing while sharing scene and camera contracts.

## Outcome proofs and request accounting

Stage advancement and foreground completion use the same published hierarchy coverage and measured CSS-pixel error predicate. A target, camera, content or topology change invalidates an applicable proof. Unknown metadata, exhausted source detail and empty queues cannot prove an unmet target. Proven empty child regions are released in both mesh modes. Shadow completion is separate from observer quality and reports metadata, loading, blocked and ready for the current receiver corridor.

Each renderer keeps bounded request-start counters for initial load, movement and zoom, independent of debug UI visibility. Native admissions include retries and cache-backed metadata. Browser traces measure wire requests, completion, failure and bytes separately. Request histories and phase identities belong to each runtime session.

## Functional decision pipelines

Geometry demand, queue admission, publication, retained coverage, cache removal and progress reporting consume the same current camera and topology facts. `createTileCameraDemand` supplies clipped perspective or orthographic intersections and error for the observer and additional views. The queue's request-need reason distinguishes visible coverage, family support, extra caster demand, reserve and retained work; location alone cannot determine ownership. Frame-local demand memoization may reuse results only while camera, placement, content and topology inputs match. No diagnostic query may initiate payload requests or change a published cut.

## Progress and recovery

Every blocked stage needs a matching release event or bounded retry. Transport bounds headers and body consumption; retries use bounded backoff. Decoder failures reject pending work and remove the failed worker, with a deadline for silent initialization. Success, reset and disposal cancel failure timers. A failed REPLACE parent may still expose healthy child routes once retries are exhausted; pending retries retain their wait. ADD content cannot be substituted by its children. Published observer coverage remains until usable replacements exist; offscreen caster publication separately reports incomplete corridors. Persistent unavailable source content or a cut that cannot fit the reduced budget can prevent final quality, which must be reported rather than marked converged.

## Progressive shadow families and wait telemetry

`runtime.debug.setTelemetryEnabled(true)` enables bounded event collection independently of debug boxes. `tileWaitEvents` records observed receiver and caster wait transitions, elapsed time and missing descendant URL, including material, replacement family, shadow family, render submission, depth submission and accumulation. Receiver and shadow waits have separate clocks; a released role ends its wait. `tileEvents.steps` records queue, download, decode and publication timing. The bounds are 32 spans per tile, 32 buffered transitions and 1024 actively tracked tiles; overflow drops diagnostic history, never runtime work. A depth timestamp records submission only.

## Terrain and the corridor in the tile overlay

`buildTerrainTileLocalBox` supplies the same terrain footprint and elevation range used for culling and diagnostics. `getActiveTileVolumes` includes loading terrain tiles, marking unknown height ranges. `projectDiagnosticVolumes` clips boxes against main and shadow-corridor frusta. `setShadowView` exposes the corridor as a display camera; it does not register another tile-demand camera. A terrain-only overview frames the union of reported volumes. Diagnostic wireframes reuse source geometry and are removed with their source or when disabled.

The optional raster `motionErrorTargetPixels` applies while the view changes; the terrain runtime clears its input signature after its settle interval and makes one selection at the configured target. Without that option, one target applies throughout. This affects terrain selection, not the mesh future-view predictor.

## Standalone mesh shadow camera ownership

The standalone mesh sun camera is owned by the shared scene and shadow runtime. Its fitted projection may change capture and texel density but cannot move or resize the MapLibre observer, alter its bearing or DPR, or create a second visible mesh selection. Shadow request geometry comes from visible receiver corridors and the sun direction. Independent raster terrain and LoD2 paths retain their own demand.

## Mesh removal and raster handover

Removing a terrain-providing mesh unregisters its provider immediately. The mesh detaches and disposes before the next frame so raster terrain can start. Native removal still cancels requests, disposes models and GPU resources, resets renderer state and detaches the group. The vendor adapter limits native final disposal traversal to a snapshot of its private LRU; plugin cleanup may still traverse the hierarchy. Any temporary override is restored even on failure. Normal traversal and quality are unchanged.

## Coverage diagnostics

The tile overview reports known active cells, pipeline phase, projected error and reserve boundaries; it does not certify rendered pixels or trigger new content loads. Routing parents are structural frames, while terminal active cells carry their own state and quality symbol. Unknown hierarchy or a bounded-audit limit yields an explicitly approximate refinement estimate. Overview windows bind to the supplied runtime and scene origin. Hidden queue and chart panels avoid display work; disabling telemetry stops collection independently. On-map overlays use unfilled strokes so the photo mesh stays visible, while the separate overview can use state fills. The camera intersection is the real 3D frustum clipped to tileset bounds, not a terrain raycast. Diagnostic-up changes only the overlay projection.
