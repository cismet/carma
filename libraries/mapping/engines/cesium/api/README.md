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

Flat like CesiumJS API

## Dependencies

Only `cesium` + lightweight CARMA unit types (`@carma/geo/types`, `@carma/units/*`)

## Type System Rules

### JSON-Serializable Types

For config files and serialization, Cesium object types are replaced with plain JavaScript types.

**Naming Conventions:**
- `[Type]ConstructorArgs` - Array/tuple of constructor arguments for `new Type(...args)` with labeled members
- `[Type]Json` - Plain object representation for JSON serialization

```typescript
// Example: Matrix4 constructor takes 16 numbers with labeled positions
// prettier-ignore
export type Matrix4ConstructorArgs = [
    column0Row0: number, column1Row0: number, column2Row0: number, column3Row0: number,
    column0Row1: number, column1Row1: number, column2Row1: number, column3Row1: number,
    column0Row2: number, column1Row2: number, column2Row2: number, column3Row2: number,
    column0Row3: number, column1Row3: number, column2Row3: number, column3Row3: number,
];

// Example: Color constructor args with labeled RGBA values
export type ColorConstructorArgs = [
  red: number,
  green: number,
  blue: number,
  alpha: number
];

// Example: Plain JSON object representation
export interface Cartesian3Json {
  x: number;
  y: number;
  z: number;
}
```

**Rules:**
- Must be plain JavaScript types (arrays, objects, primitives)
- Cannot import or reference Cesium types
- Use array tuples with labeled members for constructor arguments
- Apply `// prettier-ignore` to preserve matrix-like formatting
- Use interfaces or type aliases for JSON object representations

**Usage:**
```typescript
// Spread constructor args into Cesium constructors
const color = new Color(...colorArgs);
const matrix = new Matrix4(...matrixArgs);

// JSON objects need conversion helpers
const cartesian = fromCartesian3Json(jsonData);
const json = toCartesian3Json(cartesian);
```

### Override Types for Constructor Options

When Cesium constructor options contain non-serializable types, create override types:

```typescript
export type Cesium3DTilesetConstructorOptions = 
  Omit<Cesium3DTileset.ConstructorOptions, 'modelMatrix' | 'lightColor' | 'outlineColor'> 
  & {
    modelMatrix?: Matrix4ConstructorArgs;
    lightColor?: Cartesian3ConstructorArgs;
    outlineColor?: ColorConstructorArgs;
  };
```

This allows storing constructor options in JSON config files.

## Primitive Conversion Helpers

Helper methods for converting primitives from `@carma/cesium/types` to Cesium objects belong here, alongside the types they create.

# Developer Guidelines

wrap only as needed for carma, no intention of coverage of full cesium api
only manage the subset we use, but add as needed

### Function Naming Conventions

All helper functions follow consistent naming patterns:

**Type Guards**
- Pattern: `is[Type]` or `isValid[Type]`
- Purpose: Runtime type checking and validation
- Examples:
  ```typescript
  isValidCartesian3(value: unknown): value is Cartesian3
  isColorConstructorArgs(value: unknown): value is ColorConstructorArgs
  isPerspectiveFrustum(value: unknown): value is PerspectiveFrustum
  ```

**Converters: From and To Serial Format or Constructor Args to Cesium**
- Pattern: `[type]From[Format]` and `[type]To[Format]`
- Examples:
  ```typescript
  colorFromConstructorArgs(args: ColorConstructorArgs): Color | null
  colorToConstructorArgs(color: Color): ColorConstructorArgs

  cartesian3FromJson(json: Cartesian3Json): Cartesian3
  cartesian3ToJson(cartesian: Cartesian3): Cartesian3Json

  rectangleFromJson(json: RectangleJson): Rectangle
  rectangleToJson(rect: Rectangle): RectangleJson
  ```

**Naming Rules**
- Base type name first (lowercase for functions, PascalCase for types)
- Use `[type]` placeholder to refer to the Cesium type being converted
- Direction suffix: `To` (outbound) or `From` (inbound)
- Target format: `Json`, `ConstructorArgs`, `ConstructorOptions`, etc.
- Consistent camelCase (e.g., `fromJson` not `FromJSON`)

see also custom eslint rules

scripts/eslint/rules/createRestrictedImportRule.js