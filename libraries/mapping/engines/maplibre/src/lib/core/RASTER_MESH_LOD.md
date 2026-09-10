# Error-bounded regular raster meshes

**ID / date / status:** RME-01 / 2026-09-07 / native-or-regular index reduction implemented; camera-dependent same-tile refinement remains a separate runtime requirement.

## Context and constraints

Replaces the fixed 128/256 segment cap in the terrain worker with a native, half-
or quarter-step candidate accepted only against the same native raster surface.
The original `buildGridTile` remains the full-grid reference and test utility;
`buildErrorBoundedGridTile` is the worker entry. Source-LOD selection still uses
projected raster spacing; that is not a certified vertical or final image error.
The MapLibre terrain, its drape and physical framebuffer resolution are unchanged.

## Decision

- Keep every source pixel centre and the complete original uniform boundary ring
  in the attribute arrays. Coarsen indices only. The native ring and its incident
  pixel cells retain their original faces, winding and accumulation order.
- Evaluate whole-tile quarter/half regular candidates; a failing candidate falls
  back to a finer candidate or the native topology. Interior coarse blocks have
  the reference NE–SW diagonal. Transition fans keep every vertex shared with the
  unsimplified boundary strip, including the corner transitions.
- Candidate triangles use only existing pixel centres. For each triangle,
  measure reference-minus-candidate at enclosed native pixels and intersections
  of its edges with all native horizontal, vertical and diagonal edges. These
  are the overlay vertices where a piecewise-linear difference can attain an
  extremum. Pixel-only validation is insufficient.
- An optional affine-envelope certificate accelerates flat/planar tiles: if all
  native vertices lie within `e` of a plane, both interpolated triangle surfaces
  lie within `e`, and their difference is at most `2e`. Failed certificates still
  use the full crossing-aware test. Rough tiles fail early, without a full scan.
- Default maximum residual is **0.01 m**, with downward binary tolerance buckets
  for stricter requests. This is a representation bound, not survey accuracy.
  Raw and projected variant keys include that tolerance; prepared-cache revision
  is `prepared-raster-dem-error-bounded-grid-v7`. A stricter variant reuses the
  decoded raster in a worker, not the previous variant's geometry or another PNG.
- Retain at most four height-independent topology plans, together <=2 MiB per
  worker. Returned indices are owned copies; source heights/certificates are never
  shared via those plans or trusted after a changed input.

## Alternatives and disposition

- Live Delatin/TIN: **measured rejection for the current loading path**, not for
  all offline formats. See the [terrain representation assessment](../../../../../../../output/terrain-representation-assessment-20260907/README.md).
- Blind half/quarter grids: **incompatible by inspection** with the residual
  guarantee; one omitted embankment can move a low-sun shadow substantially.
- Compact vertex arrays: **deferred**. They would invalidate the current O(log n)
  native-grid height-sampler fallback after persistent restoration. Index-only
  reduction preserves that path without a new main-thread spatial index. It
  reduces indexed GPU vertex/triangle work, not allocated/uploaded attributes.
- Independent bounded blocks: **deferred**. Whole-tile early rejection is small
  and predictable. A cliff can still force the tile to native resolution; mixing
  independently reduced blocks needs another boundary/error contract.
- Reusing full raster normal detail on reduced geometry: **not implemented**.
  Existing worker normals are recomputed from accepted indices. Boundary normals
  are regression-tested exactly; interior shading is not a pixel-equality claim.

## Evidence and limits

[Worker harness](../../../../../../../output/terrain-representation-assessment-20260907/error-mesh-benchmark.mjs)
and [raw results](../../../../../../../output/terrain-representation-assessment-20260907/error-mesh-results.json):
one Node worker, M4 Max, decoded 512² flat/slope/noise and real quarry DEM16/DOM16;
five warmups, fifteen rotated native/bounded trials. Includes grid allocations,
error checks and owned output indices. Excludes HTTP/PNG decode, projection,
normals, stitching, upload, rendering and whole-app frame time. Topology cache is
warm in the reported steady-state timings. First accepted topology construction
is more expensive and is amortized across compatible tiles in that worker.

| Workload | Native grid median | Bounded median | Accepted triangles |
| --- | ---: | ---: | ---: |
| Flat | 3.56 ms | 4.00 ms | 45,000, zero residual |
| Planar slope | 4.78 ms | 5.14 ms | 45,000, zero residual |
| Checker noise | 4.41 ms | 4.56 ms | 526,338, native fallback |
| Quarry DEM16 | 4.81 ms | 4.77 ms | 526,338, native fallback |
| Quarry DOM16 | 4.85 ms | 4.89 ms | 526,338, native fallback |

The first crossing-audit/compact-vertex prototype took 28–31 ms for the accepted
planes and was not retained. The affine-envelope shortcut and topology reuse
remove that cost in the final warm index-only path. Full attributes are retained;
there is no GPU timing claim for this implementation. The real quarry tiles do
not meet the 1 cm whole-tile reduction bound, so they deliberately gain no fewer
triangles. A sub-0.2 ms rejection delta is not a meaningful hardware speed claim.

Regression coverage includes a between-pixel diagonal extremum of 2/3 m when all
enclosed pixel errors are zero, narrow spikes, Terrarium precision, matched edges,
unchanged native boundary normals, immutable topology reuse, decoded-source reuse
and strict/loose persistent variant isolation. The raster-plane proof does not
certify Float32 geographic projection or later mixed-source/LOD stitching.

## Revisit when

Benchmark independent block adaptation only if rejection of useful smooth areas
is common enough to justify it. Do not relax the 1 cm bound merely to make a
benchmark faster. A later per-view error policy must account for both camera
projection and low-sun shadow displacement, and invalidate/refine same-id resident
meshes when that bound tightens. This implementation must not be described as an
extreme-zoom physical-pixel certificate or as unchanged interior shading.
