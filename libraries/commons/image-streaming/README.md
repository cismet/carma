# Large streaming image viewer

Owns bounded image crops, progressive physical-resolution loading, compressed range persistence and pooled preview workers. Stories stay in `playgrounds/stories/src/stories/libraries/image-streaming/ImageViewport.stories.tsx`.

## Replaces

The image streaming, AVIF grid parsing, RGB composition and canvas-pool implementation previously owned by `libraries/mapping/oblique-viewer`. The oblique feature remains responsible for camera geometry and scene placement, and consumes this library's image/viewport API.

## Dependencies

- Core math/types use `@carma-units` and browser APIs. There is no MapLibre, Three.js, Cesium, catalog or photogrammetry dependency.
- React is used only by the optional DOM viewer and carousel adapters.
- AVIF uses native browser decode. TIFF fallback loads `geotiff` and the JPEG WASM decoder lazily; AVIF/JPEG consumers do not initialize them.
- No new npm dependency or root configuration is required. The existing `@carma-commons/*` alias resolves this Nx project.

## Memory and prewarming

An active viewport fills before idle work protects a full-image overview (up to 1024 pixels on its longest edge), prepares a display-ready next zoom window, then warms compressed ranges beginning at the next finer visible level. The forecast follows the observed zoom-step ratio. Ready windows are consumed immediately when crop coverage and physical pixel density match; unknown gestures and insufficient budgets retain the overview while missing details load. Image changes and interaction cancel idle work. CacheStorage or IndexedDB persist versioned compressed ranges independently of resident RGBA surfaces; cache pressure is limited to 256 MiB/eight image identities.

Viewport and pool diagnostics estimate owned RGBA surfaces and report resampling scratch peaks. A four-times-physical-viewport allocation target controls retention, reserving actual crop surfaces rather than fictitious full-viewport copies. The protected overview establishes a small minimum allocation for tiny viewports; diagnostics include this floor. Cache pressure may evict optional decoded tiles or prepared frames while preserving the active quality floor. Once a complete accepted frame fits within one physical viewport, that bitmap becomes the protected baseline; it aliases the current frame until a detail crop replaces it, and then remains separately accounted. A small overview may be evicted after this sharper baseline exists. JPEG folder families retain their coarse encoded members and prefer an exact-sized cache member over a much larger one. Native codec allocations and browser/GPU internals are not observable, so this is not a guarantee for total browser process RAM. Legacy JPEG files still need whole-file transfer and can require a transient native decode.

## Centralized stories

- `libraries-image-streaming--large-image`: public 2026 AVIF with live per-level tile state.
- `libraries-image-streaming--pool-carousel`: four views and four/eight retained image instances.
- `libraries-image-streaming--full-resolution-photo`: full native 19136×12736 2026 forest/path photograph, added L0 q90 and byte-preserved production L1–L8, served exclusively from `2026/avif-fullres-samples`.
- `libraries-image-streaming--legacy-jpeg-2024`: existing `/2024/{level}/{imageId}.jpg` families.
- `libraries-image-streaming--synthetic-16-k`: generated 16384-square analytical resolution target, independent L0–L8 in one tiled AVIF.

Generated AVIF/manifest assets live in the ignored `playgrounds/stories/public/streaming-samples` delivery folder. Canonical reproduction scripts live in shared `dev-local/scripts/oblique-viewer/streaming-samples`; sanitized samples are also delivered next to Amy's production AVIF directory, in `2026/avif-fullres-samples`.

The viewer exposes Fit, physical-pixel 1:1 and zoom-step controls directly over the image, with a live zoom percentage relative to the finest available source level (including display pixel ratio). Externally supplied viewports remain read-only to these local controls. Diagnostics occupy one compact horizontal strip: each pyramid map carries an inset level label; source dimensions, tile state counts and extended memory details appear on hover. The main readout keeps loading/error state and managed memory visible without re-rendering React on image updates.

Zoom-out compares quality against the current physical-pixel requirement rather than raw source density. A display-matching expanded crop can replace a smaller finer crop; a weaker overlapping composition cannot replace already sharp pixels, including a worker reply marked complete. A completed full-image composition that fits within one physical viewport is retained as a learned quality baseline. It is immediately reusable when zooming back out and remains protected while detailed crops replace the main frame; ownership and memory accounting deduplicate bitmap aliases. Optional forecasts and the coarse overview yield first under pressure. Wheel composition uses a fixed, non-resetting 16 ms scheduling window, and DOM painting coalesces updates once per animation frame. Generic workers release their duplicate composition canvas after transferring the accepted bitmap. AVIF composition skips coarse stages when the physical-resolution ROI (including resampling halos) is decoded or verified locally encoded. Idle forecasts follow both zoom directions, stay within native image bounds, and preserve the target aspect at clipped image edges. Same-image oblique compositions can start during camera movement.
Local range reads join adjacent RAM buffers and version-matched persistent fragments within the existing request ceiling; only genuinely missing segments are fetched. Availability never infers cache residency from download history, and includes the filter halo. Expired persistent-cache inventories are refreshed once through a coalesced, bounded key-list request before choosing cold progressive stages; this adds no HTTP probe. Asset-epoch checks prevent mixed-version outputs.

Accepted compositions expose their actual input level, dimensions and backend separately from the protected overview in `ImageViewportSnapshot.input` / `overviewInput`. The live HUD distinguishes physical/CSS viewport size, canvas allocation/projected display size, full source-level dimensions and cropped source pixels. A cyan inset arrow marks the input to the displayed canvas; readiness colors still describe decoder/cache state. Final AVIF selection tolerates up to one outward-rounded output pixel per axis, preventing unnecessary promotion to a finer level solely due to crop/target integer rounding.

Viewer stories live under **Libraries / Image streaming** and fill their Storybook iframe, including responsive one/four-pane carousel layouts. `fill` sizes the reusable viewer to its parent while reserving natural space for navigation and compact diagnostics; fixed `height` remains the default for other callers.

Fast wheel input uses one non-resetting 16 ms composition deadline with the latest crop and one animation-frame draw, so continuous input cannot postpone composition indefinitely. Accepted replacements compare display-normalized quality over overlapping pixels; a weaker complete frame cannot replace a sharper resident crop or baseline. A covering baseline that already meets physical display density is reused synchronously on zoom-out. Generic workers release their duplicate composition canvas after transferring a frame. JPEG whole-image fallback is opt-in through `retainWholeImage`; ROI-only readers do not allocate it. Expired persistent range inventories refresh locally before foreground stage selection, without HTTP probes or payload downloads.
