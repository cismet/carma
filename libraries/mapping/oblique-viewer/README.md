# Oblique imagery viewer

This project provides the MapLibre/Three.js oblique viewer extracted from `mapping/addons/src/addons/ObliqueViewer`. Pure camera/data/selection logic lives in `src/lib/core`; React, image loading and camera flights live in `src/lib/runtime`. The mapping-addons package owns the route registry and persistent state adapter and mounts this feature through its public API.

The Cesium viewer is the legacy implementation. This change does not update its runtime.

## Imagery series

The host supplies either an explicit `series` array or a `seriesConfigURI`.
The latter points to a server-owned JSON document with `schemaVersion: 1` and
a nonempty `series` array of `ObliqueDataset` entries. No production series,
camera calibration or image metadata is bundled with this package. Geoportal
stores only the server configuration URL; changing the available series does
not require rebuilding the app.

The configuration loads asynchronously after the basemap starts, with a bounded
timeout and cancellation on teardown. Named animation curves in JSON are
resolved against the existing Easing exports. Dataset IDs must be nonempty and
unique. Each entry owns its catalog URL, image URLs, camera calibration, source
conventions, height datum, acquisition month/year and short display label.

The multiple-selection dropdown enables configured series independently, in any
combination or none. Enabled series participate in one geometric selection.
Source image names remain opaque asset identifiers; series-qualified keys keep
identically named images from separate flights distinct. The first-level layer
button shows the enabled short labels and current heading/pitch; the expanded
tools show the active image ID.

Camera-relative view names do not define fixed cardinal eligibility. A series
without nadir imagery omits that capability. Catalog availability and image
availability are independent; errors remain attached to the affected series.
Unknown height datum remains explicit. Source-Z inspection requires the existing
development-only opt-in, without guessing a datum conversion.

For JPEG series, `minimumPreviewQualityLevel` identifies the finest published
level. Higher zoom retains available pixels instead of requesting an absent
level. Preview decode and resampling run in reusable workers, composing only the
visible source-pixel window in OffscreenCanvas. Three parked workers plus the
active worker retain four sources within a memory budget. Optional CacheStorage
retains encoded sources without lossy recompression. Original TIFF range reads
and progressive overview loading are described below.

## Selection and navigation

Best-fit selection evaluates the requested ground target and continuous camera bearing/pitch against the poses and camera field of view of enabled series. Direction names remain per-series hints rather than a shared north/east/south/west eligibility rule. Enabling a nadir-capable series offers a Nadir button. It locks browsing at zero pitch and selects calibrated nadir cameras only, including on subsequent pan requests; the compass or the same button returns to oblique browsing. Removing the last nadir-capable series returns to oblique mode. Orbit requests change the desired view direction; pan requests change the target in the current image-view frame. Both requests search enabled series and may choose a different year. No-enabled-series and no-candidate results are valid empty states.

The map overlay owns a compact two-row navigation grid with rotation and pan
controls and a separate “Flug zum Bild” / “Beenden” button. It remains usable when
the secondary information panel is collapsed. The panel retains the current image
information and “Bild öffnen”, “Herunterladen” and feedback actions. Object Coverage
temporarily replaces the ordinary navigation overlay.

Best-fit queries use a persistent Vite module worker with one catalog copy per data revision. A combined index holds record references in one-kilometre UTM cells, grouped by each series' own intrinsic sector. Circular means of the actual calibrated headings choose one oblique group independently per series; group spacing need not be 90 degrees and matching groups need not share a sector name. Spatial filtering retains only camera positions inside the configured search radius before exact coverage/orientation ranking. Nadir has its own spatial group and no bearing filter. The application neither loads tiled catalogs nor uses a database; the indexes contain references into the existing catalog. The UI sends only the target, direction, pitch and normalized per-series heights and receives a small ranked candidate list, preserving the original record identities. At most one query runs and one newer query waits; a subsequent request replaces the waiting query. Selection ignores results from earlier view requests, removed series, locked cameras and disposed workers. Heights are converted asynchronously before evaluating candidates, so a late datum conversion cannot change an already superseded selection.

A delivered footprint is optional. Core selection can use calibrated camera rays and a target/reference-height plane; an approximate center/coverage test is not a terrain-occlusion check or a surveyed footprint. Terrain-derived polygons can be added later without changing the authoritative pose source.

The center image's footprint carries an open two-line caret with a 120-degree
tip at the image-bottom boundary, pointing toward image up. Camera roll and the
projected image-up axis determine orientation; polygon start corner and winding do
not. Footprint outlines and carets use 2 CSS pixels, matching the preview frame. The
center fill is capped at 8% of the configured outline opacity. Pointer candidates
and selection trails have no fill, so layered fills remain below 33%.

