# Oblique imagery viewer

This project continues Thorsten’s MapLibre/Three.js oblique viewer originally implemented inside `mapping/addons/src/addons/ObliqueViewer`. Pure camera/data/selection logic lives in `src/lib/core`; React, image loading and camera flights live in `src/lib/runtime`. The mapping-addons package owns the route registry and persistent state adapter and mounts this feature through its public API. This project does not import the addon registry.

The Cesium viewer is the legacy implementation. This change does not update its runtime.

## Imagery series

The host declares a list of series. The panel's multiple-selection dropdown enables each independently: 2024, the full 2026 delivery, the 41-image 2026 Rathaus sample, any combination, or none. Enabled series participate in one geometric selection. Source image names are opaque asset identifiers; a series-qualified key identifies records in state and indexes. A filename shared by two years therefore remains two separate records and URLs always use the original source name.

The list names the acquisitions as 03/2024 and 04/2026, with a Sample suffix for the independent Rathaus subset. The 2024 month follows the published March 14/17 flight description in the Geoportal background configuration; the 2026 delivery's Aufnahmeorte.shp records April 11 in ATTR_6 for all 7,436 capture points. Short footprint labels are `2024`, `2026`, and `2026Test`, and are shown only while more than one series is enabled. The first-level layer button uses those short labels for all active series plus the current heading and pitch, rounded to degrees; the image ID stays in the expanded tools.

Each series owns its metadata URI, asset base URL, camera calibrations, source conventions and height datum. 2024 has no nadir assets. 2026 includes all five Osprey heads; camera-relative labels LE/RI/FW/BW/NA do not define fixed north/east/south/west eligibility.

Metadata and asset availability are separate. The 2026 preset prepares the viewer for the metadata/derivatives endpoint; it does not create JPEG derivatives. A failed series load is reported independently and does not disable a successfully loaded series. An unknown vertical datum prevents an aligned camera flight until the operator declares the verified source datum. The explicit local-development Rathaus configuration can use unverified source Z; this does not change the source datum or enable this exception in production.

## Selection and navigation

Best-fit selection evaluates the requested ground target and continuous camera bearing/pitch against the poses and camera field of view of enabled series. Geographic cardinal sectors are presentation/navigation hints, not candidate bins. Enabling the full 2026 series offers a Nadir button. It locks browsing at zero pitch and selects calibrated nadir cameras only, including on subsequent pan requests; the compass or the same button returns to oblique browsing. Removing the last nadir-capable series returns to oblique mode. Orbit requests change the desired view direction; pan requests change the target in the current image-view frame. Both requests search enabled series and may choose a different year. No-enabled-series and no-candidate results are valid empty states.

A delivered footprint is optional. Core selection can use calibrated camera rays and a target/reference-height plane; an approximate center/coverage test is not a terrain-occlusion check or a surveyed footprint. Terrain-derived polygons can be added later without changing the authoritative pose source.

The selected footprint carries an open two-line caret with a 120-degree tip at
the image-bottom boundary, pointing toward image up, and its series'
short label at the polygon centroid when multiple series are enabled. The caret shares the outline's colour
and line width; the year uses that colour at 50% opacity, weight 800 and no stroke. Camera roll and the projected image-up axis determine orientation;
polygon start corner and winding do not. The active footprint retains its outline
and adds a fill capped at 20% opacity. Inactive footprints use at most 10% opacity
for both outline and fill. Up to twelve locally ranked candidates are reused from
the existing image search; the full image catalog is never sent to the scene.
Footprint polygons, the active caret and label use one native MapLibre GeoJSON
source with at most fifteen features. MapLibre workers own its
tiling/tessellation. Without a mesh receiver, the markings use ordinary raster-DEM draping.
With a receiver, the same geometry is rasterized once into a bounded,
georeferenced canvas texture (at most 2048 pixels per side), and the existing
shared material pass paints it on the actual visible mesh, including roofs.
This world-aligned pass retains the requested alpha and is independent of the
DEM-depth mask that keeps street labels occluded by buildings. No extra Three
geometry or render target is created. Native marker paint is suppressed while
the surface texture is active; removal restores the terrain fallback. The ground-aligned label opts out of floating
point-label placement with `carma:map-style-placement: "draped"` metadata.
This replaces the manual Three overlay and repeated per-vertex terrain-height
queries. The preview fade is bounded and stops requesting repaints once complete;
there is no recurring footprint height polling.

