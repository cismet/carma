# @carma-geo/data-structures

Geo domain package for geographic and cartographic data structures and branded types.

## Purpose

This library contains shared geo domain structures such as coordinates, extents, and branded units.

## What belongs here

- ✅ Branded types for coordinates: `Latitude`, `Longitude`, `LatLng`, `LngLatArray`
- ✅ Altitude types: `Altitude.EllipsoidalWGS84Meters`, `Altitude.DHHN2016Meters`
- ✅ Cartographic types: `EastingNorthingMeters`, `Cartesian3D`
- ✅ Bounding box types

## What does NOT belong here

- ❌ Converters or helper functions
- ❌ Validators or type guards
- ❌ General-purpose helper logic or conversion pipelines
- ❌ Coordinate transformations
- ❌ Format conversions
- ❌ Web map, Web Mercator, or Earth model constants

**For runtime utilities, use [`@carma-geo/helpers`](../helpers/README.md)** which provides:

- Format conversions (LatLng ↔ LngLatArray)
- Unit conversions (degrees ↔ radians)
- Coordinate validation
- Normalization functions

## Validation

```sh
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
- **[`@carma-geo/utils`](../utils/README.md)** - Higher-level geographic utilities and shared Web Mercator constants
- **[`@carma-units`](../../commons/units/types/README.md)** - Unit type definitions
- **[`@carma-units`](../../commons/units/helpers/README.md)** - Unit conversion helpers
