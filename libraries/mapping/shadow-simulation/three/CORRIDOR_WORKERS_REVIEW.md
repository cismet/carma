# Independent corridor workers — review proposal

Status: proposed, not implemented. 2026-09-09.

## Evidence and immediate changes

Reference: Mesh2024, 51.2704513/7.2003812, z20.404, bearing 11,
pitch 37.28, shadow=821;19, internal Codex browser, 64 samples, tiled.
The live UI reported 212 loaded tiles and 124 receiver pages. Before the
changes the eventually completed scene had 15,686 depth / 39,060 colour passes.
These are cumulative counters, not a timed benchmark.

The new watchdog subsequently observed 123 ready pages with zero samples,
one active page, no publication retries and no capture fallback. This identifies
queue waiting, not unavailable caster data, for those pages. A 30-second reload
observation still encountered a timed-out UI click. No CPU/GPU trace was obtained:
the internal-browser connector exposes UI and console, not trace capture.
Network-idleness and GPU-utilisation claims remain unverified.

Implemented small changes: remove viewport-wide soft-start gates; yield an
unready active page if another ready page needs the slot; retain it if no other
work can proceed; reuse the allocation map for unchanged receiver demand;
report 20-second no-progress episodes even without another repaint. Hard work
still submits first. Complete masks, geometry, physical display resolution,
sun-disc samples, bias and target quality are unchanged.

54 focused scheduler/presentation/watchdog tests pass. The 124-page mixed-area
fixture completes without allocation changes between active-page switches.
This proves the scheduling invariant, not an end-to-end speedup. A trial 8 ms
main-thread submission budget was reverted before acceptance: the user requires
work off the main thread rather than trading responsiveness for submissions.

## Ownership and data flow

Main thread: map interaction, versioned input dispatch, bounded upload of finished
scalar masks and final compositing. Never transfer/detach arrays still owned by
visible Three.js geometry. Avoid cloning entire scenes/tilesets on every job.

CPU planning workers: maintain the sparse parsed tileset index, resolve viewport
receivers, search the sunward union/corridors, reuse ancestor/subtree proofs,
fit light/capture cameras, select anisotropic resolution and build sample plans.
The setup is part of the worker pipeline, not a main-thread prelude.

GPU workers: one OffscreenCanvas WebGL2 context per active worker; cached,
versioned geometry only. Reuse the production sampling, bias, clipping,
projection, depth-range and accumulation code, extracted by concern. Do not
implement a second approximately equivalent shadow shader.

Results: transferable scalar Float32 visibility buffer, projection metadata,
and depth only where the existing compositor/persistent format actually needs
it. Read back asynchronously and transfer ownership. No textures or renderer
objects can be shared across WebGL contexts. Measure readback + transfer + main
upload; GPU-only timings cannot establish a benefit.

## Geometry protocol and independent lifecycle

- Register dataset revision, geometry ID/version, local position/index arrays,
  normals when required by production bias, draw ranges/groups, winding and world
  transform. Send only additions/changes/removals. Prefer dispatch from the
  existing decode worker, before main-thread scene construction.
- Jobs refer to receiver and intersecting caster IDs. One geometry can fill both
  roles. Offscreen-only casters never receive shadows. Opaque Mesh2024 requires
  no albedo textures. Alpha-tested, displaced, skinned or instanced content must
  be explicitly supported with parity or rejected; textureless is not a universal
  equivalence for arbitrary materials.
- Key jobs/results by dataset/generator, receiver geometry/caster revision,
  normalized centre sun vector, bias/filter settings, sample pattern and actual
  capture projection/resolution. Camera pan is not physical invalidation.
- States: waiting for geometry → planning → queued → integrating → readback →
  ready to upload → published. Track timings and progress separately per job.
- Preserve visible geometry and completed compatible masks throughout. Changed
  sun uses current hard shadows; reject old-sun asynchronous results. Pause on
  motion; prioritize newly exposed hard coverage on resume. Discard only obsolete
  dependencies, not all work because an unrelated receiver changes.
- A waiting job relinquishes its execution slot. Never await one corridor in a
  loop before submitting independent ready work. Park partial integrations within
  the memory budget rather than restarting unrelated samples.
- Context loss/crashed worker: revoke its leases, preserve main-context captures,
  bounded retry on a healthy context; surface a capability error if unavailable.

## Concurrency and resource policy

### Hard-caster retrieval takes priority over cosmetic receiver refinement

