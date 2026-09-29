# Tile diagnostics

Tile diagnostics expose the active tile-loading and presentation state without
changing loader decisions. The MapLibre library owns runtime capture, metric
collection, scheduling, and the worker renderer. The shared
`@carma-mapping/tile-diagnostics-ui` package owns the toolbar, panels, charts,
and overview interaction used by both the Geoportal and stories.

## Activation and ownership

The Geoportal exposes diagnostics through the explicit debug feature flag or
the shadow-simulation diagnostics option. Running on `localhost` alone does not
enable them. Stories use the same UI package. While the debugger is closed, its
diagnostic content and worker remain unloaded and runtime diagnostic collection
is disabled. Opening it enables the runtime's debug observer; closing it
disables collection and releases the overlay resources.

The runtime reads live tile and scene objects only on their owning thread. It
yields between bounded capture batches and sends numeric snapshots to the
worker; it does not use the vendor traversal callback to estimate screen-space
error. Diagnostic capture does not alter request admission, tile selection, or
loader quality targets.

## Capture and rendering

Tile snapshots default to a 10 Hz cap. The optional **Every render frame** mode
requests a capture after each scene render. In either mode, at most one capture
runs at a time and busy work coalesces to the latest pending request. Capture
statistics keep their own sampling intervals. Frame mode does not start a
render loop or promise one completed tile audit per displayed frame.

Camera matrices travel through a separate latest-wins mailbox. The render
callback records camera state and schedules a small update; it does not project
labels or serialize tile data in the render callback. One worker frame or GPU
completion may be in flight, with newer input replacing pending input. Unchanged
snapshots reuse worker buffers and GPU storage. Diagnostic geometry is rendered
on demand rather than by a stationary animation loop.

Capture and worker disposal cancel pending work and release observers, canvases,
and GPU resources. If worker setup, rendering, or GPU support fails, the
diagnostic overlay reports the failure and disables itself; the map and tile
loader continue to operate.

## Overview and interaction

The overview starts top-down and follows the active loader camera. Its crop is
derived from the presented tile bounds and the camera footprint. The default
padding is 200% of that footprint, with 100% fitting the viewport. The overview
can also show the full extent or a free window view. The map overlay does not
intercept map gestures. In a focused overview window, drag pans, Ctrl-drag or
right-drag orbits around the overview center, and the wheel zooms. Double-click
resets the view.

### Frustum markers

The loader's camera and native content bounds define the diagnostic cuts.
Presented content oriented bounding boxes retain their transforms; enclosing
world-axis boxes are not used to decide whether a cut exists. For each box, the
four camera side planes intersect its faces. Each resulting segment is clipped
against the complete frustum, including near and far depth limits. Near and far
planes constrain the segments but do not generate lines. A contained tile has
no cut lines, and disjoint tiles are omitted. Segments remain separate per tile;
the renderer does not bridge gaps, close clipped polygons, or draw a twelve-edge
frustum outline. These are tile-volume cuts, not mesh-triangle intersections.

Labels and selection marks use the captured tile identities and bounds. The
overview reports published content and the runtime's diagnostic coverage state;
membership in a runtime set by itself is not proof that a tile was drawn by the
primary camera.

### Surface cuts share the loader's camera and bounds

The overview uses the same LOD camera that drives tile selection. It preserves
each content box and its local-to-world transform through capture and
projection. Only the four side-plane cuts produce lines; clipping against the
near and far planes only limits their endpoints. A contained tile therefore
contributes no cut, and the projection does not add cap edges or free-standing
frustum edges. Orbit changes the overview projection only; loader camera demand
and field of view remain unchanged.

## Pipeline timeline

The pipeline timeline is a debug-only observer scoped to the attached tile
renderer. It listens to that renderer's native request and response events and
includes requests already active when the debugger opens. It does not wrap
`fetch`, enlarge the global performance buffer, or observe while diagnostics are
closed. Observers detach when diagnostics close.

The chart keeps these quantities distinct:

- **Requests and metadata:** completed responses, mesh responses, metadata
  responses, and metadata-ready events. Metadata readiness includes worker and
  cache completion, not only network responses.
- **Wire and file sizes:** wire bytes come from Resource Timing. Encoded file
  bytes use the encoded response size or, when timing access is hidden, the
  observed `Content-Length`. Unknown sizes remain unknown. A known response body
  with zero transfer bytes is reported as a cache hit. File bytes and resident
  cache bytes are not estimates of network traffic.
- **Response timing:** fetch-to-headers uses the runtime's response events.
  TTFB and body duration prefer Resource Timing. When cross-origin timing is
  hidden, body duration can use observed headers-to-body-ready time, including
  decompression and browser body reading. TTFB and compressed wire size remain
  unknown without timing access.
- **Decoded payload:** the B3DM body length before glTF upgrade is reported
  separately from encoded file and wire bytes. It does not add a body read or
  represent compressed network bandwidth.
- **Queue and preparation:** current queued, downloading, parsing, and parked
  jobs; queue, request, and parse-wait ages; configured parse and per-origin
  download slots; preparation and presentation rates; and load errors. Slot
  counts describe configured limits, not device utilization.
- **Visible quality:** geometric screen-space error for the exposed main-camera
  hierarchy cut, using the CSS viewport. Maximum and area-weighted mean error,
  the area share above 20 CSS pixels, and its duration are bounds-based. Partial
  parent/child coverage can overlap, and bounds can include occluded geometry.
  These values do not measure framebuffer error or unique screen pixels.
  Missing data remains unknown, and terminal source tiles can exceed the
  requested error when no finer payload exists. The duration resets when the
  observer changes or no known coarse region remains.

Chart samples are taken at 10 Hz independently of the tile-capture cadence.
History is bounded to 2,048 sample buckets; older buckets are merged into
min/max envelopes while recent samples remain exact. The chart can show history
since recording or a trailing 30-second window. Reference lines show reported
limits and explicitly labeled assumptions; they are comparisons, not measured
device utilization or clipping bounds. The timeline makes no claim of improved
loading speed or a measured CPU, GPU, or process-memory ceiling.
