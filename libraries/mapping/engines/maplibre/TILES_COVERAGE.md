# Shared tile coverage policy

## Post-startup zoom refinement — 2026-09-16

Once a parent is published, its immediate drawable children are the next
request frontier regardless of the parent's current pixel error. A zoom-out,
pan and zoom-in must not turn a resident parent into a cold-start skip merely
because its error exceeds 64px. Metadata routing nodes do not count as levels.
The 64px ceiling applies only to first publication; complete sibling-family
handoffs still apply afterward. Already resident finer coverage can be reused.

Focused frontier/runtime tests: 134 passed. A warm browser zoom-in/out/pan/in
cycle observed 140 render frames with no detached published meshes. This is a
handoff regression check, not a cold-network latency improvement measurement.

## Useful first image — 2026-09-16

Startup publication now requires a complete cut at no more than 64px error.
Coarser payloads remain hidden reserves. Stop ancestor bootstrap after its first
payload, and stop initial traversal at the 64px cut before refining it in drawable
LOD steps. The 12px initial and 4px idle goals remain separate. Later movement
may reuse coarser coverage rather than opening holes. This supersedes the
unlimited coarse first-image admission described below.

A diagnostic reload recorded 672 rendered load-state changes over 30 seconds;
the first visible cut arrived at 2.17s. Canvas readback for this capture adds
overhead, so this is not a throughput benchmark. Hidden intermediate pyramid
levels can be evicted under pressure with a resident coarser replacement;
published detail and the configured residual surface remain pinned.

## Zoom publication after asynchronous hierarchy expansion — 2026-09-16

Sibling support can contain raw hierarchy entries. `ensureChildrenArePreprocessed`
schedules expansion and does not initialize every child synchronously. Passing
those entries to deferral/payload admission threw after native traversal had
removed the old meshes, before the retained cut could reattach them. Keep the
support demand but wait for initialized traversal/internal state before queuing.
The normal process-node completion event retries; publication must continue.

Browser reproduction: 81/294 fast-zoom frames had published but detached meshes
before this fix, 0/304 afterward. A separate synthetic wheel-handler reversal
cycle observed 0 detached-publication frames and 0 floor disposals over 543
frames. These checks validate scene membership, not screen-pixel coverage.
Focused runtime tests: 53 passed, including asynchronous sibling preprocessing.

## Non-evictable residual surface — 2026-09-16

Once armed and loaded, the configured extent floor and its loaded coarser
ancestors remain resident for the lifetime of the tileset. Both direct removal
and native batch eviction protect them even when another replacement exists.
Hidden-tab cleanup retains this surface and its external metadata. Explicit
runtime disposal still releases it. Its materials are prepared offscreen too;
geometry-only residency must not postpone texture preparation until a pan.

The published cut still changes synchronously before rendering, with complete,
material-ready replacement families; no deliberate empty handoff frame or
overlapping parent underlay is introduced. This is a scene-publication contract,
not proof of successful GPU execution after context loss or allocation failure.
The floor remains inside the memory budget, reducing space available to detail;
it must not be silently evicted to admit optional refinement.

## First-image coverage — 2026-09-16

**ID: FIRST-IMAGE-COVERAGE-20260916 / implemented, uncommitted.** Initial
pixel error is a request-priority target, not a visibility gate. Load drawable
ancestors until a complete first cut is published, then resume the skip strategy.
An available coarse complete cut may appear immediately; incomplete child
families still cannot replace it. Startup ancestor loading does not opt into
legacy motion throttling. Shadow publication retains its separate policy.

On the standalone Mesh Coverage story with default arguments and browser caches
preserved, the baseline first primary draw was 5.15 s (first payload 2.31 s).
Two subsequent warm reloads with ancestor bootstrap reached first draw at 2.03 s
and 1.75 s; the latter reached initial quality at 4.69 s. These are sampled draw
submission timings, not cold-network or GPU pixel-visibility certification.
Focused frontier/current-view tests: 131 passed, including startup publication,
whole-family replacement and continued updates during startup motion.

## Zoom-out coverage, native eviction and draw acknowledgement — 2026-09-16

**ID: NATIVE-LRU-COVERAGE-20260916 / implemented, uncommitted.** The vendor's
`unloadUnusedContent()` batch invokes disposal callbacks directly, bypassing
`remove()`. Protecting only `remove()` left disposed tiles in the published cut.
Before native eviction, pin the published cut, resident metadata and the ready
ancestor used to replace each eligible hidden tile for the entire batch. Never
evict both a tile and its replacement in one batch. Keep the warmed mesh pool
until hard-budget pressure; under pressure retain a 95% byte watermark rather
than immediately draining back to the old soft watermark. Explicit disposal
continues to require replacement coverage, and motion admission quality never
relaxes the retained-detail target. Building-only/ADD consumers keep their
existing native policy. Content revisions also invalidate publication even
when the native traversal was skipped.

After initial acceptable quality, native selection stops at the next drawable
level below a published REPLACE parent. Request its whole immediate family and
publish it together. JSON routing nodes are not drawable LODs; new/coarse regions
may still bootstrap directly to initial quality. Existing finer resident content
is reusable. No cross-stage download/parse barrier is restored.

Prediction checks explicitly include the primary observer (the default demand
query describes additional cameras). Expiring speculative work cannot cancel a
request adopted by that observer, a reserve ancestor or sibling repair, nor evict
an already completed payload. Speculation uses spare capacity below 85% of the
soft eviction watermark, not space reserved for foreground pressure handling.

`runtime.loading.getDrawStatus()` separates published, loaded, mounted and
submitted tiles. Mesh render hooks acknowledge a draw only when the renderer's
draw-call counter advances, and identify the primary camera separately. Model
disposal and context loss/restoration invalidate evidence. This is submission
evidence, **not** a GPU fence, successful shader/pixel validation, or an occlusion
query. Never re-download a tile merely because culling prevents a draw. The
prediction latency sample now ends at the first primary-camera draw, not mount.
Callbacks are detached on model/runtime disposal; no readback or extra frame is
introduced. Download/parse queues no longer sustain render polling; native
content/material events wake the renderer. Memory-blocked ring ticks are idle.

Validation: focused cache/frontier/queue/view/draw tests and the reusable
`benchmarks/zoom-pan-coverage-browser.js` exercise rapid zooms 19/15/18/14/17,
long pans and zoom-out to 12 twice. Before native-batch protection, two runs
reported 38 and 46 structurally uncovered frames despite safe individual
removals. Afterwards: 2,845 and 2,618 frames with zero structural gaps or
replacement-free disposals; the latter observed 65 in-view load completions and
870 refinement publications during motion, without replacing the runtime.
These native MapLibre motions are not literal mouse-wheel events or a
pixel-perfect coverage certificate, and evolving warm caches preclude a speedup
claim. With no pending work, an idle sample rendered zero frames in three seconds.
Live draw verification counted 597 mounted tiles and 461 primary submissions,
matching the renderer's 461 draw calls; offscreen resident tiles need not draw.

## Latency-aware future views — 2026-09-16

**ID: PAN-PREDICTION-20260916 / implemented, uncommitted; end-to-end benefit unproven.**

- Context: sustained pans expose new tiles before their queue/download/parse/publication completes. Preserve current initial-quality coverage, shared payload ownership and existing cancellation; do not register speculative cameras as visible receivers.
- Decision: infer translation only after at least 400 ms of coherent motion. Direction cosine must be at least 0.95, speed agreement at least 0.7, and their product at least 0.8. Stop, reversal, teleport, significant lens/orientation changes or a sample gap reset inference. Sample at most every 100 ms; these are request updates, not a render-frame cap.
- Lead is the rolling p75 request-to-first-primary-draw latency (64 samples; default 500 ms, clamped 100–1500 ms), limited to half the viewport width. Draw submission is **not** a GPU completion timestamp. Only outside-live-view target candidates and immediate REPLACE siblings are admitted, at the initial error target; no extra scene, renderer or refinement of an offscreen family beyond its target cut.
- At most four speculative jobs per runtime, at most 256 metadata nodes inspected per scheduling pass, deferred outside the draw callback. Existing foreground queue eligibility wins; no new speculation before initial coverage, during a loading pause or above 85% of the soft eviction watermark. Forecasts must not consume the foreground eviction reserve. Existing visible-camera priorities still outrank forecasts; this does not implement a new idle-versus-prediction priority lattice.
- Invalid future demand cancels unfinished work, but live demand adopts the same tile/promise. A 2 s retry delay affects preempted speculation only, never normal viewport requests. Finished data remains ordinary evictable shared-cache data. Immediate siblings are requested together when they fit the bounded speculative family budget; larger families are left to the normal loader.

### Known camera paths

`createCameraFlightPlayer(camera, path).sampleAhead(seconds, aheadMs, manualFov?)` returns a reused scratch camera without moving the live camera or its mixer. `layer.requestTileCameraAhead(viewAt, aheadMs, validForMs = 250)` snapshots that future view for all supporting runtimes. Example:

```ts
layer.requestTileCameraAhead(aheadMs => ({
  id: "flight-ahead",
  camera: player.sampleAhead(elapsedSeconds, aheadMs),
  viewport: [width, height],
  errorTargetPixels: 12,
  role: TILE_CAMERA_ROLE.RECEIVER,
}), 500);
// Refresh while animating (camera-window stories use 100 ms), or cancel:
layer.removePrefetchCameraView("flight-ahead");
```

Up to three explicit future views per runtime; lead 0–5000 ms, validity 1–2000 ms. Expiration also runs without rendered frames. Perspective and orthographic snapshots reuse the existing demand evaluator. Automated paths need no stability inference: they provide the actual future pose/FOV. The camera-window demo is wired; paused flights cancel their prediction. The adapter currently supports the mesh tile runtime, not a new raster prefetch implementation.

### Evidence and remaining work

132 focused engine checks and five camera-window tests pass: coherent-motion gating, reversals, latency/spatial bounds, non-mutating path samples, API routing without receiver demand, whole-family admission, memory limit, expiry, live adoption and preemption backoff. No production build or server restart.

Chrome 152 / M4 Max, 1200×1143 CSS pixels/DPR2, debug enabled, warm evolving caches, same existing Storybook: a 2 km / 60 s native MapLibre pan activated prediction in 210/232 samples but admitted no speculative requests before current initial quality was ready (and the first memory gate used the too-low eviction watermark). Raw local artifact: `output/prediction-pan-no-admission-20260916.json`; script: `benchmarks/slow-pan-browser.js`. A subsequent 20 s / 1300 px pan with the corrected budget admitted 114 requests but only three completed as speculation; preemption retries motivated the final 2 s backoff. It retained the runtime and disarmed after stopping. These are **not** balanced A/B results: different views, evolving residency, no cold-network reset, and the final backoff/deferral release has not been browser-accepted because the test tab became unavailable. No measured speedup or GPU-gapless guarantee.

Alternatives: unconditional directional prefetch rejected by design (wasted work after erratic input); predictive visible cameras rejected (would weaken publication/retention invariants); unlimited latency feedback rejected (overload amplification). Revisit with paired, equally warmed motion runs measuring entry quality, unused bytes and foreground delay; keep speculation bounded if it does not help.

## Continuous-pan queue and resident-family repair — 2026-09-16

**ID: DRAG-RESIDENT-SIBLINGS-20260916 / implemented, uncommitted.** Retained fine cuts now consider already-loaded, formerly unpublished siblings. Immediate REPLACE families request and publish together, with missing siblings treated as coverage repair, not optional outside-view refinement. Ready parses no longer wait for higher-ranked downloads in another stage; bounded moving parsing remains enabled. Earlier 2 km / 60 s runs before prediction observed 2 versus 122 tiles finishing in-view after removal of the cross-stage barrier, zero in-view evictions, and no runtime remount. Warm-cache hierarchy queries had 128 extra hits and no extra misses: a monolithic JSON helper is not supported as the fix for that workload (cold startup remains unevaluated). Shared-render spikes up to 131 ms remain open. These exploratory runs do not establish a universal speedup.

## Runtime profiling and cache recovery — 2026-09-16

The runtime-profile decision recorded here covers five current-story motion
runs, CPU/GPU boundaries, repeat preparation, download backpressure and cache
limits; raw profile output is retained locally and is not a publication artifact.
A delayed IndexedDB lookup no longer
disables hierarchy cache reads permanently; ten focused tests and a browser
reload confirm reuse (57 hits / 1 miss). Prepared mesh geometry/texture
persistence and additional parse workers remain proposals, not delivered paths.

## Explicit startup targets — 2026-09-16

**INITIAL-RESERVE-IDLE-20260916 / implemented, focused tests; live UI unverified.**
Supersedes the earlier policy of waiting for final viewport convergence before
preparing the reserve. Non-shadow terrain-providing meshes now load in this order:

1. Complete the initial viewport target (`initialPixelError`, story default 12 px).
2. Prepare the tileset residual surface with its distance-dependent tree
   transitions (`tilesetMinResolutionPx`, metadata default 1024). Keep the initial
   foreground target while floor discovery, payloads and transitions settle.
3. Refine the live view towards `idlePixelError` (metadata default 6 px for a mesh, 4 px otherwise).

The ad-hoc style's `metadata.carmaConf["3d"]`, alongside `colorCorrection`,
declares `baseErrorTarget: 12`; the idle target of 4 px and the residual
resolution of 1024 px are the layer manager's defaults, see the style contract
in the README. Mesh Coverage reads its initial/idle/residual
control defaults from these fields; explicit story/URL controls override them.
The regular layer manager forwards the same fields and applies live changes
without rebuilding the tile pool. Absent/zero residual resolution falls back to
the existing `entry` hint. Both bundled mesh style copies stay identical.
The metadata forwarding/live-update and loading-policy checks pass (19 tests);
this does not certify live browser performance.

Commit check (2026-09-16): the changed engine/diagnostic suites pass 321
assertions after updating the old startup-state test to require initial viewport
coverage before arming the reserve. The two separately baseline-reproduced
corridor failures below remain open. Nx affected discovery failed to start its
plugin worker; no build or merge-readiness claim follows from these checks.

Display retention now uses the idle-quality target independently of relaxed
startup/motion/memory admission targets. An already published in-view cut is
not replaced by a coarser parent unless that loaded parent meets idle quality
and provides complete replacement coverage. Newly exposed regions may still
use the relaxed target. Multi-camera retention uses normalized demand so the
strictest overlapping camera keeps its requested quality. Offscreen reserve
coarsening and the memory ceiling remain unchanged. Focused lifecycle regressions
cover motion, relaxed memory admission, newly exposed coverage, and permitted
coarsening after zoom-out; live fast-pan acceptance remains to be checked.
Throughput-adaptive request targeting with hysteresis remains a proposal.
The client texture-compression benchmark is deferred at the user's request.

