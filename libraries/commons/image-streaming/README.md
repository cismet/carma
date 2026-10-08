# Large streaming image viewer

Owns bounded image crops, progressive physical-resolution loading, compressed range persistence and pooled preview workers. Stories stay in `playgrounds/stories/src/stories/libraries/image-streaming/ImageViewport.stories.tsx`.

## Replaces

The image streaming, AVIF grid parsing, viewport composition and canvas-pool implementation previously owned by `libraries/mapping/oblique-viewer`. The oblique feature remains responsible for camera geometry and scene placement, and consumes this library's image/viewport API.

## Dependencies

- Core math/types use `@carma-units` and browser APIs. There is no MapLibre, Three.js, Cesium, catalog or photogrammetry dependency.
- React is used only by the optional DOM viewer and carousel adapters.
- AVIF uses native browser decode. TIFF fallback loads `geotiff` and the JPEG WASM decoder lazily; AVIF/JPEG consumers do not initialize them.
- No new npm dependency or root configuration is required. The existing `@carma-commons/*` alias resolves this Nx project.

## Memory and prewarming

The source AVIF/JPEG pyramid already contains the production downsampling and sharpening. Display composition uses native `drawImage` with linear smoothing; it performs no second Lanczos, gamma, sharpening or pixel-array readback. Three.js applies its existing linear texture filtering. Canvas2D can use the browser's accelerated path, but its hardware backend and native AVIF decoder allocation are browser-dependent.

The visible crop has first priority. Once it is ready, idle work decodes the actual overlapping children of the next finer level, the current level's nearby pan tiles and its direct parent. The plan follows tile offsets and viewport dimensions, with a one-source-pixel sampling guard. Both inward and outward zoom windows are prepared, following the observed step and inferred cursor anchor; pan movement also forecasts adjacent tiles. Only after these critical buffers are ready does the worker download the rest of the next finer level compressed, then continue the remaining pyramid on idle. A new image or interaction cancels background work.

Two previous complete crops and two prepared zoom frames are retained by the shared pool. A fully covering resident frame is reused synchronously when returning to it. The standalone viewer draws one physical-viewport canvas from a uniform covering level, instead of laying a sharp center on a much coarser full-image canvas. When a new edge is not ready, its direct parent can cover the entire view temporarily; an arbitrary jump to a distant coarse overview is reserved for initial loading. If no suitable covering buffer exists, the last uniform presentation stays visible until the new crop arrives.

Render surfaces have a four-times-physical-viewport budget. Decoded source tiles have a separate bounded cache, sharing the default 128 MiB pool fairly with active images and retained crops; full native RGBA pyramids are never kept. A protected overview is at most 1024 pixels on its longest edge. A complete full-image frame fitting one viewport also establishes a sharper retained baseline. Diagnostics separately report render, source-cache and pooled allocations, tile residency, neighborhood plans and both prepared windows. These are estimates of owned RGBA surfaces, not a bound on total browser-process RAM.

Versioned compressed ranges persist in CacheStorage or IndexedDB, independently of volatile decoded pixels, up to 256 MiB/eight image identities. Adjacent missing ranges are coalesced under the request ceiling, and version-matched local fragments are reused before a download. Cache inventories are refreshed locally without HEAD/probe requests; download history alone never proves residency. Legacy JPEG folder levels retain their compressed members and use native crop decoding, but still require whole-file transfer and can incur a transient native decode.

## Centralized stories

- `libraries-image-streaming--large-image`: public 2026 AVIF with live per-level tile state.
- `libraries-image-streaming--pool-carousel`: four views and four/eight retained image instances.
- `libraries-image-streaming--full-resolution-photo`: full native 19136×12736 2026 forest/path photograph, added L0 q90 and byte-preserved production L1–L8, served exclusively from `2026/avif-fullres-samples`.
- `libraries-image-streaming--legacy-jpeg-2024`: existing `/2024/{level}/{imageId}.jpg` families.
- `libraries-image-streaming--synthetic-16-k`: generated 16384-square analytical resolution target, independent L0–L8 in one tiled AVIF.

Generated AVIF/manifest assets live in the ignored `playgrounds/stories/public/streaming-samples` delivery folder. Canonical reproduction scripts live in shared `dev-local/scripts/oblique-viewer/streaming-samples`; sanitized samples are also delivered next to Amy's production AVIF directory, in `2026/avif-fullres-samples`.

The viewer exposes Fit, physical-pixel 1:1 and zoom-step controls directly over the image, with a live zoom percentage relative to the finest available source level (including display pixel ratio). Externally supplied viewports remain read-only to these local controls. Diagnostics occupy one compact horizontal strip: each pyramid map carries an inset level label; source dimensions, tile state counts and extended memory details appear on hover. The main readout keeps loading/error state and managed memory visible without re-rendering React on image updates.

Accepted compositions expose their actual input level, dimensions and backend separately from the protected overview in `ImageViewportSnapshot.input` / `overviewInput`. The live HUD distinguishes physical/CSS viewport size, canvas allocation/projected display size, full source-level dimensions and cropped source pixels. A cyan inset arrow marks the input to the displayed canvas; readiness colors still describe decoder/cache state. Final AVIF selection tolerates up to one outward-rounded output pixel per axis, preventing unnecessary promotion to a finer level solely due to crop/target integer rounding.

Viewer stories live under **Libraries / Image streaming** and fill their Storybook iframe, including responsive one/four-pane carousel layouts. `fill` sizes the reusable viewer to its parent while reserving natural space for navigation and compact diagnostics; fixed `height` remains the default for other callers.

Fast wheel input uses one non-resetting 16 ms composition deadline with the latest crop and one animation-frame draw. Accepted covering detail remains protected; a direct-parent replacement is admitted only when it is needed to cover newly exposed pixels. Both generic and scene adapters release the worker's duplicate composition surface after transferring the frame, while bitmap ownership stays in the shared pool.

Foreground requests retain an immutable crop and physical target throughout progressive loading. Activity updates a separate warm window; idle work never releases an active composition lease. Cache ownership transfers only after the foreground pipeline has finished, and fresh canvas/bitmap dimensions are checked against its target. Reported sample density is bounded by actual bitmap and source pixels.

Each image identity owns its worker, decoded tiles and retained frame history. The shared memory coordinator reserves active working sets before retaining parked decoders, and broadcasts recovered budgets to every active worker immediately. Parked display buffers can survive decoder eviction. Native stitching has a bounded tile-row working floor independent of retained-cache capacity, so a zero cache budget cannot degenerate into repeated single-row tile downloads. A refinement failure after the first frame completes the RPC with an error while preserving those pixels.
