# Instanced terrain presentation

The shared Three terrain runtime presents compatible prepared terrain meshes as instances by default. Geoportal, its shadow addon and other shared-scene consumers use the same integration. The terrain manager continues to own conversion, tile requests, LOD selection, coverage, seams, memory admission and persistent storage.

Compatible tiles share index and UV buffers. Their prepared RTC/ECEF positions and normals are stored losslessly in bounded Float32 texture-array pages. Color, directional-shadow depth and point-shadow distance passes fetch the same prepared vertices. Positions, normals, topology, UVs and bounds are preserved; source PNGs require no changes.

## Ownership and rendering

- The adapter borrows the published terrain cut and never changes source visibility or loading policies. Source and target belong to independent rendering trees.
- Compatible Standard/Phong/Lambert surfaces and unlit caster materials are batched using RTC anchors. Unsupported layouts, materials and transforms retain their source presentation; singleton groups also retain the source mesh.
- Unchanged frames mark no vertex or matrix uploads. Changed layers update independently, and unaffected batches survive unrelated tile arrivals.
- Picking uses the retained source CPU geometry. Disposal releases only adapter-owned resources.

## Shared runtime integration

The shared scene host supplies its renderer through `SharedThreeSceneFrame`. The runtime retains manager-owned meshes in a hidden query group and renders the same published cut in a separate presentation group. Original geometry remains available for exact picking and receiver/caster queries. Projected MapLibre textures and shadow capture compose with the prepared-vertex shader; instance transforms apply before the model transform.

Packed buffers count against the existing terrain memory grant. If allocation is denied, a tile is unsupported or WebGL2 texture arrays are unavailable, the original geometry renders through a fallback. Allocation failures restore native coverage and disable instancing for that runtime. Memory pressure releases presentation buffers before deferring terrain detail. Set `instancedRendering: false` on `buildRasterDemTerrainRuntime` for a native reference. Standalone callers should supply `frame.renderer` to enable the shared presentation; query-only consumers need no renderer.

## Cost and limits

Shared topology and instancing reduce duplicate render buffers and draw submissions. Network transfer and raster meshing are unchanged. The adapter retains source geometry and allocates packed texture data, so representation estimates do not establish lower total resident or driver memory. Shared imagery textures are excluded from both estimates.

Batched bounds have coarser culling than independent tiles and may submit more offscreen triangles, including in shadow passes. Vertex texture fetches also execute in each pass. Rendering speed must therefore be measured independently of draw count or payload estimates.

## Comparison and validation

The offline comparison uses identical prepared ECEF geometry, camera and sunlight, with optional hard shadows and wireframes. The manager comparison uses the existing published cut and 0.5 CSS-pixel target.

[The focused GPU probe](../../../../../../../../../scripts/terrain-rendering/README.md) checks shader compilation, image parity at two pitches with shadows off/on, unchanged uploads and resource lifecycle without external requests. Numerical transform order can cause minor rasterization differences even though packed vertices are lossless.
