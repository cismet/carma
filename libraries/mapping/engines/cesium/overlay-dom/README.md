# @carma-mapping/engines/cesium/overlay-dom

Generic DOM/Canvas/SVG overlay system for Cesium 3D scenes.

## Status

**Work in Progress** - Package structure created, implementation not stable yet.

## Overview

Syncs Cesium 3D positions to 2D screen overlays. Salvaged from `cesium-reference` playground measurements.

- Automatic Cartesian3 → screen coordinate conversion
- Updates on Cesium postRender event (real-time)
- Visualization registration system
- Supports DOM, Canvas, and SVG rendering

## Related

- `@carma-mapping/engines/cesium/core` - Core Cesium engine
- `playgrounds/cesium-reference/src/measurements/` - Original measurement system
