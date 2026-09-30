# Tile diagnostics UI

Shared tile manager debugger for Geoportal and mapping stories: a draggable
toolbar that opens the diagnostic panels, overlays and charts for one 3D Tiles
runtime. It needs the full runtime handle (`ThreeTilesRuntime`), which
`Tiles3dLayerManager` registers per map; hosts read it through
`getTiles3dRuntimeHandles` and `subscribeTiles3dRuntimeHandles` from
`@carma-mapping/engines/maplibre`.

The heavy diagnostic content, Three debug plugin and workers arrive on demand
when the debugger opens. Geoportal exposes it through the explicit `ff=debug`
flag or shadow diagnostics
option; localhost alone does not enable it. Stories consume the same library.
The debug flag opens the overview and stats timeline by default. Both remain
independently closable. Engine pipeline measurement lives in MapLibre diagnostics;
chart presentation lives in this library. Neither imports story/playground code.

The diagnostics themselves live in the engine, see
`libraries/mapping/engines/maplibre/TILE_DIAGNOSTICS.md`.
