# Geographic Libraries

This directory contains libraries for geographic and cartographic operations.

## Library Scope

### `@carma/geo/types`
Pure TypeScript type definitions for geographic coordinates and cartographic systems.
- Branded types for coordinates: `Latitude`, `Longitude`, `LatLng`, `LngLatArray`
- Altitude types: `Altitude.EllipsoidalWGS84Meters`, `Altitude.DHHN2016Meters`
- Cartographic types: `EastingNorthingMeters`, `Cartesian3D`
- No runtime code, only type definitions (`.d.ts` files)

### `@carma/geo/helpers`
Runtime utilities for conversions and validation of geographic types.
- **Conversions**: Format and unit conversions (`latLngToLngLatArray`, `latLngDegToRad`)
- **Validators**: Range validation and normalization (`isValidLatitudeDeg`, `normalizeLatitudeDeg`)

Follows the pattern established by `@carma/units/types` → `@carma/units/helpers`.

### `@carma/geo/proj`
Projection transformations using proj4js with strongly typed converters.
- Typed wrapper around proj4 for coordinate transformations
- Managed projections: EPSG:4326 (WGS84), EPSG:3857 (Web Mercator), EPSG:25832 (UTM32)
- Type-safe `getProj4Converter<TSource, TTarget>()` with `CoordinateFor<P>` mapping
- Converter caching for performance

### `@carma/geo/utils`
Higher-level geographic utilities and domain-specific calculations.
- Mercator projection calculations
- Bounding box operations
- Geographic constants and reference values

## Architecture Principles

**Separation of Concerns:**
- Types define the data model
- Helpers provide low-level operations on types
- Utils provide domain-specific business logic
- Proj handles coordinate system transformations

**Type Safety:**
- Branded types prevent coordinate confusion
- Generic types ensure transformation correctness
- Altitude types maintain vertical datum awareness

**Map Framework Independence:**
- ⚠️ **CRITICAL RULE**: No imports from `leaflet`, `maplibre-gl`, or `cesium` allowed in `@carma/geo/*`
- Map framework-specific conversions live in `@carma-mapping/engines/*` packages
- Pure format converters (turf, proj4, plain arrays) belong in `@carma/geo/*`
- This keeps geo packages portable and framework-agnostic
