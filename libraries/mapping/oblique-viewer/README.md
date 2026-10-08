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

## Image streaming ownership

Image grid parsing, physical-resolution refinement, compressed range persistence and canvas/worker pooling have moved to the standalone Nx project `libraries/commons/image-streaming` (`@carma-commons/image-streaming`). That library replaces the former feature-local image decoder and pool modules; there are no forwarding copies here. Stories remain central in `playgrounds/stories`.

The oblique feature owns scene projection and photo/camera geometry. Its preview adapter supplies source-pixel crops and physical target sizes to the shared image API. AVIF and JPEG refine only as far as the physical viewport requires; finer compressed data can be prewarmed on idle without allocating a full-photo canvas. See the streaming library README for cache limits, optional TIFF codecs and memory-measurement scope.

## Selection and navigation

Object views are an optional extension supplied by the separate host addon
`obliqueObjectViews`, available only in the next interface (`ff=olbng`). This
replaces the former inline query hook and overlay in `ObliqueViewer`. The base
viewer does not import the object-query runtime; it lazy-loads only when its
registered mode opens. See `libraries/mapping/addons/src/addons/ObliqueObjectViews/README.md`.

Geoportal defaults to the Cesium-style interface. The hovered footprint is
highlighted, with the viewport-centre image as fallback without pointer input.
The persistent “Flug zum Bild” button fits the whole photograph,
including roll and principal offset, with 5% padding. Classic preview drag is
disabled and wheel zoom is centred. Closing first restores that full-photo frame
and then returns to the ordinary oblique camera. The compact rotation/pan controls stay available when the
secondary information panel closes. The layer readout shows the selected photo’s
month/year, positive compass bearing and image ID. Series selection and compact
export/feedback actions remain in that panel. This uses the MapLibre/Three viewer,
without switching engines.

The opt-in feature flag `olbng` adds off-centre preview positioning,
Nadir and Objektansichtenabfrage controls. For example, `#/oblique?ff=oblique.olbng`
enables that interface, whereas `#/oblique?ff=oblique` uses the default. The flag
does not enable mapstyle3d. Both interfaces reuse the same worker-backed pointer
search and photo-axis picking cache while the viewer is running.

Both interfaces share the compact panel, photo metadata readout and prepared
image-navigation targets. Buttons and keyboard use the same cached target for each
step; image downloads never determine navigation availability.

| Action in the current image orientation | Keys |
| --- | --- |
| Up / forward | W, Arrow Up, Num 8 |
| Left | A, Arrow Left, Num 4 |
| Down / back | S, Arrow Down, Num 2 |
| Right | D, Arrow Right, Num 6 |
| Rotate counterclockwise | Q, Num 7 |
| Rotate clockwise | R, Num 9 |
| Toggle nadir | Num 5, only in NG with an enabled nadir-capable series |

Pan directions are available as soon as the current directional slice is usable.
Rotation buttons, NG cardinal choices and Q/R/Num7/Num9 remain disabled until
all four oblique catalog slices have loaded successfully for every enabled
series (or its canonical catalog finished). A missing or failed oblique part
keeps rotation disabled; disabled series do not count. The deferred Nadir catalog
and Num5 mode action are independent. Slice startup and idle background loading
retain their existing order; pan preparation does not promote other sectors.
Disabled rotation keys never enter the FIFO, so current-slice pan stays usable.

Numpad mappings use physical key codes and also work with Num Lock off. Num 5
never navigates to another image. Text inputs, editable content, composition and
Ctrl/Alt/Meta combinations retain their normal keyboard behavior. The viewer
claims mapped arrows before MapLibre's native keyboard pan. Every mapped key press and repeat, including Num 5, enters the same FIFO as the
buttons. Image steps await the preceding flight and stay at least 200 ms apart;
the next target is resolved relative to the then-current photo. Missing catalog
directions load before geometry lookup, and pending entries wait through cache
revisions. Num 5 toggles dynamically when its entry executes. Explicit image
open/close, external navigation, manual map gestures, disabled viewing, object
coverage and unmount cancel the remaining queue. Only the next queued direction
is prefetched; a valid cache with no neighbor records a no-op, with at most eight
no-ops per task before yielding. No mapped event is replaced by a later key.

