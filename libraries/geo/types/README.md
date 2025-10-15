# @carma/geo/types

Buildable declaration package providing geographic and cartographic type definitions with branded types.

## Purpose

This library contains **geographic coordinate and cartographic TypeScript type definitions only**. It should remain a pure type definition library without runtime code.

## What belongs here

- ✅ Branded types for coordinates: `Latitude`, `Longitude`, `LatLng`, `LngLatArray`
- ✅ Altitude types: `Altitude.EllipsoidalWGS84Meters`, `Altitude.DHHN2016Meters`
- ✅ Cartographic types: `EastingNorthingMeters`, `Cartesian3D`
- ✅ Bounding box types
- ✅ Type-only declarations (`.d.ts` files)

## What does NOT belong here

- ❌ Converters or helper functions
- ❌ Validators or type guards
- ❌ Runtime code or implementations
- ❌ Coordinate transformations
- ❌ Format conversions

**For runtime utilities, use [`@carma/geo/helpers`](../helpers/README.md)** which provides:

- Format conversions (LatLng ↔ LngLatArray)
- Unit conversions (degrees ↔ radians)
- Coordinate validation
- Normalization functions

## Lint

```sh
nx build geo/types   # generates dist declarations
nx lint geo/types    # lints declaration sources
```

## Development guidelines

- This package should have **zero dependencies except `@carma/units/types`**
- Especially **no dependencies to `@carma/types`** or other CARMA-specific types
- Types only needed by one project should stay local to that project
- Keep this library focused on type definitions - no runtime logic

## Related Libraries

- **[`@carma/geo/helpers`](../helpers/README.md)** - Runtime utilities for coordinate conversions and validation
- **[`@carma/geo/proj`](../proj/README.md)** - Projection transformations using proj4
- **[`@carma/geo/utils`](../utils/README.md)** - Higher-level geographic utilities
- **[`@carma/units/types`](../../commons/units/types/README.md)** - Unit type definitions
- **[`@carma/units/helpers`](../../commons/units/helpers/README.md)** - Unit conversion helpers


