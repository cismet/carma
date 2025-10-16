# Floodingmap Migration to Redux-Free Cesium Context

## Status: READY FOR MIGRATION
**Approach:** Use scene style slots with different terrain providers per style. Each HQ variant gets its own scene style.

## Architecture: Scene Style Slots with Terrain Variants

Floodingmap's 6 HQ simulation variants map perfectly to Cesium's scene style system. Each simulation gets its own scene style with a dedicated terrain provider.

### Configuration Pattern

```typescript
const config: CesiumConfig = {
  // Define all terrain providers (one per HQ simulation)
  terrainProviders: [
    { id: "default", type: "dtm", config: WUPP_TERRAIN_PROVIDER },
    { id: "hq100", type: "dtm", config: HQ100_TERRAIN_PROVIDER },
    { id: "hq10", type: "dtm", config: HQ10_TERRAIN_PROVIDER },
    { id: "hqextrem", type: "dtm", config: HQEXTREM_TERRAIN_PROVIDER },
    { id: "hq2021", type: "dtm", config: HQ2021_TERRAIN_PROVIDER },
    { id: "hq2024", type: "dtm", config: HQ2024_TERRAIN_PROVIDER },
  ],
  
  tilesets: [
    { id: "mesh", config: WUPP_MESH_2024 }
  ],
  
  // Scene style per simulation variant
  sceneStyles: [
    {
      id: "default",
      name: "Normale Ansicht",
      terrain: "default",  // References terrainProviders[0]
      tilesets: [{ id: "mesh" }]
    },
    {
      id: "hq100",
      name: "HQ 100 Simulation",
      terrain: "hq100",  // References terrainProviders[1]
      tilesets: [{ id: "mesh" }]
    },
    {
      id: "hq10",
      name: "HQ 10 Simulation",
      terrain: "hq10",
      tilesets: [{ id: "mesh" }]
    },
    // ... more styles
  ]
}
```

**Key Insight:** Switching scene styles automatically swaps terrain providers!

## Current Blockers

### Redux Dependencies to Remove
- `cesiumReducer` - **REMOVED** from `@carma-mapping/engines/cesium`
- `getCesiumConfig()` - **REMOVED**
- `CesiumState` type - **REMOVED**

### Files Needing Updates

#### 1. `/src/store/index.ts`
```typescript
// CURRENT (broken):
import { getCesiumConfig, cesiumReducer, CesiumState } from "@carma-mapping/engines/cesium";

// NEEDS TO BE: No Redux store for Cesium
```

#### 2. `/src/config/cesium/cesium.config.ts`
```typescript
// CURRENT (old format):
export const CESIUM_CONFIG: CesiumConfig = {
  providerConfig: {
    terrainProvider: WUPP_TERRAIN_PROVIDER,
    surfaceProvider: WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
  },
  tilesetConfigs: { primary: WUPP_MESH_2024 }
};

// NEEDS TO BE (new slot-based format):
export const CESIUM_CONFIG: CesiumConfig = {
  terrainProviders: [
    { key: "default", type: "cesium", config: WUPP_TERRAIN_PROVIDER },
    { key: "hq100", type: "cesium", config: HQ100_TERRAIN_PROVIDER },
    // ... more slots
  ],
  tilesets: [
    { key: "primary", config: WUPP_MESH_2024 }
  ]
};
```

#### 3. `/src/config/cesium/store.config.ts`
```typescript
// CURRENT:
import { CesiumState } from "@carma-mapping/engines/cesium";
export const defaultCesiumState: CesiumState = { /* ... */ };

// NEEDS TO BE: Remove this file entirely (no Redux state)
```

#### 4. `/src/App.tsx` (assumed)
```typescript
// CURRENT: Uses Redux Provider
<Provider store={store}>
  {/* Cesium stuff */}
</Provider>

// NEEDS TO BE:
<CesiumContextProvider config={CESIUM_CONFIG}>
  <CesiumSceneComponent 
    containerRef={containerRef}
    /* props */
  />
</CesiumContextProvider>
```

## Required Floodingmap Features

### Dynamic Terrain Switching
Floodingmap has custom logic for switching between HQ terrain variants based on simulation selection:
- Users select simulation type (HQ100, HQ10, HQExtrem, etc.)
- Map dynamically loads corresponding terrain provider
- Custom retry logic for terrain loading failures

**Current implementation:** Custom hooks in `useHGKCesiumTerrain.ts`
**Future approach:** Use `CtxEvent.SetTerrainProvider` with slot keys

### Terrain Loading with Retry
```typescript
// Current custom logic (needs porting):
const loadTerrain = (retryCount: number) => {
  getProvider(scene, hqKey, HGK_TERRAIN_PROVIDER_URLS).then((provider) => {
    // Custom retry on failure
  });
};

// Future approach: Provider loader handles this
```

## Migration Steps (When Ready)

1. **Enable provider loaders** in `CesiumContextProvider`
2. **Convert config format** to slot-based arrays
3. **Remove Redux store** entirely
4. **Replace custom terrain loading** with provider events
5. **Test HQ variant switching** with new slots

## Benefits of New Architecture

- **No Redux overhead** - Everything in React context
- **Slot-based providers** - Multiple terrain/imagery sources
- **Better for future portals integration** - Floodingmap can become a standard geoportal consumer
- **Simplified terrain switching** - Just emit event with slot key

## Timeline

**Wait for:** Provider loader implementation in `CesiumContextProvider`
**Target:** Once geoportal fully uses slot-based approach, migrate floodingmap

## Notes

- `libraries/mapping/engines/cesium-widget` is **NOT** the new approach - it's an old POC
- New widget-based approach is in `libraries/mapping/engines/cesium`
- Geoportal uses `CesiumSceneComponent` + `CesiumContextProvider`
