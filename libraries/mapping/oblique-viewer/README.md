# Oblique imagery viewer

This project continues Thorsten’s MapLibre/Three.js oblique viewer originally implemented inside `mapping/addons/src/addons/ObliqueViewer`. Pure camera/data/selection logic lives in `src/lib/core`; React, image loading and camera flights live in `src/lib/runtime`. The mapping-addons package owns the route registry and persistent state adapter and mounts this feature through its public API. This project does not import the addon registry.

The Cesium viewer is the legacy implementation. This change does not update its runtime.

## Imagery series

The host declares a list of series. The panel's multiple-selection dropdown enables each independently: 2024, the full 2026 delivery, the 41-image 2026 Rathaus sample, any combination, or none. Enabled series participate in one geometric selection. Source image names are opaque asset identifiers; a series-qualified key identifies records in state and indexes. A filename shared by two years therefore remains two separate records and URLs always use the original source name.

The list names the acquisitions as 03/2024 and 04/2026, with a Sample suffix for the independent Rathaus subset. The 2024 month follows the published March 14/17 flight description in the Geoportal background configuration; the 2026 delivery's Aufnahmeorte.shp records April 11 in ATTR_6 for all 7,436 capture points. Short footprint labels are `2024`, `2026`, and `2026Test`, and are shown only while more than one series is enabled. The first-level layer button uses those short labels for all active series plus the current heading and pitch, rounded to degrees; the image ID stays in the expanded tools.

Each series owns its metadata URI, asset base URL, camera calibrations, source conventions and height datum. 2024 has no nadir assets. 2026 includes all five Osprey heads; camera-relative labels LE/RI/FW/BW/NA do not define fixed north/east/south/west eligibility.

Metadata and asset availability are separate. The 2026 preset prepares the viewer for the metadata/derivatives endpoint; it does not create JPEG derivatives. A failed series load is reported independently and does not disable a successfully loaded series. An unknown vertical datum prevents an aligned camera flight until the operator declares the verified source datum. The explicit local-development Rathaus configuration can use unverified source Z; this does not change the source datum or enable this exception in production.

## Selection and navigation

Best-fit selection evaluates the requested ground target and continuous camera bearing/pitch against the poses and camera field of view of enabled series. Direction names remain per-series hints rather than a shared north/east/south/west eligibility rule. Enabling the full 2026 series offers a Nadir button. It locks browsing at zero pitch and selects calibrated nadir cameras only, including on subsequent pan requests; the compass or the same button returns to oblique browsing. Removing the last nadir-capable series returns to oblique mode. Orbit requests change the desired view direction; pan requests change the target in the current image-view frame. Both requests search enabled series and may choose a different year. No-enabled-series and no-candidate results are valid empty states.

Best-fit queries use a persistent Vite module worker with one catalog copy per data revision. A combined index holds record references in one-kilometre UTM cells, grouped by each series' own intrinsic sector. Circular means of the actual calibrated headings choose one oblique group independently per series; group spacing need not be 90 degrees and matching groups need not share a sector name. Spatial filtering retains only camera positions inside the configured search radius before exact coverage/orientation ranking. Nadir has its own spatial group and no bearing filter. The application neither loads tiled catalogs nor uses a database; the indexes contain references into the existing catalog. The UI sends only the target, direction, pitch and normalized per-series heights and receives a small ranked candidate list, preserving the original record identities. At most one query runs and one newer query waits; a subsequent request replaces the waiting query. Selection ignores results from earlier view requests, removed series, locked cameras and disposed workers. Heights are converted asynchronously before evaluating candidates, so a late datum conversion cannot change an already superseded selection.

A delivered footprint is optional. Core selection can use calibrated camera rays and a target/reference-height plane; an approximate center/coverage test is not a terrain-occlusion check or a surveyed footprint. Terrain-derived polygons can be added later without changing the authoritative pose source.