The markers share the outline's preview fade. A single enabled series produces
no superimposed label. Clicking inside the visible footprint uses MapLibre's
rendered-polygon query and opens that image through the same anchored transition
as “Flug zum Bild”. An overlap selects the active image first; another footprint
selects its own image. The native hit layer becomes hidden synchronously when
a flight starts; stale source revisions, drags, hidden outlines and preview/flight
locks do not activate it. Handled clicks leave host feature-info selection alone.

For a bounded development-only interaction capture, add `obliqueProfile=1` to the
route query and activate an image. The console emits one `[oblique-profile]`
report after eight seconds with frame gaps, long tasks, camera timing, map events
and visible mesh geometry counts. The sampler never requests map repaints and
detaches itself after the capture.

## Data contract

The old `image-name -> [x,y,z,row0,row1,row2]` feed remains an ingestion format for 2024. New imports use the typed version-1 INPHO envelope with `seriesId`, explicit conventions, camera definitions and a map of source image names to camera poses. Keep calibration and pose together; do not reconstruct the camera from a filename prefix.

Positions use named horizontal CRS and declared vertical datum, in metres. Matrix layout is row-major; the world-to-camera rotation applies to world coordinates relative to the perspective center. The optical axis is camera negative Z. Camera focal length and the image plane use millimetres; dimensions and principal points use pixels. Pixel origin, axis signs and pixel-center reference are explicit. The INPHO image-plane-to-pixel affine is a camera calibration, not a raster-to-world geotransform.

A source mount rotation is preserved for provenance. The calibrated pixel axes drive image orientation so that mounting is not applied twice. Processing timestamps are not acquisition timestamps. Missing acquisition time or height reference stays unknown. The format is designed to permit a later STAC mapping; it does not claim STAC conformance or publish a catalog.

## Metadata import

The canonical INPHO importer and reproducible commands live in [scripts/oblique-viewer](../../../scripts/oblique-viewer/README.md). It performs metadata conversion only. The delivery PRJ is authoritative; the footprint-derived CSV is diagnostic reference and is not mixed into camera poses.

The 2026 delivery contains 30,172 images (23,823 oblique and 6,349 nadir). Its 41 Rathaus TIFFs contain no nadir. The sample catalog is committed separately from the full-flight metadata. A loopback development bridge reads the original TIFFs on amy and renders requested views in memory, using their embedded reduced pages. It writes no image derivatives and applies no watermark. Browser alignment and the source height convention still need to be checked against buildings and terrain.

## Run the Rathaus sample

The local-development route `#/oblique?ff=ng` starts the addon and loads the
existing Mesh 2024 style by default. Its MapStyle3d declaration explicitly
requests a vector Karte source for separate street labels. Luftbild retains the
selected orthophoto, and routes without this declaration retain their authored
background sources. Its layer visibility is remembered in the
route's own storage namespace.

From this worktree, with SSH access to `amy.cismet.de`:

```sh
python3 scripts/oblique-viewer/serve-originals.py
```

The local-development Geoportal addon connects to `http://127.0.0.1:8926`. Use the Geoportal dev server for this branch at its normal `http://localhost:4200` URL and enable the MapLibre and oblique addon flags (`ng` and `oblqml`). The bridge serves the committed 41-image sample catalog, JPEG views generated on demand and original TIFF downloads. The multiple-selection dropdown keeps the Rathaus sample separate from the full 2026 delivery. See the [script guide](../../../scripts/oblique-viewer/README.md) for options and delivery validation.

The full 2026 upload is being placed under `/mnt/storagebox/luftbildschraegaufnahmen2026`. It is not the Rathaus bridge source and must be inventoried and validated after transfer before enabling the full-flight asset configuration.

Inside a flown-to image, dragging shifts the perspective centre and the image
together without moving the calibrated camera. Wheel zoom is anchored at the
mouse pointer, with the current viewport centre as the fallback for a missing
or outside cursor. The preview leases an instance-specific transform window so
its perspective centre can lie outside the viewport. Projection matrices,
picking, camera queries and transform clones share that centre; Three.js reads
the same offset. This prevents cursor drift during large zooms or image pans.
Dragging can bring image edges to the viewport centre. The bounds use the
calibrated image size, principal point and roll; rotated corners stop earlier
when needed to retain 25% of the viewport as imagery (at most 75% exposed mesh).
Naturally smaller zoomed-out photos retain their size instead of enlarging as a
side effect of dragging. Moving back from a boundary takes effect immediately.
A tracked image-camera entry may initially sit at an image edge with less
coverage. The first drag retains that position and can recover coverage without
reducing it further; ordinary bounds resume once sufficient coverage is reached.
Leaving the preview tracks the visible Mesh/terrain point under the physical
viewport centre; when no loaded surface can be picked, it uses the terrain
height there. The return cancels the projection offset and moves the camera
in its plane on the same eased progress as optical-depth travel. FOV follows
from the target's pixel scale rather than running on a separate timing curve.
The current FOV is changed only to the nearest permitted browsing FOV; the
entry FOV is not a return requirement. Only the ordinary map zoom bound may
reduce the tracked point's scale. Ground-reference changes reparameterize the
physical camera before restoring clamping. Closing the photo does not reset
pan first. Turning the addon off waits for this return before tilting out;
re-enabling during the return retains the original camera/terrain baseline.

