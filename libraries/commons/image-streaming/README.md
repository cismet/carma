# Large streaming image viewer

Streams very large photographs from tiled pyramids and draws them as a transparent stack of sparse pyramid levels. Stories live in `playgrounds/stories/src/stories/libraries/image-streaming/ImageViewport.stories.tsx` (Libraries / Image streaming).

## Model

- **Levels.** For a view with `d` physical display pixels per native pixel, level `L` is shown at scale `s_L = d · native/level` (per axis, from the real level size; stored levels are rounded, so it is not `2^k`).
- **Target.** The target is the coarsest level that is not upscaled (`s ≤ 1`). Past 1:1 of the finest stored level the finest level is used.
- **Stack.** Each frame draws resident tiles bottom to top: a pinned whole-image floor (long edge ≤ 1024), coarser bridge levels, the parent underlay (`s ≤ 2`), then the target. Missing tiles stay transparent, so the next coarser level shows through. In steady state only the target and its parent are visible.
- **Plan** (`core/image-level-plan.ts`, pure). One priority list per view, in this order:
  1. floor
  2. visible underlay
  3. visible target, centre-out from the pointer
  4. underlay and target rings for pans
  5. underlay and coarser levels over a 2× zoom-out extent
  6. next finer level (decoded from `s ≥ 0.75` or while zooming in, otherwise compressed only)

  Decoded wants are cut to the budget from the lowest priority up. Optional foveation moves peripheral target tiles behind the rings. After the planned work is resident, any single zoom step up to 2× at the hovered anchor renders from the target or its parent, never coarser.
- **Stack runtime** (`runtime/image-level-stack.ts`). Keeps decoded tiles per image and schedules work by plan priority:
  - Fetches are merged per level and priority class; up to 3 fetches and 4 decodes run at once.
  - Rendering reads resident tiles synchronously every frame.
  - The budget defaults to ten physical viewports of RGBA, at least 96 MiB. Tiles outside the plan are evicted first, and planned tiles never evict each other.
  - Idle time prefetches compressed bytes: the next finer level, then the rest of the pyramid. All work stops when an image is parked or disposed.
- **Pool** (`ImageLevelStackPool`). Up to `maxImages` stacks. Released images park to a small budget, floor first, so flipping back is immediate.

## Sources

- **AVIF** (`AvifTileSource`). Single-file independent pyramid: an AVIF per level, a UUID index box and absolute per-cell tables.
  - Opening reads the head, the index and all cell tables, normally in three requests. Small levels (≤ 512 KiB) are fetched whole; other cells come from merged range requests (gap ≤ 64 KiB, ≤ 4 MiB).
  - Ranges persist in `BoundedImageRangeCache`, keyed by `ETag`/`Last-Modified`. A full-file `200` is refused.
- **JPEG** (`JpegTileSource`). Families with one file per level (`/{level}/{id}.jpg`). Exact level sizes come from each file's SOF header. A level is decoded once per burst and cut into virtual 512 tiles.

## Rendering

- `drawImageLevels` draws into a 2D canvas with shared rounded tile edges, so there are no seams.
- `ThreeImageLevels` composes the same stack with three.js:
  - into a ping-pong render target (`renderToTarget`), whose texture identity changes only when content changes;
  - or into the bound framebuffer (`renderToScreen`).
- Both can fade tile edges whose same-level neighbour is still missing (`featherPx`). Image edges are never faded, and the fade disappears as soon as the neighbour is resident.
- The oblique viewer renders into the render target inside the shared scene's before-render callback, so the photo is always composed for the camera of the same frame.

## Components

- `ImageStreamViewer`: pan/zoom viewer with Fit, 1:1 and step buttons, plus per-level tile state diagnostics.
  - Tile states: missing, requested, compressed, decoded.
  - Options: renderer `canvas | three`, `featherPx`, `foveaRadius`, `ringTiles`.
- `ImageStreamCarousel`: groups of viewers over one shared pool.

## Legacy

`ImageViewportPool`, the preview worker and `AvifPyramidPreviewSource` still serve the oblique object-view thumbnails, the rotation drape and JPEG downloads until those move to the level stack.
