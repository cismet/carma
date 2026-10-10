# Image pyramid

`@carma-commons/image-pyramid` streams very large photographs from tiled pyramids and draws them as a transparent stack of sparse pyramid levels. Stories live in `playgrounds/stories/src/stories/libraries/image-pyramid/ImagePyramid.stories.tsx` (Libraries / Image pyramid).

## Model

- **Levels.** For a view with `d` physical display pixels per native pixel, level `L` is shown at scale `s_L = d · nativeScale`. Native AVIF supplies the exact per-axis pixel-edge scale; rounded layer dimensions never shift cell boundaries.
- **Target.** The target is the coarsest level that is not upscaled (`s ≤ 1`). Past 1:1 of the finest stored level the finest level is used.
- **Used levels.** Levels whose long edge is shorter than `minLevelEdge` are omitted from the view plan. Native files store L1–L4; the coarsest used level is the floor.
- **Stack.** Each frame draws resident tiles bottom to top: the pinned whole-image floor, coarser bridge levels, the parent underlay (`s ≤ 2`), then the target. The floor may itself be the underlay or, in thumbnails, the downscaled target. Missing tiles stay transparent, so the next coarser level shows through. In steady state only the target and its parent are visible.
- **Plan** (`core/image-level-plan.ts`, pure). One priority list per view, in this order:
  1. floor
  2. visible underlay
  3. visible target, centre-out from the pointer
  4. underlay and target rings for pans
  5. underlay and coarser levels over a 2× zoom-out extent
  6. next finer level, decoded as the lowest priority within the budget (`decodeFinerAt` can restrict it to larger target scales)

  Decoded wants are cut to the budget from the lowest priority up. Optional foveation moves peripheral target tiles behind the rings. After the planned work is resident, any single zoom step up to 2× at the hovered anchor renders from the target or its parent, never coarser.
- **Stack runtime** (`runtime/image-level-stack.ts`). Keeps decoded tiles per image and schedules work by plan priority:
  - Fetches are merged per level and priority class; up to 3 fetches and 4 decodes run at once.
  - Rendering reads resident tiles synchronously every frame.
  - The decoded budget accounts for resident bitmaps and progressive decoder work. Required floor/target pixels take priority over optional rings and retained zoom contexts.
  - Optional idle prefetch is configurable. Geoportal disables whole-pyramid idle fetching; viewport and navigation forecasts retain priority. Parked stacks release speculative decoder contexts while keeping bounded compressed ranges.
- **Pool** (`ImageLevelStackPool`). Up to `maxImages` stacks. Released images park to a small budget, floor first, so flipping back is immediate.

## Navigation prewarming

`pool.prewarm(source, view, physicalViewportPixels)` reserves one predicted image
in the display pool and returns a generation-safe cancellation lease. It waits
until every active stack has its visible target tiles before opening the source.
The forecast fetches only its floor, underlay and visible target, at low priority,
with one fetch batch and one decode at a time. It does not scan the next image's
whole pyramid. Metadata requests use the same low priority.

Changing an active view suspends forecast scheduling and aborts its downloads;
decoded tiles remain resident. An already executing native decode may finish,
but its cancelled result is discarded and no further forecast decode is started.
An unopened forecast is disposed to cancel metadata traffic too. After it is
ready, the active image resumes its own rings and idle prefetch.

`acquire` promotes the same forecast stack without parking or discarding its
tiles. The one forecast has a separate bounded decoded budget (96 MiB by default),
so the ordinary 8 MiB parked budget cannot immediately erase the work. Cancelling
or replacing the prediction restores ordinary parking. Multiple acquired stacks
can render together during a blend; any missing active target blocks the forecast.

## Sources

`AvifTileSource` reads one native four-layer AVIF. Each spatial cell covers the same image region through L4→L1; enhancement layers extend its existing decoder state.

- Bootstrap starts with a bounded 512 KiB GET range and stops once the complete L4 prefix is usable. Larger prefixes use adjacent bounded windows. A server with ambiguous CORS-hidden range headers can use one early-cancelled ordinary GET of the same asset.
- Enhancement batches stay within one physical layer and publish completed cells immediately. No gap bytes are deliberately fetched to merge requests.
- Compressed ranges persist in `BoundedImageRangeCache`, keyed by `ETag`/`Last-Modified`. Verified opaque SDR 4:4:4 cells of at least 1024px use a persistent per-cell `VideoDecoder`, retaining AV1 references across spatial layers. Smaller or unsupported cells use `ImageDecoder` or bitmap decoding of the same native format. Geoportal and the native stories share this source-owned decoder path.
- JPEG and independent-level AVIF delivery adapters are removed. Original-image download/export remains a separate consumer concern.

## Rendering

- `drawImageLevels` draws into a reusable 2D canvas with shared rounded tile edges. Its optional native damage rectangles preserve pixels outside the changed cells and filtering halo.
- `ThreeImageLevels` composes the same stack with three.js:
  - into retained, tile-aligned ping-pong targets (`renderToTarget`), updating dirty cells and returning an explicit pixel revision;
  - or into the bound framebuffer (`renderToScreen`).
- Uniform padded cell bitmaps remain uncropped internally; image extents and requested crops are applied at output. `freezeSnapshot()` detaches the source while preserving an immutable GPU result.
- Both can fade tile edges whose same-level neighbour is still missing (`featherPx`). Image edges are never faded, and the fade disappears as soon as the neighbour is resident.
- The oblique viewer renders into the render target inside the shared scene's before-render callback, so the photo is always composed for the camera of the same frame.

## Components

- `ImagePyramidViewer`: pan/zoom viewer with Fit, 1:1 and step buttons, plus per-level tile state diagnostics.
  - Tile states: missing, requested, compressed, decoded.
  - Options: renderer `canvas | three`, `featherPx`, `foveaRadius`, `ringTiles`, `minLevelEdge`.
- `ImagePyramidCarousel`: groups of viewers over one shared pool.

## Shared outputs

`ImageViewportPool` produces independent thumbnail/object crops from the same `ImageLevelStackPool` used by the main view. Its retained composition canvas and output snapshots are budgeted separately from shared decoded source tiles. Rotation, hover and mosaic detail publishers borrow GPU compositions instead of repeatedly uploading full-image canvases.