Only the center image and one prospective pointer image are drawn. Selection and
hover outlines use the same white Cesium-style colour. Without a valid pointer
candidate, the center is the implicit hover.
Identity labels are limited to the center and pointer image. The short year
uses the highlighted colour at 50% opacity, weight 1000, Arial Black with a system
sans-serif fallback stack, and no stroke. Ordinary selection labels are gated by
at least two successfully loaded, enabled series. The same rule applies to explicit
and implicit hover; labels update when series loading or selection changes and are
hidden with one usable series.

Hover searches the full catalog of viewport-intersecting footprints. It resolves
the visible mesh point under the pointer, with MapLibre terrain as fallback. Actual
polygon hits in the current +/-45-degree camera-heading sector take priority and
are ranked by distance to the footprint-diagonal/image-axis intersection. If that
sector has no polygon hit, all oblique sectors become eligible: absolute wrapped
heading deviation ranks first, then intersection distance. Nadir remains separate.
The viewport candidate list uses the same sector fallback, capped at 128. This query is
independent of displayed geometry; the active image wins exact ties. Requests are
limited to one active and one latest queued worker request, at most every 50ms;
stale replies after movement, lock or teardown are ignored. Clicking opens the
hovered record even before native GeoJSON tiling catches up.

Previous center and pointer selections leave at most 32 outline trails. They retain
the current line width and white colour at at most 20% outline opacity and fade
over about 2.7 seconds. Expired trails and trails outside the current
viewport are removed. Trails carry no fill, label, caret or click target. Absolute
deadlines survive preview locks; one expiry timer cleans hidden trails and idle
repaints run at at most ten Hz.

With a shared mesh or terrain receiver, markings are the intersections of the
calibrated photo-camera frustum's four side planes with the actual rendered surface.
They follow roofs and facades instead of extruding an approximate ground polygon.
INPHO delivered-pixel affines, principal points, mounting orientation and UTM
convergence use the same conventions as image selection. The shared engine stores
two current markings and 32 trails in one small float-data texture. A small white
alpha atlas contains only center/hover year labels, projected in photo UV together
with the open caret. Highlight changes are immediate; no 180ms highlight crossfade,
large footprint canvas, extra geometry, photo-depth pass or second map is needed.

Camera heights resolve outside render callbacks and are cached per record, datum
and offset. Local-frame revision/origin changes refresh the ECEF matrix; Mercator
terrain gets a separate matrix using the existing image-flight camera convention.
An explicit development configuration may permit original source Z without
claiming a confirmed datum conversion. Native GeoJSON footprint layers and their
large surface atlas are no longer created. Delivered-footprint downloads are optional; derived coarse bounds remain only in the worker search index. The
visible contour follows the actual receiver tiles through their material-version
changes, without rerasterizing or scheduling an extra render loop. It is independent
of the DEM-depth mask that keeps street labels occluded by buildings.

Ground labels retain carma:map-style-placement "draped" metadata. There is
no recurring footprint height polling.

The center contour stays visible above the photograph during preview; pointer
marks and trails are suspended there. The year label and up marker are hidden
throughout preview. One
click resolves enabled-series candidates at the clicked mesh or
terrain point, even before hover completes. It requires no native rendered feature.
The toolbar action independently refreshes best fit at the physical viewport
center, so hover cannot change its target. Overlap ranking uses the nearest image
diagonal intersection for actual sector hits, using the heading-first all-sector
fallback when there is no hit, with active-image preference only for an exact tie.
Drags, stale replies and preview/flight locks do not start another flight. Claimed
clicks precede host feature-info handling. Camera travel begins concurrently with
image loading; progressive and native pixels become visible when ready.

For a bounded development-only interaction capture, add `obliqueProfile=1` to the
route query and activate an image. The console emits one `[oblique-profile]`
report after eight seconds with frame gaps, long tasks, camera timing, map events
and visible mesh geometry counts. The sampler never requests map repaints and
detaches itself after the capture.

## Object Coverage

Select Object Coverage, then click the rendered mesh or terrain twice: the first
click sets the sphere centre, and the second sets its three-dimensional radius in
metres. The shared scene displays the sphere while it is being drawn. Changing the
enabled series resets the selection; reset and close controls remain available.

Loaded, enabled series are scanned for cameras whose calibrated image frustum
contains the entire sphere. Partial intersections are excluded. Each image gets a
tight rectangular crop around the projected sphere and a native pixel-density
score. Images are grouped by their actual camera bearing into four quadrants:

