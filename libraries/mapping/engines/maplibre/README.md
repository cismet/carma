# engines/maplibre

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
