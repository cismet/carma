# Launching layers from a URL

Geoportal accepts repeated `addLayer` parameters in the router hash query:

```text
/#/addons?lat=51.2268312&lng=7.1959211&zoom=19.51&addLayer=https%3A%2F%2Ftiles.cismet.de%2Flod2%2Fmesh2024.style.json&ff=debug
```

Use `encodeURIComponent(styleUrl)` for every value, especially URLs containing
`?`, `&` or `#`. Repeat `&addLayer=...` for additional styles. These are HTTP(S)
MapLibre/CARMA style JSON URLs, using the same metadata and layer conversion as
Geoportal's drop/default-layer paths. Existing `additionalLayers` app config
populates the catalog; `addLayer` activates the styles directly.

The launch list is captured once on mount, waits for app configuration, and
imports styles sequentially in URL order. Later entries are appended after
earlier entries using the normal stack placement rules. Duplicate URLs are
ignored; an existing layer is made visible instead of duplicated. A failed URL
does not stop later entries. Normal layer persistence still applies.

The captured `addLayer` parameters are removed once with router replace; camera,
feature flags and other parameters remain. This avoids repeated keys being
collapsed by normal camera hash updates.

This is input only: editing the layer stack does not write an `addLayer` state,
and subsequent camera/hash changes do not replay it. Opening the original launch URL
consumes its parameters again. No new layer-to-URL synchronization is installed.

## Mesh diagnostics without shadows

The existing feature flag `ff=debug` exposes a bug button named **Mesh-Diagnose**
when the map has a mounted 3D Tiles runtime. It opens the same diagnostics overlay
as the shadow options without enabling shadows or changing their state. Closing
the panel returns to the button; removing the last mesh hides the entrypoint.
Without the flag, normal mesh loading adds no debug controls. Shadow diagnostic
options keep their existing behavior. Diagnostic panels remain lazy-loaded and
inactive until opened. Combine existing flags with dots, e.g. `ff=debug.dev`.
