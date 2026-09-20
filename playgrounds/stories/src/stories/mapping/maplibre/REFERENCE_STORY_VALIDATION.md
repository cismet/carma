# Reference-story review — 2026-09-14

Browser review summary; not a production or geodetic certification.
The checks used an existing Storybook on port 4400. Browser captures and raw
logs are not included in this repository.

## Stories and navigation

- [Padding](http://127.0.0.1:4400/iframe.html?id=tile-loading-manager-coverage--viewport-padding&viewMode=story)
- [Mesh mount](http://127.0.0.1:4400/iframe.html?id=terrain-and-atmosphere-mesh-mount--reference&viewMode=story)
- [Terrain horizon](http://127.0.0.1:4400/iframe.html?id=terrain-and-atmosphere-terrain-horizon--reference&viewMode=story)
- [Langenberg masts](http://127.0.0.1:4400/iframe.html?id=terrain-and-atmosphere-terrain-horizon--langenberg&viewMode=story)
- [Sunset](http://127.0.0.1:4400/iframe.html?id=terrain-and-atmosphere-terrain-horizon--sunset&viewMode=story)

Historical local-only check: all 51 CSF files were parsed with the installed Storybook parser and actual
`sortStoriesV7`: 104 stories, all 96 previous IDs preserved, zero duplicate IDs.
The ordering applies to the complete stories project, not only this branch:
Terrain and Atmosphere → Shadows → Tile Loading Manager → Map Navigation →
Annotations → Gizmos → UI Components → Appendix. References lead their scope;
isolated tests, benchmarks and proofs of concept are collected at the end.


The subsequent dev-parity audit supersedes that local-only navigation check:
60 CSF files, 117 stories, all 88 IDs from fetched `origin/dev` preserved and
no duplicate story IDs. The main index now includes Pointcloud and Georadar
from their existing application source project. Every CSF has a fixed meta ID
for Storybook 8.5.3. Applications lead the sidebar; Gizmos live under UI, and
diagnostics stay within their topic rather than a global Appendix. The restarted
4400 server publishes 117 entries. This is index/link validation, not rendering
acceptance for every application or remote dataset.

## Padding and viewport identity

### Four-site mesh comparison follow-up (2026-09-14)

The existing Mesh Mount Reference ID now renders a 2×2 grid of independent maps:
root / Dönberg above Beyenburg / Cronenberg. Shared controls drive zoom, narrow
perspective FOV, opacity and tangent mounting. All four contexts reported mesh
content received and requests idle in the shared Playwright session. The initial
loaded screenshot shows buildings at the northern/eastern center crosses;
Cronenberg was then shifted onto a nearby building instead of the street.
Ten focused preset/projection tests pass. Each map retains its own 1 GiB budget.

The 0.1° perspective FOV is not true orthography. Beyenburg is approximately
9.585 km from the root and farther than the other image-verified sites, but a
global farthest-content location is **not established**. A deeper metadata crawl
was stopped after slow responses. North/south remain built-up comparison sites,
not certified coverage extrema. Do not use these screenshots as global maxima.
Evidence: *unpublished browser capture* and
*unpublished validation artifact* (local, not committed artifacts).

Five browser states covered default/opposite/reset padding and a narrow canvas.
All retained the same Map, runtime, pool and camera objects. The screen guide
matched the projected map center exactly; LOD projection differences were below
2.5e-9 CSS px. Base coverage reported ready, floor pending was zero; some detail
refinement was still pending. These samples do not prove arbitrary hole-free
navigation.

| Canvas (CSS px) | Padding state | Projected focus (CSS px) |
| --- | --- | --- |
| 1728 × 998 | left 320, top 80 | 1024, 539 |
| 480 × 998 | left 320, top 80 | 400, 539 |
| 480 × 998 | right 120, bottom 100 | 180, 449 |
| 1728 × 998 | reset | 864, 499 |



137 focused test executions passed; logs:
*unpublished validation artifact*.

## Terrain A/B and memory boundary

The clean Nordhelle reload after the stitching batch change rendered 192 terrain
children, base coverage ready, with no recorded worker clone failure. Switching
Curved → Planar retained the exact same Map, terrain runtime and camera pose.
Inspected images: *unpublished browser capture*.
One earlier screenshot, *unpublished browser capture*, records a failed two-panel
experiment and must not be presented as a successful result.

This is **not a throughput benchmark**: no cold/warm repetitions, medians, tails,
GPU timings or output-parity timing study were performed. The earlier clone OOM
also reproduced with a single scene. Bounded stitching batches address clone
spikes, not total residency. The observed Chromium heap stayed around 3.0–3.7 GB
against a 4.396 GB limit; one request remained pending in the later sample.
The workload is still memory-heavy. Actual pre-fix failing task kind was not
captured, so the batch path is not claimed as the uniquely proven OOM cause.


106 focused terrain/stitch/worker tests passed:
*unpublished validation artifact*.
These overlap other suites; do not add counts as unique tests.

The three reference suites passed 21 tests:
*unpublished validation artifact*. This covers projection math, landmarks
and preset geometry, not survey accuracy. No broad production build was run.

## Source and interpretation limits

### Final Langenberg and sunset checks

Chromium 152 on this Mac, same visible session, one run each (not a benchmark):
Langenberg rendered both masts and 192 terrain children, then retained Map,
terrain and camera across A/B. No recorded page/clone error; reported JS heap
rose from about 3.23 to 4.31 GB. Sunset initially rendered 104 children, with
nine requests pending, at about 2.82 GB. Its planar switch retained object/pose
identity but exposed visible terrain gaps. A later capture still showed gaps;
reported heap rose to 5.25 and subsequently 6.52 GB. `performance.memory` is an
approximate browser-reported JS metric, not measured GPU or process residency.
The previous 3.0–3.7 GB figures are not a ceiling or the final workload maximum.

**Sunset remains a review preset, not accepted reference imagery.** The production
addon takes its solar location from MapLibre's map center, which is displaced
from this physical observer. The diagnostic computes the reference-eye sun
(about +0.25°); that is not an exact rendered-disc-position check. The story now
warns explicitly about both solar-anchor and planar-coverage issues. Its source
and shader/selection alignment need follow-up; missing pixels must not be
interpreted as real negative terrain or proof of a valid viewshed.


 The expensive scene was unloaded by returning
the shared session to the root-mount story; no server was stopped or restarted.

The final image presets use source-covered built-up locations instead of the
empty OBB probes: Dönberg (6.443 km horizontally from the root) and Cronenberg
(4.651 km). Both fixed-root captures reported requests idle. Cronenberg's local
anchor comparison has visibly fewer double edges, but was still refining; no
pixel residual or uniquely identified cause is claimed. Images:
*unpublished browser capture*.
The updated mount suite passed nine tests, superseding its earlier eight-test
run within the 21-test aggregate above.

Actual resize/reposition probe: Map, runtime and canvas identities unchanged,
runtime generation 2 unchanged; 1708 × 826 at (0, 0) became 1110 × 578 at
(598, 248), with unchanged camera center/zoom/FOV and ground scale. That identity
probe preceded the source-covered preset replacement; its white image cannot
prove visible alignment.

- The mesh origin is derived from its real root matrix. Narrow perspective
  (0.1° FOV) reduces but does not eliminate relief parallax over a planar image.
- Root OBB face centers are mathematical probes, not guarantees of image or
  mesh coverage. Initial north/south screenshots at those probes were white;
  they cannot support an alignment claim.
- Pan/zoom/resize retain the mesh runtime; explicitly changing its mount anchor
  currently replaces it. Download-free remounting and exact nonlinear Mercator
  flattening, including picking/bounds/shadows, remain open work.
- Nordhelle terrain coverage is clipped. Independent full-NRW DGM ground anchors
  do not extend that source footprint. WDR tower total-height sources conflict.
- Langenberg mast centers were checked inside the actual terrain polygon and
  outside the mesh. DGM still omits buildings and vegetation.
- Authored tower parts and reusable source records are in resources, with OSM,
  NRW, municipal and Wikimedia provenance separated. No Wikimedia photo texture
  was downloaded or bundled. Widths/platforms are illustrative, not surveyed.

See [reference design and decisions](./ThreeReferenceSurfaces.md) and the source
READMEs under `libraries/commons/resources/src/lib/de.nrw.sauerland/` and
`libraries/commons/resources/src/lib/de.nrw.ruhr/`.
