# Mesh reference comparisons

Tags: stories, projections, mesh, geodesy
Role: active mesh comparison methods, numerical measurements and interpretation limits.
Load when: changing Mesh Alignment stories, reprojection methods or elevation diagnostics.

## Current comparison stories

`Terrain and Atmosphere/Projections/Mesh Alignment` exposes four active stories: Reference (four locations), Method errors (numerical acceptance), Transform strategies (one opaque mesh) and Why rigid mounts diverge (diagram). The comparison selects Mesh 2024 or LoD2 over a topo basemap projected through the shared addon path. Original model texture remains available by disabling style projection. The story does not use a translucent aerial overlay or a second tile manager. The multi-camera Shared Views diagnostic lives with Tile Loading Manager and tests one scene and tile pool; it is a different comparison from two independent synchronized maps.

The mesh-root coordinate remains fixed while camera presets change. A root bounding box is a probe domain, not proof of content at every point. The WGS84 input-geometry and encoded-height interpretations are diagnostic assumptions pending independent source/control-point verification. Horizontal projection, vertical datum, scene mount and imagery acquisition date must be assessed separately. Geometric point samples do not certify a rendered mesh or whole-source coverage.

## Anchored elevation differences

Elevation Stripes distinguishes relative normal height `ΔH`, relative ellipsoidal height `Δh`, their difference `Δh − ΔH = ζ(P) − ζ(anchor)`, and ECEF tangent-mount sag. The adjustable anchor H is a declared diagnostic assumption, not surveyed ground. The absolute/anchor-relative datum selector, numerical readouts and GPU LUT all use `getGcg2016HeightAnomalies` from `@carma-geo/proj` and the shared `@carma-commons/resources/gcg2016` grid with BKG-compatible interpolation. No separate geoid coefficients live in the story.

| Site | Sampled Δζ from mesh root | WGS84 zero-height tangent drop |
| --- | ---: | ---: |
| Rathaus Barmen | −0.042 m | −1.468 m |
| Paul-Flocke-Weg | −0.106 m | −8.041 m |
| Cronenberg | +0.013 m | −1.697 m |
| Stoffelsberg | +0.244 m | −7.325 m |
| Nordhelle, outside mesh | +1.076 m | −142.000 m |

The sampled city sites span about 35 cm in anomaly difference, while the separate tangent drop reaches metres. Neither value establishes observed mesh error or source datum. GPU sag is a quadratic local approximation; the half-float GCG field and texel-centred sampling avoid coarse 8-bit steps. Datum/sag colours use a 17×17 viewport-ground-footprint range sampled on moveend/resize, with a 1 mm minimum span. This is sampled coverage rather than exact triangle extrema. Scalar views use 0.1 m and emphasized 1 m contours, with fade independent of colour range. Raster bending is independent of colour interpretation.

The default comparison mounts one corrected DSM over the broader Barmen view; a second panel is optional. Each bounded raster runtime selects at most 16 tiles, retains at most 24 cached meshes, uses a 32 MiB source cache and two concurrent requests. An optional mesh budget is 384 MiB. Hidden comparison tabs unmount their runtimes, and material disposal releases shader bindings. These are story-local limits, not total browser or GPU memory caps.

## Reprojection modes

The single `reprojectionMode` selector in `MeshMountDemo` and `MESH_REPROJECTION_METHODS` controls one native tile-preparation path:

| Mode | Geometry or mount operation | Camera movement |
| --- | --- | --- |
| Off | Original fixed rigid root tangent | Retains geometry. |
| Camera tangent | Tangent frame at map centre with latitude scale | Changes parent matrix only. |
| Camera metric | Camera tangent plus ellipsoid R/N east and R/M north scales | Changes parent matrix only. |
| Fixed sphere | Principal-axis-fitted sphere followed by nonlinear Mercator unwrap | Retains prepared geometry. |
| Global-fit sphere | Local-domain least-squares fit after sphere mapping | Retains prepared geometry. |
| Local AEQD | Spherical azimuthal equidistant map with camera-local differential fit | Retains prepared geometry; changes parent matrix. |
| Ellipsoid LUT | ECEF → WGS84 geodetic → spherical Web Mercator via segmented lookup | Retains prepared geometry. |
| Ellipsoid direct | Same mapping computed directly | Retains prepared geometry. |

“Global fit” refers to the declared local ±24 km domain, not all Earth. AEQD is spherical, not an ellipsoidal geodesic. No mode changes vertical datum. MapLibre's scene metres use its mean-sphere radius; EPSG:3857 uses the WGS84 semi-major radius. Confusing them introduces a first-order horizontal scale mismatch. A camera-local affine fit improves its neighbourhood but cannot flatten a curved regional ellipsoid everywhere.

