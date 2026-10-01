# Tile manager feature stories

The **Feature Policies** group exercises production functions with deterministic
payload/metadata inputs. Each named case has a `play` invariant check. These
cases do not replace integration, throughput, storage-I/O or image-quality checks.

| Feature | Focused cases | Live integration |
| --- | --- | --- |
| Seam construction | [Terrain seam geometry](./terrain-seam-geometry.stories.tsx): actual raster meshing, boundary ownership, compact-shell positions and normals | [Terrain comparison](../maplibre/TerrainGeometryComparison.stories.tsx) |
| LOD rings | [Seam rings](./seam-rings.stories.tsx): complete sibling publication and outward error bands | [Reference](./MeshCoverage.stories.tsx) |
| Resident/persisted base | [Base coverage](./base-coverage.stories.tsx): complete restored cut, memory floor, build invalidation | [Reference](./MeshCoverage.stories.tsx) |
| Multiple cameras | [Camera demand](./multi-camera-demand.stories.tsx): real frustum intersections, normalized area and first-fill priority | [Camera Views](./TileCameraStress.stories.tsx) |
| Offscreen shadow casters | [Caster demand](./shadow-caster-demand.stories.tsx): receiver reuse, geometry-only demand and ancestor exclusion | [Lights](./TileLightStress.stories.tsx), [Corridors](../shadows/TiledCorridors.stories.tsx) |
