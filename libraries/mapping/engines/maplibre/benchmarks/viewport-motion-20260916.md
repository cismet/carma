# Fast camera motion: measured limits, not acceptance

Date: 2026-09-16. Branch: `feat/tile-loading-manager`, HEAD `1b219d568`
plus the existing uncommitted worktree. No production loader changes in this experiment.

## Workload

Live Storybook 4400, Mesh Coverage, Chrome 152/macOS, 14 logical cores,
982 × 1061 CSS viewport at DPR 2. Same browser context and warm caches;
no CPU/network throttling. Debug UI/telemetry disabled during each run;
the small probe samples on render at most every 150 ms (0.6–1.1 ms p95).
The benchmark context was separate from the user's open browser tab.

Ten approximately 14.4-second scripted interaction cycles: Barmen zoom 17→19,
pan to Elberfeld, zoom out to 14, pan to Zoo, zoom in to 18.5, reverse-pan,
zoom out, return to Barmen and settle for six seconds. Motion durations
400–700 ms, with brief pauses. This exercises MapLibre camera events but is
not a pointer-to-present/input latency measurement. Pitch 35 degrees.

The first exploratory sequence was rejected: zooming with center elevation 0
put the camera below the source mesh. At Zoo, camera Up was 134.46 m and a
vertical ray hit the mesh at 141.45 m. Empty gray frames are not fast rendering.
The ten retained runs use explicitly unclamped center elevations sampled from
resident geometry plus 15 m. These are safety offsets, not surveyed terrain
heights. Intermediate terrain clearance along the entire flight is not certified.

## Results

Two repetitions per configuration. Parser order: 2,1,4,4,1,2; then downloads 8,
motion target 4 px, motion target 4 px, downloads 8. All other runs use a 20 px
motion stage and 16-request ceiling. Requested final target is 4 px.

| Parsers / download ceiling / motion stage | RAF interval p95 per run | Parse completions/s | Download starts per cycle |
| --- | --- | --- | --- |
| 2 / 16 / 20 px | 13.9 / 14.3 ms | 33.3 | 1004 / 1128 |
| 1 / 16 / 20 px | 7.8 / 13.9 ms | 25.1 | 823 / 1055 |
| 4 / 16 / 20 px | 20.4 / 20.9 ms | 38.3 | 1024 / 1062 |
| 2 / 8 / 20 px | 14.1 / 14.2 ms | 36.2 | 966 / 1032 |
| 2 / 16 / 4 px | 20.9 / 21.0 ms | 42.8 | 1361 / 1929 |

These are asynchronous parse completions, not CPU worker utilization or equal
bytes of useful visible detail. RAF cadence is not mesh presentation cadence.
Cache/order differences and two repetitions do not establish a global optimum.
One retained run had a 479 ms worst RAF interval; do not claim universal 60 fps.
Download-start events include browser-cache service and aborted requests; they
are not a count of network transfers. Completed loads and disposals are retained
in the JSON summary. Warm revisits still generate substantial decode/eviction
work; increasing concurrency alone does not resolve it.

## Viewport priority and coverage

- No new non-baseline offscreen download or parse started during movement in
  the ten retained runs. Classification was checked again at actual queue start.
- Up to two already-started non-baseline decoders were observed outside the
  current frustum after camera changes. Pending parse buffers are counted
  separately from executing callbacks; state 3 alone does not mean executing.
- Waiting parse queues peaked at 76–172 entries, despite active parser capacity
  not being continuously occupied. Eligibility/priority gates, download latency,
  and camera churn must be separated before adding more parser slots.
- There was no completely empty displayed frontier. This is NOT gapless coverage:
  the conservative source-tree coverage probe found 1–5 unproven floor cells,
  and `visibleBaseReady` ended false in several later runs. Resolve that before
  claiming no-holes acceptance or deploying more speculative refinement.
- Bounds-based SSE/area samples include underlays, overlapping boxes and hidden
  geometry. They are NOT pixel-weighted error of the final visible surface and
  cannot select the best configuration for lowest viewport error per frame.
  The retained raw samples also multiply by the runtime stage target, which can
  differ from the compiled camera target during transitions. The harness now uses
  the compiled target for future runs; historical SSE numbers remain provisional.
  Next useful measurement: exposed receiver/frontier coverage with depth-resolved
  tile ownership, without synchronous GPU readback in the interaction loop.

## Policy audit and decisions

1. Keep two parsers for now. Four increased completion throughput about 15% over
   two, but degraded p95 RAF cadence. This is not proof of maximum client throughput.
   Keep the existing request ceiling; lowering to eight was inconclusive.
2. Do not globally replace the 20 px movement stage with 4 px. Both trials caused
   more churn and worse cadence. Prefer a targeted eligibility change only for
   genuinely exposed viewport patches with an already-published coarse fallback,
   after the remaining coverage uncertainty is resolved.
3. Do not add general pan prediction yet. A possible later experiment is one
   cancelable payload immediately beyond the leading edge, only after visible
   demand drains, with a stable direction and strict byte cap. Reverse pans in
   this workload make broad prediction likely to waste decode/memory bandwidth.
   Zoom-center prefetch already exists, with gesture/admission limits.
4. Existing offscreen queues are parked while foreground work is eligible.
   Idle-ring admission also checks rest/base readiness. Already-running decode
   is not guaranteed to be interruptible; cancellation at stage boundaries is
   different from killing a synchronous decode in progress. Refinement-support
   exceptions need dependency-aware auditing, not blanket offscreen deletion.
5. Cache reached roughly 4.6–6.04 GiB peak per cycle; estimates are not physical
   VRAM measurements. The 6 GiB setting permits limited overflow. Current retention
   low-water mark is 75% (4.5 GiB), not permanent optimistic filling to 6 GiB.
   The requested dynamic protected floor of 512 MiB up to 25% (1.5 GiB) remains
   unimplemented: current extent sizing estimates 35% using transfer-to-resident
   expansion. Frequency-plus-recency eviction is also not implemented as specified.
6. Priority of further work: coverage/camera-clearance correctness → visible
   refinement eligibility and canceled-work accounting → useful decoded residency
   and the requested floor policy → only then predictive prefetch/adaptive workers.

## Reproduction and scope

Install `viewport-motion-browser.js` through DevTools in the story frame and run
`__tileMotionBenchmark.run({parse:2,requests:16})`; call `.restore()` afterward.
The harness temporarily changes runtime limits and diagnostics, restoring them
after each run. Do not run concurrently or in a production tab.

Compact results are retained as local raw evidence and are not part of the
publication tree.
Raw evidence, intentionally outside Git to avoid adding 6 MB to this branch:
`carma-viewport-motion-safe-20260916.json` and rejected exploratory
`carma-viewport-motion-initial-20260916.json` (temporary artifacts).

No production build, server restart, production policy change or commit. Harness
syntax checked; runtime experiments are not full application or no-holes acceptance.