The shared loading API accepts `setErrorTarget(idle, initial?)`; controls update
the current runtime without rebuilding its tile pool. The initial target is never
finer than the idle target. Zero residual pixels means **metadata hint**, not
disabled coverage; the UI labels this explicitly. Memory limits still bound the
chosen residual level. Shadow receiver/caster staging is unchanged.

The reserve barrier is startup-only: subsequent pans do not restart the global
pass. Completed resident data remains reusable. A capacity-blocked or failed
reserve can yield once active work stops; this releases the scheduling phase,
**not** a coverage certificate. Pending floor counts remain truthful, avoiding a
memory/source-failure deadlock. Changes to the initial target invalidate its
reserve pass and residual-resolution derivation.

77 focused loading, cascade and view-refresh tests pass, including initial-before-
reserve ordering, transitions still in flight, no repeated startup on pan,
memory-parked work and live target changes (`mesh-startup-stages-final.log`).
The existing browser initially still showed the old controls and subsequently
crashed during visual verification; current control visibility/load timing is
not accepted. Existing Storybook 4400 was not restarted. No production build.

## Current contract versus implementation — 2026-09-16

**RESIDENT-TREE-CUT-20260916 / local implementation, browser acceptance open.**
This inventory consolidates the loader requirements,
including the clarification that the reserve is **one tree cut de-densifying in
steps away from the viewport to the residual level**, not separately rendered
rings. `idleRing*` names below are existing distance-band implementation details.
This section supersedes conflicting status statements in the historical entries
below; it does not claim that every previous proposal was delivered.

### Regression and changes

The previous first-view fix accidentally reused its maximum initial-error gate
after movement: an unpublished but resident coarse reserve could not replace a
partial newly exposed cut. Its global atomic gate could then withhold other ready
branches too. Separately, coarsening allowed only four direct children, while
offscreen retention could jump immediately to the highest loaded ancestor.

- Keep atomic acceptable-quality publication for the **first** view. After a cut
  exists, immediately admit render-ready resident fallback; never withhold it
  solely for exceeding the quality goal. This does not relax the requested LOD.
- Allow complete mixed-depth cuts to coarsen to a loaded parent or superparent
  within the current display error, not only a direct quartet.
- Offscreen coarsening now reuses the distance-band reserve error policy, caps
  candidates at the residual frontier, and requires ready materials. Missing
  replacement means keep the previous cut. Per-candidate checks are memoized per
  reconciliation; no new full-pool scan runs per frame.
- Reserve payloads reaching eviction are protected even before their first draw.
  Visible replacements must already be published; hidden replacements may use a
  resident complete cut with ready materials. Pending jobs remain cancellable;
  explicit hidden-tab teardown/disposal is exempt. This is coverage preservation,
  not an unbounded pin of all fine geometry.

### Consolidated inventory

“Focused” means executable regression coverage, **not** full browser acceptance.
“Existing” evidence is from previous checks; it has not all been rerun today.

| Paradigm / ideal | Current implementation | Evidence / remaining gap |
| --- | --- | --- |
| One resident scene/pool for main, secondary, panorama and shadow cameras | Shared Three scene and registered camera-demand union; no per-camera tile download cache | Existing camera-demand/shared-view tests; current camera-demand focused suite |
| Coverage before quality; never retire the last known surface | Published-cut retention plus guarded native LRU; reserve protection and ready replacement added here | Focused tests: incomplete replacements, reserve eviction, texture readiness, teardown; live no-gap acceptance still open |
| Replace a parent and its children atomically, without double surfaces | Non-shadow publication returns a REPLACE cut; parent-underlay path removed from this lifecycle | Focused parent/child and partial-cut tests; ADD tiles retain additive semantics |
| Parent **or superparent** may replace detail if target allows | Complete mixed-depth cut coarsening added here | Focused skipped-generation and excessive-error rejection tests |
| Tree gradually de-densifies outside the viewport to residual coverage | Existing expanded-frustum distance bands drive idle selection; same demand now limits offscreen coarsening | Focused permitted-level/absent-parent tests; exact visual transition and fast pan stress acceptance still open |
| New reserve work only after the live view; existing reserve usable immediately | Idle work waits for base coverage, convergence and stationary map; warm fallback no longer gated by initial quality | Attachment/lifecycle source audit; first-view and warm-promotion tests |
| First acceptable whole view, then breadth-first improvement | Story uses 12 px initial / 6 px requested; request and execution share an effective halving stage | Focused loading/view-refresh tests. Still waits for **published** stage, not merely all current-wave requests admitted; lookahead remains open |
| Primary view dominates secondary views, but highest LOD wins shared tiles | Separate scheduling priority and maximum normalized demand ratio | Current camera-demand tests; initial publication currently considers receiver union, so strict primary-only first-wave independence remains open |
| SSE from visible 3D bounds, camera plane/FOV/resolution, transforms and padding | Compiled demand clips transformed bounds to request frusta; avoids invisible-corner edge refinement | Existing core demand tests. Offscreen reserve uses native camera metric only where clipped foreground SSE is undefined |
| Revalidate work on camera change; cancel obsolete download/parse work | Admission and queue-start checks plus motion/settled cancellation; loaded payloads are not stale requests | Existing cascade tests; two previously documented corridor assertions remain unresolved, not hidden by this inventory |
| Zoom-centre prefetch one/two levels, spare capacity only, cancel on zoomend | Shared zoom snapshot; serial optional work, bounded gesture count, regular demand adopts requests | Existing zoom/cascade and raster request-ownership tests; benefit under rapid wheel interaction not established today |
| Pan-direction prediction only if useful | No demonstrated production predictor in this audit | Optional experiment, not a prerequisite for persistent reserve coverage |
| Max useful throughput without blocking interaction | Bounded download/parse concurrency, backlog/byte admission, memory-adaptive error | Current loading tests; no current CPU/network saturation proof or verified 80% utilisation controller |
| Residual memory minimum 512 MiB, maximum 25% of 6 GiB; remaining data frequency/recency evictable | Floor resolves from metadata levels, requested minimum resolution and cache ceiling; current policy share is **35%** | Requested 512 MiB/25% contract and combined frequency/recency replacement policy are **not established**; change separately with memory-pressure verification |
| Textures ready before reserve becomes visible; caster-only geometry avoids shading/textures | Deferred-material plugin promotes receiver/reserve materials, keeps opaque caster-only material work deferred | Existing material-plugin tests; eviction now rejects an untextured replacement |
| Same principles for raster terrain, not duplicate assets per camera | Separate raster runtime uses complete terrain frontiers and shared request ownership/scene plumbing | Existing raster/frontier tests. Not literally one mesh/raster selection implementation; shared semantics are ahead of full consolidation |
| Repair “loaded but absent from scene”; retry genuine failures | Publication attachment repair, dirty-view refresh and retry owners remain in shared runtime | Existing liveness/view-refresh tests; browser proof of every mounted pixel remains stronger than the current state-based diagnostics |
| Reuse decoded/GPU-ready data on camera loops; persistent optimized artifacts only if faster | Resident reuse exists; source-format conversion/compressed persistent mesh texture cache remains separate work | No accepted cold-vs-HTTP-cache-vs-optimized-cache benchmark claimed here |
| Debug UI must not determine loader cadence | Lazy debug/UI boundaries and independent diagnostic presentation exist | Debug cadence/performance remains separately tracked in `TILE_DIAGNOSTICS.md`; not certified cost-free/60 FPS by loader tests |

### Acceptance boundary for this change

129 focused tests pass across frontier, loading, view refresh and camera demand
(`2026-09-16 16:43` local; `mesh-reserve-final.log`). Browser
before-fix inspection included wheel zoom out/in; the final zoomed-out screenshot
showed a continuous mesh inside its irregular source boundary. On reloading the
updated code the internal browser tab crashed; recovery failed and a fresh test
tab returned `ERR_BLOCKED_BY_CLIENT`. Thus **the requested post-fix rapid wheel +
long pan + return sequence has not been completed**. No framewise no-gap or
performance result is claimed. No server restart or production build was used.

Remaining acceptance: loaded residual extent -> fast zoom in -> long pan -> zoom
out -> reverse pan -> zoom back in, with framewise coverage capture, queue counts,
visible SSE and memory pressure. Distinguish true source boundaries and not-yet-
downloaded extent from loss of previously resident coverage. Failure/unknown
metadata is never proof of complete coverage.

## Refinement policy inventory and proposed consolidation

**ID / date / status:** VIEWPORT-REFINEMENT-WAVES-20260916 / 2026-09-16 /
source audit with first coverage fix implemented; bounded browser check,
not a cold-load performance acceptance.

**Implemented first:** non-shadow mesh loading now keeps the acceptable base
target until a complete published current-view cut exists, then halves the
request target towards requested/memory quality. Already resident final-quality
coverage skips unnecessary stages. Both request admission and job start use that
effective stage. Initial publication withholds disconnected detail islands;
known empty branches and terminal source resolution remain valid completion.
Previously displayed fallback survives incomplete child replacement. An incomplete
old cut no longer rejects a loaded parent that repairs its holes. Parent underlay
draws are removed from this publication path; the joint shadow receiver/caster
gate retains its prior scheduling policy rather than gaining a second barrier.

**Conservative boundary:** this first fix waits for published stage coverage,
not merely all jobs entering the queue. Admission-only lookahead from the proposal
below remains follow-up work. This is a current-view proof, not the old whole-
tileset/floor readiness gate. Unknown or failed data can delay the first complete
presentation; the implementation cannot manufacture missing source coverage.

**Evidence:** 125 focused frontier, loading, view-refresh and camera-demand tests pass;
warm-cache internal Storybook remount showed complete coverage in the first
screenshot, then refinement. Earlier live panning still exposed newly entered
unloaded extent before it filled, so no universal no-hole guarantee is claimed.
Two corridor assertions (drag cancellation timing and a caster request) also fail
with the pre-wave scheduling/retention policy reconstructed in an isolated Vite
test transform; live sources were not rolled back for that comparison.
Logs: `mesh-wave-final.log`, `mesh-wave-check.log`,
`mesh-corridor-baseline.log`. No production build or server restart.

Audit scope below (before this fix): Mesh Coverage configuration (12 px base, 6 px final), shared
mesh runtime and raster frontier. This section distinguishes executable policy
from historical decisions below. It does not restore the old global readiness
gate or claim that the observed load-time regression has been benchmarked.

### Current executable policies

Paths below are relative to `src/lib/runtime/integrations/` unless specified.

| Concern | Current implementation | Consolidation |
| --- | --- | --- |
| Initial versus final quality | `three-tiles-runtime-loading.ts:applyErrorTargetPolicy` selects requested/memory target at rest; base target is primarily for motion. `assignTilePriority` boosts work toward initial quality, but does not constrain traversal to an initial cut. | One explicit bootstrap cut followed by refinement waves; a priority bonus is not a bootstrap pass. |
| Skip versus parent-first loading | `three-tiles-runtime-attachment.ts` sets `loadAncestors=false` whenever terrain-providing mesh has an explicit base target. `three-tiles-mesh-frontier.ts:shouldDeferMeshRefinement` then bypasses the loaded-parent requirement. | Preserve initial skip-to-acceptable-cut, but replace subsequent direct-to-final skipping with one renderable replacement generation per region. Metadata-only nodes do not count as generations. |
| Admission checks | `shouldDeferMeshRefinement` is called at request insertion and again by `guardPayloadQueue`; motion/target derivation is repeated with slightly different inputs. | One current-demand admission decision, reused before download and parse. Revalidation is necessary; duplicated policy derivation is not. |
| Request ordering | `deriveTilePriority` has terrain nearest-first lanes (metadata, missing coverage, initial improvement, casters, detail, floor), plus a separate depth-first scoring path for other tilesets. Queue guard additionally selects the highest pending camera priority. | Separate semantic lane, wave and within-wave ranking. Keep primary-camera priority and foveation; do not mistake either for breadth-first wave admission. |
| Visible replacement | Lifecycle calls `collectLoadedMeshReceiverCandidates` without a committed stage and with infinite initial-error allowance. It can select arbitrarily coarse resident fallback. `retainMeshDetailFrontier` additionally protects previous detail. | A single published non-overlapping REPLACE cut, with explicit bootstrap quality and atomic per-parent replacement. Preserve previous cut until replacements are render-ready. |
| Hole repair | `selectMeshUnderlayParents` deliberately renders parents beneath partial children; lifecycle applies a depth underlay. | Conflicts with requested no-overlap policy. Replace only after a complete replacement cut exists; do not remove underlay protection before that invariant is implemented. |
| Raster replacement | `terrain-tile-frontier.ts:advanceTerrainTileFrontier` already requires ready descendants covering the entire parent footprint. Mesh selection instead considers current-view coverage. | Share replacement semantics, not mesh-specific types. Explicitly distinguish full-parent coverage from current-view coverage. |
| Reserve and idle work | New floor/ring work waits for view convergence; loaded fallbacks remain resident. Ring cascade has its own refinement cadence and memory allowance. | Keep in a background lane; never include it in a foreground-wave completion condition. |
| Stale work and safety | Current request relevance is checked before queue entry, job start and parse; retries, memory admission and attachment repair have separate owners. | Keep these checks. View changes invalidate the wave, not reusable payloads. A failed/blocked request must never count as render-ready. |
| Multiple views | `core/tile-camera-demand.ts` takes the maximum normalized error ratio across intersecting cameras, separately from scheduling priority. Shadow corridor demand can require offscreen casters. | Keep highest required detail; deduplicate shared tiles. Secondary views and background reserve must not block the primary view's wave. |
| Residual staging helpers | `isMeshRefinementBeyondStage` has no production caller in the integration sources; staged parameters remain on the receiver-cut helper although lifecycle does not supply them. Load-stage display also has a default 16 px baseline while this story requests 12 px. | Review/remove unused staging paths and derive diagnostics from the actual scheduler, rather than adding a second wave implementation. |

The direct-to-final request path and intentional parent/child underlay are
confirmed policy mismatches. Their individual contribution to latency needs a
controlled trace; this audit does not attribute all slowdown to either one.

### Proposed single foreground policy

1. **Current-view bootstrap:** discover the complete renderable cut at the
   maximum acceptable error (12 px here), without foveated relaxation above that
   ceiling. Prioritize its missing metadata and payloads. Publish it together
   once render-ready; keep an existing valid cut while a new view loads. On a
   cold load this trades partial early detail for a coherent first presentation.
