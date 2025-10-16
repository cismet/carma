# Cesium Playground Snapshot Changes

This document tracks all modifications made to the cesium-engine and cesium-widget snapshots from commit `7a152e575` (November 12, 2024).

## Overview

The playground contains frozen snapshots of:
- **cesium-engine** → `src/lib/cesium-engine-snapshot/`
- **cesium-widget** → `src/lib/cesium-widget-snapshot/`
- **app** → `src/app/` (restored from same commit)

## Snapshot Source

- **Commit**: `7a152e575`
- **Date**: November 12, 2024
- **Message**: "change cesium integration for fuzzy search to use a Ref"
- **Reason**: Last stable state after HQ500 demonstrator, before major refactoring

---

## Changes to cesium-engine-snapshot

### 1. Package Import Updates

Updated imports to use current @carma packages instead of old locations:

| Old Import | New Import | Files Affected |
|------------|-----------|----------------|
| `types/common-geo` | `@carma/geo/types` | `slices/cesium.ts`, `utils/cesiumSerializer.ts` |
| `types/shaders` | `@carma/types` | `shaders.ts` |
| `@carma-commons/resources` | `@carma/resources` | `utils/cesiumHelpers.ts`, `utils/cesiumTilesetProviders.ts`, `components/ByTilesetClassifier/ByTilesetClassifier.tsx` |
| `@carma-commons/debug` | Local stub | All hooks using tweakpane |

**Rationale**: Package structure changed in current codebase. Using current packages avoids copying more libraries.

### 2. Type System Updates

#### PlainCartesian3
- **Old**: `types/common-geo`
- **New**: `@carma/geo/types`
- **File**: `utils/cesiumSerializer.ts`

#### TilesetConfig & TilesetTypes
- **Old**: `@carma-commons/resources` (type only)
- **New**: `@carma/types` (type + value)
- **Files**: `utils/cesiumHelpers.ts`, `utils/cesiumTilesetProviders.ts`, `components/ByTilesetClassifier/ByTilesetClassifier.tsx`
- **Change**: Added value import for `TilesetTypes` enum to fix runtime errors

#### CesiumCustomShaderOptions
- **Old**: `types/shaders`
- **New**: `@carma/types`
- **File**: `shaders.ts`
- **Fix**: Corrected typo `CesiumCustomChaderOptions` → `CesiumCustomShaderOptions`

#### LatLng Types
- **Old**: `LatLngRecord`, `LatLngRadians` from `types/common-geo`
- **New**: `LatLng.deg`, `LatLng.rad` from `@carma/geo/types`
- **Files**: `slices/cesium.ts`

### 3. Debug UI Removal

removed and replaced with leva in playground app

**Updated files**:
- `CustomViewerPlayground.tsx`
- `hooks/useTweakpane.ts`
- `hooks/useTilesetTweakpane.ts`
- `hooks/useBaseTilesetsTweakpane.ts` (commented out paneCallback logic)
- `components/controls/ElevationControl.tsx`

**Rationale**: Avoid dependency on `@carma-commons/debug`. Actual debug UI (Leva) is in playground app, not snapshot.

### 4. Test File Exclusion

**File**: `playgrounds/cesium/tsconfig.json`
```json
"exclude": [
  "src/app.current-refactored",
  "**/*.spec.ts",
  "**/*.spec.tsx"
]
```

**Rationale**: Test files (`cesiumHelpers.spec.ts`) had missing test framework types. Excluded from build.

### 5. Local Types Documentation

**File**: `src/lib/types/local-types.d.ts`

Originally created for local type definitions, but all types were migrated to current packages:
- `PlainCartesian3` → `@carma/geo/types`
- `TilesetConfig` → `@carma/types`

File kept as placeholder for future local types if needed.

---

## Changes to cesium-widget-snapshot

### 1. Import Updates

**File**: `lib/Widget.tsx`

| Old Import | New Import |
|------------|-----------|
| `types/common-geo` (LatLngRadians, LatLngRecord) | `@carma/geo/types` (LatLng) |
| `@carma-mapping/cesium-engine` | `../../cesium-engine-snapshot/src` |

### 2. Type Updates

**File**: `lib/Widget.tsx`

- `LatLngRecord[]` → `LatLng.deg[]`
- `LatLngRadians[]` → `LatLng.rad[]`
- Added type assertions for branded types: `as any`, `as LatLng.rad`
- Fixed property names: `coord.lngRad` → `coord.longitude`, `coord.latRad` → `coord.latitude`

**File**: `lib/utils.ts`

- Updated to use `LatLng.deg` and `LatLng.rad` from `@carma/geo/types`
- Imported `EARTH_RADIUS` from `@carma/geo/utils`
- Fixed return type structure to match `LatLng.rad` (longitude/latitude instead of lngRad/latRad)
- Added type assertion for branded type: `as LatLng.rad`

---

## Changes to App Directory

### 1. App Restoration

Restored entire `src/app/` directory from commit `7a152e575` to match snapshot state.

**Backup**: Current refactored code saved to `src/app.current-refactored/`

### 2. Import Updates

**File**: `app/App.tsx`