Only the `olbng` interface offers “Nächste Bildachse” and “Beste Pixelauflösung” as selection
policies. The latter compares calibrated native pixels per metre at the requested
ground point, along the least-resolved transverse direction; preview JPEG levels
never affect the ranking. Current-sector coverage still takes precedence, with
heading deviation first when falling back across sectors. Equal native density
uses the ordinary proximity ranking. Missing or unknown ground/source heights
retain proximity selection rather than claiming calibrated resolution. The policy
is persisted with enabled series; changing it keeps workers and imagery caches.


Classic and NG browsing pitch follows the image-count-weighted mean of calibrated oblique poses in the requested world bearing sector across enabled, loaded catalogs. Nadir and invalid poses are excluded. The metadata worker derives small per-series and per-direction totals together once, including for older cached catalogs; enabling or removing a series recombines only those totals. Complete directional manifest summaries supply the calibrated startup pitch before image slices arrive and replace matching partial sums rather than adding to them. Legacy series means and then the configured pitch are fallbacks without directional evidence. Entering browsing and leaving a preview use this same target. A rotation return resolves its destination bearing and latest catalog statistics, changing pitch throughout the same tween as heading. A changed default adjusts only pitch without restarting the mode or resetting zoom/FOV, and an open preview retains its photo camera.

The shared Classic/NG layer readout keeps the original source-image prefixes and components in normal-weight text, separated by thin spaces. The raw identifier remains available on hover and for accessibility; plane/arrow markers and camera-prefix stripping are no longer used for this display. Asset URLs and catalog identity are unchanged.

NG (`ff=oblique.olbng`) offers the persisted **Fotos auf Mesh** option, off by default. Rotation prepares two full-photo streamed compositions bounded to the physical viewport and a shared 128 MiB two-entry pool; it does not decode native L1 into a full-resolution canvas. The calibrated start/end cameras project these textures onto existing visible ECEF mesh surfaces, including roofs and facades. The camera tween supplies the same eased progress to weights `1-t` and `t`, blended in linear space. Terrain and the fullscreen image backdrop do not receive these projective photos. The selected label option remains in effect. Preparation is bounded to two seconds; missing images or absent mesh keep normal geometric navigation. Aborting, switching mode/image/series, disabling the option or unmounting removes projections before releasing textures and borrowed bitmaps. A normal target preview takes over once its physical display pixels are ready, with a bounded fallback timeout. Classic does not initialize this path.

The reusable photo source resolver is shared with object views. The engine's optional `MapStyleScreenOverlay.projective.sceneToTexture` is generic; photogrammetry and transition lifecycle remain in the oblique feature. No additional mesh geometry, terrain source, depth pass or render target is created for this option.

Best-fit selection evaluates the requested ground target and continuous camera bearing/pitch against the poses and camera field of view of enabled series. Direction names remain per-series hints rather than a shared north/east/south/west eligibility rule. In the olbng interface, enabling a nadir-capable series offers a Nadir button. It locks browsing at zero pitch and selects calibrated nadir cameras only, including on subsequent pan requests; the compass or the same button returns to oblique browsing. Removing the last nadir-capable series returns to oblique mode. Orbit requests change the desired view direction; pan requests change the target in the current image-view frame. Both requests search enabled series and may choose a different year. No-enabled-series and no-candidate results are valid empty states.

The map overlay owns a compact two-row navigation grid with rotation and pan
controls and a separate “Flug zum Bild” / “Beenden” button. It remains usable when
the secondary information panel is collapsed. The panel retains the current image
information and “Bild öffnen”, “Herunterladen” and feedback actions. Objektansichtenabfrage
temporarily replaces the ordinary navigation overlay.

