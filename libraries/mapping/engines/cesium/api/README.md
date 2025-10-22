# @carma/cesium

**Curated Cesium API Surface** - Opinionated, reliable subset of Cesium for better manageability.

## Philosophy

- **No Viewer** - Use `CesiumWidget` directly for full control
- **No Entities** - Direct primitive manipulation for performance
- **Curated API** - Only expose features we actively use and support
- **Type Safety** - Guards, converters, and wrappers for safe usage

## Usage

```typescript
// Preferred: Use @carma/cesium for all imports
import { 
  Cartesian3, 
  Cartographic,
  cartographicToUnitTyped,
  isRectangleLike,
  rectangleFromLike,
  CesiumWidget
} from '@carma/cesium';
```

**Import Path**: Always use `@carma/cesium` (not `cesium` directly)  
**Package Name**: `@carma-mapping/engines/cesium/api`

## Structure

Mirrors Cesium's engine source:

- **Core** - Cartesian3, Cartographic, Rectangle + type guards
- **Scene** - Camera, Globe utilities  
- **Widget** - CesiumWidget re-exports

## Dependencies

Only `cesium` + lightweight CARMA unit types (`@carma/geo/types`, `@carma/units/*`)

## Primitive Conversion Helpers

Helper methods for converting primitives from `@carma/cesium/types` to Cesium objects belong here, alongside the types they create.