Follow-up view: 51.2703852/7.2008024, z19.258, b11, p37.28, shadow=821;19.
Code inspection identifies a concrete priority inversion: the mesh branch of
`deriveTilePriority` puts every visible refinement in lane 2 and all offscreen
payloads in lane 0. `shadowReceiverCenterness` is ignored in this branch. Both
download and parse queues use this order. Consequently missing hard-shadow
casters can wait behind all receiver refinement requests.

The shared download gate permits at most 16 mesh requests, reduces to 4 at 12
queued parse items and stops new downloads at 24 items, once base coverage is
ready. This bounds memory but also prevents missing caster geometry from entering
while the shared GLTF queue is congested. Increasing network concurrency alone
does not remove synchronous scene creation. Internal-browser state queries timed
out twice in this follow-up; actual queue occupancy in this view is not measured.

Implemented follow-up: metadata discovery stays highest, then missing visible
coverage, proven sun-corridor dependencies, and visible detail. The lane ordering
is covered by focused tests; an isolated latency benchmark is still open.
Reserved admission is not implemented. Reserve downstream geometry decode/commit capacity
as well as network capacity, otherwise the bottleneck merely moves. Preserve the
shared memory ceiling and allow an empty priority lane to lend capacity. Use the
current corridor membership, not every offscreen tile. Test sustained visible
refinement demand cannot starve caster fetch/decode, and caster demand cannot
starve missing viewport coverage. Measure fetch-to-first-correct-hard-shadow,
not just request starts. Geometry-only worker processing is the longer-term fix.

Reuse `libraries/commons/worker-scaling` throughput monitoring and existing terrain
worker lifecycle patterns. CPU core count is a ceiling/input, not the number of
GPU contexts to spawn. All contexts compete for the same GPU and duplicate
geometry/shadow buffers; start with one worker context, measure 2 and additional
contexts only while whole-pipeline throughput improves and drag responsiveness
does not regress. Reserve input/render headroom. Do not multiply the full mesh
pool budget by worker count; account for copied geometry and peak replacement
targets. Cancel failed probes and release their GPU allocations.

Pool-level backpressure bounds pending readbacks and result uploads. Worker jobs
yield between sample submissions for cancellation. Main-thread uploads are
bounded and scheduled separately from pointer handling; an upload itself cannot
be preempted. Cache complete scalar components, not baked basemap colours.
Reuse existing versioned persistent cache and device-measured admission policy.

## Benchmark and acceptance sequence

1. Shared standalone story: opaque plane + elevated occluder, identical capture
   matrices/resolution, samples, bias and sun. Compare same-context production
   output against one worker's transferred result before pool integration.
2. Internal-browser reference view above plus the chimney close-up, unchanged
   Mesh2024 resource and settings. Report browser/GPU/device, native pixel size,
   cache state and source revision; confirm offscreen chimney shadows visually.
3. Compare current implementation, one worker, two workers, then further counts
   only if justified. At least three cold and three warm runs; separate shader
   warm-up. Each reload measurement stops at 30 seconds and reports unfinished
   counts rather than silently extending the run.
4. Record first coverage/hard shadow, first/full soft publication, per-stage
   median/p95, transferred bytes, peak CPU/GPU memory, long tasks/input latency,
   stalled jobs and repeated geometry/capture work. A timer after 20 seconds must
   report the state, dependency/retry/context/resource reason for any active stall.
5. Fixed-camera visibility parity: same receiver/caster set and no missing masks;
   tolerance <=1/255 coverage away from rasterization discontinuities, edge error
   bounded by the configured target texel, plus visual acne/edge checks. Report
   both numeric and screenshot evidence; do not hide failures with blur.
6. Reload, small pan, moveend, animation/time change, LOD replacement, partial
   tile failure, worker/context failure. No visible geometry holes, stale-sun
   masks, duplicate jobs, or recomputation of unchanged completed corridors.

Accept only measured end-to-end improvement without material responsiveness or
quality regression. No default worker count or speedup is claimed by this spec.

## Alternatives

- Larger main-thread time slices: rejected by requirement; no accepted benchmark.
- Promise concurrency in the existing context: cannot move synchronous rendering
  off the main thread; not a worker implementation.
- Full-view worker baseline: benchmark alongside corridors; may amortize setup
  and repeated geometry traversal but sacrifices fine-grained reuse. Deferred.
- Shared depth/sample work for overlapping corridors: potentially avoids repeated
  caster rendering; more complex dependency tracking, deferred until measured.
- WebGPU rewrite: deferred; first reuse the working WebGL2 production algorithm.

Review first: geometry protocol and memory ownership, reuse of the production
shader path, capability policy, then one-worker parity. Pool scaling comes last.
