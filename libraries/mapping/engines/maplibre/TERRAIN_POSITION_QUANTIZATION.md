# Terrain position quantization

This bounded CPU experiment uses production tile bounds, local ECEF frames and
source geometric-error calculation. Each representative Wuppertal tile samples
a 65×65 grid at elevations 0, 300 and 600 m. Native Float32 positions are encoded
in normalized UInt16 using independent axis offsets/scales. It is an analytical
assessment with synthetic terrain, not a DEM, GPU or image-quality benchmark.

| Raster zoom | Tile span | Maximum 3D error | Maximum elevation error | Added SSE at 0.5 px | Added SSE at 6 px |
| --- | ---: | ---: | ---: | ---: | ---: |
| 9 | 49.17 km | 527.9 mm | 7.7 mm | 0.00276 px | 0.0331 px |
| 10 | 24.59 km | 263.0 mm | 5.2 mm | 0.00276 px | 0.0332 px |
| 11 | 12.29 km | 132.3 mm | 4.7 mm | 0.00277 px | 0.0332 px |
| 12 | 6.14 km | 66.1 mm | 4.6 mm | 0.00277 px | 0.0332 px |
| 13 | 3.07 km | 33.1 mm | 4.6 mm | 0.00279 px | 0.0335 px |
| 14 | 1.53 km | 16.9 mm | 4.6 mm | 0.00287 px | 0.0344 px |
| 15 | 0.77 km | 9.3 mm | 4.6 mm | 0.00316 px | 0.0379 px |
| 16 | 0.38 km | 6.1 mm | 4.6 mm | 0.00412 px | 0.0495 px |

The conservative reconstruction bound is
`sqrt(dx² + dy² + dz²) / (2 × 65535)` for the per-axis tile box spans.
Added SSE is that bound divided by the source geometric error, multiplied by
the target: it estimates extra error at the LOD target distance, rather than
measuring a specific camera. Coarse decimeter/submeter allowances pass here;
a strict 1 cm Euclidean bound passes only zooms 15–16. Synthetic height-error
measurements do not certify arbitrary DEMs; the 3D bound remains the safe limit.

Three.js can use a normalized UInt16 position attribute and a tile-local matrix
`tileMatrix × translate(boxMin) × scale(boxSpan)` without custom position GLSL.
The nonuniform scale requires normal compensation:
`normalize(physicalNormal × boxSpan)`. Float32 roundtrip tests preserve normal
direction within approximately 0.0000015 degrees; lighting parity is unverified.

A dense 512 raster has 264,196 vertices including its boundary. UInt16 positions
save 1.512 MiB in CPU attributes and another 1.512 MiB after GPU upload. Geometry
buffers shrink by 12.52%; retained native topology, source arrays, samplers and
indices remain unchanged. UInt32 provides no byte saving over Float32.

## Real DEM follow-up

A CPU-only encoding check used three already-published Wuppertal DEM geometries,
including seam vertices. Each position was written to an actual UInt16 array
and reconstructed against its local ECEF bounding box.

| Raster LOD | Vertices | Max additional 3D error | Added SSE at 0.5 px |
| --- | ---: | ---: | ---: |
| 9 | 265,348 | 0.537 m | 0.00280 px |
| 12 | 266,317 | 0.0659 m | 0.00275 px |
| 16 | 264,196 | 0.00414 m | 0.00277 px |

SSE values are ratios to source geometric error at the LOD target distance,
not rendered pixel differences. This extends the synthetic CPU result to real
geometry; it does not verify GPU normals, shadows or persistent quantized reloads.
No live geometry was replaced.

Float32 remains the current format. Before enabling a UInt16 codec, validate
real surfaces and shadows, record quantization error in tile geometric error,
reject tiles exceeding their LOD allowance, and version the cache representation.