| Top left | Top right |
| --- | --- |
| North | East |
| West | South |

Within each quadrant, the highest-resolution image appears first; the Ant Design
carousel exposes the remaining images in descending pixels-per-metre order. Only
the active image in each quadrant composes its crop, reusing the ordinary JPEG/TIFF
preview workers and caches. Double-click a crop, or activate it with Enter/Space,
to synchronize the main camera and open that image as a centered full-viewport
preview. The coverage grid closes after the camera transition succeeds.

## Data contract

The legacy `image-name -> [x,y,z,row0,row1,row2]` feed remains an ingestion format. New imports use the typed version-1 INPHO envelope with `seriesId`, explicit conventions, camera definitions and a map of source image names to camera poses. Keep calibration and pose together; do not reconstruct the camera from a filename prefix.

Positions use named horizontal CRS and declared vertical datum, in metres. Matrix layout is row-major; the world-to-camera rotation applies to world coordinates relative to the perspective center. The optical axis is camera negative Z. Camera focal length and the image plane use millimetres; dimensions and principal points use pixels. Pixel origin, axis signs and pixel-center reference are explicit. The INPHO image-plane-to-pixel affine is a camera calibration, not a raster-to-world geotransform.

A source mount rotation is preserved for provenance. The calibrated pixel axes drive image orientation so that mounting is not applied twice. Processing timestamps are not acquisition timestamps. Missing acquisition time or height reference stays unknown. The format is designed to permit a later STAC mapping; it does not claim STAC conformance or publish a catalog.

## Metadata import

The canonical INPHO importer and reproducible commands live in [scripts/oblique-viewer](../../../scripts/oblique-viewer/README.md). It performs metadata conversion only. The delivery PRJ is authoritative; the footprint-derived CSV is diagnostic reference and is not mixed into camera poses.

The 2026 delivery contains 30,172 images (23,823 oblique and 6,349 nadir). Production
series configurations and catalogs are server-owned; no sample catalog is bundled
or offered separately by the Geoportal configuration. Original TIFFs are decoded
in the browser worker using their embedded reduced pages; no image bridge or
image-processing service is required.

## Run the viewer

The route `#/oblique?ff=oblique` starts the addon in local development and PR previews.
Enabling the Geoportal viewer selects Luftbild and loads the Mesh 2024
Cesium-parity style with separate draped street labels. The existing Karte /
Luftbild selector switches between LoD2 buildings on Three.js raster-DEM terrain
and that textured mesh. The viewer owns these basis runtimes in the shared scene;
they do not add permanent layer-list entries or change saved addon choices.
Terrain replaces native ground paint only after its first usable view is ready.
Turning the viewer off releases the presentation and terrain leases and restores
ordinary background and explicit-layer behavior. Other routes retain their
configured background sources.

Local development uses the same public imagery configuration as published previews.
The production multiple-selection dropdown contains the server-configured 2024
and 2026 series. See the
[script guide](../../../scripts/oblique-viewer/README.md) for import and delivery validation.

Inventory and validate the full 2026 imagery before enabling its asset configuration;
metadata availability alone does not establish image availability.

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

When the catalog supplies `assets.original.href`, or a series configures
`originalImageUrlTemplate`, the preview worker reads the
original TIFF directly. The first image uses the coarsest internal overview
that meets the visible window's physical pixel demand, including device pixel
ratio, image roll and off-centre pan. After publishing that image it reads only
the immediately finer overview for the same window. Native resolution is the
final step; there is no full-image idle download.

Composition uses 1024-pixel output regions with a filter halo. Encoded TIFF
tiles or strips that intersect each region are read through bounded HTTP
byte ranges and decoded with a JPEG WebAssembly codec. Lanczos3, gamma
0.454545/2.2 and unsharp 0x0.2 follow the 2024 scaling settings; magnification
uses native pixel replication. No JPEG re-encode or additional chroma
subsampling is introduced. The delivered strip-based sample and tiled
originals are supported without claiming certified COG layout.

The server must support HTTP 206. The client verifies exposed `Content-Range`
when available, or a bounded `Content-Length` with the existing CORS settings.
Ignored range responses are cancelled before buffering a whole TIFF. Reads
use at most four simultaneous requests, each at most 1 MiB. Panning aborts
obsolete TIFF work; leaving the preview aborts all active downloads. Three
parked workers and the active worker retain bounded compressed-byte and
decoded-block caches. Optional CacheStorage stores the original compressed
byte ranges for up to four images; it never stores decoded RGBA images.
Cache keys use the exposed ETag or Last-Modified value. A first range request
establishes that version before persisted ranges are reused. Hover thumbnails
read one suitable TIFF overview in a separate worker and warm the same byte cache.
JPEG-only series retain the published resolution pyramid. JPEG byte ranges
do not provide independent pixel tiles, so their selected JPEG must be read
in full before cropping it in the worker.

