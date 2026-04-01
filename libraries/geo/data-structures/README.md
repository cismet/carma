# @carma-geo/data-structures

Buildable geo domain package for geographic and cartographic data structures, branded types, and a small set of shared constants.

## Purpose

This library contains shared geo domain structures such as coordinates, extents, branded units, and a few stable exported constants that belong to the same domain language.

## What belongs here

- ✅ Branded types for coordinates: `Latitude`, `Longitude`, `LatLng`, `LngLatArray`
- ✅ Altitude types: `Altitude.EllipsoidalWGS84Meters`, `Altitude.DHHN2016Meters`
- ✅ Cartographic types: `EastingNorthingMeters`, `Cartesian3D`
- ✅ Bounding box types
- ✅ Shared geo constants and token maps when they are part of the domain model

## What does NOT belong here

- ❌ Converters or helper functions
- ❌ Validators or type guards
- ❌ General-purpose helper logic or conversion pipelines
- ❌ Coordinate transformations
- ❌ Format conversions

**For runtime utilities, use [`@carma-geo/helpers`](../helpers/README.md)** which provides:

- Format conversions (LatLng ↔ LngLatArray)
- Unit conversions (degrees ↔ radians)
- Coordinate validation
- Normalization functions

## Lint

```sh
nx build geo-data-structures
nx lint geo-data-structures
```

## Development guidelines

- This package should stay low in the dependency graph
- Prefer dependencies only on foundational shared packages such as `@carma-units`
- Types only needed by one project should stay local to that project
- Keep this library focused on geo domain data structures, not helper behavior

## Related Libraries

- **[`@carma-geo/helpers`](../helpers/README.md)** - Runtime utilities for coordinate conversions and validation
- **[`@carma-geo/proj`](../proj/README.md)** - Projection transformations using proj4
- **[`@carma-geo/utils`](../utils/README.md)** - Higher-level geographic utilities
- **[`@carma-units`](../../commons/units/types/README.md)** - Unit type definitions
- **[`@carma-units`](../../commons/units/helpers/README.md)** - Unit conversion helpers