2. **Breadth-first admission:** enumerate the next replacement family for every
   visible region still above its local target. Admit the entire wave before
   admitting deeper generations anywhere. "Requests running across the view"
   means resident, queued or in flight, not all simultaneously downloading:
   bounded concurrency must still work when the view contains hundreds of tiles.
   Current-wave jobs precede deeper jobs at both download and parse stages.
3. **Atomic publication per parent:** swap a displayed REPLACE parent for its
   complete render-ready child cut in one publication; reverse that atomically
   on coarsening. No parent/descendant overlap. A slow family retains its parent
   but does not prevent other complete families from publishing. `ADD` tilesets
   retain their explicitly additive semantics.
4. **Bounded lookahead:** a branch can prepare its next generation only after
   its current family publishes and all current-wave foreground families have
   been admitted. Do not recursively enqueue the entire final cut merely because
   earlier jobs have queue entries. Metadata discovery stays eligible when it is
   necessary to discover a missing family.
5. **Coverage definition:** without clipping/stencilling, complete replacement
   means the full displayed parent's footprint, including required sibling
   support. Offscreen support may be loaded for that transition, but must not
   recursively refine. Otherwise keep the parent. Never confuse arbitrary
   whole-tileset reserve completion with a local replacement requirement.
6. **Demand changes:** recompute affected membership/targets on camera changes;
   cancel obsolete work, reuse valid residents and retain coverage. Cache hits
   can satisfy a wave immediately. Exhausted retries and memory limits retain
   fallbacks and report an explicit blocked region, not a false completion or
   an endless traversal loop.

Implementation order: current-demand admission/cut planner, atomic publication,
then remove conflicting underlay/staging policy and derive diagnostics from the
same state. Do not add an independent story-only loader.

Focused acceptance cases: slow sibling; metadata-only hierarchy pages; cold
12-to-6 px progression; cached immediate convergence; pan during a wave; tight
memory; failed child; foveated mixed depths; overlapping cameras. Measure first
complete acceptable view, screen-area-weighted error over time, frame stalls,
stale work and offscreen refinement bytes with the same interaction trace.

## Published mesh attachment repair

**ID / date / status:** MESH-PUBLICATION-REPAIR-20260916 / 2026-09-16 /
implemented; intermittent browser holes not yet reproduced.

**Context:** publication skipped tiles already listed in `visibleTiles` without
checking their actual scene attachment. Upstream deliberately sets an active-only
model's `parent` to the group without adding it to `group.children`, so parent
identity alone is not proof of rendering membership.
**Decision:** on publication, compare selected models against one set of current
group children and active/visible membership; reattach mismatches through the
existing renderer API. Mark selected tiles used even when visibility is unchanged.
Use all camera demand volumes for underlay selection, matching the receiver cut.
**Alternatives:** redownloading valid resident payloads is unnecessary; GPU
visibility/occlusion readback is deferred and not required for attachment repair.
**Evidence:** regression tests detach a loaded selected model with and without an
active-only parent, then pan at unchanged error. Both reattach the same payload,
retain LOADED state, mark it used on subsequent publication, and avoid duplicates.
**Revisit:** this checks scene membership, not visible pixels or payload validity;
missing geometry, material state and true coverage gaps still need live diagnosis.

## Viewport first quality

**ID / date / status:** VIEWPORT-FIRST-QUALITY-20260916 / 2026-09-16 / implemented;
initial-load latency not yet benchmarked.

**Context:** the extent reserve started at coarse first coverage and competed
with useful visible detail. Missing reserve parents could gate finer publication.
**Decision:** arm the extent reserve only once the current view converges at its
requested target. During subsequent view changes retain existing reserve tiles,
but postpone new offscreen floor leaves, ring detail and ancestor backfill until
convergence. Loaded complete child coverage is not demoted for a missing reserve
parent. Missing visible coverage stays first; refinement toward the initial target
precedes caster-only work, with normal shadow/detail scheduling thereafter.
The reference story uses the existing base target at 12 px and requested target
at 6 px; no duplicate error policy or renderer is introduced.
**Alternatives:** extending the global coarse-stage barrier rejected by inspection:
it delays independent ready viewport branches. Predictive prefetch unchanged.
**Evidence:** focused priority/loading and current-view regression tests; a known
pre-existing memory-relaxation assertion in view-refresh remains separate.
**Revisit:** measure cold first-view convergence and fast zoom-out coverage with
the reserve delayed; cached fallback protection does not guarantee unloaded areas.

The SVG diagnostic implementation described in historical records below has
been replaced by the lazy library-owned TypeGPU worker overlay. See
[TILE-DIAGNOSTICS-WEBGPU-20260916](./TILE_DIAGNOSTICS.md) for the active boundary,
measurement scope, and source-snapshot versus display-rate contract.

MESH-COVERAGE-20260912, extraction checkpoint 2026-09-13. This preserves the
coverage-first policy from the Mesh Coverage prototype (WIP `fdef8701b`) in the
engine used by all common playground demos. It is not a new story-local loader
or a production no-holes certification.

## Rules

### View-local refinement without a global readiness gate

Decision `MESH-LOCAL-REFINEMENT-20260915` (2026-09-16, implemented; bounded browser check).

- **Context:** Mesh Coverage stalled at 20 px instead of its requested 4 px,
  with only 489 MiB of its 6 GiB budget resident and all queues idle after 70 s.
  A global base-coverage certificate gated both the target and queue admission.
  Removing that gate exposed a second dependency: publication restored one
  coarse parent despite a loaded 202-tile viewport cut, waiting for offscreen
  siblings that current camera demand did not require.
- **Decision:** At rest, permit requests at the requested/memory-adaptive target
  without a global readiness certificate. Keep the coarse motion policy and
  fallback-payload admission. Publish a complete current-view replacement cut
  independently of whole-extent completeness. Unknown child bounds fail closed.
  This does not authorize physical eviction: whole-extent replacement coverage
  remains necessary to remove the resident fallback.
- **Recovery after movement:** The LRU keeps unused entries near 75% of the
  budget, while adaptive quality recovery waits below 60%. For an idle,
  converged cut, use current/pinned cache bytes for that recovery decision, not
  reusable unused entries. Physical admission still counts all resident bytes
  and remains blocked at the ceiling. Active loading and unconverged cuts retain
  the conservative total-byte check. This addresses the observed 6 px hold
  after zooming back (4,615 MiB cached, 3,449 MiB used, 6,144 MiB budget).
- **Evidence:** Regression tests exercise the missing global certificate,
  motion and memory targets, view-local replacement, entering siblings and
  unknown bounds. In a warm-cache Storybook reload, the first 500 ms probe with
  main-view convergence was at 6.06 s: requested/effective 4 px, 202 published
  tiles. Idle background loading finished at about 15 s with 4,744 MiB resident.
  This is a single-device sampled result, not a cold-load benchmark or an
  exhaustive no-holes guarantee. The earlier constrained-cache acceptance
  below did not establish requested-target convergence.

### Constrained-cache fallback admission

Decision `MESH-BUDGET-FLOOR-20260915` (2026-09-15, implemented; bounded browser check).

- **Context:** Elevation Stripes capped residency at 384 MiB. The entry-L3 hint
  reserved an estimated ~407 MB including ancestors; all 73 resident entries
  were used at 392.75 MiB, preventing another download. Raising SSE stopped at
  20 px, even when that cut did not fit.
- **Decision:** Resolve the resident floor against the budget, not a hard entry
  minimum. Arm it on startup and admit its renderable payload before descending
  into finer content. External JSON pages are topology, not replacement meshes;
  look through them when proving a loaded floor ancestor. Memory coarsening can
  exceed the base target, bounded by the current root SSE, and wakes a fresh
  demand sweep. Existing coverage-removal guards still require loaded geometry.
- **Alternatives:** Merely increasing the story budget is deferred: it masks the
  admission cycle. Eviction without replacement coverage is incompatible with
  the no-hole invariant. Raster payload selection is unchanged.
- **Evidence:** Policy/frontier/spatial regressions pass (144 tests). A bounded
  Chrome check of Stripes with the 2024 mesh, Barmen -> city overview -> Barmen,
  retained surface coverage and resumed new detail with the 384 MiB ceiling;
  sampled residency was 291–338 MiB. This is not a throughput benchmark or an
  exhaustive no-holes certification. The older runtime/traversal test pair has
  four failures reproduced against unchanged HEAD `1b219d568` as well.
- **Revisit:** A budget below even the coarsest payload cannot guarantee complete
  coverage. Source-level byte estimates and coverage telemetry for page-wrapped
  floor cuts remain approximate; reduced effective quality must not be presented
  as meeting the requested pixel target.

### Asymmetric viewport and padding

Decision `TILE-VIEWPORT-PADDING-20260914` (2026-09-14).

MapLibre padding shifts the projection's principal point, not the canvas bounds.
The render camera retains MapLibre's exact custom-layer matrix. The synthetic LOD
camera now preserves its principal-point offset in CSS pixels via `setViewOffset`;
its metric scale and SSE remain unchanged. Do not use drawing-buffer dimensions
for this offset or replace the metric LOD camera with a composite clip matrix.

Foveation, raster request ranking, margin cameras and idle rings use that same
shifted focus. Full-canvas frustum coverage remains required, including underneath
UI padding. Padding is not an occlusion mask. Cursor zoom keeps its cursor anchor;
zoom without a cursor uses the projected geographic map center. Raster focus is
part of the demand update, not tile identity, so padding-only changes cannot leave
priorities stale or create another tile pool. Other scene cameras retain their
own projection and request priority.

Evidence: 137 focused cases across the LOD, camera-set, foveation/margin/ring,
raster selection and zoom-prefetch suites. The common `Viewport Request Padding`
story changes padding and canvas width on the existing Map/runtime, with the
projected center and usable rectangle visible. This establishes the coordinate
contract, not a universal no-holes or GPU performance guarantee.

### Coverage invariants

The long-range reference story exposed a synchronous Worker `postMessage`
allocation failure while publishing a large terrain cut. Decision
`TERRAIN-STITCH-BATCH-20260914`: full-geometry stitching transfers are grouped by
actual backing-buffer bytes (16 MiB target), with compact shared boundary-shell
context. Small cuts retain the existing one-pass path. Results remain private
until the entire new cut is ready; cancellation discards the partial result and
keeps the previous published coverage. Equivalent seam/normal/topology fixtures
cover mixed 1:2 and 1:4 LODs, corners and cached cuts. This caps clone spikes, not
total resident memory: one indivisible tile plus shell context may exceed the
target, and newly encountered large cuts need a shell-preparation pass before
stitching. Do not describe this as a hard memory ceiling or throughput win without
browser evidence.

- **R1 — Coverage before detail.** Draw a loaded ancestor under an incomplete
  replacement cut. Unprocessed children are unknown, not known-empty.
- **R2 — First base cut.** Gate the initial surface on base-view coverage.
  A loading presentation cannot manufacture unavailable source content.
- **R3 — Shared extent floor.** Pin and request the selected fallback level
  across the source extent once the first base view exists. Preserve loaded
  floor coverage; unfinished offscreen floor/transition work yields to current
  camera payloads. Downloaded buffers can wait without re-downloading, and
  active background fetches can be preempted for waiting viewport requests.
- **R4 — Replace only when ready.** Retain parent/previous cuts until a complete
  current-view replacement can be published. Offscreen siblings do not block
  that visible refinement. Physical eviction has a wider domain: keep ancestors
  protecting historical offscreen regions, regardless of their local error
  target. A resident-but-hidden parent is not a published eviction replacement.
  Do not pressure-evict the last coverage; coarsen the published family atomically
  first.
- **R5 — Local refinement.** Refine idle rings and the visible cut from a coarse
  base target. On movement, cancel stale refinement, but preserve demand from
  **any** registered camera, including offscreen receiver and caster cameras.
- **R6 — Memory from the floor up.** Account for pinned fallback before admitting
  rings/detail. Reuse resident detail while budget permits; it is not a second
  per-camera cache. The adaptive error target coarsens admission under pressure.
- **R7 — Composable demand.** Perspective and orthographic camera frusta are
  evaluated in the same scene frame against tile 3D bounds. Receiver demand
  includes color/material readiness; caster-only demand does not require draping.
- **R8 — Zoom speculation is optional.** Once foreground queues and base
  coverage are ready, use spare capacity for up to two finer levels at the
  cursor/zoom centre. Cancel owned unfinished work at zoomend, preserve work
  adopted by foreground consumers, and retain completed data in the same pool.

## Camera priority and reusable array diagnostics

**TILE-CAMERA-PRIORITY-20260914 / 2026-09-14 / implemented, scoped acceptance**

- **Context:** Panorama/facade stories already use `buildThreeTilesRuntime` or
  the raster adapter in one shared scene. Their array cameras previously had the
  same scheduling rank as the MapLibre observer. `isTileInMainView` deliberately
  includes additional receivers for coverage, so it cannot identify the observer
  alone when assigning priority.
- **Decision:** Camera snapshots carry a finite numeric priority. Existing
  callers default to PRIMARY (1); array strips default to SECONDARY (0). The
  story can promote one one-based segment to FOCUS (2), while the observer stays
  PRIMARY. Intersecting cameras contribute their maximum rank and required
  error/role union to the same payload identity. Priority-only changes invalidate
  demand without rebuilding the scene or rig. These constants are scheduling
  ranks, not geometric-error multipliers or separate caches.
- **Scheduling and safety:** Native download/parse admission parks lower ranks
  only behind eligible higher-rank work. Buffered jobs keep their promises and
  resume when that work drains. Lower-rank active fetches may be preempted;
  executing parsers and published coverage are retained. Current or not-yet-
  discriminated shadow casters stay PRIMARY. Raster selection and preparation
  stages follow the same ranks; siblings required for an atomic replacement
  inherit that replacement's rank. No camera's retained coverage is discarded
  to promote another, and blocked/irrelevant high-rank requests do not freeze
  secondary work. Continuous primary work can still defer secondary refinement.
- **Diagnostics:** `TileLoadingDebug` extracts the Coverage panels and binds to
  the supplied runtime handle and scene origin, not the first global registry
  entry. Camera-array stories start closed with diagnostic sampling disabled;
  opening opts in and closing tears it down. Coverage retains its debug-on
  default and existing explicit loader controls. The detailed panel currently
  requires a mesh runtime; the raster source shows a disabled launcher rather
  than misleading mesh statistics.