Best-fit queries use a persistent Vite module worker with one catalog copy per data revision. A combined index holds record references in one-kilometre UTM cells, grouped by each series' own intrinsic sector. Circular means of the actual calibrated headings choose one oblique group independently per series; group spacing need not be 90 degrees and matching groups need not share a sector name. Spatial filtering retains only camera positions inside the configured search radius before exact coverage/orientation ranking. Nadir has its own spatial group and no bearing filter. Optional directional catalog batches feed that same index; its entries retain references into the parsed catalog. The UI sends only the target, direction, pitch and normalized per-series heights and receives a small ranked candidate list, preserving the original record identities. At most one query runs and one newer query waits; a subsequent request replaces the waiting query. Selection ignores results from earlier view requests, removed series, locked cameras and disposed workers. Heights are converted asynchronously before evaluating candidates, so a late datum conversion cannot change an already superseded selection.

A delivered footprint is optional. Core selection can use calibrated camera rays and a target/reference-height plane; an approximate center/coverage test is not a terrain-occlusion check or a surveyed footprint. Terrain-derived polygons can be added later without changing the authoritative pose source.

The highlighted image's footprint carries an open two-line caret with a 120-degree
tip at the image-bottom boundary, pointing toward image up. Camera roll and the
projected image-up axis determine orientation; polygon start corner and winding do
not. Footprint outlines and carets use 2 CSS pixels, matching the preview frame. The
highlight fill is capped at 8% of the configured outline opacity. Selection trails
have no fill; only one filled footprint is visible.

Only one current image is highlighted. Pointer input takes precedence; a pointer
miss or pending query has no center replacement. Without map pointer input,
including touch, the center image is the implicit hover. Highlight outlines use
the same white Cesium-style colour.
Identity labels belong only to the single highlighted image. The short year
uses the highlighted colour at 50% opacity, weight 1000, Arial Black with a system
sans-serif fallback stack, and no stroke. Ordinary selection labels are gated by
at least two successfully loaded, enabled series. The same rule applies to explicit
and implicit hover; labels update when series loading or selection changes and are
hidden with one usable series.

Both interfaces search the full catalog on hover of viewport-intersecting footprints. It resolves
the visible mesh point under the pointer, with MapLibre terrain as fallback. Actual
polygon hits in the current +/-45-degree camera-heading sector take priority and
are ranked by distance to the actual photo-camera axis intersection with the live surface. If that
sector has no polygon hit, all oblique sectors become eligible: absolute wrapped
heading deviation ranks first, then intersection distance. Nadir remains separate.
The viewport candidate list uses the same sector fallback, capped at 128. This query is
independent of displayed geometry; the active image wins exact ties. Requests are
limited to one active and one latest queued worker request, at most every 50ms;
stale replies after movement, lock or teardown are ignored. Clicking opens the
hovered record even before native GeoJSON tiling catches up.

The index returns every eligible candidate, without the display cap. An async
refinement casts each physical photo center ray against visible mesh/terrain
receivers, with native DEM iteration as fallback. Hits are cached by image and
receiver/LOD revision; pointer motion reuses them. Uncached work yields after
eight rays or about three milliseconds and stops for superseded queries. The
cache contains at most 2048 ground coordinates and no frustum geometry.

The common `debug` feature flag enables a floating diagnostic panel using the
tile manager's window chrome, for example `ff=oblique.olbng.debug`. It shows the live
ground distance from the pointer to the chosen camera-axis surface intersection,
along with source identity and mesh/DEM provenance. Values use a DOM subscription,
keeping pointer updates out of the viewer's React tree; diagnostics load lazily.

Previous center and pointer selections leave at most 32 outline trails. They retain
the current line width and white colour at at most 20% outline opacity and fade
over about 2.7 seconds. Expired trails and trails outside the current
viewport are removed. Trails carry no fill, label, caret or click target. Absolute
deadlines remove expired trails while browsing; idle repaints run at at most ten Hz.
Camera travel disables picks while retaining the footprint contour. Only when
the shared scene draw has the photograph border at full opacity do markings and
trails fade together within 100ms. Slow image loading cannot leave a borderless
view; refinements do not repeat this handoff. Style or receiver updates cannot
restore hidden markings.

