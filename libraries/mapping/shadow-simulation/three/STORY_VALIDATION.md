# Shadow story parity and readiness

Decision: **SHADOW-STORY-ADDON-PARITY-20260914**.

## Runtime boundary

`Shadows/Sun Disc` uses the production `ShadowController`, solar sampler and
`buildSharedSceneAccumulator` used by the addon's mono path. `Shadows/Corridors`
uses the exact `ShadowTiledScene` receiver/publication path plus the same central
hard-sun controller. Only fixtures, camera interaction and presentation scale
belong to these DOM hosts; they do not have a second shader or solar model.

The old corridor observer-atlas host and cache benchmark are no longer exposed
as interactive stories. Scalar visibility/cached-RGB experiments remain in the
library and tests, but are not presented as addon modes. Geodetic sunrise/sunset
presets already mount the actual addon; point-light/night-traffic stories are
different lighting models, not solar-disc references.

## Defaults and acceptance boundary

Sun Reference uses 64 directions, a 2048 depth budget, hybrid FP16/FP32, no MSAA
and half drawing-buffer scale. Detail/Float32 presets use 128 directions.
Thin Occluders uses 80-degree sun so one-metre slats do not hide each other's
shadows. Corridors uses 32 directions, a four-render-pixel texel target, maximum
512 axis size, half drawing-buffer scale and no automatic camera tour.
These are story defaults only, not changes to addon quality profiles.

We chose lower deterministic preview work rather than a timeout that could
claim completion with unfinished pages. Arbitrary high-quality control values
and the opt-in multi-pass benchmark are outside the five-second default target.
Production Geoportal/terrain download performance is not measured by resident
fixtures. Tiled drag preserves completed publications and replans on drag end.

## Browser evidence, 2026-09-14

Reference client: Mac16,5, Apple M4 Max (32 GPU cores), 36 GiB unified memory,
Chrome 152 / WebGL2. Existing visible browser, 1728×998 CSS viewport, DPR 2;
actual default drawing buffers 1728×888 (Sun) and 1728×870 (Corridors).
Existing Storybook server; no CPU/network throttling. Three sequential fresh
iframe navigations per preset, third with HTTP cache disabled. This is not a
fresh browser/GPU process or cold production-server benchmark.

Timing is navigation start to the first animation frame after the DOM reports
complete accumulation/publication. Screenshots were then captured. It is not
a GPU-fence timer; LCP alone is not a shadow-readiness metric.

| Preset | Ready range, three runs |
| --- | ---: |
| Sun Reference | 248–332 ms |
| Penumbra Detail | 397–447 ms |
| Thin Occluders | 247–316 ms |
| Float32 precision | 389–477 ms |
| Point Sun | 107–129 ms |
| Corridors Reference | 997–1082 ms |
| Columns | 963–1024 ms |
| Floating Casters | 980–1025 ms |
| Retained shadows on drag | 963–1032 ms |

All 27 navigations completed. Every corridor result published all 50 pages at
32 directions. One 77 ms long task occurred in these repetitions; other runs
had none above the 50 ms observer threshold. The initial HMR-backed corridor
visit had a 367 ms setup long task and finished in 1393 ms. Thus low steady-state
submission cost does not mean first shader/module setup is nonblocking.

Before migration the old 128-direction, 2048-axis, 0.5-pixel animated corridor
fixture first completed after 10.6 s (different 1200×1143 CSS viewport). This is
context for the change, **not** a controlled engine speedup comparison: renderer,
defaults and viewport changed. Lower settings alone would not establish addon
parity, hence the host migration.

Reproducible local browser artifacts: `output/playwright/shadow-stories-check.js`,
`shadow-defaults-three-runs.log`, and `shadows-*.png` in that directory. Browser
control checks are recorded separately in `shadow-sun-controls.log` and
`shadow-corridor-controls.log`. These local output files are not shipped runtime.

Focused validation: 105 tests across controller, adapter, fixtures and benchmark
lifecycle. This is not a full-app performance or arbitrary-hardware guarantee.

Live Controls checks cover hard/soft switching and hidden soft defaults, all four
RGB formats, MSAA (including automatic zero for full FP32), all render scales,
sample/depth settings, shape/view, distance, elevation, exposure, intensity, texel
fit, raster jitter and opt-in benchmark completion. Corridor checks cover every
control, retained publications during drag and repeated tour start/stop. No page
errors occurred in those successful runs. Not every Cartesian combination of
extreme quality settings was tested.

The controls test caught a status-throttling defect on immediate retained-view
replay: a completed revision could be suppressed within 250 ms of the previous
one and have no later frame to publish it. Throttling now applies only within
the same revision and phase; final new-view status is never dropped.