The selected footprint carries an open two-line caret with a 120-degree tip at
the image-bottom boundary, pointing toward image up, and its series'
short label at the polygon centroid when multiple series are enabled. The caret shares the outline's colour
and line width; the year uses that colour at 50% opacity, weight 1000 with Arial Black and a widely available system sans-serif fallback stack and no stroke. Camera roll and the projected image-up axis determine orientation;
polygon start corner and winding do not. Selection defaults to saturated cyan (#00b8ff), distinct from neutral aerial
textures and the yellow hover. Outline, caret, fill and active label share that
selection colour. The active footprint retains its outline
and adds a fill capped at 20% opacity. All footprint and caret line widths use two thirds of the configured width.
Inactive outlines use half the active line
width and 20% opacity; inactive fill uses 20% opacity.
The hovered prospective image has a yellow outline at the active width and opacity,
plus its short year/series label in yellow at the same font weight and 50% opacity.
Only one identity label is displayed: hover takes precedence over the active label.
Hover reveals this identity even when only one series is enabled; the ordinary
active label remains hidden in that case. Up to 128 footprints from every enabled series intersect the current viewport
within a continuous +/-45-degree camera-heading sector. A worker orders matching
footprints by ground-centroid distance to the viewport centre and retains the nearest
128. Nadir mode uses nadir cameras without an undefined horizontal-heading filter.
This display selection is independent from the best-image search; the full image catalog is never sent to the scene. Hover resolves the actual visible mesh point under the pointer, with MapLibre terrain as fallback, and asks the existing footprint worker for all viewport-intersecting polygons matching the current +/-45-degree view direction (or Nadir). The pointer need not lie inside the polygon. The query does not depend on rendered features or the display cap. Hover chooses the nearest footprint-diagonal/image-axis intersection; the active image wins exact ties. Pointer requests run at most every 50ms with one active and one latest queued worker request, and stale replies after movement/lock/teardown are ignored. A match outside the 128 displayed footprints temporarily replaces the farthest inactive outline and receives the yellow outline/year label. Clicking opens the hovered catalog record even before native GeoJSON tiling catches up; leaving the pointer restores the ordinary subset.
Footprint polygons, the active caret and label use one native MapLibre GeoJSON
source with at most 130 features. MapLibre workers own its
tiling/tessellation. Without a mesh receiver, the markings use ordinary raster-DEM draping.
With a receiver, the same geometry is rasterized once into a bounded,
georeferenced canvas texture (at most 2048 pixels per side), and the existing
shared material pass paints it on the actual visible mesh, including roofs.
Changes crossfade in world space over 180ms between the old and new textures,
with independent georeferenced bounds and premultiplied color interpolation.
Only the blend uniform changes during these frames; completed transitions
release the previous texture and stop requesting repaints.
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
as “Flug zum Bild”. The toolbar action independently refreshes the best-fit search
at the physical viewport centre, so a pointer highlight cannot change its target.
Among overlapping footprints, the nearest projected
intersection of the image diagonals to the clicked ground point wins; the active
image only wins an exact tie. A click outside the active footprint can select
another image. The native hit layer becomes hidden synchronously when
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

The local-development Geoportal addon connects to `http://127.0.0.1:8926`. Use the Geoportal dev server for this branch at its normal `http://localhost:4200` URL and enable the MapLibre and oblique addon flags (`ng` and `oblique`). The bridge serves the committed 41-image sample catalog, JPEG views generated on demand and original TIFF downloads. The multiple-selection dropdown keeps the Rathaus sample separate from the full 2026 delivery. See the [script guide](../../../scripts/oblique-viewer/README.md) for options and delivery validation.

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

## Catalog preparation

Each series loads and normalizes its metadata in a Vite module worker. Pose parsing,
projection, optional delivered-footprint association and estimated coverage stay
off the UI thread. The worker returns records and keyed selection maps; each
footprint belongs to its image record instead of a duplicate full GeoJSON catalog.
Runtime animation callbacks remain on the UI thread, and worker inputs use absolute
metadata URLs. Loads are cached by series configuration, time out after 60 seconds,
and terminate their worker on completion or failure.

The Geoportal registers the new viewer addon only when the URL feature flag
`oblique` is enabled, including on the dedicated `#/oblique` route. Use
`ff=ng|oblique` and reload after changing flags; availability resolves at startup.

## Photo and 3D-label composition

The dedicated Geoportal `#/oblique` route enables `mapStyle3d` by default with
Mesh 2024. It uses the existing shared Three scene and mesh label rules.

The photo uses a screen-image slot in the existing shared Three scene. Receiver
materials apply their ordinary mesh appearance first, then the calibrated photo,
then the draped street/water labels with the existing terrain-depth and receiver
occlusion checks. Following native MapLibre point-label layers remain above this
pass. This preserves mesh-based label placement and visibility while the photograph
replaces the underlying mesh colour. There is one MapLibre map and one shared scene.

A two-triangle screen quad supplies photograph coverage outside available receiver
geometry. It shares the same uniforms as the receiver pass and renders before the
mesh. At most two caller-owned image textures are active: the progressive image
and a higher-priority native RGB crop. Both use the existing pan, roll, principal
point and physical-pixel projection, with the crop mapped back to source pixels.
No second map, label scene or additional label render target is created.

The DOM preview root remains the input surface; its image/canvas is hidden when
the shared scene supports this slot. The DOM image remains a fallback for hosts
without that API. Texture images use anonymous CORS; the local TIFF bridge sends
Vary: Origin so previously cached non-CORS image responses can be refreshed once.
The initial image fade ends after 250 ms; unchanged image transforms do not request
idle repaints. Browser RGB bitmap readback and resampling run in the existing
preview worker; the UI only receives bounded output tiles for texture updates.

## Responsive transitions

Camera transitions are capped at 500 ms. Default rotations take up to 300–350 ms,
image entry/return up to 450 ms; small flights shorten with ground distance and
angular displacement. Smooth easing and the existing anchored camera/FOV/pan path
are retained. Switching the addon off reserves 250 ms each for preview compensation
and flattening, so the combined camera action also stays within 500 ms. Image and
backdrop fades take 250 ms; native pixel fetching retains its 800-ms idle debounce.
Viewport-footprint queries stop during flights/previews and resume after settling.
