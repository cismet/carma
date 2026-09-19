# Tile diagnostics UI

The tile manager debugger of the mapping stories as a library: a draggable
toolbar that opens the diagnostic panels, overlays and charts for one 3D Tiles
runtime. It needs the full runtime handle (`ThreeTilesRuntime`), which
`Tiles3dLayerManager` registers per map; hosts read it through
`getTiles3dRuntimeHandles` and `subscribeTiles3dRuntimeHandles` from
`@carma-mapping/engines/maplibre`.

Nothing here is loaded while the debugger is closed: the content, the Three
debug plugin and the workers arrive on demand. The geoportal mounts it only
with the development UI (localhost or the developer-mode flag); the stories
mount it directly.

The diagnostics themselves live in the engine, see
`libraries/mapping/engines/maplibre/TILE_DIAGNOSTICS.md`.