- **Image navigation:** Shared `createCanvasImageStrip` owns one 2D presentation
  canvas. Drag, wheel/trackpad and keyboard transform the entire source strip;
  closed loops draw cropped tail/head slices of that same buffer at the seam.
  There is no duplicated camera, render target or 3D scene for wrapping. Open
  strips clamp to their ends. Source-only updates preserve navigation. Alt plus
  vertical drag translates every camera and its clipping/image planes in scene
  metres, coalesced per presentation frame; obsolete readbacks cannot overwrite
  the new elevation. The map camera does not move. Segment readbacks remain
  asynchronous and sequential, not a synchronized whole-panorama capture.
- **Alternatives:** A second loader per view would duplicate residency and
  coverage state. Suppressing secondary demand entirely would leave the array
  incomplete indefinitely. Rendering the meridian camera twice would add GPU
  work without new information. All three are avoided by shared demand plus
  presentation-buffer reuse. Storybook's cloned object args are compared by
  active custom-path value, avoiding rig rebuilds on unrelated control changes.
- **Focused verification:** 280 tests in seven engine suites pass for demand,
  queue precedence/preemption, raster selection/cancel/resume, camera refresh
  and coverage retention. Seven strip tests cover identity-preserving priority,
  whole-rig elevation/clipping translation and stale readbacks. Seventeen UI
  tests cover bounded/wrapped navigation, source reuse, frame coalescing and
  cleanup. Logs: `camera-priority-final-tests.log`,
  `camera-strip-final-tests.log`,
  `camera-interactions-final-tests.log`. No broad build or full-suite
  green claim; prior source-floor/corridor blockers are not closed by this work.
- **Browser verification:** The existing user-visible Chrome session on 4400
  confirms twelve SECONDARY panorama cameras in one pool, promotion of segment
  five without changing pool or camera IDs, 0-to-0.916 wrap navigation, wheel
  zoom, and the same +3.142 m elevation delta for all twelve cameras without
  moving the map. Closing diagnostics removes its registration; one presentation
  canvas remains. `output/playwright/camera-array-priority-browser.log`,
  `camera-array-interaction-browser.log` and `camera-panorama-wrap.png` record
  the local probe. The closed facade keeps 16 cameras in one pool and wraps
  0-to-0.966; the open Wupper-bank strip keeps 29 cameras, stops at 0 and 1,
  and also starts with diagnostics off. Local evidence:
  `camera-closed-facade-browser.log`, `camera-closed-facade-wrap.png`,
  `camera-open-spine-browser.log`, `camera-open-spine.png` in that same folder.
  `camera-debug-extraction-regression.log` confirms the original Coverage story
  still opens its overview and diagnostics by default on one runtime.
  This is functional interaction acceptance, not a cold-load,
  throughput, memory-pressure or every-camera no-holes certification; the demo
  still reports its existing 73/75 source floor and unknown fallback cut.

## Foreground admission before background repairs

**VIEWPORT-WORK-FIRST-20260914 / 2026-09-14 / implemented, end-to-end latency still limited**

- **Context and constraints:** The live Coverage tab held 260 offscreen transition-support payloads, 258 waiting to parse and two active. Floor priority ranked above visible detail; support bypassed the motion/base guard. Keep already published coverage, other-camera demand and current sun casters. A native `PARSING` state includes queued buffers, not just active decoding.
- **Decision:** Retain useful queued floor/support buffers and original promises but park them during movement and while eligible current-camera payloads are pending. Rank offscreen floor below visible detail. Refresh eligibility at native download/parse dispatch and after the pre-parse yield; reawaken parked parsing on camera changes. Cancel obsolete coarse REPLACE requests when a complete drawn child cut already covers them. In main-view-only scenes, preempt active offscreen fetches for waiting visible payloads, but do not repeatedly restart already running decoders. A covered viewport may tighten its target before the independent floor audit/downloads complete. Loaded coverage, cache ceiling and atomic publication rules are unchanged.
- **Alternatives and disposition:** Dropping loaded historical coverage is incompatible with R4. Aborting every useful downloaded buffer would waste completed transfers, so pending buffers are retained. Keeping a high-priority floor and merely increasing concurrency is rejected by the observed foreground priority inversion, not by a throughput sweep. Interrupting native GLTF work already executing is not implemented; it remains bounded by parse concurrency.
- **Evidence:** 178 focused tests across load policy, cascade cancellation, current-view refresh and frontier retention passed. They cover parked native promises, foreground precedence for both queues, camera-entry wakeup, cancellation across the pre-parse yield, coarse-child replacement and other-camera protection. The wider corridor-demand check still reports its three previously recorded failing cases; this is not a green full-suite gate.
- **Browser measurement:** Shared user-visible Chrome 152 on the reference Mac16,5 / M4 Max / 36 GiB, 1728×998 CSS pixels, development Storybook. One six-second run before and one after: fixed centre `[7.12701818627022, 51.23829136862301]`, zoom 13.66→18 over 650 ms, one-second preparation, 500 ms queue sampling. Both reached the 4 px target/converged flag at the 3.5 s sample. Frame p50/p95/max were 7.0/7.6/69.4 ms before and 8.3/9.3/58.3 ms after. Afterward the 0.5 s snapshot had visible work active and offscreen support queued; at 1.0 s visible payloads had drained and support fetched. Resident pools differ (431 versus 587 at the first sample), and HTTP/cache/thermal state was not controlled: no comparative latency or throughput gain is claimed. No CPU/GPU profile, byte-cost comparison, cold-load, memory-pressure or no-holes certification follows from this queue observation. Reproducer and raw results: `output/playwright/profile-fast-zoom.js`, `fast-zoom-before.log`, `fast-zoom-after.log` (local artifacts, not committed).
- **Remaining limit / revisit when:** Atomic REPLACE publication still waits for offscreen siblings needed to replace an already published ancestor. Foreground payloads finishing early does not mean they can all be published early. Revisit that separate coverage/publication dependency with frame-by-frame no-holes and overlap tests; do not treat the queue correction as its solution.

## Current-view demand and completion liveness — 2026-09-13

**CURRENT-VIEW-DEMAND-20260913 / implemented; browser acceptance scoped below**

- **Context and constraints:** A zoom-out immediately after first publication,
  followed by zoom-in, stranded the manager at the bootstrap 20 px target despite
  a requested 4 px target. Preserve historical coverage, shared-camera/caster
  demand, and responsive interaction; do not add another loader or payload pool.
- **Decision:** Prepare native camera/SSE state before retention, priorities or
  cancellation. Reconcile every current camera/target against outstanding work,
  including queued parsing. Obsolete work is aborted through native ownership and
  becomes requestable again; completed published surfaces are not evicted by this
  cancellation pass. Routing nodes are not mistaken for renderable fallback.
  Armed floor and complete-family replacement support remain useful outside
  the view, but are background work (see VIEWPORT-WORK-FIRST-20260914).
  Demand from other cameras/current sun corridors is not obsolete offscreen work.
  Active zoom speculation only survives while still relevant to the current view.
  Admission and cancellation share the same relevance predicate: rejecting an
  obsolete job must also prevent immediate re-enqueue under unchanged demand.
  The demand target includes the memory-adaptive minimum, not the temporary
  bootstrap stage. Memory-driven coarsening applies immediately, even when base
  or floor coverage is incomplete; refinement waits for base-view coverage,
  not completion of the source-wide floor.
  Selection, historical-cut retention and request admission use that same target.
- **Publication dependencies:** An existing parent cannot be replaced by only its
  visible children while historical coverage requires its entire footprint.
  Include already-loaded offscreen sibling fallbacks and request only missing
  coarse support siblings, including required materials, through existing queues.
  Unconditionally refined payloads route to descendants; they are never requested
  as fallback. Atomically publish the complete family. Caster-only work still
  does not require color materials.
- **Wake-up rules:** Reset synthetic deferral on camera or effective-target
  changes, not just pointer events. Floor readiness requires a real traversal
  after arming; skipped native traversals preserve the preceding audit counts.
  The final request completion can arm one recovery audit, not a permanent render
  loop driven by a nonempty deferred set. Shared zoom prefetch resumes after
  temporary foreground pressure without repeating fulfilled adapters.
  Eligible memory raise/relax holds schedule a single remaining-deadline wake;
  an otherwise idle view cannot miss its quality recovery. The existing 60%
  relaxation hysteresis remains unchanged and ineligible timers are cancelled.
- **Raster failure rules:** Retry failed stitching/publication for an unchanged
  view while keeping the preceding cut. Selection completion wakes the host.
  Intentional cancellation does not reduce the throughput controller's capacity.
  Per-entry cancellation ownership preserves overlapping/shared requests. Every
  changed camera immediately rejects provably offscreen pending work using
  conservative elevated bounds, even while selection workers remain busy. Exact
  in-view LOD reconciliation stays in the worker; equal resolved cuts do not
  restart preparation. Cancelled conversions terminate only their owning worker
  slot. Old stage queues cannot readmit rejected keys; returning to the same
  selected cut can request them again.
- **Alternatives and disposition:** Queue-priority changes alone are incompatible
  by inspection: fake-deferred tiles are absent from queues. Dropping historical
  parents with incomplete sibling coverage violates R4. The first camera/floor
  fixes without publication-support requests were a **measured rejection** as a
  complete fix: all three replay runs still stopped at 20 px with idle queues.
  Cancellation without matching admission was also a **measured rejection**:
  one 1.5-second zoom-out produced 4,514 queued-request cancellations because
  native traversal immediately re-created the rejected work. Raw local probe:
  `carma-cancel-demand-probe.log`.
  A subsequent cold-session run exposed another cycle: 6.44 GB accounted against
  a 6.51 GB admission ceiling, memory target 20 px but effective target 4 px,
  incomplete base, and 553 queued/3 downloading/4 parsing unchanged. The code
  incorrectly required base readiness before **coarsening**; its collector also
  continued requesting 4 px replacement support. This supersedes any inference
  that camera freshness and shared admission alone close all liveness gaps.
  Raw snapshot: `carma-reconciled-demand-settled.log`.
- **Evidence:** Existing user-visible Chromium 152.0.7977.83 session, static
  Storybook preview on port 4300; no new browser/context/renderer pool. Workload:
  first visible mesh → underlying MapLibre zoom 14 over 600 ms → zoom 17.32 after
  1500 ms. Before support admission, all 3 warm runs were still at 20 px after
  9.5 seconds. With complete-family support and unconditional-node routing, two
  warm fresh-renderer runs reached an actually published maximum error of
  2.982 px in 7.184 / 6.166 s after starting zoom-in (median 6.675 s, observed max
  7.184 s; no meaningful tail percentile from two runs). Resident accounting was
  2.59–2.61 GB, JS heap 0.96–0.97 GB. A cache-disabled 80 ms/4 MiB/s run had not
  converged at 15 s: 37 queued/16 downloading, coarse coverage present, no idle
  queue stall. This is a network-throttled run, not a disk-cold benchmark.
  Probe: `output/playwright/current-demand-acceptance.js`; raw local results:
  `carma-current-demand-acceptance.log`. The warm screenshots were
  inspected; the source-floor diagnostic still reports two unresolved roots.
  These measurements predate the follow-up aggressive cancellation change and
  do not certify global no-holes, cold completion, GPU throughput or p95 latency.
  After memory coarsening was fixed, a repeated stress run (zoom 19 → 14 → 17.32,
  200 ms/4 MiB/s during reversal, then normal network) finished with base coverage
  ready, zero queued/download/parse jobs, no pending replacement support, and
  max published error 4.992 px under a memory-adaptive 6 px target (requested 4).
  Two later idle snapshots 2.5 seconds apart had the same cancellation count;
  the last cancellation was at 13.8 s, not an ongoing request/requeue loop.
  Accounted residency was 3.946 GB, just above the existing 60% relaxation
  threshold. This reopened headed session used 1200x1199 CSS pixels, DPR 2
  (2400x2398 screenshot), Chromium 152.0.7977.83, and 14 reported logical CPUs;
  hardware/GPU model was not recorded. It is not a timing comparison against the
  earlier smaller-window runs. Raw evidence: `carma-memory-demand-probe.log`,
  `carma-memory-demand-idle.log`, and
  `carma-demand-browser-environment.log`; inspected screenshot:
  `output/playwright/cancel-demand-final.png`. Raster continuous-motion
  cancellation is covered by held-worker tests, not by this mesh screenshot.
- **Cancellation boundary:** Queued native parsing can be removed immediately;
  already-running non-cooperative GLTF/browser decoding may finish its current
  step before checking AbortSignal. Late results cannot publish. Do not claim
  that an abort synchronously preempts all browser decode/GPU work.
- **Revisit when:** Remaining source-floor roots, cold-start coverage, memory
  pressure, multi-camera lighting, or target changes fail the same publication
  and latest-demand contract. Test actual published SSE, not merely a target label.

## Zoom focus and persistent coverage — 2026-09-13

**ZOOM-PREFETCH-20260913 / implemented diagnostic; performance acceptance open**

- **Context:** View-only retention could discard offscreen geometry without a
  replacement. Zoom also exposed data that could have been prepared while
  foreground queues were idle. Input responsiveness and every registered
  receiver/caster camera take precedence over optional quality.
- **Decision:** The shared scene host observes zoomstart/zoomend, snapshots a
  128 CSS-pixel cropped view around the event cursor (otherwise view centre),
  and invokes adapters sequentially after leaving the render callback. All
  active runtimes must have no outstanding foreground demand and base coverage
  before admission, including a recheck after yielding. The zoom snapshot is
  not a receiver, shadow camera, new scene, renderer, or second payload cache.
  3D Tiles reuses native download/parse queues and cancellation, one payload at
  a time, with a two-renderable-level depth limit, 16-request gesture cap and
  80% retention-budget admission guard. Undiscovered metadata is processed by
  the existing bounded queue, not a synchronous full-tree expansion. Raster
  prepares the focus tile at the next two source levels up to source/runtime
  maxzoom. Ready mesh capacity and worker backoff still limit admission.
- **Ownership:** zoomend aborts only optional unfinished work. A 3D request
  adopted by any regular camera/caster demand survives. Raster source requests
  have independent reference-counted waiters; only the last cancellation aborts
  shared fetching/decoding. Foreground raster preparation adopts the same
  in-flight geometry job. Completed data stays cached; partial terrain
  quartets are never published just because one prefetched child is ready.
- **Coverage:** Historical 3D cuts survive sparse pan/zoom traversals and native
  LRU removal until a published ancestor or complete replacement cut covers
  them. Wholly offscreen families can coarsen to an already-loaded ancestor.
  Raster selection includes whole available child quartets, with coarse
  non-demanded siblings counted against its existing budget. Offscreen terrain
  is retained; after foreground completion a sequential reserve pass prepares
  coarse ancestors outside the requested cut. Failed reserve downloads keep
  the old surface and do not block foreground readiness/retry its view.
