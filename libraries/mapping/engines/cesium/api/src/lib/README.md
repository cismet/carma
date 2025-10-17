# Cesium Engine Namespace

This folder mirrors the structure of [Cesium's engine source](https://github.com/CesiumGS/cesium/tree/main/packages/engine/Source) to organize re-exports and custom extensions.

## Structure

Based on Cesium's official package structure:

### Core/
Fundamental types and utilities:
- Math types: `Cartesian2`, `Cartesian3`, `Matrix3`, `Matrix4`, etc.
- `Color` - Color utilities and conversions
- `Ellipsoid`, `Cartographic`
- Core utilities and helpers

### Scene/
Rendering scene components:
- `Scene`, `Camera`, `Globe`
- `Primitive`, `GroundPrimitive`
- `Cesium3DTileset`
- Scene modes and settings

### DataSources/
Entity-based data visualization:
- `Entity`, `EntityCollection`
- `DataSource` types
- Graphics objects

### Renderer/
Low-level WebGL rendering (rarely used directly)

### Widgets/
UI components:
- `CesiumWidget` - Minimal 3D viewer
- `Viewer` - Full-featured viewer with UI
- Widget configurations

## Usage

Import from this namespace instead of directly from `cesium`:

```typescript
// ✅ Preferred
import { Cartesian3 } from '../engine/Core';
import { CesiumWidget } from '../engine/Widgets';

// ❌ Avoid
import { Cartesian3, CesiumWidget } from 'cesium';
```

## Organization Rules

**What belongs in `engine/`:**
- ✅ Pure Cesium object re-exports (e.g., `Cartesian3`, `Color`, `Scene`)
- ✅ Simple utilities that work directly with Cesium objects
- ✅ Default configurations for Cesium constructors
- ✅ Type definitions for Cesium objects

**What stays outside `engine/`:**
- ❌ React hooks → `hooks/`
- ❌ React components → `components/`
- ❌ High-level application logic
- ❌ Complex integration/orchestration code → `utils/`

**Principle:** Each file in `engine/` should map to a specific Cesium object or namespace. If it involves React, state management, or complex coordination, it belongs elsewhere.