Entering “Flug zum Bild” uses the inverse operation. It tracks the visible
mesh/terrain point at the physical viewport centre while travelling to the
calibrated image-camera position and orientation. FOV follows that target's
pixel scale; off-centre projection keeps it in place instead of centring the
image first. The projection lease captures ordinary browsing padding before
the flight starts and remains active until the later return finishes.

The isolated `Map Navigation/Camera and Scale/Off-center Pan Cancellation`
Storybook fixture exercises both directions on this same runtime path with
synthetic Three.js geometry. Its “Fly back to image camera” control reverses
the return without recentering the tracked point. Pan Only, Pan And Dolly Zoom,
and Off Center Target variants report rendered position and horizontal/vertical camera-plane scale errors. Sideways
parallax of objects at different depths is expected.
The Three.js tile-selection camera uses the same off-centre projection as the
render camera. Sharper preview levels load on demand, retaining the current
image until decoding succeeds.

Preview wheel zoom reaches two physical display pixels per native source
pixel (200%), using calibrated dimensions and the current device pixel ratio.
The preview temporarily raises the map zoom limit when necessary; leaving the
preview restores the original limit after the animated camera return. Above
100%, magnification adds no new
source detail.

When `originalPixelPreviewPath` is configured, the decoded JPEG remains visible
while the view settles for 800 ms. Visible native TIFF windows then arrive as
lossless RGB PNG tiles and a browser worker resamples them to physical display
pixels. Lanczos3, gamma 0.454545/2.2 and unsharp 0x0.2 follow the 2024 scaling
settings; magnification uses native pixel replication. The RGB path adds no
chroma subsampling. Each fetch and worker job is bounded; pan/zoom and teardown
cancel obsolete jobs. Missing originals retain the progressive JPEG. This
avoids loading and decoding a complete 12,736 × 19,136 image in the browser.
The local 2026 bridge enables this path; existing JPEG-only series retain their
level-based loader.

## Photo and 3D-label composition

The dedicated Geoportal `#/oblique` route enables `mapStyle3d` by default with
Mesh 2024. It uses the existing shared Three scene and mesh label rules.

The current photo preview is a DOM overlay. Placing it between the mesh and the
labels in the shared framebuffer is feasible, but requires an explicit
composition phase rather than moving the DOM overlay or changing render order:

1. Render the mesh (or its converged accumulation) and retain its depth.
2. Draw the calibrated photo as a screen-space quad without depth testing or
   depth writes, outside HDR/tone mapping. Keep its existing pan, roll, principal
   point, physical-pixel sampling and progressive/native RGB refinement.
3. Draw only the draped label contribution on the same mesh geometry, with the
   existing DEM/mesh receiver and occlusion checks against the retained depth.
4. Keep the existing depth clear and following MapLibre point-label layers.

`SharedThreeSceneLayer.addScreenRenderPass` currently runs after the complete
MapLibre frame, so using it for the photo would also cover floating place labels.
Street and water labels are currently composited into mesh color by
`shared-three-map-style-shaders.ts`; they need a label-only rendering mode for
step 3. The composition phase belongs immediately after
`accumulationRuntime.render` and before `clearDepthForMapStyleOverlays` in the
MapLibre shared scene layer. Reuse its existing projection capture, depth checks
and renderer-state handling, rather than adding a second scene or tileset.

The label-only pass must be restricted to photo coverage and opacity to avoid
double blending glyph edges outside the photo or during transitions. Preserved
accumulation depth must match the label geometry/camera, and GL depth range,
render target, viewport and scissor state must be restored on every exit. A
regression should verify both an unoccluded street label above the photo and a
street label hidden behind a nearer roof, with point labels above both. This
composition is an investigated next step; the current preview rendering remains
the DOM implementation.