With a shared mesh or terrain receiver, markings are the intersections of the
calibrated photo-camera frustum's four side planes with the actual rendered surface.
They follow roofs and facades instead of extruding an approximate ground polygon.
INPHO delivered-pixel affines, principal points, mounting orientation and UTM
convergence use the same conventions as image selection. The shared engine stores
one current marking and up to 32 trails in one small float-data texture. Pointer
input takes precedence; only when there is no pointer input on the map does the
center image become highlighted. A pointer miss or pending query shows no current
highlight. Touch input keeps the center fallback. A small white alpha atlas contains
only the highlighted year label, projected in photo UV together with the open caret. Highlight changes are immediate; no 180ms highlight crossfade,
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

During preview, the photograph border replaces all footprint contours. The
image and its border use the original physical photo projector used for mesh
footprints, including delivered-pixel calibration. The map camera travels to the
corresponding physical photo eye; its altitude accounts for the different Mercator
scales at the map center and camera location. The screen transform projects
homogeneous view directions instead of near-plane points, so centimetre-scale
camera refits cannot shift image pixels during FOV zoom. It updates immediately
before the shared scene draw, with photo matrices cached by record and local-frame
revision. Native crops change sampling bounds only; the
border follows the full sensor frame. The year label and up marker remain hidden.
In both interfaces, one click resolves enabled-series candidates at the clicked mesh or
terrain point, even before hover completes. It requires no native rendered feature.
The toolbar action opens the current viewport-centre selection, so hover cannot
change its target. In olbng the action is hidden on hover-capable
devices while browsing; touch retains it, and preview close remains available.
A footprint's single-click flight starts after a 500ms double-click window;
catalog picking runs immediately in parallel. A double click cancels that pending
flight. Classic single and double clicks fit the whole photograph with 5% padding;
`olbng` double click retains the current view-center anchor and pixel scale. Slow picks
retain the double-click decision; movement, locking and teardown discard pending
activation. In `olbng`, single click frames the full image's shorter axis at 90% of the shorter
viewport axis, leaving 5% padding on each side. The
four next-image arrows fit the destination image during the same camera/FOV
transition. Browsing rotations retain their ground anchor and end directly at
the dataset-average pitch. Heading, pitch, optical scale and projection pan use
one eased interval, without a subsequent pitch settle. A Nadir-to-cardinal turn
includes the mode pitch in that same interval. Overlap ranking uses the actual camera-axis surface intersection and
the heading-first all-sector fallback, with active-image preference only for an
exact tie. Drags and stale replies do not start another flight. Claimed
clicks precede host feature-info handling. Camera travel begins concurrently with
image loading; progressive and native pixels become visible when ready.

For a bounded development-only interaction capture, add `obliqueProfile=1` to the
route query and activate an image. The console emits one `[oblique-profile]`
report after eight seconds with frame gaps, long tasks, camera timing, map events
and visible mesh geometry counts. The sampler never requests map repaints and
detaches itself after the capture.

## Preview URL state

The Geoportal adapter uses the existing `HashStateProvider` methods to persist
the image window independently of normal map lat/lng/zoom/pitch state:

| Hash key | Meaning |
| --- | --- |
| `obs` | Configured series ID |
| `obi` | Source image ID, without a series prefix or asset URL |
| `obx`, `oby` | Image-center displacement from viewport center, divided by the image's long screen edge |
| `obz` | Image short screen edge divided by viewport short edge |

Entry, settled image switches, pan end and wheel end replace these values using
the common URL encoder. Camera animation frames do not update history. Closing
the preview removes all five keys while retaining normal map and feature flags.
On reload a known series is enabled if necessary, its catalog is awaited, and the
source image's calibrated camera restores pan and zoom. Ratios retain the same
image point at viewport center across different sizes/aspect ratios; FOV changes
within camera limits. Missing ratios default to centered 90% fit. Nonfinite,
out-of-bounds or unknown identities do not load arbitrary URLs. Standalone hosts
can supply the optional `previewState` config channel without a routing provider.

## Object views query

This mode requires the `obliqueObjectViews` addon and the next interface.

