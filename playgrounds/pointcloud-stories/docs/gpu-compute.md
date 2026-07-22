# Baked point-cloud occlusion

## Current renderer boundary

The MapLibre point-cloud route renders through Three.js/WebGL. Ambient occlusion is never computed in the viewer: when a COPC contains a baked `AO` scalar field, the renderer consumes it through the normal colorization path. Tile selection, 3D Tiles lifecycle, depth sorting, and spatial registration remain Three.js or `3d-tiles-renderer` responsibilities.

TypeGPU is a viable incremental tool for custom compute and shader code, not a replacement for those renderers. Its core API can wrap an existing `GPUDevice`, buffer, or bind-group resource, while `@typegpu/three` can expose a TypeGPU function as a TSL node. TypeScript-authored GPU functions require the `unplugin-typegpu` build integration. The Three integration currently removes Three's WebGL fallback, and TypeGPU remains pre-1.0. The project therefore does not add the dependency yet.

Primary references:

- <https://docs.swmansion.com/TypeGPU/integration/webgpu-interoperability/>
- <https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-three/>
- <https://github.com/software-mansion/TypeGPU>

## Offline point-cloud plus mesh occlusion

Combined ambient occlusion becomes meaningful only after point cloud and mesh share a sufficiently stable registration. Browser WebGPU has no portable hardware ray-tracing API, so the practical implementation is a shared local occupancy representation:

1. Select the visible/working point-cloud and mesh extent in the same local East/North/Up frame.
2. Voxelize the actual local point population with the requested 0.5 m support radius and rasterize every intersecting mesh triangle into the same occupancy grid. Do not infer occupancy from one global average density.
3. Ray-march the existing upper-hemisphere directions from every point through the combined occupancy field.
4. Store one AO byte per point in the derived COPC.

AO is baked offline against a fixed, documented Mesh 2024 resolution. Runtime AO would depend on resident mesh LOD and change while tiles refine, so it is not part of the viewer. Registration error, mesh LOD, voxel size, support radius, ray count, and source hashes must accompany every derived AO result.

COPC already supplies the octree for range retrieval, frustum selection, and chunk-local spacing. The production bake traces 50 m AO rays through exact voxel occupancy and selects Mesh 2024 geometry with the same 50 m halo. Mesh triangles use an AABB/BVH for extent selection and a conservative triangle/voxel intersection test. For city-scale processing, partition the occupancy into sparse bricks or a mipmapped sparse voxel octree and retain the same ray-length halo around each block.

CloudCompare's qPCV is a useful visual baseline, but it renders each loaded cloud or mesh independently into fixed-resolution orthographic depth buffers. It neither combines a separate point cloud and mesh into one occluder nor provides a density-independent reference for this bake. This was verified against CloudCompare source commit `c7d5bb7`: [`PCV.cpp`](https://github.com/CloudCompare/CloudCompare/blob/c7d5bb7eb9187203c17fb557bc7bf372638a31d4/plugins/core/Standard/qPCV/src/PCV.cpp) contains the depth-buffer passes and [`PCVCommand.cpp`](https://github.com/CloudCompare/CloudCompare/blob/c7d5bb7eb9187203c17fb557bc7bf372638a31d4/plugins/core/Standard/qPCV/src/PCVCommand.cpp) dispatches them per loaded entity.
