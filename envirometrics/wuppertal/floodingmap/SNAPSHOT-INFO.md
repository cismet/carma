# Floodingmap Cesium Engine Snapshot

This floodingmap version contains a **frozen snapshot** of the Cesium engine to decouple it from ongoing refactoring work.

## Snapshot Details

- **Source Commit**: `d408bffde572947e3237479db590d90bba2e97d0`
- **Date**: October 2025
- **Message**: "chore/prettier"
- **Location**: `src/lib/cesium-engine-snapshot/`

## Purpose

This snapshot preserves the current working state of floodingmap with the Cesium engine as it exists today, allowing:
- Continued development without breaking changes from Cesium refactoring
- A stable reference implementation
- Independent evolution of the new version (floodingmap-ng)

## Migration Path

**This version should eventually be replaced by `floodingmap-ng`**, which uses the current, refactored Cesium engine.

The `-ng` version represents the "next generation" implementation with:
- Updated Cesium engine integration
- Modern architecture patterns
- Improved maintainability

## Changes Made

### Cesium Engine Snapshot

The entire `libraries/mapping/engines/cesium/src` directory has been copied to `src/lib/cesium-engine-snapshot/`.

**Removed unnecessary features:**
- Oblique mode hooks and utilities (`useCameraForceOblique`, `cesiumCameraForceOblique`)
- These features are not needed for the flooding map use case

### Import Updates

All imports have been updated to use current `@carma` packages except for the Cesium engine:

- ✅ `@carma/types` - Current version
- ✅ `@carma/geo/types` - Current version  
- ✅ `@carma/geo/utils` - Current version
- ✅ `@carma/resources` - Current version
- ❄️ `@carma-mapping/engines/cesium` → `./lib/cesium-engine-snapshot` - **Frozen**

### Type Divergence

The snapshot contains **diverging types** that differ from the current `@carma/types` package. These types are frozen and must remain separate.

#### Snapshot Types Location

**`src/lib/cesium-engine-snapshot/lib/types/cesium-snapshot-types.ts`**
- Contains internal snapshot types: `CesiumState`, `SceneStyle`, `SceneStyles`, `CesiumConfig`
- These types are part of the old architecture and deprecated outside this snapshot
- Exported from snapshot index for internal use only

**`src/lib/types/CesiumConfig.snapshot.d.ts`**
- Reference documentation for the expected config structure
- Shows the snapshot's `CesiumConfigSnapshot` type
- More detailed than the internal `CesiumConfig` type in cesium-snapshot-types.ts

#### Key Differences

The snapshot's `CesiumConfig` type (in `cesium-snapshot-types.ts`) is **simpler** than the current `@carma/types` version:

```typescript
// Snapshot version (frozen)
export type CesiumConfig = {
  transitions: { mapMode: { duration: number } };
  camera: { minPitch: number; minPitchRange: number };
  markerKey?: string;
  markerAnchorHeight?: number;
  baseUrl: string;
  pathName: string;
  providerConfig: any;
  tilesetConfigs: any;
  models?: any[];
};
```

The app's config (in `config/cesium/cesium.config.ts`) uses `CesiumConfigSnapshot` which is more detailed and matches the actual usage pattern.

### Import Boundaries ⚠️

**CRITICAL**: The floodingmap app must **NEVER** import from `@carma-mapping/engines/cesium` or any live Cesium engine package.

✅ **Allowed imports:**
- `./lib/cesium-engine-snapshot` - The frozen snapshot
- `@carma/types` - Current shared types (except diverging ones)
- `@carma/geo/*` - Current geo utilities
- `@carma/units/*` - Current unit types and helpers
- `@carma/resources` - Current resources
- `@carma-commons/*` - Current common utilities
- `@carma-mapping/engines/leaflet` - Current version (no breaking changes)

❌ **Forbidden imports:**
- `@carma-mapping/engines/cesium`
- `@carma-mapping/engines-cesium`
- Any other live Cesium engine package

**Rationale**: The snapshot exists to decouple this app from ongoing Cesium refactoring. Importing from the live engine defeats this purpose and will cause build failures when the live engine changes.

## Known Limitations

### 3D Gazetteer Selection Partially Implemented

**Status**: A snapshot-compatible `useSelectionCesium` hook has been created in `src/lib/hooks/useSelectionCesium.ts`, but the actual marker/polygon rendering is stubbed out with a console warning.

**Cause**: Fully implementing 3D selection would require copying 443+ lines of utility code from `@carma-appframeworks/portals` (including `cesiumHitTrigger`, `cesiumHandleSelection`, and `getDerivedGeometries`). This creates significant maintenance burden for a frozen snapshot.

**Impact**: When selecting an area from the gazetteer in 3D mode, a console warning appears but no marker or highlight is rendered. The selection still works in 2D mode via `useSelectionTopicMap`.

**Workaround**: Switch to 2D mode for area selection visibility.

**Resolution Path**: This functionality will be properly implemented in `floodingmap-ng` which uses the current engine architecture and can import these utilities directly from portals without copying code.

## Development

This version is **stable** and should not receive Cesium engine updates. Bug fixes and feature work should target `floodingmap-ng` instead.

## Testing

The snapshot includes all necessary dependencies and should build and run identically to the original version at commit `d408bffd`.

```bash
# Build
npx nx build wuppertal-floodingmap

# Serve
npx nx serve wuppertal-floodingmap
```

## Future Work

Once `floodingmap-ng` is stable and tested:
1. Deprecate this snapshot version
2. Rename `floodingmap-ng` → `floodingmap`
3. Archive or remove the snapshot

---

**Note**: This is a transitional setup to allow parallel development. The snapshot should be considered **read-only** for Cesium engine code.
