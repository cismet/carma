# Cancel/re-request churn between publication support and the settled-demand sweep

**ID:** MESH-SUPPORT-RETENTION-20260917
**Status:** measured diagnosis; fix implemented (`isRequiredMeshTile` honours
`meshRefinementSupport`); unit-tested; runtime re-measurement outstanding.

Date: 2026-09-17. Base commit `cede49c8e` on `feat/tile-loading-manager`.

## Symptom

At a close tilted geoportal view the Network tab fills with thousands of
requests for the same handful of `b3dm` tiles, almost all cancelled, and the
view never settles. Bandwidth and tile statistics stay unremarkable because the
repeats are served from the HTTP cache, so throughput-based reading of the same
run shows nothing wrong. The shadow addon is not involved.

## Workload and limits

- Geoportal dev server on 4200, `data/mesh2024-cesium-parity.style.json` dropped
  onto the map, view `lat=51.2476452 lng=7.1224632 zoom=19.358 b=12.84 p=34.24`.
- Headless Chrome 152 via Playwright (`channel: "chrome"`), 1600 x 1000 CSS
  viewport at DPR 1, macOS, 32 GiB reported device memory. No CPU or network
  throttling, warm HTTP cache. These are NOT cold-network measurements.
- Each run: load, drop, 100 s settle, four mouse pans, 60 s settle.
- Counts come from a page-level `fetch` hook. An aborted request never produces
  a resource-timing entry, so resource timing alone under-reports this loop by
  roughly two orders of magnitude.
- The storm is intermittent, not deterministic: 3 of 8 default runs. The other
  five runs show the same mechanism at small scale. Run-to-run comparisons below
  are therefore directional, not a controlled A/B.
- The shadow addon was inactive and the runtime reported `shadowView === false`
  in every run, so shadow selection is excluded by measurement, not assumption.

## Mechanism

Each update, `collectLoadedMeshReceiverCandidates` walks the tileset to build
the atomic REPLACE-family cut it may publish. For an incomplete family it adds
the family's offscreen siblings to the `support` set, so a later pan does not
downgrade into an unloaded sibling. `updateMeshRefinementSupport` marks and
queues that set, and `isTileRequestNeeded` admits it explicitly.

`isRequiredMeshTile`, which gates the settled-demand sweep, did not consult that
set: `meshRefinementSupport` was not even part of the loading module's state
slice. An offscreen support tile is outside the main view and outside every
camera demand, so the sweep released it and the LRU removal aborted its fetch.
The removal dispatches `needs-update`, the next update rebuilds the same
incomplete family, re-adds the same siblings, and queues them again. The
admission side and the eviction side disagreed about the same set, at frame rate.

## Evidence

Cancelled-tile attribution over two instrumented runs (no shadow addon):

| Measure | Run A | Run B |
| --- | ---: | ---: |
| Cancelled tiles carrying `support = true` | 98 % | 97 % |
| Cancellations from `sweepSettledMeshDemand` | 174 / 194 | 196 / 226 |
| `needs-update` dispatches per 100 s at rest | 825 | 958 |

Request churn per 100 s settle plus four pans:

| Variant | Fetch starts | Max repeats of one tile | Storms | Base coverage |
| --- | ---: | ---: | ---: | --- |
| Baseline, five non-storm runs | 314 - 523 | 9 - 24 | 0 / 5 | 15 - 19 s |
| Baseline, three storm runs | 25 073 - 35 141 | 1 000 - 1 386 | 3 / 3 | never reached |
| In-page proxy for the fix, two runs | 487 - 494 | 24 | 0 / 2 | 15 - 18 s |
| 6 GiB cache ceiling override, one run | 510 | 5 | 0 / 1 | 27 s |

The proxy row emulated retention inside the page by refusing to cancel a pending
tile the traversal had marked used in the current frame. It is a broader rule
than the shipped fix and stands only as directional support for the mechanism,
not as a measurement of the shipped code.

Ruled out by measurement, not by inspection: a remount or projection
invalidation. Over 5 557 resting frames the runtime reported one manager mount,
zero runtime-object swaps, zero style reloads, three main-view projection
changes and zero `minElevationForCurrentTile` changes. The runtime's own frustum
also agreed with the renderer's camera frustum on every one of 22 285 sampled
tile tests (max plane delta 3.1e-4).

## Decision

`isRequiredMeshTile` treats membership in `meshRefinementSupport` as demand, so
the eviction predicate and the request predicate agree on one set. The sweep's
memory-pressure paths (`replacedParent`, `droppableRefinement`) bypass this
predicate and still release loaded support under real pressure, so the change
protects in-flight support without pinning the cache.

## Alternatives and disposition

- Cancel against `tiles.errorTarget` instead of `memoryErrorTarget` in
  `abortStaleDownloads`: **not evaluated** as a fix. That path accounted for
  8 - 16 % of cancellations in the measured runs, so it cannot explain the loop.
- Refuse to cancel any pending tile the traversal marked used this frame:
  **measured as a proxy**, effective, but broader than the demand it protects.
  Deferred in favour of the explicit support check.
- Raise the 2 GiB desktop cache ceiling: **measured mitigation**, single run,
  reduces churn but leaves the predicate asymmetry in place. Deferred; it is a
  separate change with its own memory trade-off.
- Suppress the sweep's `needs-update` dispatch when it removed nothing:
  **deferred**. With the support check in place the sweep no longer removes
  those tiles, so the dispatch storm should disappear with it; revisit only if
  measurement shows otherwise.

## Verification status

- `nx test engines-maplibre` on `cede49c8e`: 18 failed / 1126 passed. With this
  change: the same 18 failures and 1127 passed, so this change adds a passing
  test and alters nothing else.
- Those 18 failures are NOT pre-existing against `origin/dev`. On `origin/dev`
  the same target is green (68 files, 698 tests). The failing specs are added by
  this branch, so the branch takes the target from green to red and must not be
  called merge-ready until they pass. Three of the 18 are the 1000-line
  module-budget guards in `three-tiles-runtime-architecture.spec.ts`, which this
  branch pushes over budget: `three-tiles-runtime-attachment.ts` (1176),
  `three-tiles-runtime-lifecycle.ts` (1267) and `three-tiles-runtime-loading.ts`
  (1319 after this change).
- `probes/mesh-request-churn.mjs` reproduces the symptom as repeats per tile
  URL. It has NOT been run against the fixed runtime: both dev servers were
  stopped before the fix was applied, and server lifecycle is user-owned.

## Revisit when

- The publication walk changes which tiles it puts in `support`, or the sweep
  gains another release path that does not consult `isRequiredMeshTile`.
- A run of `probes/mesh-request-churn.mjs` against the fixed runtime shows
  repeats above the probe's limit, which would mean a second churn source.
