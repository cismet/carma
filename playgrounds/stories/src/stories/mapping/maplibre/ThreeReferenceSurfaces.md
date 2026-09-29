# Reference surfaces: focused visual diagnostics

Tags: stories, geodesy, terrain, horizon
Role: current scope, camera geometry and limits of the Reference Surfaces stories.
Load when: changing terrain reference rendering, horizon presets or source-bounds diagnostics.

## Scope

Seven Storybook entries under `Terrain and Atmosphere/Projections/Reference Surfaces` compose `MapLibreThreeReferenceSurfacesDemo` with one shared raster/3D Tiles implementation:

| Story | Comparison |
| --- | --- |
| Terrain · datum correction | Normal heights in flat Mercator versus H + GCG2016 in WGS84 ECEF. |
| Mesh and raster terrain | Textured Mesh 2024 and corrected DOM, separately or with common elevation colours. |
| Reference surfaces and Nivellement | Generated surfaces and surveyed points. |
| Horizon · flat versus curved | Curvature and datum correction along the 40.38 km Toelleturm–Nordhelle sightline. |
| Atmosphere · depth comparison | Analytic attenuation approximation. |
| Sunrise · Toelleturm | Geometric sun alignment with the terrain and camera. |
| Sunset · Nordhelle | Reverse sightline near sunset. |

The default screen-error target is 2 CSS pixels. Each entry exposes relevant controls while reusing the same demo and source runtimes. The `--reference-surfaces` URL selects surfaces and points. Colour and angular legends remain visible; diagnostics start collapsed. The mesh overview stays within local urban mesh coverage. Panning outward can reveal the actual edge of that source.

## Camera and rendering

The shared Three LOD and sky cameras use MapLibre's public vertical FOV and explicit centre elevation. Physical sightline cameras derive bearing and pitch from ECEF eye and target, including the sampled GCG correction. The Toelleturm eye has 3 m clearance above the recorded DOM top. MapLibre clamps pitch to 89.9°, so a target above the tangent horizon can appear without being exactly screen-centred. The artificial horizon uses perspective-angle mapping and follows live map pitch and FOV.

Reference-only and viridis views do not wait for unrelated raster basemap downloads. Textured terrain enables the drape; authored basemap sources remain available. The mesh uses the Cesium-parity metadata and terrain-provider role. None of these settings establishes its source vertical datum or flattens its geometry.

## Shader-displaced terrain bounds

The reference shader bends flat source vertices into curved model space. `boundsPaddingMeters` expands the raster runtime's worker-selection and published local-metre boxes before the root transform, so receiver/caster classification and retention use the same conservative envelope. It is optional, non-negative and defaults to zero for other consumers. Per-mesh Three sphere culling is disabled for these shader-patched reference meshes; normal runtime admission still applies.

Curved reference presets use 1,500 m padding on each axis. Flat normal-height views use zero; flat corrected views reserve 64 m vertically. A 65×65 sample over the NRW source bounds, three origins, both curved models, source height endpoints and a +64 m datum correction found maximum absolute X/Y/Z displacement of 886.626 / 747.006 / 769.356 m. This is a sampled envelope for those presets, not continuous extrema or a transferable bound for another source. Broad padding can admit extra work.

## Mesh mount and horizon instruments

Mesh Mount uses the published mesh-root translation as its fixed anchor. North/south probes are root-OBB face centres with a 431.025 m inset; a root box does not prove content exists at each probe. The comparison uses the production mesh loader over planar true-ortho 2022, whereas mesh imagery is from 2024. Different capture dates are not projection residuals. A 0.1° vertical FOV gives a narrow perspective comparison at the same z=0 ground scale; it is not orthographic. Pan, zoom and resize retain the runtime, while changing the explicit mount anchor rebuilds it. The UI reports the conditional perspective bound for mesh heights up to 1,000 m; no exact nonlinear flattening is performed here.

Terrain Horizon uses one retained scene and an A/B geometry switch. The shared worker batches large terrain geometry clones, but source and resident terrain size still bound long-range use. Both A/B modes reserve the same conservative curved bounds. Switching modes updates uniforms without replacing the terrain pool; camera interaction is locked for the comparison and view/FOV controls remain in Storybook. The physical eye and height datum stay identical. MapLibre's pitch clamp keeps the uphill target from always lying on the optical axis. Instance-owned panel records in `window.__carmaReferenceSurfacesPanels` prevent one panel from deleting another's diagnostics.

Nordhelle resources include three tall transmitters and Robert-Kolb. Langenberg includes the sourced 301 m Hordt and 170 m Rommel masts; their centres were checked inside the terrain polygon and outside the mesh-root extent. Independent full-NRW DGM anchors do not extend clipped Terrarium coverage. All dimensions except sourced total heights are illustrative silhouettes. DGM omits intervening vegetation and buildings. The resource READMEs distinguish mapping, ground samples, conflicting source claims, authored geometry and licences; no Wikimedia photo texture is bundled.

## Evidence and limits

Focused fixtures cover FOV and centre elevation, padded receiver/caster selection, ECEF sightlines, source displacement and solar presets. A local browser inspection found continuous sunset foreground after bounded padding, but it was not a general no-holes or throughput test. Presets use 2026-02-21 07:40 and 2026-08-23 20:27 Europe/Berlin; the shared solar model yields approximately +0.24° and +0.25° geometric elevation without atmospheric refraction. Optical depth is dimensionless. The overview uses a fixed 200 m display elevation; physical corridor views have separate explicit heights.

GCG interpolation, shader precision, arbitrary reference-axis scaling and closest-point distances require their own validation. Displayed distances are signed same-coordinate separations, not closest-point residuals. Remote WMTS failures or source holes can still prevent textured coverage. Neither story is a certified viewshed, and visible mesh imagery does not certify completed LOD refinement.
