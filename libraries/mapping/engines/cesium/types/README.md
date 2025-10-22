# cesium/types

Primitive type definitions for Cesium configuration objects.

## Purpose

This package provides **primitive-only** versions of Cesium types for:

1. **Lazy Loading** - Config types that don't force Cesium bundle to load
2. **Serialization** - JSON-safe types for storage/transmission
3. **Type Safety** - Strict typing without runtime Cesium dependency

## Why This Exists

Cesium types like `Color`, `Cartesian3`, `Rectangle` are **runtime classes**. Importing them forces the entire Cesium bundle (~5MB) to load immediately.

By using primitive equivalents (arrays, plain objects), configs remain:
- ✅ Serializable to JSON
- ✅ Independent of Cesium runtime
- ✅ Lazy-loadable (Cesium loads only when needed)

## Structure

Each file matches a Cesium type:

- **Cartesian2.d.ts** - `Cartesian2Primitive` → `[x, y]`
- **Cartesian3.d.ts** - `Cartesian3Primitive` → `[x, y, z]`
- **Color.d.ts** - `ColorRgbaArray`, `ColorRgbArray`
- **Rectangle.d.ts** - `RectanglePrimitive` → `{ west, south, east, north }`
- **Globe.d.ts** - `GlobeConstructorOptionsPrimitive`
- **Cesium3DTileset.d.ts** - `Cesium3DTilesetStyleOptionsPrimitive`
- **Camera.d.ts** - `CameraPositionPrimitive`, `CameraViewOptionsPrimitive`
- **HeadingPitchRoll.d.ts** - `HeadingPitchRollPrimitive`
- **[Imagery Providers]** - `*ConstructorOptionsPrimitive`

## Usage

```typescript
// ✅ Config with primitives (no Cesium import)
import type { GlobeConstructorOptionsPrimitive } from "@carma/cesium/types";

const config: GlobeConstructorOptionsPrimitive = {
  baseColor: [0.2, 0.3, 0.4, 1.0], // RGBA array
  show: true
};

// ✅ Convert to Cesium when needed (lazy loaded)
const applyConfig = async (scene: Scene) => {
  const { Color } = await import("@carma/cesium");
  scene.globe.baseColor = new Color(...config.baseColor);
};
```

## Naming Convention

- Primitive types end with `Primitive` suffix
- ConstructorOptions types end with `ConstructorOptionsPrimitive`
- File names match Cesium class names (PascalCase)

## Helper Methods

Conversion utilities (primitive → Cesium objects) live in `cesium/api`, not here. This package contains only type definitions.