Nonlinear modes use one existing native preparation plugin. It projects metadata bounds, positions, normals and tangents while retaining UVs; geometry publication is atomic and cancellable, yielding every 1,024 vertices. Uploaded Float32 positions are enclosed by the prepared bounds. Work is done when tiles are prepared, without a per-frame nonlinear warp. Pan/zoom retains the pool; an explicit method or grid change rebuilds the diagnostic pool. The local displacement LUT uses CPU doubles for full coordinates and Float32 deltas for a bounded domain. It does not silently clamp outside-domain points, support global Mercator singularities or create a persistent projected-artifact cache.

The selector offers 1 cm, 10 cm and 1 m ellipsoid-lookup targets with 400, 1,200 and 4,000 m grids. Sampled Float32-inclusive maxima over the declared local domain were 6.593 mm, 5.699 cm and 63.222 cm, including the interpolation envelope. These are method-approximation budgets, not source or rendered accuracy. Prefer the 1 cm setting for the numerical experiment. In a separate 603-point comparison over 48 km, the 250 m full-ellipsoid lookup gave 2.51 mm sampled error, versus 518.67 mm for the fitted sphere and 497.72 mm after its domain fit. A closer local fit may still worsen another part of the domain. Direct ellipsoid projection is the zero-error mathematical reference for this comparison.

[The projection benchmark](./MESH_PROJECTION_BENCHMARK.md) records method, reproduction and raw timing limits. On the measured M4 Max client, converting the same 59,931 loaded vertices took median active CPU 85.4 / 84.3 / 72.6 ms for the three lookup grids and 193.8 ms for direct projection; lookup initialization took 28.7 / 4.0 / 0.4 ms separately. Seven samples vary substantially and exclude upload and GPU frame time. The coarsest lookup has no established end-to-end throughput advantage.

## Imagery and model measurements

The 2024 true-orthophoto comparison uses `GIS-102:trueortho2024` as EPSG:3857 WMS with regular 512-pixel bbox tiles. Its WMTS capabilities advertise 256-pixel grids; relabelling those as 512-pixel tiles would change scale rather than supply larger source images. The WMS and mesh both depict the 2024 flight, but neither image registration nor source datum is certified by that common year. Other mesh-mount views can use LoD2 and independent city-map imagery with native attribution.

A fixed-root, narrow-perspective Cronenberg capture at 7.12825/51.20561, zoom 17, FOV 0.1°, 1966×889 CSS pixels and DPR 2 registered separate mesh and 2024 true-ortho images with 327 SIFT/RANSAC inliers. Measured mesh-to-ortho centre displacement was (+26.9149, −7.3991) CSS pixels, magnitude 27.9134; the median transform-fit residual was 0.4759 CSS pixels. The corresponding h=0 rigid-root ENU versus exact MapLibre Mercator prediction was (+25.8262, −7.9603) CSS pixels; vector disagreement was about 1.23 CSS pixels. These are a measured image displacement and a model prediction, not a control-point accuracy certificate. Mixed source LOD, relief, lossy captures, the match distribution and unknown source datum remain limitations.

At Beyenburg, the analytical fixed-root ENU-to-Mercator difference at h=0 is 32.356732 m horizontally and −7.325101 m vertically, or 33.175522 m in 3D. A first-order local sphere fit with east/north scales N/R and M/R differs by 0.033396 m there. The sampled maximum sphere-fit residual over rectangular mesh metadata bounds is 0.104473 m, not a city-polygon maximum. At the root latitude, the north ENU component of a changed longitude includes `N·cos(phi₀)·sin(phi₀)·(1−cos(Δλ))`, while Mercator northing stays constant. Parallel bending contributes to the north difference; the mean-sphere metric mismatch contributes strongly to the east difference. These values describe the fixed raw-mount convention, not an inevitable error of correctly reprojected mesh content.

## Analytical graphics and sources

`render-mesh-scale-isolines.mjs` generates separate latitude-scale and full rigid-mount displacement maps, plus filled 3D ENU-versus-Mercator and locally axis-fitted-sphere comparisons. The graphics sample h=0 geodetic points; contour interpolation is descriptive, not an exact survey bound. The plotted municipal outline comes from [Stadt Wuppertal's Stadtgebiet GeoJSON](https://daten.wuppertal.de/Infrastruktur_Bauen_Wohnen/Stadtgebiet_EPSG4326_JSON.json), with [catalog metadata](https://data.gov.de/suche/daten/stadtgebiet-wuppertal9c823) and CC BY 4.0 attribution. It is a statistical subdivision, not a parcel-accurate mesh footprint. The reproducible generator preserves the source polygon vertices.

Mesh Mount's multiply/screen comparison happens in the mesh material against the previously drawn orthophoto; it is a qualitative contour aid, not an image-error metric. Numerical tests report position loops separately from tile preparation, uploads and GPU time. Source format and vertical datum, triangle interiors, LOD boundary continuity, orthophoto residuals at all four sites and full visual acceptance remain open. No measurement here certifies the nonlinear path for production use.
