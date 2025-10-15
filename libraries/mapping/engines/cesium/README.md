# engines/cesium

Cesium 3D mapping engine integration for CARMA applications.

> **Production-ready React wrapper for CesiumJS** with flexible scene styles, event-driven architecture, and seamless 2D/3D transitions.

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
  - [Scene Styles](#scene-styles-new-flexible-system)
  - [Provider Types](#provider-types)
  - [Legacy Configuration](#legacy-configuration-deprecated)
- [Usage](#usage)
  - [Basic Setup](#basic-setup)
  - [Event System](#event-system)
  - [Camera Control](#camera-control)
  - [Model Loading](#model-loading)
- [Architecture](#architecture)
- [Best Practices](#best-practices)
- [Common Patterns](#common-patterns)
- [API Reference](#api-reference)
- [Installation](#installation)
- [Troubleshooting](#troubleshooting)
- [Migration Guide](#migration-guide)
- [Advanced Topics](#advanced-topics)
- [FAQ](#faq)
- [Testing](#testing)

## Overview

This library provides a React-based wrapper around CesiumJS with:

- **Context-based state management** - No prop drilling, ref-based for performance
- **Flexible scene style system** - Multiple tilesets, terrain, and imagery per style
- **Event-driven architecture** - Subscribe/emit pattern for state changes
- **2D/3D map transitions** - Seamless switching with animation support
- **Camera controls** - Safe access patterns with validation
- **Custom markers and models** - GLB/GLTF model loading as primitives
- **Oblique view support** - Advanced camera positioning
- **Performance optimized** - Request render mode, minimal re-renders

### Key Features

- ✅ **TypeScript-first** - Full type safety with comprehensive definitions
- ✅ **Production-tested** - Used in CARMA geoportal applications
- ✅ **Extensible** - Custom loaders, events, and providers
- ✅ **Well-documented** - Extensive examples and API reference
- ✅ **Framework-agnostic state** - Works with Redux, Zustand, or any state library

## Configuration

### Scene Styles (New Flexible System)

Scene styles define complete visual configurations for your 3D map. Each style specifies which tilesets, imagery, and terrain to display.

#### Basic Structure

```typescript
import type { CesiumConfig } from "@carma-mapping/engines/cesium";

const config: CesiumConfig = {
  // Define available providers
  imageryProviders: [
    { id: "grau", config: BASEMAP_GRAYSCALE }
  ],
  terrainProviders: [
    { id: "terrain", type: "dtm", config: TERRAIN_PROVIDER },
    { id: "dsm_mesh", type: "dsm", config: DSM_PROVIDER }
  ],
  tilesets: [
    { id: "LOD2", config: LOD2_TILESET },
    { id: "MESH", config: MESH_TILESET }
  ],
  
  // Define scene styles (array index = slot number)
  sceneStyles: [
    {
      id: "lod_2",
      name: "LOD 2",
      type: "lod_2",
      backgroundColor: [1, 1, 1, 1],
      globe: { baseColor: [1, 1, 1, 1] },
      imagery: [{ id: "grau", opacity: 0.5 }],
      tilesets: [{ id: "LOD2" }],
      terrain: "terrain"
    },
    {
      id: "mesh",
      name: "Mesh 2024",
      type: "mesh",
      backgroundColor: [0.5, 0.5, 0.5, 1],
      globe: { baseColor: [0, 0, 0, 0.01] },
      tilesets: [{ id: "MESH" }]
    }
  ]
};
```

#### Style Slots

Scene styles are accessed by **array index** (slot number):

- `sceneStyles[0]` = Slot 0 (default style, typically LOD2/Karte)
- `sceneStyles[1]` = Slot 1 (typically Mesh/Luftbild)
- `sceneStyles[n]` = Additional styles...

Applications can bind UI controls to specific slots:

```typescript
const karteStyle = config.sceneStyles[0];
const luftbildStyle = config.sceneStyles[1];

// Switch to specific style
emit(CtxEvent.SetSceneStyle, karteStyle.id);

// Toggle between slots 0 and 1 (legacy binary toggle)
emit(CtxEvent.ToggleSceneStyle);
```

#### Provider Types

**ImageryProvider**: Base map imagery

```typescript
{
  id: "unique-id",
  config: {
    url: "https://...",
    // ... WMTS/TMS config
  }
}
```

**TerrainProvider**: Elevation data

```typescript
{
  id: "unique-id",
  type: "dtm" | "dsm",  // dtm = terrain, dsm = surface
  config: {
    url: "https://...",
    // ... terrain config
  }
}
```

**Tileset**: 3D Tiles (buildings, mesh)

```typescript
{
  id: "unique-id",
  config: {
    url: "https://...",
    // ... 3DTiles config
  }
}
```

#### Scene Style Properties

- **id**: Unique style identifier
- **name**: Human-readable name for UI
- **type**: Style type (free-form string, e.g., "mesh", "lod_2")
- **backgroundColor**: RGBA array for scene background
- **globe.baseColor**: RGBA array for globe surface
- **imagery**: Array of imagery layer references with opacity
- **tilesets**: Array of tileset references with optional opacity
- **terrain**: Terrain provider ID (optional) - **References a provider from `terrainProviders` array**

#### Terrain Provider Switching via Scene Styles

Each scene style can reference a different terrain provider by ID. When you switch styles, the terrain automatically changes:

```typescript
const config: CesiumConfig = {
  terrainProviders: [
    { id: "default", type: "dtm", config: DEFAULT_TERRAIN },
    { id: "hq100", type: "dtm", config: HQ100_TERRAIN },
    { id: "hq10", type: "dtm", config: HQ10_TERRAIN },
  ],
  sceneStyles: [
    {
      id: "normal",
      name: "Normal View",
      terrain: "default"  // Uses DEFAULT_TERRAIN
    },
    {
      id: "flood_hq100",
      name: "Flood HQ100",
      terrain: "hq100"  // Uses HQ100_TERRAIN
    },
    {
      id: "flood_hq10",
      name: "Flood HQ10",
      terrain: "hq10"  // Uses HQ10_TERRAIN
    }
  ]
};

// Switching styles automatically swaps terrain!
emit(CtxEvent.SetSceneStyle, "flood_hq100");  // Now using HQ100_TERRAIN
```

**Use Case:** Perfect for applications like flood maps where each simulation variant requires different terrain elevation data.

### Legacy Configuration (Deprecated)

The old binary primary/secondary system is still supported but deprecated:

```typescript
const config: CesiumConfig = {
  providerConfig: {
    terrainProvider: TERRAIN_PROVIDER,
    surfaceProvider: DSM_PROVIDER,
    imageryProvider: IMAGERY_PROVIDER
  },
  tilesetConfigs: {
    primary: LOD2_TILESET,    // Maps to sceneStyles[0]
    secondary: MESH_TILESET   // Maps to sceneStyles[1]
  },
  sceneStyles: {
    primary: { backgroundColor: [...], globe: {...} },
    secondary: { backgroundColor: [...], globe: {...} }
  }
};
```

**Migration Path**: Update to the new array-based `sceneStyles` for flexibility and support for 3+ styles.

## Usage

### Basic Setup

```tsx
import { CesiumContextProvider } from "@carma-mapping/engines/cesium";
import type { CesiumConfig } from "@carma-mapping/engines/cesium";

const cesiumConfig: CesiumConfig = {
  // ... your config
};

function App() {
  return (
    <CesiumContextProvider config={cesiumConfig}>
      <YourMapComponent />
    </CesiumContextProvider>
  );
}
```

### Using CesiumContext

```tsx
import { useCesiumContext } from "@carma-mapping/engines/cesium";

function MapControls() {
  const {
    sceneRef,
    emit,
    currentSceneStyleRef,
  } = useCesiumContext();

  const switchToStyle = (styleId: string) => {
    emit(CtxEvent.SetSceneStyle, styleId);
  };

  return (
    <button onClick={() => switchToStyle("mesh")}>
      Switch to Mesh
    </button>
  );
}
```

### Event System

The Cesium engine uses an event-based architecture for state changes:

```tsx
import { CtxEvent } from "@carma-mapping/engines/cesium";

// Subscribe to events
const unsubscribe = subscribe(CtxEvent.SetSceneStyle, (styleId) => {
  console.log("Style changed to:", styleId);
});

// Emit events
emit(CtxEvent.SetSceneStyle, "lod_2");
emit(CtxEvent.ToggleSceneStyle); // Toggle between slots 0 and 1
emit(CtxEvent.SetTilesetVisibility, { id: "MESH", visible: true });
emit(CtxEvent.Suspend); // Suspend Cesium (switch to 2D)
emit(CtxEvent.Activate); // Activate Cesium (switch to 3D)
```

**Available Events:**

- `SetSceneStyle` - Switch scene style by ID
- `ToggleSceneStyle` - Toggle between slot 0 and slot 1
- `SetTilesetVisibility` - Show/hide specific tileset
- `SetTilesetOpacity` - Change tileset opacity
- `Suspend` - Suspend Cesium rendering (2D mode)
- `Activate` - Activate Cesium rendering (3D mode)

### Camera Control

```tsx
import { useCesiumContext } from "@carma-mapping/engines/cesium";

function CameraControls() {
  const {  sceneRef, emit } = useCesiumContext();

  const flyToPosition = () => {
      sceneRef.current.camera.flyTo({
        destination: Cartesian3.fromDegrees(lon, lat, height),
        duration: 2.0
      });
  };

  const resetHome = () => {
    emit(CtxEvent.ResetHome);
  };

  return (
    <>
      <button onClick={flyToPosition}>Fly To Position</button>
      <button onClick={resetHome}>Reset Home</button>
    </>
  );
}
```

### Model Loading

Models are configured in the `CesiumConfig`:

```typescript
import type { ModelConfig } from "@carma/resources";

const config: CesiumConfig = {
  models: [
    {
      position: {
        longitude: 7.121277,
        latitude: 51.252545,
        altitude: 100
      },
      orientation: {
        heading: 0,
        pitch: 0,
        roll: 0
      },
      model: {
        uri: "path/to/model.glb",
        scale: 1.0,
        show: true
      },
      properties: {
        name: "Bridge Model",
        description: "New bridge design"
      }
    }
  ]
};
```

Models are automatically loaded when the viewer is ready and added as primitives to the scene.

## Architecture

### Context-Based State Management

The Cesium engine uses React Context to provide access to the Cesium viewer and scene without prop drilling:

```text
CesiumContextProvider
  ├── CesiumContext (provides refs, callbacks, events)
  ├── CustomViewer (Cesium viewer instance)
  └── Your Components (via useCesiumContext)
```

### Event-Driven Updates

State changes flow through an event system:

1. Components emit events via `emit(CtxEvent.*, payload)`
2. Internal subscriptions update refs and Cesium state
3. No React re-renders for Cesium state changes
4. Refs are used for performance-critical state

### Provider Loaders

Providers (imagery, terrain, tilesets) are loaded via dedicated hooks:

- `useImageryProviderLoader` - Loads base imagery
- `useTerrainProviderLoader` - Loads terrain elevation
- `usePrimaryTilesetLoader` - Loads primary 3D tileset
- `useSecondaryTilesetLoader` - Loads secondary 3D tileset
- `useModelsLoader` - Loads GLB/GLTF models

## Best Practices

### Style Switching

Always use style IDs from config, not hardcoded strings:

```tsx
// ✅ Good
const style = config.sceneStyles[0];
emit(CtxEvent.SetSceneStyle, style.id);

// ❌ Bad
emit(CtxEvent.SetSceneStyle, "lod_2");
```

### Camera Operations

tryWithValidScene etc but use passed refs not callbacks

### Resource Cleanup

Subscribe/unsubscribe in useEffect:

```tsx
useEffect(() => {
  const unsub = subscribe(CtxEvent.SetSceneStyle, handler);
  return () => unsub();
}, [subscribe]);
```

### Performance

- Use `requestRender()` instead of forcing continuous rendering
- Leverage `tryWithValidScene` for conditional rendering
- Models load async - don't block initialization

## Common Patterns

### Toggle Between Two Styles

```tsx
function StyleToggle() {
  const { emit } = useCesiumContext();
  
  return (
    <button onClick={() => emit(CtxEvent.ToggleSceneStyle)}>
      Toggle Style
    </button>
  );
}
```

### Multi-Style Selector

```tsx
function StyleSelector({ config }: { config: CesiumConfig }) {
  const { emit, currentSceneStyleRef } = useCesiumContext();
  
  return (
    <select 
      value={currentSceneStyleRef.current}
      onChange={(e) => emit(CtxEvent.SetSceneStyle, e.target.value)}
    >
      {config.sceneStyles?.map((style, i) => (
        <option key={style.id} value={style.id}>
          {style.name}
        </option>
      ))}
    </select>
  );
}
```

### Conditional Tileset Visibility

```tsx
function TilesetControl() {
  const { emit, tilesetVisibilityRef } = useCesiumContext();
  const isVisible = tilesetVisibilityRef.current.get("MESH");
  
  return (
    <button 
      onClick={() => emit(CtxEvent.SetTilesetVisibility, {
        id: "MESH",
        visible: !isVisible
      })}
    >
      {isVisible ? "Hide" : "Show"} Mesh
    </button>
  );
}
```

## API Reference

### Hooks

#### `useCesiumContext()`

Access the Cesium context and all control functions.

**Returns:**

- `widgetRef` - Ref to Cesium Viewer instance
- `sceneRef` - Ref to Cesium Scene
- `withCamera` - Execute callback with camera instance
- `withScene` - Execute callback with scene instance
- `emit` - Emit context events
- `subscribe` - Subscribe to context events
- `currentSceneStyleRef` - Current active style ID
- `tilesetVisibilityRef` - Map of tileset visibility states
- `requestRender` - Request a scene render

#### `useHomeControl()`

Hook for home position controls.

```tsx
const { homeControl, bumpInitialCameraEpoch } = useHomeControl();
```

#### `useSceneStyles()`

Hook for scene style management.

```tsx
const { currentStyle, setStyle, toggleStyle } = useSceneStyles();
```

### Context Provider Props

#### `CesiumContextProvider`

**Props:**

- `config: CesiumConfig` - Cesium configuration object
- `children: ReactNode` - Child components

## Installation

### Prerequisites

- Node.js 18+
- CesiumJS 1.117+
- React 18+
- Vite (recommended) or similar bundler

### Package Installation

```bash
npm install @carma-mapping/engines/cesium
npm install cesium
```

### Vite Configuration

**Step 1:** Create/update `vite.config.mts` (note the `.mts` extension):

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/cesium/Build/Cesium/Workers/*",
          dest: "cesium/Workers"
        },
        {
          src: "node_modules/cesium/Build/Cesium/ThirdParty/*",
          dest: "cesium/ThirdParty"
        },
        {
          src: "node_modules/cesium/Build/Cesium/Assets/*",
          dest: "cesium/Assets"
        },
        {
          src: "node_modules/cesium/Build/Cesium/Widgets/*",
          dest: "cesium/Widgets"
        }
      ]
    })
  ]
});
```

**Step 2:** Set the Cesium base URL in your app entry point:

```typescript
// main.tsx
import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium";

const CESIUM_BASE_URL = `${import.meta.env.BASE_URL}cesium/`;
setupCesiumEnvironment(CESIUM_BASE_URL);
```

**Step 3:** Import Cesium styles:

```typescript
// main.tsx or App.tsx
import "cesium/Build/Cesium/Widgets/widgets.css";
```

**Step 4:** Add global type declaration:

```typescript
// src/env.d.ts
declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

export {};
```

### App Integration

```tsx
import { CesiumContextProvider } from "@carma-mapping/engines/cesium";
import type { CesiumConfig } from "@carma-mapping/engines/cesium";

const cesiumConfig: CesiumConfig = {
  // Your configuration
  baseUrl: `${import.meta.env.BASE_URL}__cesium__`,
  pathName: "__cesium__",
  // ... rest of config
};

function App() {
  return (
    <CesiumContextProvider config={cesiumConfig}>
      <YourMapComponent />
    </CesiumContextProvider>
  );
}
```

### Resources

- [Cesium with Vite Discussion](https://community.cesium.com/t/is-there-a-good-way-to-use-cesium-with-vite/27545)
- [CesiumJS Quickstart](https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/#step-2-set-up-the-cesiumjs-client)
- [Vite Plugin Cesium Build](https://github.com/s3xysteak/vite-plugin-cesium-build/)

## Troubleshooting

### Cesium Assets Not Loading

**Symptom:** Console errors about missing Workers or Assets

**Solution:**

1. Verify `viteStaticCopy` is configured correctly
1. Check that `CESIUM_BASE_URL` matches your asset path
1. Ensure assets are copied to the correct output directory

```typescript
// Debug: Check the base URL
console.log("CESIUM_BASE_URL:", window.CESIUM_BASE_URL);
```

### Scene Styles Not Switching

**Symptom:** Style toggle doesn't change the view

**Solution:**

1. Verify style IDs match between config and emit calls
1. Check that tilesets/imagery are defined in config
1. Ensure `CesiumContextProvider` wraps your components

```tsx
// Debug: Log current style
const { currentSceneStyleRef } = useCesiumContext();
console.log("Current style:", currentSceneStyleRef.current);
```

### Models Not Appearing

**Symptom:** GLB models don't render in the scene

**Solution:**

1. Verify model URLs are accessible
1. Check model position is within view bounds
1. Verify model scale isn't too small/large

```typescript
// Debug: Check model loading
console.debug("[CESIUM|MODEL] Loading:", modelConfig.model.uri);
```

### Performance Issues

**Symptom:** Low frame rate or stuttering

**Solution:**

1. Use `requestRender()` instead of continuous rendering
1. Limit number of visible tilesets
1. Reduce tileset maximum screen space error
1. Disable unused features (shadows, fog, etc.)

```typescript
// Optimize scene
scene.fog.enabled = false;
scene.globe.enableLighting = false;
scene.requestRenderMode = true;
```

## Migration Guide

### From Legacy Primary/Secondary to Style Slots

**Before:**

```typescript
const config = {
  providerConfig: {
    terrainProvider: TERRAIN,
    imageryProvider: IMAGERY
  },
  tilesetConfigs: {
    primary: LOD2_TILESET,
    secondary: MESH_TILESET
  },
  sceneStyles: {
    primary: { backgroundColor: [...] },
    secondary: { backgroundColor: [...] }
  }
};
```

**After:**

```typescript
const config = {
  imageryProviders: [
    { id: "imagery", config: IMAGERY }
  ],
  terrainProviders: [
    { id: "terrain", type: "dtm", config: TERRAIN }
  ],
  tilesets: [
    { id: "LOD2", config: LOD2_TILESET },
    { id: "MESH", config: MESH_TILESET }
  ],
  sceneStyles: [
    {
      id: "lod_2",
      name: "LOD 2",
      type: "lod_2",
      backgroundColor: [...],
      globe: { baseColor: [...] },
      imagery: [{ id: "imagery", opacity: 0.5 }],
      tilesets: [{ id: "LOD2" }],
      terrain: "terrain"
    },
    {
      id: "mesh",
      name: "Mesh",
      type: "mesh",
      backgroundColor: [...],
      globe: { baseColor: [...] },
      tilesets: [{ id: "MESH" }]
    }
  ]
};
```

**Component Updates:**

```typescript
// Before
emit(CtxEvent.SetSceneStyle, SCENE_STYLES.PRIMARY);

// After
emit(CtxEvent.SetSceneStyle, config.sceneStyles[1].id);

// Or keep using legacy constants (still works)
emit(CtxEvent.SetSceneStyle, SCENE_STYLES.PRIMARY); // Maps to slot 1
```

## Development

### Build

```sh
nx build engines/cesium
```

### Test

```sh
nx test engines/cesium
```

### Lint

```sh
nx lint engines/cesium
```

## Contributing

When adding new features:

1. Update type definitions in `index.d.ts`
1. Add JSDoc comments for public APIs
1. Update this README with examples
1. Add tests for new functionality
1. Follow existing patterns (event-driven, ref-based state)

## Related Packages

### CARMA Ecosystem

- **`@carma-mapping/map-transition-2d-3d`** - 2D/3D map transition utilities
- **`@carma-mapping/engines/carma-cismap`** - 2D Leaflet mapping engine
- **`@carma-mapping/components`** - Shared mapping UI components
- **`@carma/resources`** - Resource definitions (tilesets, models, etc.)
- **`@carma-commons/math`** - Math utilities for coordinate transformations

### Integration Example

```tsx
import { CesiumContextProvider } from "@carma-mapping/engines/cesium";
import { CarmaTopicMapContextProvider } from "@carma-mapping/engines/carma-cismap";
import { TransitionContextProvider } from "@carma-mapping/map-transition-2d-3d";

function MapApp() {
  return (
    <TransitionContextProvider>
      <CarmaTopicMapContextProvider>
        <CesiumContextProvider config={cesiumConfig}>
          <Map2D3DView />
        </CesiumContextProvider>
      </CarmaTopicMapContextProvider>
    </TransitionContextProvider>
  );
}
```

## Advanced Topics

### Custom Loaders

Extend the provider system with custom loaders:

```tsx
import { useCesiumContext } from "@carma-mapping/engines/cesium";
import { useEffect } from "react";

function useCustomDataSourceLoader(config) {
  const { sceneRef } = useCesiumContext();
  
  useEffect(() => {
    
    const scene = sceneRef.current;
    if (!scene) return;
    
    // Load your custom data source
    const loadData = async () => {
      const dataSource = await CustomDataSource.load(config.url);
      scene.dataSources.add(dataSource);
    };
    
    loadData();
    
    return () => {
      // Cleanup
      scene?.dataSources.removeAll();
    };
  }, [config, sceneRef]);
}
```

### Dynamic Style Updates

Update scene styles at runtime:

```tsx
function DynamicStyleUpdater() {
  const { emit, withScene } = useCesiumContext();
  
  const updateGlobeColor = (color: ColorRgbaArray) => {
    withScene((scene) => {
      scene.globe.baseColor = Color.fromBytes(
        color[0] * 255,
        color[1] * 255,
        color[2] * 255,
        color[3] * 255
      );
    });
  };
  
  const toggleImageryVisibility = (opacity: number) => {
    withScene((scene) => {
      const layers = scene.imageryLayers;
      for (let i = 0; i < layers.length; i++) {
        layers.get(i).alpha = opacity;
      }
    });
  };
  
  return (
    <>
      <input 
        type="range" 
        min="0" 
        max="1" 
        step="0.1"
        onChange={(e) => toggleImageryVisibility(+e.target.value)}
      />
    </>
  );
}
```

### Custom Event Handlers

Create domain-specific events:

```tsx
// Extend the event system
enum CustomCtxEvent {
  LoadBuilding = "LoadBuilding",
  HighlightFeature = "HighlightFeature",
}

function BuildingLoader() {
  const { subscribe, emit } = useCesiumContext();
  
  useEffect(() => {
    const unsub = subscribe(CustomCtxEvent.LoadBuilding as any, async (buildingId) => {
      const building = await fetchBuildingData(buildingId);
      // Load building into scene
      console.log("Loading building:", buildingId);
    });
    
    return () => unsub();
  }, [subscribe]);
  
  return (
    <button onClick={() => emit(CustomCtxEvent.LoadBuilding as any, "building-123")}>
      Load Building
    </button>
  );
}
```

### Camera Animations

Advanced camera control patterns:

```tsx
import { animateCamera } from "@carma-mapping/engines/cesium";

function CameraAnimations() {
  const { sceneRef, animationMapRef } = useCesiumContext();
  
  const flyToWithCustomEasing = () => {
    animateCamera(
        sceneRef.current.camera,
        animationMapRef.current,
        {
          destination: Cartesian3.fromDegrees(lon, lat, height),
          duration: 3000,
          easingFunction: EasingFunction.CUBIC_IN_OUT,
          complete: () => console.log("Flight complete"),
          cancel: () => console.log("Flight cancelled")
        }
      );
    });
  };
  
  const orbitAroundPoint = () => {
    const camera = sceneRef.current.camera;
      const center = Cartesian3.fromDegrees(lon, lat, 0);
      const heading = camera.heading;
      const pitch = camera.pitch;
      const range = 1000;
      
      // Circular orbit animation
      let angle = 0;
      const animate = () => {
        angle += 0.01;
        camera.lookAt(
          center,
          new HeadingPitchRange(heading + angle, pitch, range)
        );
        requestAnimationFrame(animate);
      };
      
      animate();

  };
  
  return (
    <>
      <button onClick={flyToWithCustomEasing}>Fly To (Custom)</button>
      <button onClick={orbitAroundPoint}>Orbit Around</button>
    </>
  );
}
```

### Performance Optimization

Advanced performance tuning:

```tsx
function PerformanceOptimizer() {
  const { sceneRef sceneRef } = useCesiumContext();
  
  useEffect(() => {
    withScene((scene) => {
      // Optimize tileset loading
      scene.globe.tileCacheSize = 1000;
      scene.globe.maximumScreenSpaceError = 2;
      
      // Optimize rendering
      scene.requestRenderMode = true;
      scene.maximumRenderTimeChange = Infinity;
      
      // Disable expensive features
      scene.fog.enabled = false;
      scene.skyAtmosphere.show = false;
      scene.sun.show = false;
      scene.moon.show = false;
      
      // Optimize shadows
      scene.shadowMap.enabled = false;
      
      // Reduce quality for performance
      scene.fxaa = false;
      scene.highDynamicRange = false;
      
      console.log("[PERFORMANCE] Optimizations applied");
    });
  }, []);
  
  // Monitor frame rate
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    
    let frameCount = 0;
    let lastTime = performance.now();
    
    const measureFPS = scene.postRender.addEventListener(() => {
      frameCount++;
      const now = performance.now();
      
      if (now - lastTime >= 1000) {
        const fps = frameCount;
        console.log("FPS:", fps);
        frameCount = 0;
        lastTime = now;
      }
    });
    
    return () => measureFPS();
  }, [sceneRef]);
  
  return null;
}
```

## FAQ

### How do I add multiple tilesets to a single style?

```typescript
const config: CesiumConfig = {
  tilesets: [
    { id: "buildings", config: BUILDINGS_TILESET },
    { id: "roads", config: ROADS_TILESET },
    { id: "trees", config: TREES_TILESET }
  ],
  sceneStyles: [
    {
      id: "full_city",
      name: "Full City View",
      tilesets: [
        { id: "buildings" },
        { id: "roads" },
        { id: "trees", opacity: 0.7 }
      ]
    }
  ]
};
```

### Can I switch terrain providers dynamically?

**Yes!** Use scene styles with different terrain provider IDs:

```typescript
// Configure multiple terrain providers
const config: CesiumConfig = {
  terrainProviders: [
    { id: "terrain_a", type: "dtm", config: TERRAIN_A },
    { id: "terrain_b", type: "dtm", config: TERRAIN_B },
  ],
  sceneStyles: [
    { id: "style_a", terrain: "terrain_a", ... },
    { id: "style_b", terrain: "terrain_b", ... }
  ]
};

// Switch terrain by switching styles
emit(CtxEvent.SetSceneStyle, "style_b");  // Terrain automatically changes!
```

**Example:** Flood simulation apps can have one style per HQ variant (HQ100, HQ10, HQExtrem), each with its own terrain.

### How do I handle viewer initialization errors?

```tsx
import { CesiumErrorHandler } from "@carma-mapping/engines/cesium";

function MyMap() {
  return (
    <CesiumErrorHandler
      onError={(error) => {
        console.error("Cesium error:", error);
        // Show user-friendly error message
      }}
    >
      <CesiumContextProvider config={config}>
        <MapContent />
      </CesiumContextProvider>
    </CesiumErrorHandler>
  );
}
```

### How do I synchronize Cesium with Redux/Zustand?

Use the event system to sync external state:

```tsx
function CesiumReduxSync() {
  const { subscribe, currentSceneStyleRef } = useCesiumContext();
  const dispatch = useDispatch();
  
  useEffect(() => {
    // Sync Cesium → Redux
    const unsub = subscribe(CtxEvent.SetSceneStyle, (styleId) => {
      dispatch(setMapStyle(styleId));
    });
    
    return () => unsub();
  }, [subscribe, dispatch]);
  
  // Sync Redux → Cesium
  const reduxStyle = useSelector(state => state.map.style);
  const { emit } = useCesiumContext();
  
  useEffect(() => {
    if (reduxStyle !== currentSceneStyleRef.current) {
      emit(CtxEvent.SetSceneStyle, reduxStyle);
    }
  }, [reduxStyle, emit]);
  
  return null;
}
```

### Can I use this with Next.js?

Yes, but Cesium must be loaded client-side only:

```tsx
'use client';

import dynamic from 'next/dynamic';

const CesiumMap = dynamic(
  () => import('./CesiumMap'),
  { ssr: false }
);

export default function Page() {
  return <CesiumMap />;
}
```

### How do I implement click handlers on 3D features?

```tsx
function FeatureClickHandler() {
  const { sceneRef,  } = useCesiumContext();
  
  useEffect(() => {
    const scene = sceneRef.current;
    if (!viewer || !scene) return;
    
    const handler = new ScreenSpaceEventHandler(scene.canvas);
    
    handler.setInputAction((movement) => {
      const picked = scene.pick(movement.position);
      
      if (picked?.primitive instanceof Cesium3DTileset) {
        const feature = picked.getFeature();
        if (feature) {
          console.log("Feature clicked:", feature.getProperty("name"));
          ]);
  
  return null;
}
```

### How do I export the current view as an image?

```tsx
function ExportViewButton() {
  const { sceneRef } = useCesiumContext();
  
  const exportImage = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    
    scene.render();
    const canvas = scene.canvas;
    
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'cesium-view.png';
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    });
  };
  
  return <button onClick={exportImage}>Export View</button>;
}
```

## Testing

### Unit Testing with Vitest

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCesiumContext } from '@carma-mapping/engines/cesium';

describe('useCesiumContext', () => {
  it('should provide context values', () => {
    const { result } = renderHook(() => useCesiumContext(), {
      wrapper: ({ children }) => (
        <CesiumContextProvider config={mockConfig}>
          {children}
        </CesiumContextProvider>
      )
    });
    
    expect(result.current.widgetRef).toBeDefined();
    expect(result.current.emit).toBeInstanceOf(Function);
    expect(result.current.subscribe).toBeInstanceOf(Function);
  });
});
```

### Integration Testing

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('Style Switching', () => {
  it('should switch styles on button click', async () => {
    const user = userEvent.setup();
    
    render(
      <CesiumContextProvider config={testConfig}>
        <StyleToggle />
      </CesiumContextProvider>
    );
    
    const button = screen.getByText('Toggle Style');
    await user.click(button);
    
    // Verify style change
    expect(mockEmit).toHaveBeenCalledWith(
      CtxEvent.ToggleSceneStyle
    );
  });
});
```

## License

See repository root LICENSE file.