- **Alternatives:** A second loader/cache was rejected by inspection because
  ownership, admission and coverage would diverge. Unconditional overzoom is
  incompatible with foreground priority. A throughput-tuned concurrency wider
  than one is deferred until measured; spare bandwidth alone is not proof of
  spare parse/upload capacity.
- **Evidence boundary:** Focused tests cover request ownership, serial limits,
  abort-before-admission, source limits, complete spatial handoff and offscreen
  replacement under eviction pressure. The checked set is 227 tests across
  eight files (225 in the combined run, then two additional post-yield pressure
  cases). The visible static preview retained at least six displayed tiles
  throughout the sampled zoom/pan and had no optional jobs pending after
  zoomend. Its memory guard skipped speculative downloads; this does not
  demonstrate a live latency benefit. The source-wide floor still reported
  73/75 loaded and one root without a loaded cut. Static browser checks are samples, not
  a no-holes certification or a cold/warm latency benchmark. No end-to-end
  speedup percentage or free-VRAM measurement is claimed.
- **Limits / revisit:** Missing/failed source coverage and an absent loaded
  ancestor can still prevent convergence; retain old coverage and stop optional
  refinement instead of manufacturing a hole. Initial full-extent floor and
  sustained memory-pressure acceptance remain open. Explicit scene disposal,
  source replacement and the existing hidden-tab full wipe are teardown,
  not normal navigation. Revisit the depth/window/cap after repeatable warm
  zoom traces and device-specific memory/parse measurements.

## Implementation and diagnostics

`three-tiles-runtime-floor`, `three-tiles-runtime-cascade`, load-policy and
mesh-frontier implement the existing 3D Tiles policy. Camera demand extends this
runtime; stories only register cameras and render diagnostics. Mesh Coverage,
Camera Views and Lights all call `buildThreeTilesRuntime` and share the same 2024
metadata entry in the common stories project.

`loading.getCoverageStatus()` supplies bounded-cadence source-floor evidence.
Unknown metadata and failed roots remain incomplete. `floor-cut-covered` means
the discovered source floor has a loaded cut, **not** that all camera images have
been proved complete at their requested error. UI labels must keep that distinction.

The raster runtime uses the same shared scene and camera-demand contract but
retains its raster-native selection/payload adapter. A common scene-wide budget
and identical cross-source coverage transaction are still follow-up work.

## Remaining acceptance work

- Per-camera readiness, movement/zoom/replacement tests with real payloads and
  pressure, plus failure/no-data cases, before a production no-holes claim.
- The requested dynamic floor allowance (512 MiB minimum, up to 25% of 6 GiB)
  is not implemented by this extraction. The inherited floor-share heuristic
  and transfer-to-resident estimate need the separate budget-policy change.
- Texture/GPU readiness, not just a loaded metadata/content state, must gate
  publication. A caster becoming a receiver must obtain missing material data.
- Source-format conversion, compressed persistent texture caching and exact
  ECEF/planar datum compensation are separate deliverables, not part of this port.

Focused regression coverage lives in the load-policy, mesh-frontier, runtime,
camera-demand, camera-rig and raster-runtime specs. Browser snapshots show
selected configurations only; they do not replace sustained coverage testing.
# QUALITY-SYMBOLS-20260914

## Initial main Storybook integration (2026-09-14, superseded host)

The first integration ran the full `stories:storybook` on port **4400** in `feat-shadow-simulation`, replacing the isolated port-4300 preview. `TILE-CONSOLIDATION-20260914` below supersedes that host: the full Storybook now runs from `tile-loading-manager`, and Tile Loading Manager is top-level. The old `MapLibre Playground/Mesh Coverage (MapLibre + Three)` entry is replaced, not kept as a second loader demonstration.

The newer shared mesh/raster manager is integrated into this host's engine package. Source-datum elevation queries, NoData extrema exclusion, standalone ground referencing and concurrently edited shader-deformation bounds/camera elevation are preserved. The reference-surface stories use that same package, without cross-worktree import aliases. Scope: 144 focused integration tests passed; Coverage, Barmen Night Traffic, Closed Facade and the mesh/terrain comparison passed startup checks. Pending source downloads, complete shadow quality, town-wide lighting, previous broader suite failures and full coverage certification remain separate acceptance work. No commit or push accompanies this integration.

- **Status:** implemented diagnostic, not coverage certification.
- **Combined glyph:** pipeline state occupies the innermost circle (empty queue, half-filled download, filled processing); LOD contours surround it. Both circle centres and triangle centroids coincide with the overview tile centroid. The outer radius fits the shorter tile dimension with 8% padding (minimum half a display pixel), without a fixed-radius cap. Pipeline drawing follows the outer contours so the active stage stays on top. These are categorical phases, not byte-progress indicators.
- **Active-level subdivision:** the overview draws actual authored child bounds, not an aggregate at the extent floor. Metadata nodes and parents with finer shown resident/requested descendants are structural frames only; each terminal active cell has its own boundary, state and quality glyph. Unrefined siblings stay coarse. Ancestor closure uses only already-known candidates and does not request content or alter the rendered tile cut. Quality estimation runs only on terminal cells. The former 18-unit symbol cutoff hid detail even when magnified; visibility now follows the overview scale (4 display pixels), with borders retained below that. Live checks observed active hierarchy depths 9–17, no borderless child cells and no zero-radius circles. These depths include authored routing levels and are not the quality glyph's renderable-LOD step count. Evidence: `output/playwright/overview-active-levels.png`, `overview-level-diagnostics.log`; loader tests were not rerun for this diagnostic-only change.
- **Decision:** drawn/not-drawn fills, independent floor/ring borders and pipeline symbols. Concentric circles indicate required refinement, triangles indicate coarsening available through known REPLACE ancestors. A suitable selected LOD has no quality symbol. Hover retains the fallback/underlay role. Deferred is not a failed request.
- **Photo-mesh contrast (2026-09-14):** map and popout have distinct presentations of the same cells. On-map tile, frustum and pipeline shapes have no fills and no area backdrop. A narrow neutral-grey (`#404040`, 2.5 px) stroke pass uses 25% opacity and `mix-blend-mode: darken`, beneath bright cyan grids, yellow quality contours, magenta reserve outlines and light-violet pipeline strokes. Only stroke pixels can darken the photo; the pass ignores pointer events. This follows the existing layered annotation-cursor approach without filters. Empty, bisected and double inner circles distinguish map queue/download/parse states; the popout retains empty/half/full discs and cyan drawn/dark-neutral not-drawn fills on an opaque background. User review rejected both heavy double casings and a map-wide grey backdrop. Active-level subdivision and loader policy are unchanged. No universal contrast or performance certification is claimed. Earlier superseded reviews: `output/playwright/overview-photo-contrast.png`, `output/playwright/overview-bright-darken.png`. Current map/popout evidence: `output/playwright/overview-strokes-map.png`, `output/playwright/overview-strokes-popout.png`.
- **Prediction boundary:** use the renderer's camera-projected errors over the available tile hierarchy, skipping metadata and unconditional routing nodes. Return a min/max LOD range; cap each audit at 128 nodes. Missing hierarchy or the cap produces an error-halving estimate marked `≈`, using solid contours rather than visually noisy dashes. These are not downloads, frame iterations, time predictions or a completeness guarantee. The effective target includes the runtime's memory adaptation; 10% tolerance avoids threshold noise. Display one contour per LOD step without truncation, scaling the complete concentric stack inside the tile's padded extent and reserving the innermost position for active processing.
- **Alternatives:** twelve exclusive colours mix independent properties (inspection); unconditional error-halving remains only an explicitly estimated fallback. New metadata downloads for diagnostics are deliberately excluded.
- **Evidence:** focused coverage tests exercise nonuniform branches, metadata routing, unknown hierarchy, audit limits, target tolerance and replaceable ancestors. Static preview visually checked circles/triangles and legend. No loader-performance or full-coverage acceptance is inferred.
- **Location:** all four branch-added stories live in `playgrounds/stories/src/stories/mapping/tile-loading-manager`, under the top-level `Tile Loading Manager`, using the common MapLibre story style with a no-basemap option (no unnecessary raster downloads). Mesh metadata is shared with the reference stories at `mapping/maplibre/data/mesh2024-cesium-parity.style.json`.
- **Revisit:** if an upstream hierarchy exposes explicit refinement costs or diagnostic traversal is measurably expensive.

## Diagnostic windows and spatial projection

- **ID / date / status:** `COVERAGE-DIAGNOSTIC-WINDOWS-20260914` / 2026-09-14 / implemented diagnostic, not loader acceptance.
- **Context and constraints:** the user requested functional Ant Design/Font Awesome story chrome, independent movable/collapsible windows, quieter contours and a diagnostic-only up switch. Existing loaded tiles and the main camera must remain untouched. This explicit UI request supersedes the default minimal story-framing guidance for this story.
- **Decision:** enable `debug` by default in Coverage. A compact icon toolbar opens legend, overview, queue, statistics, charts and a separate event log. Windows can move, resize, collapse into the toolbar or open externally. Hide-all preserves recording; telemetry can be stopped independently. Advanced display settings are initially closed in a popover. Camera, Loading and Memory remain grouped Storybook controls; other new story modules group their larger control sets by scope.
- **Solid symbology:** use solid contours and `≈` estimates. Offscreen floor/ring tiles have quiet blue-grey baseline frames without LOD divergence; their active processing/failure symbols remain visible. Classification uses the runtime's main-view intersection result/native bounding volume where available, with a world-box fallback. On-map no-fill and stroke-only 25% darken composition are preserved; the separate overview retains state fills.
- **Spatial model:** replace the two arbitrary height-plane footprints with vertices of the actual camera frustum clipped to the tileset's world bounds, then project its edges. The clipper is an extension of shared `createTileCameraDemand`, rebased near the box center for ECEF precision. It returns independent vertices, not an ordered polygon; a convex hull is appropriate for this single-camera convex intersection, not for the union of multiple cameras. This is the intersection with conservative tile bounds, not a terrain raycast or the exact ground silhouette.
- **Diagnostic up:** either native tileset Z or geodetic tangent-up at the camera. Only the SVG projection changes; no map-camera, mesh-mount or datum changes. Loaded wireframes reuse source geometry and instance buffers in the existing scene; disabling the overlay or disposing source geometry removes the diagnostic proxies.
- **Alternatives and disposition:** two height planes and dashed outlines are superseded by user review; CARMA info-box framing was rejected for this developer-only UI. A new Three/WebGL context or cloned tile payloads are unnecessary by inspection. Storybook 8.5.3's stock control-category rows do not expose supported initially-collapsed state; no DOM patch or conditional hiding of preset args was introduced.
- **Evidence:** 18 focused camera-demand tests pass, including clipping, disjoint/enclosing volumes, perspective, multiple cameras, immutability and ECEF/tiny extents. Live 4400 reload confirms default debug, the rendered mesh, legend and eight grouped Controls. Shared visible Playwright checks confirm drag-position retention through collapse/restore, native resizing, styled external-window docking and independent statistics/log windows. Up switching leaves the camera and mesh matrix unchanged. Wireframe toggling created 453 proxies sharing source geometry and removed all proxies on disable. Hide-all restores correctly; telemetry off removes diagnostic registry entries and re-enabling retains the same tile-pool UUID. The separate overview retains state fills. Screenshot: `output/playwright/coverage-diagnostic-windows.png`; scoped checks: `coverage-ui-{drag,window,up,geometry,visibility}-check.log`. This is not a full loader, no-holes or performance certification; existing tile-fetch failures and previously recorded acceptance blockers remain separate.
- **Revisit when:** native tile bounds replace the current conservative world extent, diagnostic clipping becomes a measured bottleneck, or a newer Storybook exposes category expansion defaults.

## Scoped overview ownership and render-thread work

- **ID / date / status:** `COVERAGE-DIAGNOSTIC-WORK-20260914` / 2026-09-14 / implemented; supersedes the independent global Legend window/control above.
- **Context and constraints:** keep legends and options with their component; default to a map overlay, offer Off / Overlay / Window, and remove diagnostic-induced render-thread churn without weakening retained coverage.
- **Decision:** one Tile overview settings group owns placement, legend visibility, following, up axis, labels and opacity. The legend belongs to that overview in both presentations; there is no global Legend button. Other scene settings stay in their own group. Metrics no longer rebuild the SVG or toolbar: compare exact pool membership/phases, camera/mount matrices, content revision, target, readiness and options before geometry/SSE work. Share per-snapshot projected errors, memoize the visible SVG and controls, stop hidden queue/chart display work, and sample coverage status independently from camera-driven geometry updates. An unchanged coverage proof does not repeatedly traverse metadata merely to update a counter.
- **Measured loader bottleneck:** a 0–15° camera rotation spent 2701.5 ms of a 5180 ms CPU-profile window inside `retainMeshDetailFrontier`, mostly repeated ancestry scans. Index in-view proposed ancestry once per invocation and keep a local descendant index while editing the result. Visibility is memoized only within that synchronous invocation, never across camera changes. Complete-child, REPLACE, offscreen fallback and retained-detail rules remain unchanged; the helper does not request or evict tiles.
- **Alternatives and disposition:** hiding all debugging would conceal useful information rather than remove redundant work (rejected by requirement). Loosening coverage/pixel targets is unnecessary for this bottleneck (not applied). Worker offloading of DOM/React is incompatible; workerizing the now-small snapshot audit remains deferred, not a measured rejection. No new package or persistent cache was added.
- **Reference setup:** Mac16,5 / Apple M4 Max / 36 GiB; Chrome 152.0.0.0, 1728×998 CSS pixels, no CPU/network throttling. Existing visible Playwright session on full Storybook 4400; source-reading development React/Three bundle, not a production benchmark. Coverage parity view at MapLibre zoom 17, pitch 0; 651 warm resident tiles (~4.75 GB reported resident bytes), 448 displayed initially. Requested/effective error 4/6 px and the 6 GiB ceiling were unchanged.

| Five-second workload | Before | Final result |
| --- | --- | --- |
| Quiet view: sampled diagnostic computation | 66.2 ms | 15.0 ms |
| Quiet view: React work-loop / overview render samples | 162.9 / 31.5 ms | absent from sampled stacks |
| 4.5 s rotation, 0–15°: median frame interval | 24.4 ms | 7.0 ms |
| Same rotation: p95 / maximum interval | 33.7 / 66.1 ms | 13.3 / 27.1 ms |
| Same rotation: observed long tasks | one, 52 ms | none |

