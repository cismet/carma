# engines/maplibre

## Mesh memory and shadow casting — MESH-BUDGET-20260908

- **ID / date / status:** MESH-BUDGET-20260908 / 2026-09-08 / implemented, no universal OOM guarantee.
- **Context and constraints:** Surface meshes must reach requested visible LOD before optional sun-disc refinement. The former device ceiling silently rejected larger explicit budgets. Photogrammetric meshes are not single-valued raster heightfields: back-facing triangles must also occlude sunlight.
- **Decision:** Explicit mesh cache budgets override conservative device defaults, up to the user-requested 24 GiB maximum. The shadow display panel exposes GiB; blank restores device defaults. Admission uses predicted/resident tile costs including CPU overhead, with bounded accounting drift; this is not a measurement of total process RAM or GPU VRAM. Optional Chromium heap telemetry pauses admission/download/parse at 80% of the reported heap limit and resumes below 65%. Check at most once per second, reclaim unused cache entries and unfinished loads while preserving visible replacements. No render loop for paused queues. WebGL context loss pauses loads until restoration; reported allocation failure latches the pause until explicit budget reconfiguration. Missing telemetry retains the finite admission budget, not unlimited growth. Surface 3D meshes cast with `DoubleSide`; visible render side is unchanged and the separate raster heightfield remains `FrontSide`.
- **Alternatives and disposition:** Unbounded automatic growth: incompatible by inspection with the absence of portable available-RAM/VRAM telemetry. CPU Compute Pressure and storage quota: incompatible as RAM/VRAM availability signals. Raising the global default to 24 GiB for all devices: rejected by safety constraints; only explicit overrides change it. Front-only photogrammetric casters: excludes away-facing triangles. Full saturation/OOM stress testing: deliberately not performed on the user's active session.
- **Evidence:** Focused runtime/policy/UI tests cover 24 GiB acceptance/clamping, pressure hysteresis, context pause/recovery, budget propagation and double-sided shadow materials. Live Playwright selection reaches 24 GiB; at one later snapshot the cache accountant reports 23.996 GiB (including reservations), 726 visible tiles, requested error 1px, with download/parse limits zero at heap usage 3.38/4.09 GiB. No context loss/error page observed. All 286 mesh materials in an earlier loaded snapshot used double-sided shadow casting. Full LOD convergence and visual elimination of every reported halo are not established by these snapshots.
- **References:** [Three.js material shadow-side semantics](https://threejs.org/docs/pages/Material.html#shadowSide), [WebGL memory-budget limitations](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#estimate_a_per-pixel_vram_budget).
- **Revisit when:** Portable total-memory pressure signals become available, a supported device cannot sustain an explicit budget, or loaded replacement families themselves pin excessive heap after unfinished loads are canceled.

## Build

```sh
nx build engines/maplibre
```

## Test

```sh
nx test engines/maplibre
```

## Lint

```sh
nx lint engines/maplibre
```

## Shared Three.js scene

`buildSharedThreeSceneLayer` creates one MapLibre custom layer whose Three.js
scene can host multiple `SharedThreeSceneRuntime` roots. Point clouds, 3D Tiles,
and simulation geometry can therefore share one renderer and scene graph.
`buildThreeTilesRuntime` adds a streamed Cesium 3D Tiles tileset to that scene;
callers can retain its `root` or use the layer's `getScene()` accessor for
custom shadow or simulation passes.

Existing `carma3d` building and vegetation layers still own their established
custom scenes for selection and overlays. Their generic-layer registry emits
lifecycle and geometry changes so simulation addons can discover and light
that content consistently while it is visible.

MapLibre raster-DEM terrain is not Three.js geometry in this scene. The shared
layer currently queries its elevation only to align the frame camera target.
A simulation that needs terrain as a shadow receiver must add an explicit
terrain-mesh runtime to the shared scene.
