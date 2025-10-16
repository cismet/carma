# Cesium Playground

A testing and development playground for Cesium 3D mapping functionality.

## Purpose

This playground serves as a sandbox for:
- Testing Cesium 3D viewer features
- Developing and prototyping new 3D map controls
- Experimenting with terrain, tilesets, and markers
- Reference implementation for Cesium integration

## Structure

```
playgrounds/cesium/
├── src/
│   ├── app/                    # Main application
│   │   ├── components/         # Reusable components
│   │   ├── views/              # Test views and demos
│   │   └── App.tsx            # Root component
│   └── lib/
│       ├── cesium-engine-snapshot/  # Frozen reference library (Nov 2024)
│       └── CesiumWidget.tsx         # Local widget component
```

## Cesium Engine Snapshot

The `src/lib/cesium-engine-snapshot/` directory contains a **frozen reference snapshot** of the `@carma-mapping/engines/cesium` library from November 2024 (commit `7a152e575`).

This snapshot:
- Preserves a stable, working version of the Cesium integration
- Serves as reference documentation
- Can be used as a fallback if the main library breaks
- Should NOT be modified except for critical fixes

See `src/lib/cesium-engine-snapshot/README.md` for details.

## Development

### Running the Playground

```bash
npx nx serve cesium-playground
```

### Building

```bash
npx nx build cesium-playground
```

## Features

Current playground includes:
- **Widget Component** - Standalone Cesium widget for 3D model viewing
- **HQ500 Demonstrator** - Terrain and flood visualization
- **POI Navigation** - Point of interest selection and camera control
- **Clipping** - Polygon and radius-based clipping
- **Debug UI** - Development tools and controls

## History

- **July 2024**: Widget moved into nx library structure
- **September 2024**: Switch to 2024 mesh data
- **November 2024**: HQ500 demonstrator added, fuzzy search integration
- **November 2024**: Snapshot created (commit `7a152e575`)
- **2025**: Ongoing refactoring of main Cesium library

## Notes

- This playground is intentionally kept simple and self-contained
- Uses local `CesiumWidget.tsx` instead of library version for stability
- The cesium-engine-snapshot preserves the library state before major refactoring
- For production use, prefer the main `@carma-mapping/engines/cesium` library
