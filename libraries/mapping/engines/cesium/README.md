# @carma-mapping/engines/cesium

Modular Cesium 3D mapping engine for CARMA.

## Packages

**Core:**
- `api` - Curated Cesium reexports
- `core` - React wrapper, type provider, scene management (production-ready)

**Features:**
- `models` - 3D model loading
- `oblique-mode` - Oblique imagery viewer
- `selections` - Selection visualization
- `overlay-dom` - DOM/Canvas/SVG overlays

**Utilities:**
- `shaders` - Custom GLSL shaders
- `dev-tools` - Development utilities

## Architecture

- API layer: Type definitions only
- Core layer: Essential scene setup
- Feature layers: Opt-in declarative components

## Related

- `@carma-mapping/map-transition-2d-3d` - 2D/3D transitions
- `@carma/resources` - Tileset/terrain definitions
