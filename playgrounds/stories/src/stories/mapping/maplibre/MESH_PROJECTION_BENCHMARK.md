# Mesh projection accuracy/cost benchmark — 2026-09-15

Status: experimental story profiles on `feat/tile-loading-manager`, HEAD
`b5f0aeda5` plus the uncommitted projection comparison. No production acceptance.

## Profiles

All three use the same WGS84 ECEF → geodetic → spherical Web Mercator
mapping and the same native tile-preparation plugin. Only the bilinear lookup
spacing changes. There are no additional GPU shader branches per accuracy target.

| Target | Grid spacing | CPU lookup bytes | Maximum sampled error, Float32 included |
| --- | ---: | ---: | ---: |
| 1 cm | 400 m | 468,512 | 0.006593 m |
| 10 cm | 1,200 m | 53,792 | 0.056989 m |
| 1 m | 4,000 m | 5,408 | 0.632214 m |

Domain: ±24 km east/south of the existing Wuppertal root
(7.163461249942009°, 51.24111123027258°), local up 0–1,000 m.
Tests probe every grid cell at five horizontal offsets and five heights:
360,000 / 40,000 / 3,600 samples. These are observed interpolation errors
against the direct double-precision projector, not a continuous-domain proof,
mesh/source/datum accuracy, triangle-interior guarantee or screen-pixel bound.
The conservative metadata envelope now includes interpolation spacing; coarse
profiles must not falsely cull their displaced payloads.
The looser envelope can admit extra traversal candidates; a coarser lookup is
therefore not an unconditional loader-throughput improvement.

Accuracy profiles in the retained synchronized comparison:

- [1 cm control preset](http://localhost:4400/?path=/story/terrain-and-atmosphere-mesh-mount--transform-strategies&args=projectionAccuracy:1cm;reprojectionMode:ellipsoid-lut)
- [10 cm control preset](http://localhost:4400/?path=/story/terrain-and-atmosphere-mesh-mount--transform-strategies&args=projectionAccuracy:10cm;reprojectionMode:ellipsoid-lut)
- [1 m control preset](http://localhost:4400/?path=/story/terrain-and-atmosphere-mesh-mount--transform-strategies&args=projectionAccuracy:1m;reprojectionMode:ellipsoid-lut)

The separate visual accuracy stories were removed in the 2026-09-15 cleanup.
These links select interpolation controls in the retained comparison; they do
not certify visual accuracy. The benchmark measurements below predate the
switch from aerial alpha overlays to opaque topo draping.

The common accuracy control also allows a custom grid. The numerical comparison
retains its separate 0.5 CSS-pixel diagnostic target.

## Actual tile preparation

Client: MacBook Pro Mac16,5, Apple M4 Max, 14 CPU cores, 36 GB RAM.
Chrome 152.0.0.0, ANGLE Metal M4 Max, DPR 2. No CPU/network throttling.
Two decoded resident 2024 mesh tiles, `mesh_25104.b3dm` (46,041 vertices)
and `mesh_24764.b3dm` (13,890), total **59,931 vertices**, identical source
geometry/transforms in all runs. Two warmups, seven repetitions, rotating order.
Measured 2026-09-15T13:30:08.959Z.

Times below are milliseconds, median / nearest-rank P95. With seven repetitions,
P95 is simply the largest sample; this is not a well-estimated tail distribution.

| Method | Lookup setup, active CPU | Conversion, active CPU | Conversion, elapsed wall | Largest conversion slice |
| --- | ---: | ---: | ---: | ---: |
| Off | 0.0 / 0.1 | 0.1 / 0.1 | 0.1 / 0.1 | 0.1 / 0.1 |
| Direct | 0.1 / 0.2 | 193.8 / 207.0 | 490.2 / 497.6 | 5.1 / 5.5 |
| 1 cm | 28.7 / 41.1 | 85.4 / 91.7 | 378.0 / 383.1 | 2.4 / 2.6 |
| 10 cm | 4.0 / 5.4 | 84.3 / 95.7 | 376.8 / 385.8 | 2.7 / 2.9 |
| 1 m | 0.4 / 0.6 | 72.6 / 98.2 | 367.9 / 383.6 | 2.3 / 2.8 |

Lookup setup elapsed medians: 176.2 / 52.9 / 15.1 ms for 1 cm / 10 cm / 1 m.
Setup happens once per projector, not once per tile. Subsequent tiles reuse it.
Cooperative `setTimeout(0)` waits account for much of the wall-minus-active
difference; do not mistake those waits for expensive mathematics. The native
1024-vertex yielding policy was kept unchanged for this comparison.

Conversion includes metadata preparation, internal geometry cloning/attribute
decoding, positions, normal/tangent Jacobians, bounds and atomic publication.
Fixture copying, reference/error checking, downloads, GLB parsing, JPEG decoding
and GPU upload are excluded. “Off” means no conversion, not a decoder benchmark.

Maximum actual uploaded-geometry differences versus direct projection:
1 cm **0.006059 m**, 10 cm **0.036838 m**, 1 m **0.493625 m**.


The harness keeps each raw repetition, not just this summary.

## Loaded-frame CPU check

Same stationary north comparison camera, 1966×889 CSS pixels / 3932×1778
drawing buffer. Three runs per method, each 30 warmup and 90 measured frames.
Diagnostics disabled while measuring; streaming/setup excluded.

| Method | Range of per-run CPU medians | Range of per-run CPU P95 |
| --- | ---: | ---: |
| Off | 0.5–0.7 ms | 2.3–2.7 ms |
| Direct | 0.6–1.1 ms | 2.6–2.7 ms |
| 1 cm | 0.8–0.8 ms | 2.5–2.9 ms |
| 10 cm | 0.6–0.8 ms | 2.2–2.9 ms |
| 1 m | 0.6–0.9 ms | 2.5–2.9 ms |

A temporary diagnostic wrapper measures the installed MapLibre `_render`
call and restores it after each run. An initial event-based CPU measurement was
discarded: this installed MapLibre has no `renderstart` event. The harness now
fails if the measured method is unavailable rather than silently emitting
invalid durations.

These are CPU submission timings, not GPU completion, presentation FPS, animated
multi-camera throughput or input latency. Native residency/culling is allowed
to follow each geometry mode; this is a same-view app check, not an identical
GPU draw-list microbenchmark. Frame interval medians were 6.4–7.0 ms and are
scheduler/display observations, not a demonstrated maximum frame rate.


A separate 43-second unthrottled DevTools trace covered a synthetic pan and
switch to 1 cm. Its summary supplied no isolated converter/GPU timing; it is not
used as additional speedup evidence. Quantitative runs were untraced.
Timing terminology follows [Chrome's Performance reference](https://developer.chrome.com/docs/devtools/performance/reference).

## Interpretation

Keep **1 cm** as the recommended quality preset. It reduced median active tile
conversion cost to about 44% of direct evaluation in this sample. The 10 cm
profile mainly cuts lookup initialization and memory, with almost identical
per-tile CPU cost. The 1 m profile has a lower observed median but a worse high
sample than 1 cm; this small, variable sample does not establish a repeatable
per-vertex advantage. All three use the same four-corner interpolation loop.

There is no demonstrated steady-frame speedup from accepting metre error.
Nonlinear projection already happens once on tile preparation; pan/zoom does
not rerun it on resident geometry. Prepared-artifact reuse/worker scheduling
remain separate possible improvements, not implemented by these profiles.

## Reproduce

Open a live Mesh Alignment iframe on the same Storybook, then run in its console:

```js
const bench = await import("/src/stories/mapping/maplibre/benchmark-mesh-projection.mjs");
const tiles = await bench.runMeshProjectionBenchmark();
const frames = await bench.runMeshProjectionFrameBenchmark();
console.log(JSON.stringify({ tiles, frames }));
```

The harness temporarily enables the native diagnostic registry, selects raw
source geometry and then restores the selected method/accuracy. It leaves the
explicit `projectionBenchmarkProbe` option enabled for subsequent diagnostic
runs; turn it off afterwards. Normal story defaults leave it disabled.
Do not edit source, interact with the map or run a trace during timed runs.
Loaded tile selection is recorded: a new LOD/camera can change the fixture.

Validation: 23 focused geo tests + 14 native projection-plugin tests passed.
All three dedicated story URLs loaded real mesh content with their expected
400 / 1200 / 4000 m grids in the shared Chrome session. This smoke check is not
independent orthophoto registration or triangle/LOD-seam acceptance.
No broad build, production benchmark, commit, push or server restart.

Measured core source SHA-256 (the harness subsequently only changed frame
instrumentation and its explanatory comment):
- LUT: `e9ca16472698506bc1f46d5813737eec809a7675a78cfa7d7b0f8e3884b9f76e`
- Plugin: `b2f1dacdf4cfbdfc49c9e653b2b14b45485c98e0e5f50038daff2090e9bbaf61`