- **Evidence boundary:** one initial quiet and one rotating baseline; two post-change rotating observations (p95 13.9 and 13.3 ms), plus the final quiet observation. One interim post-change trace overlapped source reload/texture uploads and is excluded from the warm comparison; it still contained long tasks. Rotation admitted some fringe content (663 before versus 664 final resident entries), so this is a representative local comparison, not deterministic throughput certification. Final rotation still had four active tile requests. The initial post-change profile overlapped a subsequently stopped test runner; the final verified run did not. CPU samples use 1 ms sampling; absence from sampled stacks is not a proof of zero execution. Heap/GPU peaks and cold-load performance were not measured. Existing floor 73/75 and two uncovered fallback roots remain acceptance issues, not fixed by this change.
- **Validation:** 79 focused mesh-frontier tests pass. A new 128-family test checks identity-level output parity and bounds parent/visibility reads, then changes view demand to catch stale cross-frame indexing. Visible UI checks confirm default Overlay, zero map grids in Window mode, one window grid with its nested legend, no grids in Off mode, and restoration to Overlay. No full build or merge-ready claim.
- **Artifacts:** `output/playwright/coverage-debug-{idle-before,moving-before,idle-after,moving-after}.log`, `coverage-nested-overview.png`, and `profile-coverage-ui{,-moving}.js`. Run the scripts through the existing visible Playwright CLI session's `run-code`; they select the Coverage iframe tab, settle bearing 0 for two seconds, then sample five seconds. Do not overlap source edits or unrelated interactions when repeating.
- **Revisit when:** larger resident frontiers expose another nonlinear step, dependency versions change, or full cold-load/drag acceptance is requested. Scope additional work to measured bottlenecks; keep coverage proofs intact.

# TILE-CONSOLIDATION-20260914

- **Date / status:** 2026-09-14; integrated locally, uncommitted, user visual review pending. Not production acceptance.
- **Boundary:** one local branch, `feat/tile-loading-manager`, contains the current work since `3210144e9897d07879a21753f13504c11cfb94b3`. That commit is the comparison boundary, not the branch base. A fresh authenticated fetch of `origin/dev` returned `d08858ab581c8612c38e2846d0c14ec5b8e2f386`; the existing WIP checkpoint `a5ed4eee1` already directly descends from it. No rebase or remote mutation was needed.
- **Decision:** combine the newer manager/camera/lighting/diagnostic work with the source worktree's standalone Geoportal integration, metadata, reference surfaces, bounds/FOV fixes, cache experiment and preview script. Three-way comparison against `3210144e9` preserves the later upstream changes instead of copying an older checkout over dev. Do not revive rejected tiled-shadow or ground-handoff experiments merely because they appear in earlier iterations of this work.

## History reconciliation

Times below are UTC unless a commit ID supplies the exact Git timestamp.

| Evidence | Current disposition |
| --- | --- |
| Earlier iteration, 2026-09-09 to 2026-09-12 | Extent floor, cascade, motion cancellation, metadata hints and diagnostics retained, with subsequent manager fixes taking precedence. |
| Commits `799311884`, `77a378a52`, `54e3c61d1`, `3268f5845`, `1c4bc3989`, `7837911eb` | Standalone mesh style, ground/far-plane handling, persistent floor and fallback publication reconciled into the current branch. |
| Earlier iteration, through 2026-09-13 | Reference/datum/horizon work retained. Earlier failed shadow pipelines remain rejected; static-ECEF/local-fit compensation and general closest-point distances are not claimed complete. |
| `fdef8701b`, 2026-09-13 02:54 UTC, plus source uncommitted files | Reference stories, source-height/NoData queries, shader bounds padding, public FOV/center-elevation fixes and cache evidence lifted. Reference files have later local mtimes through 2026-09-13 06:33 UTC; mtimes do not prove task attribution. |
| `a5ed4eee1` and later manager work | Camera demand, current-request cancellation, zoom reserve, multi-camera/light/night stories, telemetry controls and quality symbology retained. |

Historical test/performance statements are not current acceptance results.

## Metadata and one loading implementation

- The ad-hoc `metadata.carmaConf["3d"]` format is preserved, including `tilesetUrl`, `providesTerrain`, `basemap`, both error targets, colour correction, `entry.level`, level/error/tile/byte statistics and `entry.prefetch` paths. Geoportal's deployable public JSON remains; Storybook's coverage/camera/reference consumers share one fixture. A regression test compares both host JSONs and verifies forwarding of the entry hints into the runtime.
- One production `new TilesRenderer` construction remains, in `three-tiles-runtime-attachment.ts`. The unused `engines/threejs/Tiles3dLayer` factory and exports were removed; an architecture regression prevents its return. Reusable LOD camera/decoder primitives remain in Three.
- The two React layer adapters both call `buildThreeTilesRuntime`; neither owns a separate tile cache. Raster DEM decoding/geometry still needs its format-specific runtime, sharing scene, camera-demand and receiver/caster contracts; this is not a claim that raster and 3D Tiles payload processing are identical.
- Source-only `MetricSparklines`/`sparkline-points` had no remaining consumers after `StripChartPanel` replaced the diagnostic display, so they were not reintroduced. The old committed history retains them. Identical deployed fixtures are not extra loader implementations.
- The semantic index was generated before the duplication audit and narrowed with source/consumer searches. No new shared helper or compatibility alias was introduced.

## Current validation

- Full MapLibre suite: **922 passed, 11 failed** in 81 files. The failure set matches the earlier WIP: terrain-selection dispatch, memory admission, three module line budgets, three corridor-demand cases, partial corridor readiness and two traversal cases. This is not a green merge gate.
- Additional checks: three shared LOD-camera tests and six reference-surface math tests pass. The metadata and replacement-architecture regressions are included in the full suite.
- Full `stories:storybook` runs on **4400 from `tile-loading-manager`**, not the old worktree or a narrow preview. Both collaboration submodules were initialized at dev's recorded revisions; no gitlink/manifests changed.
- Browser index: **18 entries**, comprising Coverage, six camera views, four light/night entries and seven reference presets. Coverage was visually inspected; facade, Barmen night traffic and mesh/terrain comparison each rendered with no page errors or Vite overlay in startup probes. The whole-town entry remains explicitly disabled; facade presets retain review labels.
- Coverage still reports **73/75** loaded floor tiles with two unresolved fallback cuts. Startup canvas checks are not proof of cold-load, animation, offscreen-shadow or sustained no-holes correctness.
- Raw local logs: `consolidated-manager-suite.log`, `consolidated-reference-tests.log`, `consolidated-metadata-tests.log`, `consolidated-browser-inventory2.log`, `consolidated-browser-smoke.log`. Screenshot: `output/playwright/consolidated-coverage.png`. Existing root-barrel violations remain; no new violation was introduced in the touched engine barrels.

# Motion throughput follow-up (2026-09-16)

**ID:** MESH-MOTION-THROUGHPUT-20260916. **Status:** implemented, targeted
tests pass; historical visual/performance parity remains open.

The nearest branch checkpoint before Monday noon is a5ed4eee1 (2026-09-14
10:00 CEST), followed by c578a2ee6 at 17:13. These are not an exact capture
of the uncommitted noon state. Do not treat a blanket rollback as parity.

Two bounded changes retain the newer frustum-relative error and replacement
tests, complete fallback cuts, cancellation, memory caps and shared camera union:

- Skip additional-camera bounds transformation/evaluation when the compiled
  camera set contains only the main observer. Compute additional-camera fallback
  error only when the full union did not already return an answer.
- Zoom uses the existing eight-download motion cap instead of serializing
  network work at one. Main-thread parsing remains at one job during zoom;
  memory and parse-backlog admission gates still apply. This does not authorize
  a larger cache or unbounded decode concurrency.

**Evidence and limits:** Chrome 152 / Apple M4 Max, running Storybook development
scene, 6 GiB pool, requested 4 px, zoom sequence 15/19/16/18 with 350 ms ease
and 550 ms steps. One instrumented warm movement run before/after the camera
fast path counted 846144/70586 evaluate calls and 218.9/132.9 ms cumulative
evaluation time (nested clipping included); clip counts were 24966/16548.
Instrumentation uses performance.now around evaluate/intersectionVertices.
Pool states differed, these were single runs without controlled warm-up, and
instrumentation adds overhead: not an end-to-end speedup or Monday parity claim.
Both runs ended at effective 4 px. Subsequent network-cap smoke testing observed
8 motion download slots, 1 parse slot, and intact backlog gates (4/0 downloads).

194 focused camera-demand/frontier/policy/spatial/diagnostic tests plus four
loading tests passed. New tests verify no bounds work for absent additional
cameras, preserved union SSE, newly added secondary cameras, zoom parse limits
and backlog/pause gates. They do not prove visual coverage at every instant.

A browser-cache reload first published a surface around 2.54 s and first
reported requested-target convergence at 19.36 s in one run. A later cold-pool
movement run kept a non-empty published frontier in 54 samples but still had
frame-interval p95 104.2 ms / max 361.7 ms and had not converged 2.5 s after
the final gesture. Non-empty frontier is not a no-hole certificate. Further
DevTools evaluation subsequently stopped returning, so this tail-latency and
startup issue remains open; do not describe the work as performance acceptance.
The machine still reported about 15.5 GiB free physical pages; no process-level
GPU/heap peak or network-isolated download comparison was obtained.

**Revisit:** repeat cold-pool and warm-revisit sequences with diagnostics off/on,
dump per-tile queue/parse/upload timing, and inspect long main-thread frames.
Do not trade completeness or restore invisible-near-box overrefinement for a
lower timing number.

# Frustum-relative replacement and error

**ID:** FRUSTUM-REPLACEMENT-20260914. **Status:** implemented, focused tests pass;
interactive performance and image acceptance pending.

**Context:** Historical receiver replacement recursively required invisible
sibling payloads. At the frustum perimeter this created unnecessary support
downloads. Whole-box distance also let an invisible near extension overstate
the error of a visible far sliver.

**Decision:** Receiver completeness excludes known offscreen branches (unknown,
unprocessed bounds still block replacement). Keep the existing resident ancestor
policy and atomic family transition; no new eviction policy. Main observer and
additional cameras use one demand evaluator. Perspective error uses minimum
positive view depth of the visible conservative box intersection, with an
interior-corner fast path. The vendor whole-box error must not override that
result. Caster corridor requirements remain separate and unchanged.

**Alternatives:** Queue priority alone is insufficient by inspection. A global
radial monotonicity constraint on actual error is deferred: geometry, relief,
camera pitch and additional observers can legitimately change it. Equal-depth,
equal-error single-camera rows must not develop peripheral refinement spikes.

**Evidence:** 111 focused tests across camera demand, receiver frontier and
runtime spatial selection pass. Added invisible-near-extension, radial-row,
offscreen support and newly-visible sibling fallback regressions. These tests
are not GPU, browser throughput or visual no-flicker measurements.

**Revisit:** Profile boundary-heavy views before performance acceptance. The
intersection currently uses conservative world AABBs, not tight OBB clipping;
the existing plane-triple clipper is used only when the nearest corner is outside.
No claim of exact per-surface projected error or universally monotonic LOD.
# MOTION-STRESS-AUDIT-20260916

Ten height-adjusted fast zoom/pan/revisit cycles compared 1/2/4 parser slots,
8/16 download ceilings and 20/4 px motion stages. Keep existing production
settings: four parsers and the blanket 4 px motion stage worsened p95 frame
cadence. No non-baseline offscreen job starts during movement were observed,
but already-running decoders can finish after leaving the viewport. Remaining
coverage flags, decode/eviction churn and the pending 512 MiB–25% protected floor
policy prevent optimum/no-holes acceptance. Pan prediction is deferred pending
useful-residency and visible-quality measurements. Full method, numbers and
limitations: [motion stress report](benchmarks/viewport-motion-20260916.md).
No production loader change was made by this experiment.

# VIEWPORT-BACKPRESSURE-20260916

**ID / date / status:** VIEWPORT-BACKPRESSURE-20260916 / 2026-09-16 /
implemented, focused regressions; end-to-end speedup not certified.

**Context and constraints:** Payload queues park lower-ranked cameras and
offscreen work behind live foreground requests. The downstream backpressure
previously counted those parked buffers too: 24 parked parses stopped every
download, including the foreground needed to release the parked work. Do not
trade responsive input or coverage for a nominal system-utilization percentage.

**Decision:** At the hard backlog threshold, re-evaluate current camera ranks.
Stop downloads when the highest-ranked parse backlog itself is full. When only
lower-ranked buffers fill it, allow a bounded four-download foreground lane.
The queue's existing eligibility guard still parks background work; memory/pause
admission still wins. Rank evaluation runs only at the hard threshold. No changes
to publication, eviction, parser parallelism, movement SSE or speculative prefetch.

**Alternatives and disposition:** Blanket higher motion concurrency is not
adopted. An 8/16/16/8 warm trial increased average active moving downloads from
4.77/3.58 to 6.72/5.92 but did not establish better useful throughput. Queued parse
buffers peaked at 181/216 versus 213/203; p95 RAF intervals varied 76.5–90.8 ms.
System contention was materially above earlier tests (one Chrome renderer sampled
at 691.5% process CPU, about seven logical cores; not uniquely attributed to this
tab). These runs do not establish an optimum or causal frame-time regression.
Blanket 80% system CPU/network saturation is not the controller target: byte
capacity, thread bottlenecks and useful visible work differ from slot occupancy.

**Evidence:** Focused tests reproduce zero download capacity before the fix and
four afterward for offscreen and secondary-camera backlog, both moving and idle;
they retain same-priority backpressure, fresh-rank reversal, pause and queue wakeup.
Existing view-refresh tests pass except `wakes an idle pipeline at the memory
relaxation deadline only once` (expected 6, actual 4), reproduced with this patch
removed through a test-only source transform. No unrelated expectation was weakened.
Warm motion-saturation trial results are retained as local raw evidence and are
not part of the publication tree.
Use the motion harness with a temporary `downloadQueue.maxJobsPerOrigin` setter
override that maps 8 to 16 only while moving; restore the original descriptor
after the four runs. Parser limits, memory gates and 4/0 backlog caps stay intact.
An earlier trial interrupted by Storybook hot reload was excluded.

**Revisit when:** Isolated CPU/network measurements and exposed-surface quality
measurements show sustained foreground starvation without memory/commit pressure.
Existing source-floor failures and no-holes acceptance remain separate blockers.

# VIEWPORT-PREPARSE-PREEMPTION-20260916

**ID / date / status:** VIEWPORT-PREPARSE-PREEMPTION-20260916 / 2026-09-16 /
implemented with focused queue regressions.