Select **Objektansichtenabfrage**, then click the rendered mesh or terrain twice: the first
click sets the sphere centre, and the second sets its three-dimensional radius in
metres. The shared scene displays a solid sphere with 30% opacity. A white, 2 CSS-pixel
contour is evaluated on the live mesh/terrain fragments at the sphere intersection,
including newly loaded tile LODs. Changing the
enabled series resets the selection; reset and close controls remain available.

Loaded, enabled series are scanned for cameras whose calibrated image frustum
contains the entire sphere. Nadir cameras are excluded from these four directional
views. Partial intersections are excluded. Each image gets a
rectangular crop around the projected sphere and a native pixel-density score.
The crop expands to the actual cell aspect ratio, keeps the entire sphere in view
and limits magnification to three physical display pixels per native source pixel.
A virtual crop extending beyond the sensor leaves empty margins instead of
stretching the photograph. Images are grouped by their actual camera bearing into four quadrants:

| Top left | Top right |
| --- | --- |
| North | East |
| West | South |

Within each quadrant, the highest-resolution image appears first; the Ant Design
carousel exposes the remaining images through small thumbnails in descending
pixels-per-metre order. Active crops refine progressively to the best available
quality in the ordinary JPEG/TIFF workers. Clicking a direction or changing its
carousel starts sequential, low-priority preloading of every alternative at cell
display resolution; it does not refine background alternatives to native resolution.
Carousel thumbnails share one bounded worker queue. Leaving the query cancels
active jobs and releases their canvases while preserving encoded/range caches.

**Strecke messen** casts each clicked photograph ray onto the loaded live mesh or confirmed native DEM surface.
One set of physical three-dimensional points and segment distances is projected
into all four active photographs and follows carousel changes. Measurements are
local to the current sphere; unavailable surface locations do not create points.
This query supports distance paths, not area tools or saved measurement layers.
Its grid clears the isolated Geoportal controls layer, with close/reset actions
inside the grid.

Double-click a crop, or activate it with Enter/Space,
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
that keeps each source pixel within eight physical display pixels in the visible
window, including device pixel ratio, image roll and off-centre pan. After publishing that image it reads only
successively finer overviews for the same window, ending at native resolution. Native resolution is the
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
obsolete TIFF work; leaving the preview aborts all active downloads. The ROI
pool keeps four views on coarse-pointer/low-memory devices or eight on desktop,
including the active view. LRU eviction bounds estimated CPU raster and encoded
source retention to 128/256 MiB; active GPU textures and transient decoder heaps
are outside this estimate. Reopening immediately replays the latest valid ROI,
including a sharper partial stage, with its actual source crop and loaded-source
notification. Effective rendered pixel density prevents a coarse replacement
while allowing a sharper crop to refine a downsampled view. Parked TIFF workers
are terminated while their display ROI survives; JPEG full-image decode/blob
storage is released, and retained AVIF source storage is limited to 4/8 MiB per
worker. Optional CacheStorage stores the original compressed
byte ranges for up to four images; it never stores decoded RGBA images.
Cache keys use the exposed ETag or Last-Modified value. A first range request
establishes that version before persisted ranges are reused. Hover thumbnails
read one suitable TIFF overview in a separate worker and warm the same byte cache.
JPEG-only series load the published resolution pyramid sequentially from the
initial level to the finest configured level. Each completed worker composition
replaces the preceding one without restarting the photo camera or animation.
A sharper retained or persistently cached source skips redundant levels.
JPEG byte ranges do not provide independent pixel tiles, so each requested
JPEG must be read in full before cropping it in the worker. Leaving cancels its
active fetch as well as composition.

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

An optional `compressedCatalogURI` prefers the same JSON schema over gzip. Native
worker decompression accepts both gzip bytes and an already HTTP-decoded body;
missing, invalid or unsupported compression falls back to the canonical
`exteriorOrientationsURI`. Aborted loads never start a fallback. Parsed cache keys
retain canonical identity and validate the successful transport, so this option
does not clear existing caches.

Static series can declare `catalogVersion` as an immutable revision/hash covering
catalog, calibration and any consumed footprint metadata. Matching parsed entries
are restored cache-first from IndexedDB with zero HEAD/GET, including offline;
changing the revision misses without clearing the previous entries. Unversioned
legacy sources retain bounded validator/TTL revalidation. The parser schema marker
is separate and must change when normalized pose/calibration semantics change;
app bundle filenames do not invalidate static catalog data. LocalStorage contains
only the short parser-version hint, never catalogs.

