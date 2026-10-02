# Raster terrain baseline

The raster adapter fetches Terrarium/Mapbox DEM pixels, builds the certified
native surface, then presents it in ECEF by default in Geoportal's shadow addon.
The existing terrain manager owns camera demand, request cancellation, complete
sibling replacement and publication. Raster boundary heights/normals remain an
adapter operation. `baseLevel` adds the same nested camera projections, ring
widths and error bands as the 3D Tiles manager; no second ring policy is used.

## Optional source-wide reserve

`persistBaseTiles` enables preparation after the foreground cut converges.
No baseline preparation or restore barrier runs during startup. Missing visible
coverage and visible error reduction always preempt the optional baseline queue.
Already resident foreground tiles supply their pristine buffers directly: no
second raster request, decode or native mesh is needed for those entries.
`baseRasterEdgePixels` limits the effective longest input-raster edge across the
source extent. It is independent of mesh segments and screen-space error. XYZ
alignment may add boundary tiles beyond that effective edge. Geoportal starts
at the source minimum zoom and advances through complete levels to about 4k,
then 8k (`8192`). A stage cannot skip its coarser fallback stages.

The baseline budget is `meshBaseMemoryBudget(maxCachedMeshBytes,
baseCoverageMemoryShare)`, the same 5–15% clamp used for terrain-providing 3D
Tiles. Geoportal uses 10%. Complete fitting levels remain pinned, including
coarser fallback levels. A partial finer level never becomes the resident floor.
Stages exceeding the budget are prepared one tile at a time, persisted, and
released unless active display/preparation also owns them. Foreground demand
preempts this work on movement. Storage refusal ends disk-only preparation
instead of repeatedly downloading uncacheable levels.
`setCacheBudget()` follows the shared scene's client grant. Shrinking it revokes
the finest reserves first; increasing it can restore finer disk stages again.
A confirmed unavailable source tile stops that optional complete-stage queue,
preserving earlier complete reserves and leaving foreground recovery independent.
The default grant and device caps also use `tile-cache-policy`: a desktop starts
at its shared memory seed; mobile/iOS retain their smaller limits. Explicit host
budgets can lower the grant or raise it within that device cap. The decoded raster
cache is separately bounded. Browser memory hints do not promise allocation.

## Persistent upload buffers

Terrain stores one prepared tile for its selected presentation. The ECEF mode
record holds upload-ready ECEF positions/normals/indices and bounds together with
source topology, relief mask and exact native normals needed by seam workers.
It omits native positions: the worker reconstructs those from the saved source
coordinates/heights without downloading, decoding or geodetically projecting
again. The explicit flat mode keeps its native prepared record. Geoportal does
not also write the standalone ECEF cache. GPU upload is still necessary.

All persistent mesh/terrain records, edge topology and tileset hierarchy metadata
use `createPersistentTileCache`: one IndexedDB database and adaptive origin quota,
with a 256 MiB fallback. Producer epochs and record schemas remain separate.
There is no application CacheStorage copy of Terrarium or B3DM response files;
the browser's HTTP cache remains independent. Decoded rasters live in a bounded,
shared RAM source pool, where remeshing can reuse already fetched pixels.

Keys include exact source/config revision, local preparation origin, accuracy,
presentation and immutable main/worker bundle identities. A resource `revision`
also versions the request URL identically for MapLibre and Three terrain, so a
changed source cannot re-enter through the old HTTP-cache URL. Unversioned URLs
retain their existing request behavior. Publishers must change the revision/URL
when content changes; unchanged URLs alone cannot reveal changed bytes. Arbitrary
height-correction callbacks lack a stable identity and disable durable ECEF
records. HMR also lacks an immutable build identity and uses RAM caches only.

The shared retention policy admits children only with a compatible ancestor
chain and evicts unprotected finest leaves first, then uses actual tile-use
metadata. Confirmed complete resident baselines protect their ancestors
atomically; idle disk-only finer levels remain evictable. Prefetch/restores do
not inflate tile-use counts. Mesh and terrain share the bounded idle usage queue.
A source/build/schema mismatch rejects old restoration and invalidates owned
resources; ordinary disk eviction does not dispose live visible geometry.
Untouched reads use readonly transactions and scan only their physical namespace.

Normal visible requests can restore their prepared buffers from local storage.
Baseline construction only begins after convergence; on movement it yields to
foreground selection. Confirmed resident baseline cuts then act as fallbacks.
Published cuts remain free of parent/descendant overlap. Baseline persistence
uses pristine native/ECEF buffers rather than saving a neighbour-specific seam
topology as the next session's native reference.

Initial native-to-ECEF conversion runs in the existing terrain worker pool.
The worker borrows cloned live inputs and transfers newly owned output buffers;
native seam geometry is never detached. Default seam reprojection also runs in workers. One background seam snapshot
is admitted at a time, behind foreground preparation; newer generations coalesce
and the previous visible surface remains until atomic publication. Custom
height-correction callbacks retain the synchronous converter fallback.