**Context and constraints:** The user permits cancellation or pausing of lower
priority downloads/processing in favor of the live viewport. Active lower-rank
fetches are already preempted for waiting foreground requests. Ready buffers
normally remain parked, but a foreground buffer can arrive after a background
parse callback was admitted and before its asynchronous pre-parse yield ends.

**Decision:** Recheck current camera priority at that boundary. If a higher-rank,
still-needed parse is waiting, abort the lower-rank request through native cache
removal before entering GLTF work; release its slot and permit later re-request.
Metadata, equal-rank work and already published coverage are not targeted. Normal
queue parking continues to preserve downloaded buffers whenever possible.

**Alternatives:** Interrupting a synchronous GLTF call or an already-running
shared decoder worker is not implemented; aborting a promise alone would falsely
report released compute capacity. Do not restart such work merely for utilization.

**Evidence:** Nine focused priority/parking/yield tests pass. The new case verifies
that still-needed background content never enters its decoder when foreground
work arrives across the yield, foreground completes, and background can be
requested again afterward. Log: `carma-preparse-preemption.log`.
No new end-to-end speedup or no-holes claim. Revisit if the decoder gains genuine
task cancellation or resumable processing.

# UNIFIED-VISIBLE-SSE-20260916

**ID / date / status:** UNIFIED-VISIBLE-SSE-20260916 / 2026-09-16 /
implemented; focused geometric/admission regressions, no full coverage acceptance.

**Context:** Traversal retained the vendor's distance to the uncut bounding volume,
while publication/retention already used clipped visible camera depth. Taking the
maximum of both preserved unnecessary edge refinement. Lower camera scheduling
priority also implicitly relaxed that camera's declared pixel target.

**Decision:** For visible tiles with compiled camera demand, traversal now replaces
the vendor error with the same metric used by publication/retention. Native volume
culling remains; offscreen camera/corridor admission and coverage-support traversal
overrides remain separate. Bounds are transformed into a conservative world AABB
and clipped to each camera frustum. Perspective error uses the minimum positive
view-space depth of that intersection, geometric error scaled by the scene transform,
and the larger pixel focal length from the two projection axes and viewport sizes.
Asymmetric projection/padding is taken from the camera matrix, not an assumed canvas
center. Orthographic error does not depend on camera distance. This is a bounds-based
estimate, not sampled mesh depth, depth-buffer occlusion or an exact pixel certificate.

Across overlapping cameras, maximum normalized `error / requestedTarget` wins;
camera priority affects scheduling only. Additional cameras retain their own targets
even under a relaxed main pipeline stage. Finite memory may prevent convergence;
that must not silently redefine a secondary camera's request. Cached camera SSE is
merged with current shadow-receiver demand rather than returned before that demand
is checked. Existing receiver masks already union overlapping corridors using their
strictest caster geometric-error requirement / maximum pixels per metre.

**Alternatives:** Centroid/farthest-corner estimates are not adopted because they
can underestimate the near visible part. Uncut closest distance and max(native,
clipped) are rejected by the edge regression. Exact OBB/surface clipping is deferred.

**Evidence:** Tests cover symmetric/off-axis/orthographic traversal parity with the
shared metric, invisible box extensions, strict lower-priority overlapping cameras
in either order, and changed shadow demand despite a cached camera result. The
contentless-routing fixture now derives its expected SSE from actual projection,
depth and geometric error instead of a mocked vendor pixel value. The wider run
still has the previously recorded three corridor failures and one memory-relaxation
failure; see `carma-unified-sse-third.log`. Camera-order follow-up:
`carma-unified-sse-camera-final.log`. No production build or commit.

**Revisit when:** Real-mesh measurements show world-AABB inflation is material, or
when a shared memory-pressure policy is explicitly designed for all requested views.

# MULTI-CAMERA-OVERLAP-20260914

**Status:** implemented with focused regressions; sustained visual/memory acceptance pending.

A shared pool's coarse stage/pressure target must not lower the primary observer's requested quality when a wider secondary receiver overlaps it. With additional cameras, compile the main observer at its requested target. The original secondary-target relaxation is superseded by UNIFIED-VISIBLE-SSE-20260916: all additional cameras now retain their own requested targets too. Feed the maximum normalized union error back into native traversal, not only into diagnostics/retention. Otherwise native traversal can publish a coarse parent that satisfies the global stage but violates an observer.

Priority controls which work starts first; the strictest overlapping normalized demand still wins. This preserves demand, not an impossible guarantee of convergence when primary content alone exceeds memory. Single-observer policy remains unchanged.

Validation: current-view refresh regressions exercise both terrain-providing and building-only mesh paths, an 8px global stage with 2px primary demand, repeated secondary zoom changes, and native traversal propagation. Shared camera-demand tests also cover union semantics. The real-manager story `tile-loading-manager-multi-camera-overlap--orbit-and-overlap` loops through separate orbits and nested top-down views one to two zoom levels apart; pause retains its pool. Its 1GiB stress ceiling deliberately exposes pressure. Browser observed 2px requested / 8px effective before the fix; no blanket no-holes or frame-rate acceptance claimed.

# Base-pass backlog gate (2026-09-18)

**ID / date / status:** heading anchor `#base-pass-backlog-gate-2026-09-18` /
2026-09-18 / measured rejection; not shipped.