The current parsed store has a 192 MiB budget and twelve-entry limit for legacy
series plus directional segments. Its v3 database is separate because the shared
storage manager persists count/budget policy; the previous v2 database is left
untouched. There is no aggregate capacity guarantee across old/new stores. Normal
bounded-store eviction remains possible; no global or user-cache clear is called.
Unavailable/quota-limited/deadline-exceeded storage falls back to network parsing.

The host can supply `prioritySeriesId`; Geoportal reads initial `obs` even without
`obi`. Its catalog is published before other enabled series start loading.
Equivalent configuration objects do not restart pending workers; status-only
updates reuse the existing parsed Maps. Coordinates, matrices and camera metadata
are not quantized or converted into a new catalog schema.

Optional `directionalCatalogs` expose independent exact JSON documents for each
measured direction, with their own gzip transport. An initial source image takes
priority over the current heading; otherwise the group with the nearest measured
mean azimuth loads first. The other three oblique segments load one at a time during idle periods.
Rotation or a changed viewing direction promotes its missing group without
aborting an active request. Nadir is a fifth, on-demand segment. Object views and
a hover search that needs all oblique sectors await the four oblique segments
before ranking. `awaitDirection(..., { retry: true })` and `awaitAll({ retry: true })`
retry failed segments explicitly; ordinary hover does not retry them.

`directionalCatalogPriority` provides validated source-ID routing only: a compact
camera/line-parity route plus every exact exception. It never changes a record's
orientation or geometric sector. File prefixes and aircraft-relative camera names
are insufficient because the same camera looks in opposite directions on return
flight strips. Directional datasets never request the whole-series catalog. A failed segment
retains successful segments and surfaces a per-group error; its direction await
returns unavailable. Explicit retry reloads only failed segments. The four
oblique segments fill one in-memory series incrementally; nadir is requested
separately when needed. Unsplit legacy series retain their one-file loader. Full-group pitch totals in the manifest keep each bearing sector's browsing pitch
stable while records arrive. Parsed caches remain separate per source group;
existing whole-series caches are retained.


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


## Image fidelity stories

One Storybook group contains the approved 2026 AVIF L1–L4 samples, the historical
2024 chroma/bit-depth comparison, and the L2–L4 filter experiment. The completed
blind-test UI is removed; private measured assets and votes are retained.
See [comparison entrypoints and measurement scope](src/lib/runtime/quality-comparison/README.md).


## Optional packed AVIF previews

The existing RGB composition and thumbnail workers prefer
`record.assets.pyramid.href` when supplied. Other providers can configure
`avifPyramidTemplate` with an encoded `{imageId}` placeholder. Original image
assets and downloads remain unchanged; an unavailable or unsupported pyramid
uses the existing TIFF/JPEG source. A small 30-second negative cache also expires
for an already composed TIFF viewport, so partial publication does not pin the
fallback permanently. Series without pyramid assets retain their previous path.

One file contains the native L1 AVIF primary and independent embedded lower
levels. Its `pyridx01` locator resolves the calibrated sensor dimensions and
absolute cell-range index. HEAD reads only file length; image/index bodies must
be bounded HTTP 206 streams (8 MiB maximum per range). The worker selects a coarse
initial page and refines only to the physical viewport need, reconstructs native
AVIF grid cells and uses the existing viewport canvas pool, abort generations and
bounded retained caches. Original sensor dimensions must match camera calibration;
no full-photo AVIF bitmap or external decoder service is used.

Native cell decoding currently enters the existing RGBA8 composition path;
encoded ten-bit samples do not establish ten-bit scene/display output. Focused
worker tests cover preference, TIFF fallback and the partial-publication retry.
The isolated production-worker check used a small ROI from a publicly packed
portrait photo and verified progressive AVIF output, bounded 206 reads and no
TIFF, mesh or terrain requests; it did not load the complete viewer scene.