Raster footprints only enumerate candidates inside the declared source extent.
The actual camera frustum and conservative curved 3D height envelope decide
visibility; geographic overlap alone cannot mark a receiver as in view. Shadow
readiness uses the same configured/known height ranges. A loaded empty payload
can complete a family without pretending that its descendants are empty. A
confirmed missing payload likewise cannot block idle indefinitely.

## Memory reference

Dense 512-pixel inputs produce 514×514 vertices including boundary samples.
The current ECEF path retains native topology for seam workers, derived CPU
buffers and the anticipated GPU buffers. Reducing the baseline-height snapshot
from three coordinates to one height saves about 2 MiB per tile without changing
geometry. Before optional exact CPU index reuse, dense accounted memory is
approximately 47.3 MiB per tile:

| Square input coverage | Tiles | Dense resident estimate |
| --- | ---: | ---: |
| 2048×2048 | 16 | 0.74 GiB |
| 4096×4096 | 64 | 2.96 GiB |
| 8192×8192 | 256 | 11.83 GiB |
| 16384×16384 | 1024 | 47.30 GiB |

These are buffer estimates, not allocation/load-time benchmarks. They exclude
decoded raster-cache RGBA, seam shells, transient conversion/worker copies,
browser/object overhead and shadow targets. Certified raster simplification can
lower them; input resolution alone does not predict geometry memory. Full 4k/8k
RAM residency is therefore not forced. `getTerrainCacheStats()` exposes measured
mesh bytes, baseline budget, pinned tiles and completed stage sizes/status.
These square examples exclude complete coarser fallback stages and XYZ padding.
Unchanged source/native/ECEF index arrays can share their CPU backing buffer.
Each geometry still owns a separate GPU attribute. Reuse requires equal typed
array kind, length and every index, including winding; changed seam topology
keeps its own buffer. One eligible dense pair saves about 6 MiB CPU per tile.
Cache accounting counts shared CPU buffers once and every GPU allocation.

The [position quantization assessment](./TERRAIN_POSITION_QUANTIZATION.md)
evaluates optional UInt16 local positions against LOD-relative precision.
Float32 remains the default pending actual geometry and image verification.

Optional ECEF idle shadow-depth pages still require a certified curved envelope;
this baseline does not enable those pages or change terrain shadow fitting.

## Repeated conversion cost

Repeated visibility and shadow queries reuse up to 512 exact local geodetic
envelopes. Keys include all geographic bounds and height limits; changing the
local ECEF frame clears them. Queries copy the envelope and still apply the
current scene transform, so camera movement cannot reuse stale world bounds.
Raster coordinate lookup tables in this projection are bounded to 2048 entries.

Camera gestures refit the shared group matrix; they do not reproject terrain
vertices. Actual height/normal seam edits invalidate only the affected geometry.
Unchanged same-level boundary values leave geometry versions untouched.

Repeated conversion reuses exact RTC frames, native origin scale, longitude
columns, latitude rows and vertical scales. Each worker retains at most eight
contexts keyed by exact source bounds/origin, with at most 2048 entries per
lookup. A dense 513×513 synthetic tile retained 37,344 numeric bytes per context,
excluding JavaScript bookkeeping. The converter supplies its final normal buffer
so the generic builder does not compute triangle normals that would be replaced.

Three alternating paired synthetic CPU runs measured initial conversion
254→201 ms and repeated median 215→142 ms (1.52×). Position and normal arrays
were byte-identical. These numbers do not include network, GPU upload or complete
view convergence, and supersede preliminary unpaired timings.

An actual allocation failure records the shared versioned cache policy's
20% lower client grant. Cached failures do not discard protected live coverage.
A long low-sun browser run previously exceeded its grant through protected content.
Foreground admission now reserves complete direct sibling families before dispatch
and checks actual retained CPU/GPU buffers before installation. If refinement or
its mandatory shared borders do not fit, the current complete cut remains visible.
Unpublished rejected families are released; memory refusal is deferred detail,
not an unavailable tile or a timed network retry. Changed demand, a changed grant
or released resident capacity can resume the same target. Cache statistics expose
`reservedMeshBytes` and `memoryDeferred` separately from installed bytes.

Completed preview ancestors release preparation protection immediately after
successful replacement publication. A baseline tile saved to disk but refused RAM
installation advances as disk-only content; it never certifies a resident level
or repeatedly prepares the same tile on idle. Earlier complete fallback levels
remain pinned. Optional mixed-level seams and ECEF seam replacements also check
retained growth before replacing their existing surface.

The cap governs new retained terrain records and seam state. A previously visible
cut inherited from another runtime or retained after a grant reduction may already
exceed the new grant; coverage takes precedence and further growth is deferred.
Transient decode/worker copies, the independently bounded decoded raster cache
and temporary idle shadow depth-pass geometry are separate resources. Offline
coverage/admission checks do not establish a dense browser RSS limit or improved
end-to-end loading time.