| Old Import | New Import |
|------------|-----------|
| `@carma-mapping/cesium-engine` | `../lib/cesium-engine-snapshot/src` |
| `@carma-commons/debug` (TweakpaneProvider) | `../lib/debug/LevaProvider` |
| `BASEMAP_METROPOLRUHR_WMS_GRAUBLAU` | `BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU` (typo fix) |
| `BASEMAP_METROPOLRUHR_WMTS_GRAUBLAU` | `BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU` (WMS not WMTS) |

**Rationale**: 
- Use local snapshots instead of libraries
- Use WMS imagery provider to match snapshot's expected config format
- Enable Leva for debug UI

### 3. Config Updates

**File**: `app/config/store.config.ts`

```typescript
// Old
WUPPERTAL.height

// New
(WUPPERTAL as any).height ?? 170
```

**Rationale**: `height` property doesn't exist on current `PositionPreset` type. Added fallback.

**File**: `app/config/assets.config.ts`

```typescript
// Old
import { ModelAsset } from "@carma-mapping/cesium-engine";

// New
import { ModelAsset } from "../../lib/cesium-engine-snapshot/src/index.d";
```

### 4. View Updates

**Files**: All view files in `app/views/`

Updated imports from `@carma-mapping/cesium-engine` to `../../lib/cesium-engine-snapshot/src` or appropriate relative paths.

**File**: `app/views/tests/standalone/HQ500.tsx`

- Removed `Main` component (doesn't exist in current `@carma-mapping/map-controls-layout`)
- Replaced with plain `<div>`
- Commented out `replaceHashRoutedHistory` (removed from portals)
- Replaced `useTweakpaneCtx` with `useControls` from leva

**File**: `app/views/tests/standalone/Widget.tsx`

- Updated to use `../../../../lib/cesium-widget-snapshot/lib/Widget`
- Fixed types: `LatLngRecord` → `LatLng.deg`, `PositionRecord` (inline type)
- Added type assertions for branded types
- Replaced `useTweakpaneCtx` with `useControls` from leva
- Fixed `clipPolygon` prop: `poi.clipBy?.polygon || []`

---

## New Files Created

### Debug UI (Outside Snapshot)

1. **`src/lib/debug/LevaProvider.tsx`**
   - Wraps app with Leva debug UI
   - Collapsed by default

2. **`src/lib/debug/useLevaStub.ts`**
   - Stub matching tweakpane interface
   - Not currently used (kept for reference)

3. **`src/lib/debug/README.md`**
   - Documentation for debug UI implementation

### Documentation

1. **`playgrounds/cesium/README.md`**
   - Overview of playground structure
   - Snapshot information
   - Development instructions

2. **`src/lib/cesium-engine-snapshot/README.md`**
   - Snapshot details and purpose
   - Usage instructions
   - Differences from current library

3. **`src/lib/cesium-engine-snapshot/src/lib/types/local-types.d.ts`**
   - Placeholder for local types
   - Documents migration to current packages

4. **`SNAPSHOT-CHANGES.md`** (this file)
   - Complete change log

---

## Build Configuration Changes

### TypeScript Config

**File**: `playgrounds/cesium/tsconfig.json`

```json
{
  "extends": ["../../tsconfig.legacy.base.json"],
  "files": [],
  "references": [],
  "exclude": [
    "src/app.current-refactored",
    "**/*.spec.ts",
    "**/*.spec.tsx"
  ]
}
```

**Changes**:
- Added `exclude` array to skip backup directory and test files

### Vite Config

**File**: `playgrounds/cesium/vite.config.mts`

```typescript
rollupOptions: {
  external: [
    // Exclude backup directory from build
    /src\/app\.current-refactored/,
  ],
  // ...
}
```

**Note**: This external pattern didn't work as expected. TypeScript exclude was sufficient.

---

## Summary of Changes by Category

### ✅ Package Migrations (Required)
- `types/common-geo` → `@carma/geo/types`
- `types/shaders` → `@carma/types`
- `@carma-commons/resources` → `@carma/resources` or `@carma/types`

### ✅ Debug UI (Intentional Removal)
- Tweakpane → Stubbed in snapshot
- Leva → Implemented in playground app (outside snapshot)

### ✅ Type System Updates (Required)
- `LatLngRecord` → `LatLng.deg`
- `LatLngRadians` → `LatLng.rad`
- `TilesetType` (type only) → `TilesetTypes` (enum value)
- Added type assertions for branded types

### ✅ Config Format (Snapshot Compatibility)
- WMTS → WMS imagery provider
- Added fallbacks for missing properties

### ✅ Removed Features (Not Available)
- `Main` component from map-controls-layout
- `replaceHashRoutedHistory` from portals

---

## Principles Followed

1. **Minimal Changes**: Only changed what was necessary for the build to pass
2. **Upstream Packages**: Used current `@carma` packages instead of copying more libraries
3. **Snapshot Isolation**: Kept debug UI and app-specific code outside the snapshot
4. **Documentation**: Documented all changes and rationale
5. **Compatibility**: Maintained snapshot's original config format (WMS not WMTS)

---

## Testing

Build status: **✅ PASSING**

```bash
npx nx build cesium-playground
# Successfully ran target build for project cesium-playground
```

All TypeScript errors resolved. Playground is self-contained and buildable.
