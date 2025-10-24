# Architecture Refactor: Provider Refs Migration

## Goal
Move scene-owned resources (terrain, imagery, tilesets, models) from CesiumContext to CesiumSceneComponent to align with Cesium's internal architecture and React best practices.

## Completed ✅

1. **README Documentation** - Added architecture section explaining Context vs Scene Component responsibilities
2. **CesiumContext.tsx** - Removed provider ref types from CesiumContextType interface
3. **CesiumContextProvider.tsx** - Removed provider ref initialization
4. **use-context-setup-subscriptions.ts** - Removed tilesetsRef and imageryLayersRef parameters
5. **CesiumSceneComponent.tsx** - Added local provider refs (terrain, imagery, tilesets, models)

## Remaining Work 🚧

### 1. Update Resource Manager Hooks
These hooks need to accept refs as parameters instead of reading from context:

**Files to update:**
- `hooks/resources/tilesets/use-tileset-manager.ts`
- `hooks/resources/imagery/use-imagery-manager.ts`
- `hooks/resources/terrain/use-terrain-manager.ts`

**Current signature:**
```typescript
export const useTilesetManager = (
  tilesets: TilesetConfig[],
  trackProgress: boolean = false
) => {
  const { tilesetsRef } = useCesiumContext(); // ❌ Remove this
  // ...
}
```

**New signature:**
```typescript
export const useTilesetManager = (
  tilesets: TilesetConfig[],
  tilesetsRef: MutableRefObject<Map<string, Cesium3DTileset>>,
  trackProgress: boolean = false
) => {
  // Use passed ref instead of reading from context
}
```

### 2. Update CesiumSceneComponent to Pass Refs
```typescript
// In CesiumSceneComponent.tsx
useTilesetManager(tilesets, tilesetsRef);
useImageryManager(imagery, imageryLayersRef);
useTerrainManager(terrain, terrainProviderRef);
```

### 3. Implement SetSceneStyle Handler in CesiumSceneComponent
Move the style switching logic from `use-context-setup-subscriptions.ts` to CesiumSceneComponent:

```typescript
// In CesiumSceneComponent.tsx
useEffect(() => {
  const { subscribe, emit } = useCesiumContext();
  
  const unsubSetStyle = subscribe(CtxEvent.SetSceneStyle, (styleId: string) => {
    // Apply tileset visibility changes
    const tilesetChanges = diffTilesets(tilesetsRef.current, style, allTilesetIds);
    tilesetChanges.forEach(({ id, action, opacity }) => {
      emit(CtxEvent.SetTilesetVisibility, { id, visible: action === "show" });
      if (opacity !== undefined) {
        emit(CtxEvent.SetTilesetOpacity, { id, opacity });
      }
    });
    
    // Apply imagery visibility changes
    const imageryChanges = diffImageryLayers(imageryLayersRef.current, style, allImageryIds);
    imageryChanges.forEach(({ id, action, opacity }) => {
      emit(CtxEvent.SetImageryVisibility, { id, visible: action === "show" });
      if (opacity !== undefined) {
        emit(CtxEvent.SetImageryOpacity, { id, opacity });
      }
    });
  });
  
  return () => unsubSetStyle();
}, []);
```

### 4. Clean Up Unused Imports
- Remove `diffTilesets` and `diffImageryLayers` from `use-context-setup-subscriptions.ts`
- Remove unused camera pose types from CesiumContextProvider

## Architecture Principles

**Context = Configuration & Coordination**
- Static configuration (camera home pose, zoom limits)
- Event bus for cross-component communication
- Widget/Scene singleton refs
- Lifecycle tracking

**Scene Component = Instance Resources**
- Scene-specific resources (terrain, imagery, tilesets, models)
- Resource managers initialize on mount, cleanup on unmount
- Receives props: `initialMapStyle`, `initialCameraPose`

## Benefits

✅ **Proper lifecycle** - Resources created/destroyed with scene component  
✅ **No stale refs** - Provider maps cleared on unmount  
✅ **Cleaner context** - Only coordination, not resource management  
✅ **Multiple instances** - Could support multiple scenes (future)  
✅ **React patterns** - Props flow down, events flow up
