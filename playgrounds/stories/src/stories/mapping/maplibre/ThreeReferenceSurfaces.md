# Reference surfaces: focused visual diagnostics

Decision `REF-HORIZON-20260913` · 2026-09-13 · implemented prototype,
not geodetic or production-coverage certification.

## Scope

The old all-in-one Reference Surfaces page is split into seven Storybook entries
under `Terrain and Atmosphere/Reference Surfaces`. They keep the same demo
component and the shared raster/3D Tiles runtimes, not seven new loaders.

| Story | Question |
| --- | --- |
| Terrain · datum correction | What changes between normal heights in flat Mercator and H + GCG2016 in WGS84 ECEF? |
| Mesh and raster terrain | How do the textured 2024 mesh and corrected DOM look separately? Switch mesh appearance to elevation to use the same colour range. |
| Reference surfaces and Nivellement | Where are the generated reference surfaces and surveyed points? |
| Horizon · flat versus curved | How do curvature and datum correction change the 40.38 km Toelleturm–Nordhelle sightline? |
| Atmosphere · depth comparison | What does the analytic attenuation approximation contribute? |
| Sunrise · Toelleturm | Is the geometrical rising sun aligned with the terrain and camera? |
| Sunset · Nordhelle | Is the reverse sightline coherent near sunset? |

Default screen error is 2 px. Each story exposes only relevant controls. The old
`--reference-surfaces` URL remains, now for surfaces/points only. Diagnostics are
collapsed; colour and angular legends remain visible. The mesh overview stays
inside the local urban coverage, rather than presenting its distant source edge
as a terrain horizon. Changing the view can still expose that real source edge.

## Camera and rendering decisions

- Shared Three LOD and sky cameras use MapLibre's public vertical FOV and explicit
  center elevation. The previous private FOV remained at 36.87° while the map was
  at 10°; terrain traversal, the sky and the actual rendered view disagreed.
- Physical cameras derive their bearing/pitch from their ECEF eye and target,
  including the sampled GCG correction. The Toelleturm eye has 3 m clearance above
  the recorded DOM top. MapLibre's 89.9° pitch ceiling still applies, so a target
  slightly above the tangent horizon is visible but not exactly screen-centred.
- The artificial horizon uses perspective-angle mapping and follows actual map
  pitch/FOV on interaction, rather than stale Storybook arguments.
- Reference-only and viridis views do not wait for unrelated raster basemap
  downloads. Basemap sources remain authored; textured terrain enables the drape.
- The mesh consumes the Cesium-parity entry metadata and `providesTerrain` role.
  This does not prove its vertical datum or implement mesh flattening.

## Shader-displaced terrain bounds

The vertex shader transforms flat source vertices to a curved reference frame.
Using their original CPU bounds classified visible terrain as offscreen casters
and disabled its colour material. This caused orange sky bands through the sunset
foreground even after downloads had completed.

`boundsPaddingMeters` is an optional, non-negative local-metre envelope in the
shared raster runtime. Worker selection and runtime classification both expand
the same bounds before the root transform. Caster/receiver roles, retention and
published bounds therefore agree. Its default is zero for other consumers.
Three's additional per-mesh sphere culling is disabled for these shader-patched
reference meshes; admission still uses the shared runtime.

Curved reference stories use 1,500 m on each axis; flat normal-height views use
zero and flat corrected views reserve 64 m vertically. The fixed margin is scoped
to the declared source extent and these local origins. A 65×65 fixture over the
NRW source bounds, three origins, both curved models, source height endpoints and
a +64 m datum correction measured maximum absolute X/Y/Z displacement of
886.626 / 747.006 / 769.356 m. This is a sampled envelope, not a proof of continuous
extrema, nor a universal margin for another extent or sphere radius.

Revisit with exact per-tile transformed bounds before generalizing this diagnostic
to arbitrary datasets. Broad padding can admit extra work; this fix is not a
throughput benchmark or a no-holes guarantee under memory/network failure.

## Focused mount and horizon comparisons (2026-09-14)

