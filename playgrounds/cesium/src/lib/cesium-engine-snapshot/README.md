# Cesium Engine Snapshot (November 2024)

This directory contains a **reference snapshot** of the `@carma-mapping/engines/cesium` library from commit `7a152e575` (2024-11-12).

## Purpose

This snapshot preserves the stable state of the Cesium engine library after the HQ500 demonstrator was added, before subsequent refactoring efforts. It serves as:

1. **Reference implementation** - A working example of the Cesium integration
2. **Stable fallback** - Can be used if the main library breaks
3. **Documentation** - Shows how the library worked at a stable point in time

## Snapshot Details

- **Commit**: `7a152e575` (2024-11-12)
- **Commit Message**: "change cesium integration for fuzzy search to use a Ref"
- **Last Functional Addition**: HQ500 demonstrator (2024-11-05)

## What's Included

This snapshot includes:
- Cesium context and provider
- Custom Cesium viewer components
- Map controls (compass, zoom, home, etc.)
- Hooks for camera control, transitions, and scene management
- Utilities for Cesium/Leaflet integration
- Marker and tileset handling
- Shader definitions

## Usage

To use this snapshot instead of the current `@carma-mapping/engines/cesium`:

1. Update imports from:
   ```typescript
   import { ... } from '@carma-mapping/engines/cesium';
   ```
   
   To:
   ```typescript
   import { ... } from './lib/cesium-engine-snapshot';
   ```

2. Note: You may need to update imports within the snapshot to use current `@carma/commons` and `@carma/types` packages.

## Differences from Current Library

The snapshot represents the library state **before**:
- Context-based refactoring (late 2024)
- Removal of Redux dependencies
- Type system improvements
- Marker handling refactoring
- Oblique mode extraction

## Maintenance

This is a **frozen snapshot** and should not be modified except for:
- Updating imports to current `@carma/commons` packages
- Fixing critical bugs
- Adding comments for clarity

For new features, use the main `@carma-mapping/engines/cesium` library.

## Related Files

- Main playground app: `../app/App.tsx`
- Playground components: `../app/components/`
- Test views: `../app/views/tests/`
