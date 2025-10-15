# @carma/resources

Shared library for common GIS assets and resource definitions including WMS layers, tilesets, terrain providers, and 3D models.

## Overview

This package provides centralized definitions for:

- **3D Tilesets** - CityGML LOD2, mesh data
- **Terrain Providers** - DTM, DSM elevation data
- **Imagery Providers** - WMTS, WMS base layers
- **3D Models** - GLB/GLTF model configurations
- **Resource Constants** - URLs, configurations for common data sources

## Usage

### Importing Resources

```typescript
import {
  WUPP_LOD2_TILESET,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  BRUECKENENTWURF_GLB
} from "@carma/resources";
```

### 3D Model Configuration

Models use the `ModelConfig` type for consistent configuration:

```typescript
import type { ModelConfig } from "@carma/resources";

export const BRIDGE_MODEL: ModelConfig = {
  position: {
    longitude: 7.121277,
    latitude: 51.252545,
    altitude: 100  // meters
  },
  orientation: {
    heading: 0,  // degrees
    pitch: 0,
    roll: 0
  },
  model: {
    uri: "https://example.com/model.glb",
    scale: 1.0,
    show: true
  },
  properties: {
    name: "Bridge Design",
    description: "New bridge construction model",
    // ... custom feature info properties
  }
};
```

### Using with Cesium

```typescript
import { CesiumConfig } from "@carma-mapping/engines/cesium";
import {
  WUPP_LOD2_TILESET,
  WUPP_TERRAIN_PROVIDER,
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  BRUECKENENTWURF_GLB
} from "@carma/resources";

const config: CesiumConfig = {
  imageryProviders: [
    { id: "basemap", config: BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ }
  ],
  terrainProviders: [
    { id: "terrain", type: "dtm", config: WUPP_TERRAIN_PROVIDER }
  ],
  tilesets: [
    { id: "LOD2", config: WUPP_LOD2_TILESET }
  ],
  models: [BRUECKENENTWURF_GLB],
  // ... rest of config
};
```

## Structure

```text
src/
├── lib/
│   ├── de.nrw.wuppertal/
│   │   ├── imagery.ts       # Wuppertal-specific imagery layers
│   │   ├── tilesets.ts      # 3D tilesets (LOD2, mesh)
│   │   ├── terrain.ts       # Terrain and surface providers
│   │   └── models.ts        # 3D model configurations
│   ├── loaders/
│   │   └── model.ts         # ModelConfig type and helpers
│   └── index.ts             # Public exports
```

## Adding New Resources

### Adding a 3D Model

**Step 1:** Define the model configuration:

```typescript
// src/lib/de.nrw.wuppertal/models.ts
import { ModelConfig } from "../loaders/model";

export const MY_MODEL: ModelConfig = {
  position: {
    longitude: 7.0,
    latitude: 51.0,
    altitude: 0
  },
  model: {
    uri: "https://example.com/model.glb"
  },
  properties: {
    name: "My Model"
  }
};
```

**Step 2:** Export from index:

```typescript
// src/index.ts
export { MY_MODEL } from "./lib/de.nrw.wuppertal/models";
```

### Adding a Tileset

```typescript
// src/lib/de.nrw.wuppertal/tilesets.ts
export const MY_TILESET = {
  url: "https://example.com/tileset/tileset.json",
  maximumScreenSpaceError: 16,
  maximumMemoryUsage: 512
};
```

## Types

### ModelConfig

Complete model configuration with position, orientation, and metadata.

```typescript
interface ModelConfig {
  position: {
    longitude: number;  // degrees
    latitude: number;   // degrees
    altitude: number;   // meters
  };
  orientation?: {
    heading?: number;   // degrees
    pitch?: number;     // degrees
    roll?: number;      // degrees
  };
  model: {
    uri: string;
    scale?: number;
  };
  properties: FeatureInfoProperties;
}
```

## Best Practices

- **Centralize URLs** - Keep all resource URLs in this package
- **Type Safety** - Use provided types for consistent configurations
- **Documentation** - Add JSDoc comments for each resource
- **Organization** - Group resources by region/city (e.g., `de.nrw.wuppertal/`)
- **Naming Convention** - Use descriptive names: `CITY_TYPE_YEAR` (e.g., `WUPP_MESH_2024`)

## Related Packages

- **`@carma-mapping/engines/cesium`** - Uses these resources for 3D visualization
- **`@carma-commons/types`** - Provides base types like `FeatureInfoProperties`

## Build

```sh
nx build resources
```

## Lint

```sh
nx lint resources
```