Decision `REF-COMPARISON-20260914`. `Terrain and Atmosphere/Mesh Mount` and
`Terrain and Atmosphere/Terrain Horizon` add narrower, explicitly labelled
instruments without another tile loader. Existing story URLs are preserved.

Mesh Mount uses the published root transform translation, not the current map
center, as its fixed anchor. Its north/south probes are root-OBB face centers with
a 431.025 m inset. Metadata is stored in the resources project. A root box does
not establish actual content coverage at every probe. The comparison uses the
production loader's supported overlay role over planar true-ortho 2022; the mesh
is from 2024. Different capture dates are not projection residuals.

Default FOV is 0.1 degrees with unchanged z=0 ground scale. This is a narrow
perspective reference, not an orthographic camera. Ordinary perspective caused
large radial relief displacement even at the root. The UI reports the remaining
conditional bound for absolute mesh heights up to 1,000 m. Pan/zoom/resize retain
the map and runtime; changing the explicit mount anchor still replaces the
runtime and can request source data again. Exact nonlinear mesh flattening is
not implemented by this diagnostic.

Terrain Horizon uses one retained scene with an A/B geometry switch. Rendering
both long-range terrain instances together reproduced a worker allocation error;
even a clean single-view reload reproduced it before bounded terrain stitching.
The shared worker path now batches large geometry clones (see
`TERRAIN-STITCH-BATCH-20260914` in the engine's `TILES_COVERAGE.md`). This does not
solve the substantial total terrain footprint or guarantee unrestricted horizons.

Both A/B modes reserve the same conservative curved bounds. Switching modes
updates shader uniforms, not the terrain pool; all camera interaction is locked
for a reproducible comparison. View/FOV controls remain in Storybook. The physical
eye and height datum stay identical. The artificial horizon reports actual pitch;
the uphill target is not claimed to be the optical axis because MapLibre clamps
pitch to 89.9 degrees. Panel diagnostics have instance-owned records in
`window.__carmaReferenceSurfacesPanels`; a panel cannot delete another's record.

Nordhelle resources include the three tall transmitters plus Robert-Kolb. Their
independent full-NRW DGM anchors do not extend the clipped Terrarium coverage.
Langenberg adds the 301 m Hordt and 170 m Rommel masts: their mapped centers were
checked inside the actual terrain polygon and outside the mesh root extent.
All dimensions except sourced total heights are illustrative silhouettes. DGM
does not contain intervening vegetation or buildings. Neither story is a certified
viewshed. Resource READMEs separate mapping, ground samples, source disagreements,
authored geometry and licences. No Wikimedia bitmap or photo texture is bundled.

## Evidence and limits

- Focused fixtures cover FOV/center elevation, receiver/caster padding and worker
  selection, ECEF sightlines, source displacement and solar presets.
- In the shared visible Playwright session, the sunset foreground is continuous
  after the padding fix. Sunrise, datum, horizon, optical-depth and surface/point
  views were visually inspected. Local screenshots are in *unpublished validation artifact*.
- Presets use 2026-02-21 07:40 and 2026-08-23 20:27, Europe/Berlin. The shared solar
  calculation gives approximately +0.24° and +0.25° geometrical elevation; it does
  not include atmospheric refraction. Optical depth is dimensionless, not height.
- The overview targets a fixed 200 m elevation for readable framing, not a
  certified ground sample. Physical corridor views have separate explicit heights.
- GCG interpolation, float-shader precision, arbitrary reference-axis scaling and
  closest-point distances remain separate validation work. Displayed distances
  are signed same-coordinate separations, not closest-point residuals.
- Remote WMTS failures can still prevent a basemap texture from arriving. Neither
  those failures nor actual source holes are repaired by changing camera bounds.
- Mesh imagery and elevation views both render in the checked local preset, but
  the loader still reports outstanding coverage refinement. The story now says
  "visible" instead of claiming complete readiness or looking permanently blank.

Keep the shared camera/bounds regression fixes reviewable separately from this
story composition and from the main tile-loading-manager integration branch.