**Context and constraints:** The parse backlog gate of
[VIEWPORT-BACKPRESSURE-20260916](#viewport-backpressure-20260916) only holds
once `meshBaseCoverageReady` is set. A 2026-09-18 shadow cold-start profile
showed a parse backlog of 1259 buffers and a download queue of 4646 requests,
which suggested applying the soft (4 downloads) and hard (0 downloads)
thresholds during the base pass as well.

**Decision:** Keep the base pass exempt. The backlog came from the shadow
add-on bypassing the base-pass staging (effective target at the requested
value from the first frame, no refinement-support tiles); with that bypass in
place the gate only reorders downloads towards the highest-ranked in-view
tiles and delays base coverage. Without shadows the base pass never builds a
backlog (parse queue at most 1-2 buffers), so the gate has nothing to do.

**Alternatives and disposition:** Gate during the base pass: measured
rejection (evidence below). Fix the staging bypass instead: implemented
separately (the shadow add-on now follows the base-pass staging).

**Evidence:** Playwright headless Chromium (chromium_headless_shell-1155,
`--use-gl=angle --use-angle=metal`), Apple M4 Max, viewport 1108 x 586 at 2x,
dev server of `feat/mesh-tile-loading-manager` at 2c8448b0e, legacy mesh2024
style with diagnostics on, warm CDN, fresh browser context per run, 500 ms
in-page samples. Base coverage ready (`meshBaseCoverageReady`) after the style
was added: no shadows 4.0 s / 4.0 s before, 4.0 s after (parse queue peak 1,
identical timelines); shadows on 9.6 s / 9.5 s before, 12.0 s / 12.0 s with the
gate (parse queue peak 132 / 131 before, 28 / 28 with the gate; download queue
peak 116 before, 135 / 119 with the gate; long tasks 51 / 46 before, 48 / 48
with the gate). Median download 82-113 ms in all runs; the network was not the
limit. Two runs per shadow condition, one no-shadow run after; no warm-up runs.
Raw JSONL series stay in the session scratchpad, not in the tree.

**Revisit when:** the shadow add-on respects the base pass and a shadow cold
start still shows a parse backlog above the hard limit during the base pass.

# Shadow add-on follows the base-pass staging (2026-09-18)

**ID / date / status:** heading anchor
`#shadow-add-on-follows-the-base-pass-staging-2026-09-18` / 2026-09-18 /
implemented; cold-start evidence below.

**Context and constraints:** Seamless whole-tileset base coverage is not
optional, and the load order on a cold start is fixed: the in-view LOD pyramid
from the coarsest cut to the initial target, then seams and base coverage
inside to outside, then the view refined to the idle target, then the rest.
The shadow simulation is an add-on; it adds receiver and caster demand but
must not change that order, and a view without shadows must never pay for
corridor logic. With a shadow view present from the first frame the runtime
skipped the staging (`applyErrorTargetPolicy` jumps to the requested target
under `shadowView`, the ancestor bootstrap is off, the receiver cut ignores
the initial target), so the view loaded at full detail while base coverage
waited: 9.6 s to `meshBaseCoverageReady` against 4.0 s without shadows, parse
backlog above 130 buffers, no refinement-support tiles.

**Decision:** A terrain-providing runtime keeps the add-on's view pending
(`pendingShadowView`) until its initial base pass is done, the point where
`applyErrorTargetPolicy` would start the idle refinement: view cut ready at
the initial target and the whole-extent reserve settled
(`meshInitialBasePassDone`). Until then the mesh loads exactly as without
shadows and the plain publication assigns receiver and caster roles, so
shadows still fall on the coarse cut. Then the pending view is applied and the
corridor design runs unchanged; later view changes apply at once and clearing
the view never waits. Runtimes without a base pass apply views immediately.

**Alternatives and disposition:** Staging the effective target under an
active shadow view: measured rejection. The corridor publication only
publishes at the requested target, so nothing was published at the initial
target, `readyAt(initialTarget)` never held, the target stayed at 16 px for
the whole run, the traversal grew to 3581 in-frustum tiles with a parse
backlog of 1292 and nothing became visible. Also publishing the receiver cut
at the staged target with the initial-error family limit: rejected by the
corridor specs (a partial family replaced its parent and the root fallback
was dropped). Gating downloads on the parse backlog during the base pass:
measured rejection, see the previous record.

**Evidence:** Playwright headless Chromium (chromium_headless_shell-1155,
`--use-gl=angle --use-angle=metal`), Apple M4 Max, viewport 1108 x 586 at 2x,
dev server of `feat/mesh-tile-loading-manager`, legacy mesh2024 style with
diagnostics on, shadow add-on enabled from the URL hash, fresh browser context
per run, 500 ms in-page samples, two runs per condition and one no-shadow
control, no warm-up. `meshBaseCoverageReady` after the style was added: with
shadows 9.6 s / 9.5 s before, 5.5 s / 6.0 s with the deferral; without
shadows 4.0 s before and after. With the deferral the shadow run stages like
the plain run (effective target 16 px with up to 511 refinement-support
tiles until ready), the view applies at about 6.5 s and the target drops to
6 px. First 30 s: parse queue peak 132 / 131 before, 110 / 124 after (now
after the handover instead of from the first second); long tasks 51 / 46
(3.1 / 2.9 s) before, 44 / 38 (3.0 / 2.7 s) after; frame p95 median 67 ms
before, 67 / 50 ms after. Runtime state through the diagnostics registry:
pending view until the base pass is done, then applied, corridor cut
converged at 166 receivers / 257 casters by 40 s (baseline 151 / 242).
Screenshots at 3, 5, 6.5, 8, 10, 14 and 20 s show the mesh seamless
throughout; the headless harness rendered no cast shadows in either build,
so the shadow pass itself is not compared here. Pan and zoom phases after
the handover are unchanged against the baseline (visible set collapses after
a pan, 3600-6000 queued downloads on zoom-out), which is the corridor
design's own behaviour and tracked separately. Engine suite: the same 18
failures as the branch baseline, two new tests pass. Raw JSONL series and
frames stay in the session scratchpad.

**Revisit when:** the corridor publication can publish per stage, or a
runtime never completes its initial base pass (the view then stays pending;
no timeout is applied).

# Main-thread glTF parse share (2026-09-18)

**ID / date / status:** heading anchor
`#main-thread-gltf-parse-share-2026-09-18` / 2026-09-18 / measured; worker
parsing deferred.

**Context and constraints:** The mesh parses b3dm payloads with two
main-thread parsers. Moving glTF parsing to a worker only pays off if the
main thread spends a material share of its busy time in parse stacks.

**Decision:** Keep main-thread parsing. Parse stacks (parseTile, GLTFLoader
parse, the glTF 1 upgrade fetchData, Draco decode and texture upload) are
under 10 % of main-thread busy time during a cold start, with or without
shadows. The main-thread time goes to per-tile demand evaluation and to
MapLibre's own render, terrain lookups included, which are the targets of
the follow-up blocks instead.

**Alternatives and disposition:** Worker glTF parse: deferred, not evaluated
in code; the measured share caps its benefit at roughly 0.4 s of a 6 s busy
window (no shadows) and 0.6 s of 14.6 s (shadows). Per-tile demand
evaluation and the native terrain under a mesh: taken up in the follow-ups.

**Evidence:** CDP sampling profiles (500 us interval) of the dev server on
`feat/mesh-tile-loading-manager` at 7aac18ea9 plus the drape check throttle,
headless Chromium on Metal, Apple M4 Max, 1108 x 586 at 2x, legacy mesh2024
style without diagnostics, one run per window. Load window 15.6 s without
shadows: busy 5.9 s; inclusive parseTile 75 ms, GLTF parse 72 ms, glTF 1
upgrade fetchData 61 ms, uploadTexture 192 ms, decode 25 ms. Load window
15.7 s with shadows: busy 14.6 s; parseTile 149 ms, fetchData 116 ms,
uploadTexture 250 ms, decode 50 ms. Top self time in both windows: MapLibre
getTerrainData 475 / 974 ms, tile-camera-demand intersectionVertices 307 /
553 ms, GC 390 / 651 ms; with shadows the inclusive demand family
(getTileScreenError 948 ms, getTileCameraDemand 773 ms, evaluate 654 ms)
and the receiver mask match 275 ms. Pan window 39.5 s without shadows: busy
13.0 s, GC 3.4 s, drape check matchesMapStyleImageRevision 95 ms (432 ms in a
29.6 s window before the throttle). Raw profiles stay in the session
scratchpad.

**Revisit when:** the demand evaluation and native terrain costs are gone and
parsing becomes the largest remaining main-thread share, or payload sizes
grow (higher resolution mesh).

# Tileset hierarchy cache kept (2026-09-18)

**ID / date / status:** heading anchor
`#tileset-hierarchy-cache-kept-2026-09-18` / 2026-09-18 / measured; the
worker-backed hierarchy cache stays.

**Context and constraints:** The `TilesetHierarchyPlugin` restores the
static tileset hierarchy from a worker-built index instead of fetching each
tileset JSON page natively. The question was whether this copy of the tree
stalls the start or brings no measurable benefit on cold starts and reloads;
in that case it was to be removed. The style contract gained
`hierarchyCache: false` so a style can switch it off without a code change,
which is also how the comparison was run.

**Decision:** Keep the plugin. It cuts the tileset JSON round trips of a cold
start from 24 to 6 and of a reload from 13-15 to 4-6, and it does not
stall. Time to complete base coverage is within run-to-run noise on a cold
start and marginally earlier on reloads; the first published cut can arrive
later on a cold start while the index is built.

**Alternatives and disposition:** Native JSON loading only: measured
rejection on round trips, no measurable difference on time to ready. A
smaller or lazily built index: not evaluated.

**Evidence:** Playwright headless Chromium (Metal), Apple M4 Max, persistent
browser profile per variant (fresh for the cold load, kept for the reloads),
dev server of `feat/mesh-tile-loading-manager` at 7aac18ea9 plus the block D
changes, legacy mesh2024 style with diagnostics on and `hierarchyCache`
switched per style, warm CDN, no warm-up runs. Requests are counted from the
resource timing buffer after the style was added until
`meshBaseCoverageReady`. Cache on: cold ready 5.0 s and 6.9 s (two runs),
tileset JSON requests 6 and 6, first published cut 3.3 s and 3.5 s; reloads
ready 1.63 s and 1.66 s with 4 and 6 JSON requests, first cut 0.9 s. Cache
off: cold ready 6.5 s and 5.6 s, JSON requests 24 and 24, first cut 2.3 s and
3.5 s; reloads ready 1.70 s and 1.77 s with 13 and 15 JSON requests, first cut
1.04 s and 1.06 s. b3dm requests to ready were 178-198 in every run. Transfer
sizes are not exposed by the tile CDN. Raw JSONL stays in the session
scratchpad.

**Revisit when:** the tileset changes shape (more or larger pages), the index
build time grows, or a first-display budget matters more than time to
complete base coverage.

# Per-tile frame work: demand memo and drape check throttle (2026-09-18)

**ID / date / status:** heading anchor
`#per-tile-frame-work-demand-memo-and-drape-check-throttle-2026-09-18` /
2026-09-18 / implemented, measured on single profile runs.

**Context and constraints:** The 2026-09-18 cold-start profiles (see the
parse share record above) put the per-tile camera demand family
(getTileScreenError, getTileCameraDemand, evaluate, intersectionVertices) at
1.5-2 s of a 15 s shadow load, and the drape cache's byte comparison of
versionless sprite images at 432 ms in a 30 s no-shadow pan. Neither is
shadow-only work: the demand family runs in the plain path too, the drape
check belongs to the basemap projection.

**Decision:** `getTileCameraDemand` memoises its result per tile for the
lifetime of the compiled tile camera set (a new object per camera
signature), because priority, attachment and shadow selection ask for the
same tile several times per frame and the result only changes with the
cameras. The drape cache compares versionless sprite bytes at most every
200 ms (`VERSIONLESS_IMAGE_CHECK_INTERVAL_MS`); versioned images keep their
constant-time check on every call, so an eventless updateImage is detected
within the window instead of within a frame.

**Alternatives and disposition:** Allocation-free intersectionVertices:
deferred, not evaluated; the memo removes most calls. Wrapping
map.updateImage to detect eventless writes exactly: rejected by inspection
(instance monkeypatching, restore-order hazards with several caches).
Receiver mask match, MapLibre terrain lookups under a mesh
(`getTerrainData`, kept on by design for the label drape) and GC pressure
while panning (3.4 s of 13 s busy): open.

**Evidence:** CDP sampling profiles as in the parse share record, one run
per window, dev server at 7aac18ea9 plus these changes. Shadow load
window, inclusive: getTileCameraDemand 773 ms before, 49 ms after; evaluate
654 ms before, absent after; intersectionVertices 626 ms before, absent
after; getTileScreenError 948 + 725 ms before, 330 + 251 ms after; main
thread busy 14.6 s before, 13.3 s after (of 15.7 s). No-shadow load window:
intersectionVertices 307 ms self before, 8 ms after; busy 5.9 s before,
6.3 s after (run-to-run noise, MapLibre and texture uploads dominate).
No-shadow pan window: matchesMapStyleImageRevision 432 ms in 29.6 s before,
95 ms in 39.5 s after. Specs: engine suite unchanged against the branch
baseline. Raw profiles stay in the session scratchpad.

**Revisit when:** the local frame can change without a camera signature
change (the memo keys on the compiled camera set only), or a host updates
sprite images in place more often than the 200 ms window tolerates.

# Resident cache ceiling policy (2026-09-18)

**ID / date / status:** heading anchor
`#resident-cache-ceiling-policy-2026-09-18` / 2026-09-18 / implemented.

**Context and constraints:** The mesh needs a large resident cache on a
desktop (a wide extent plus a refined view exceeded the former 2 GiB ceiling
and stalled the zoom-in), while an iPhone kills the tab and reloads it when
the page grows past the memory it grants. The shadow add-on requests a
24 GiB mesh budget, and a consumer budget used to raise the ceiling on every
device, so with shadows on an iPhone ran into that reload loop. The desired
behaviour: 6 GB optimistically where the client permits, otherwise the size
the client really supports, remembered for later sessions.

**Decision:** Desktop class ceilings scale with reported device memory at
768 MiB per GiB between 768 MiB and 6 GiB and default to 6 GiB when the
browser hides memory; phones (384 MiB) and tablets or other mobile devices
(512 MiB) keep hard caps that a consumer or style budget can only lower,
never raise. A learned ceiling persists in localStorage
(`carma:tiles3d-cache-ceiling`): an allocation failure or a lost WebGL
context learns 75 % of the bytes resident at that moment and applies it at
once; a session that never ended cleanly (no page hide, no dispose) learns
50 % of its peak resident bytes on the next start; three clean sessions that
used at least 90 % of a learned ceiling raise it by half again, up to the
unlearned ceiling. Hosts opt in with `persistCacheCeiling` (the layer
manager does); tests and stories without it keep the pure policy.

**Alternatives and disposition:** Measuring free memory directly: not
possible from a page. Raising phones by consumer budget: rejected by
inspection (the reload loop). Learning only from allocation failures: not
sufficient, a memory kill produces no event; the session probe covers it.

**Evidence:** The iPhone 16 simulator on this Mac cannot reproduce the
memory kill (it has the host's memory): with mesh and shadows it ran a minute
without errors, only the vendor's non-uniform-scale warning 400 times. The
policy was verified by state dumps: the simulator's Safari (iOS 18.6) reports
the iOS ceiling with shadows on; headless desktop Chromium reports 6 GiB.
Learning and recovery are covered by `three-tiles-cache-ceiling-memory.spec`.

**Revisit when:** a device class needs a different cap, or the page can read
its memory grant (for example through a future memory measurement API).

# Request gate: metadata stubs and margin tiles (2026-09-18)

**ID / date / status:** heading anchor
`#request-gate-metadata-stubs-and-margin-tiles-2026-09-18` / 2026-09-18 /
implemented, two regression specs restored.

**Context and constraints:** `isTileRequestNeeded` ended with an in-view-only
clause. Two consequences, both on this branch before this change: an external
tileset stub (`hasUnrenderableContent`, no payload) that the native traversal
marked used was never requested outside the view, and prefetch-margin tiles,
which the deferral deliberately does not defer, were never requested either.
A missing stub is worse than a missing payload: `areChildrenProcessed` stays
false, so `canTraverse` stops at the parent, the parent becomes a leaf, its
children are never marked used, and nothing below is ever requested. That is
the zoom-in stall seen from a wide extent: the view stayed at the initial
16 px target with base coverage never ready and an empty download queue.

**Decision:** A used external-tileset stub is always requestable, in view or
not: it is metadata, its cost is one small JSON, and the traversal cannot
proceed without it. The final clause accepts the prefetch margin next to the
main view, which matches the deferral's own margin rule.

**Alternatives and disposition:** Requesting every used off-view tile:
rejected by inspection, that is the unbounded fan-out the gate exists to
prevent. Loosening `canTraverse` instead: not possible, it is vendor code.

**Evidence:** `three-tiles-traversal.spec` "requests an off-frustum
external-tileset stub but defers its off-frustum root content" and "requests
margin siblings at low priority without deferring them" both fail on the
branch baseline and pass with this change; the engine suite goes from 18 to
16 pre-existing failures with no new ones. Browser: see the zoom profile
recorded with the loader performance follow-ups.

**Revisit when:** the margin grows beyond a bounded ring, or stub metadata
becomes expensive (a consolidated subtree file would change that, see the
hierarchy cache record).

# Hierarchy sidecar: measured JSON cost and format candidates (2026-09-19)

**ID / date / status:** heading anchor
`#hierarchy-sidecar-measured-json-cost-and-format-candidates-2026-09-19` /
2026-09-19 / measured baseline, format proposal, nothing implemented.

**Context and constraints:** The mesh hierarchy ships as nested 3D Tiles
external tilesets. On disk (read-only listing of the serving host): 49,632
`tileset.json` documents totalling 1.03 GB, and 2,194,009 b3dm payloads
totalling 1.77 TB, so roughly 2.4 M nodes at about 430 B per node raw and
100 B gzipped. A few routing documents dominate: the largest crawled is
4.83 MiB with 8,146 external children. The question was whether a
consolidated, streamable sidecar would speed up cold starts, and what it
would cost in bytes. Requirement from the tileset side: answer "which tiles
exist here, at which level" for a bounding box, which is also what the shadow
corridor needs.

**Measured baseline (what a sidecar would replace):** geoportal cold start at
the profiled viewport (zoom 16.44), hierarchy cache switched off through the
style so the native JSON path is visible: 21 tileset documents, 6 serial
dependency rounds, p50 123 ms per document, hierarchy span 616 ms (first
request 61 ms after the layer was added, last response at 677 ms), 30.1 MiB
raw and 1.98 MiB gzipped decoded and parsed before the deepest branches can
be requested. The first leaf payload arrives at 355 ms and b3dm requests take
274 ms at p50, so hierarchy and payload fetching overlap: the cost lands on
the deep leaves and on every zoom into a new region, not on the first coarse
image. A small-file round trip to the same host measured 22 ms.

**Format candidates, all existing prior art, nothing invented:**
- 3D Tiles 1.1 implicit tiling with `.subtree` files: availability bitstreams
  at 1 bit per node, bounding volumes and geometric error implied by the
  subdivision (rootError / 2^level), which is the standard form of storing
  everything relative to the parent. About 900 KB for the whole city at three
  bitstreams over 2.4 M nodes, chunked into roughly 600 to 900 files of 1.5
  to 3 KB. A cold start would fetch the root subtree plus one or two covering
  subtrees, so about 5 to 10 KB in one or two rounds. Requires regular
  subdivision, which this tree does not have (8-child, 2-child and
  8,146-child routing nodes), so it needs the dataset generator to emit a
  quadtree; 3D Tiles allows explicit tiles beside implicit subtrees for the
  irregular parts.
- Paged fixed-record binary hierarchy, as in Potree 2.0 `hierarchy.bin`
  (22 B per node plus proxy pages), COPC and EPT hierarchy pages: no
  re-tiling needed. A record of child mask, flags, geometric error as a
  log-ratio to the parent, and six uint16 bounding-box components relative to
  the parent box is about 16 B per node, so roughly 38 MB for the whole city
  against 1.03 GB of JSON, as a typed array with no parse step. The measured
  21-document pyramid is about 70 k nodes, so about 1.1 MB in one or two
  range requests.
- Bounding-box queries over a single file: PMTiles (recursive directories,
  Hilbert order, HTTP range requests) and FlatGeobuf with its packed Hilbert
  R-tree (Flatbush) are the established single-file, range-queryable
  containers; COPC does the same for octrees. Hilbert or Morton ordering
  turns a box-and-error query into a few contiguous key ranges, which is what
  the shadow corridor wants instead of walking loaded metadata.

**Quantization:** safe if bounds are rounded outward, so the stored box always
contains the true box. Frustum, corridor and screen-error tests then stay
conservative and cannot produce a false negative. Geometric error quantized
as a ratio to the parent keeps the refinement chain exact enough for the
stage comparisons, which are ratios themselves.

**Expected gain, from the numbers above:** the hierarchy part of a cold start
goes from 6 rounds and 616 ms to one or two rounds, about 25 to 60 ms with
implicit subtrees and about 60 to 120 ms with the paged binary, and the JSON
parse of 30.1 MiB disappears. On a phone, where the round trip is 100 to
200 ms instead of 22 ms, the same six rounds cost 0.6 to 1.2 s today.

**Revisit when:** the dataset is regenerated, which is the moment to choose
implicit tiling, or when a measurement of the zoom-into-new-region case shows
the hierarchy is no longer the structural blocker.

## Terrain and the corridor in the tile overlay

**TILES-DIAG-VOLUMES-20260919 / 2026-09-19 / accepted**

**Context and constraints:** the tile overlay knew one source, the 3D Tiles
tree it is attached to. Terrain tiles were invisible in it, although selection
already treats them as boxes, and the shadow corridor had no frustum of its
own beside the main camera. The add-on rule stands: nothing here may change
loading, and the no-shadow path may not pay for it.

**Decision:**
- A terrain tile is a 2.5D tile, a footprint over its elevation range.
  `buildTerrainTileLocalBox` in `core/terrain-selection.ts` is now the single
  box builder, used by selection culling and by the runtime's diagnostic
  volumes, so the drawn box is the culled box.
- `getActiveTileVolumes` reports loading tiles too, with the height range
  known for them (`unknownHeightRange` where none is), so a terrain tile is
  drawn where its payload will land, not only once it exists.
- The capture cuts those boxes with the main and the corridor frustum
  (`projectDiagnosticVolumes`) and packs them as ordinary overlay records:
  ringed when the corridor holds them, dimmed when no camera demands them.
- The corridor camera reaches the debugger through `setShadowView`, which
  every shared-scene runtime already receives, and is published as a display
  camera only (`snapshotShadowCorridorCameras`). It is drawn like any other
  frustum, orthographic included, because that path is matrix-based.

**Alternatives and disposition:**
- Register the corridor as a `TileCameraView`: *deferred*. It would make the
  corridor a demand source for every runtime that reads `tileCameraViews`,
  which is block Z4, not a diagnostics change.
- Carry the per-entry boxes out of `buildTerrainSelection`: *deferred*. It
  widens the worker payload for every frame, including with diagnostics off.
- Terrain as an `OverlayRect`: *incompatible by inspection*. Rects carry a
  `Tile` for hover, labels and selection; volumes have none.

**Evidence:** `tile-diagnostic-volumes.spec.ts` (frustum cuts, footprint
projection, unusable boxes dropped), `shadow-corridor-camera.spec.ts`,
`raster-dem-terrain-*` specs, all green; the two failures in
`tile-diagnostic-overlay.spec.ts` and `terrain-selection-dispatch.spec.ts`
reproduce on the same files at HEAD.

**Revisit when:** the corridor becomes a first-party camera member (Z4), or a
terrain-only session needs the overlay without a 3D Tiles tree to attach to.
