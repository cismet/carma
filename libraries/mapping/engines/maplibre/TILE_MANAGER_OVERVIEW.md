# Mesh tile manager: responsibilities and storage design

The CARMA mesh tile manager turns a 3D Tiles source, active cameras, quality
targets and resource budgets into a coherent set of drawable tiles. It runs in
the shared MapLibre/Three engine; Geoportal and stories use the same runtime.
Shadows are an optional consumer of that runtime. Raster elevation has its own
processing pipeline and is outside the mesh-cache design below.

**Status:** the loading behavior described first is implemented. The deeper
idle disk prefetch and conditional cached quality floor described under
[Planned storage extension](#planned-storage-extension) are a design proposal,
not current runtime behavior. [Coverage policy](./TILES_COVERAGE.md) defines the
detailed implemented rules; [configuration](./README.md#mesh-quality) lives in
the engine README.

## What comes from the vanilla loader

CARMA builds on NASA's `3d-tiles-renderer`, currently installed at 0.5.3. The
native renderer owns Tile identities, hierarchy traversal, transforms, content
decoding, loading queues, cancellation, scene objects and resource disposal.
It already supports camera-based screen-space error, multiple cameras,
REPLACE/ADD refinement and an LRU cache. CARMA adds application policies through
that runtime rather than maintaining a second set of mesh objects.
See the [upstream renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/v0.5.3/README.md)
and its [native queue/cache implementation](https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/v0.5.3/src/core/renderer/tiles/TilesRendererBase.js).

| Concern | Vanilla renderer | CARMA manager adds |
| --- | --- | --- |
| Selection | Frustum tests and projected geometric error drive traversal. | Shared CSS-pixel demand across host cameras; DPR alone does not request finer geometry. |
| Priority | Native traversal and prioritized loading queues. | Gaps first, then error reduction weighted by clipped viewport-area share; refinement advances through complete error thresholds. |
| Publication | REPLACE/ADD hierarchy semantics and parent fallback while descendants load. | Explicit complete-family publication for REPLACE, no parent/child surface overlap, and preservation of already displayed detail during movement. |
| Coverage outside the view | Ancestor/sibling loading and cache retention. | Complete offscreen LOD rings and a budgeted, full-extent resident baseline after foreground convergence. |
| Resource control | Queue limits and LRU bounds. | Shared demand reasons, foreground preemption, bounded retries, recovery after capacity stalls and device-dependent memory accounting. |
| Shadows | Rendering and extension hooks; upstream also provides shadow examples. | Receiver-derived offscreen caster corridors, deduplication, receiver-matched caster detail and exclusive caster publication. |
| Persistent reuse | Application/plugin integration points. | Validated hierarchy records and an optional persistent render-record cache of the resident base. |

These are differences from the default integration, not limitations of the
upstream extension API. Neither implementation can eliminate source latency,
payload transfer, decoding or GPU upload.

## What the manager does without shadows

1. **Fill missing view coverage.** Missing regions and the metadata needed to
   reach them outrank improving regions already shown. Useful loaded geometry
   remains visible while new work arrives.
2. **Reduce visible error.** Work advances through screen-space error thresholds
   toward the configured target. Reducing a large error over a large fraction
   of the view outranks a small local improvement. Equal error does not imply
   equal tree depth, especially in tilted views.
3. **Publish complete replacements.** A REPLACE parent remains until its next
   drawable family, including required offscreen siblings, can replace it.
   Independent families can advance separately. Motion may relax admission of
   new tiles; it does not downgrade detail already displayed. ADD tiles retain
   their additive semantics.
4. **Extend coverage when foreground work permits.** Full sibling-compatible
   LOD rings connect the view to a coarse whole-extent baseline. Baseline
   payloads stay resident even when absent from the scene, so revisiting a
   covered region does not require another download.
5. **Recover and reuse.** Obsolete demand releases queue capacity, blocked work
   has bounded retry/recovery paths, and optional cache writes yield to visible
   work. A full cache or empty queue is not proof that quality has been met.

Coverage guarantees depend on available source content and enough memory for
the required working set. Admission and publication are separate decisions:
being downloaded does not by itself make a tile safe to display.

## What the shadow addon adds

Visible tiles keep the same observer loading rules and cast directly using
their existing objects. For each displayed receiver, the addon searches the
parallel corridor toward the sun and requests only additional offscreen tiles
that can cast onto receivers. Shared candidates are deduplicated.

Extra casters target the strictest drawable generation required by their
receivers, skipping coarse intermediate payloads. A caster cannot be an
ancestor overlapping a visible tile; relevant caster replacement families
publish without parent/child overlap. Their readiness does not hold back
visible colour refinement. Offscreen textures are deferred unless they affect
the shadow silhouette; embedded texture bytes may still be part of a download.

Time changes invalidate corridor geometry while allowing useful admitted work
to finish into the bounded cache. Current demand takes priority. Shaded and
unshaded views share the same source tiles and persistent base records.

## Three independent resource decisions

| Layer | Purpose | Lifetime and budget |
| --- | --- | --- |
| Resident baseline | A complete coarse fallback across the tileset. | Kept in loader-accounted memory until layer disposal; `baseCoverageMemoryShare` defaults to 10%, configurable within 5–15%. |
| Active display | Current views, replacement support and required casters. | Uses the normal memory budget and quality targets; may be much finer than the resident baseline. |
| Persistent prepared pyramid | Faster, better starting coverage on later visits. | Browser disk storage; deeper preparation need not remain resident. Autonomous expansion is planned below. |

The current persistent cache stores typed geometry, original material data and
decoded textures as IndexedDB render records. It saves parsing/preparation work
where supported, but restored content still needs scene integration and GPU
upload. It currently prepares the resident base, not an autonomous sweep of
all finer levels. The hierarchy cache stores metadata separately.

Both caches validate source URL, source-root revision and loader-build/format
identity. A source changing child payloads at stable URLs must expose a root
or URL revision. A manifest proves complete stored coverage; individual
records must still be available when restored. See
[persistent resident base](./README.md#persistent-resident-base).

## Planned storage extension

### Prepare finer coverage on disk during idle

After active views and required shadows have converged, prepare the next finer
drawable generation across the tileset, then repeat. “One level up” means finer
children here; routing-only JSON nodes are not detail levels. Finish a complete
coverage pass before spending the remaining budget on another deeper pass.
Retain complete coarser coverage while a finer pass is incomplete.

This work has its own disk budget and progress manifest. It does not raise the
resident baseline setting, change active quality targets, or upload an entire
cached level to the GPU. Temporary download/decode/serialization memory is
bounded and released after writing. Foreground requests reuse the same Tile
identity and any useful in-flight work rather than starting duplicate downloads.

Movement, missing coverage or renewed quality demand immediately stops new
background admissions and can reclaim background network/compute capacity.
Preparation resumes from confirmed records on the next idle opportunity. It
does not delay first image or foreground completion and does not assume a
closed or suspended browser tab can keep working.

### Stop at 80% of origin storage quota

The target is **at most 80% total origin storage usage**, shared across tilesets,
tabs and other app data. It is not 80% per layer and is not the `localStorage`
key/value API. `navigator.storage.estimate()` reports approximate origin usage
and quota, not reserved disk space or available display memory.
See [StorageManager.estimate](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate).

Available prefetch space is the positive remainder of:

```text
0.80 × estimated origin quota
− total origin usage
− bytes reserved for pending writes
− safety allowance for estimation and write overhead
```

An explicit smaller app allocation also caps it. Coordinate reservations across
tabs, recheck estimates as writes complete, and stop when either the budget or
the source pyramid is exhausted. Do not start a large family without room for
its predicted records. Incomplete writes never advertise complete coverage.
Quota failure pauses optional preparation and releases expendable finer records
before the confirmed coarse fallback. An unavailable estimate disables broad
speculative filling rather than assuming unlimited storage.

Persistence should be requested, but a browser can decline it; cached coverage
must tolerate missing records. See
[StorageManager.persist](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).
The existing cache's 80% eviction low-water mark is not this new 80%-of-origin
prefetch target.

### Use prepared coverage as a conditional display floor

For a visited region, prefer the finest complete cached coverage that can be
restored within a **10% display-fallback budget**. This budget includes the
resident baseline, extra restored fallback resources and replacement overlap,
counting shared resources only once. It is 10% of the loader's usable memory
budget, not 10% of physical RAM or disk quota. Normal active-view refinement
can use the remaining normal memory allowance.

The baseline setting remains independent. Preparing deeper disk levels does
not pin them all in RAM. If the explicitly configured resident baseline already
uses 10% or more, optional floor promotion has no additional headroom; it must
not silently reduce that baseline or create a second 10% reserve.

Once validated, restored and admitted, cached coverage establishes the coarsest
permitted display for its region. A newly arrived remote parent or a relaxed
movement target cannot replace it with worse geometry. Restore that coverage
before presenting a coarser startup approximation where the budget and bounded
restore time permit; retain existing valid coverage during movement. Complete
REPLACE-family and caster rules still apply.

This floor is conditional on record availability, restore success and memory
capacity. Disk residency alone is not display readiness. Eviction, corruption,
source/build invalidation or reduced memory may make the prepared floor
unavailable; then use the resident baseline and resume normal refinement rather
than blocking the view. Track that fallback reason explicitly.

For example, a 4 GiB loader budget gives a 409.6 MiB fallback allowance. If the
resident base occupies 120 MiB, at most 289.6 MiB remains for finer cached
fallback and transition resources. Several GiB of deeper disk records can
still be useful across later visits without being loaded simultaneously.

### Implementation and measurement boundary

Existing pieces are the resident baseline, hierarchy cache, base render records,
source/build invalidation and foreground-aware scheduling. The full-pyramid
idle planner, shared 80% storage reservations and cached display-floor selection
still need implementation.

Evaluate the extension with time to first image and target error on revisits,
network bytes avoided, restore/decode/upload time, storage usage, peak temporary
memory and foreground preemption delay. Report resident baseline bytes and
prepared disk coverage separately. A larger cache is useful only if it improves
those outcomes without changing geometry quality or foreground responsiveness.