## Original-image JPEG download

For TIFF originals, “Herunterladen” creates a JPEG at the calibrated native image
dimensions in a short-lived worker. It reads the original resolution in bounded
strips, reuses the TIFF range reader and compressed-byte cache, draws the publisher's
watermark, and encodes the completed image at JPEG quality 95. This path runs only for an explicit
download; previews and hover do not request a native export. Only one export runs
at a time, and cancellation or timeout terminates its worker.

The server-owned series entry must provide `downloadWatermark` with the exact
artwork `imageUrl`, `position` (`center`, `top-left`, or `bottom-right`), and `opacity` in `(0, 1]`.
Optional `widthFraction` scales the artwork relative to the native image width;
omitting it preserves the artwork's pixel size. `marginPx` controls the placement
margin. Optional `blend: "screen"` reproduces ImageMagick Screen composition;
omitting it uses ordinary alpha blending. The artwork must be readable with CORS and fit inside the original image.
It is validated before native TIFF pixels are requested. Missing or invalid
configuration fails the download instead of inventing watermark text or exporting
an unwatermarked TIFF-derived JPEG. Published JPEG downloads retain their existing
server-provided imagery.

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
`ff=oblique` and reload after changing flags; availability resolves at startup.

## Photo and 3D-label composition

The dedicated Geoportal `#/oblique` route enables `mapStyle3d` only when its
feature flag is explicitly present.
On any available Geoportal route, the enabled oblique viewer leases that same
presentation in the existing shared Three scene, with its mesh label rules.

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

Visible receiver colour outside the photograph uses the legacy Cesium backdrop
look in this same pass: contrast, brightness and saturation in display sRGB,
followed by the configured tint (13% black by default). After 800 ms of rest,
contrast and saturation become 50%; the configured brightness remains. The
photograph and draped labels retain their colours. The photograph has a white
2-CSS-pixel frame with a 50-CSS-pixel white feather in the shared composition.
The locked center footprint composes last, above the photograph and draped labels;
its identity label and caret remain hidden during preview.
Look changes update uniforms only; no mask texture, extra map or render loop is
created.

The DOM preview root remains the input surface; its image/canvas is hidden when
the shared scene supports this slot. The DOM image remains a fallback for hosts
without that API. Texture images use anonymous CORS; previously cached non-CORS
image responses can be refreshed once.
The photo transform samples the finalized shared render camera in a synchronous
before-render callback, before runtime updates, style capture and mesh drawing.
The same frame therefore carries the image and mesh through a pan. Uniform scale
in MapLibre's composite projection is normalized before reading focal length and
principal-point offset. The 250-ms fade advances in these same camera frames;
unchanged transforms do not request idle repaints. Native RGB fetching, decoding,
readback, resampling and tile assembly run in the existing preview worker. It
transfers one completed ImageBitmap for a texture upload, without per-tile pixel
copies or React state updates on the UI thread. Movement cancels superseded
composition while retaining the worker and caches; completed crops retain their correct source-pixel transform.
A source-key guard prevents decoded photographs from a preceding image or series
from becoming the current scene texture.

Hover can optimistically prefetch only the existing Level-6 JPEG through
`prefetchPreviewThumbnail({ previewPath, imageId })`. A low-priority worker fetch
uses the HTTP cache and decodes at most a 512-pixel edge, without a TIFF download
or main-thread raster work. One active request and one replaceable queued hover
bound work; the LRU retains eight decoded bitmaps and sixteen thumbnail blobs.
A preview leases its warm bitmap for the first scene image, then replaces it
with the existing progressive JPEG; the DOM fallback can use its cached blob
URL. `null` clears the queued hover and `disposePreviewThumbnailPrefetch()`
terminates pending work and retires cache entries when the viewer closes.

## Responsive transitions

Camera transitions are capped at 500 ms. Default rotations take up to 300–350 ms,
image entry/return up to 450 ms; small flights shorten with ground distance and
angular displacement. Smooth easing and the existing anchored camera/FOV/pan path
are retained. Switching the addon off reserves 250 ms each for preview compensation
and flattening, so the combined camera action also stays within 500 ms. Image and
backdrop fades take 250 ms; the first preview crop starts immediately once its
camera geometry is available, while subsequent pan/zoom crops coalesce for 200 ms.
Viewport-footprint queries stop during flights/previews and resume after settling.
