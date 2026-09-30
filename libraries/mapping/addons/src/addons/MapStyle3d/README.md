# MapStyle3d

An optional presentation of the existing MapLibre style on the shared Three.js
scene: line labels follow terrain or textured 3D tiles, while point labels and
symbols float above the scene. It retains the map-style colors, fonts and icon
assets, and uses the mesh-specific label rules when a textured mesh supplies the
ground. It does not load another tileset or change tile quality or request policy.

Enable `mapStyle3d` in the addon manager, or declare it on a route:

```ts
addons: ["mapStyle3d"];
```

Terrain-providing mesh styles use `basemap: "labels"` (the default) for this
presentation. An explicit `basemap: "none"` keeps that tileset standalone; the
addon does not override this per-layer choice.

Optional configuration:

```ts
{ kind: "mapStyle3d", config: {
  pointLabels: true,
  elevationLines: false,
  elevationLabels: false,
} }
```

Removing the addon restores the authored label paint, terrain treatment and
layer visibility. Shadow simulation independently retains its presentation;
removing MapStyle3d does not disable an active shadow scene. The addon attaches
when the map becomes available and follows runtime registration and style
replacement through the shared scene registry.
