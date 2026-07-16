# Geographic Libraries

This directory contains libraries for geographic and cartographic operations.

## Library Scope

### `@carma-geo/data-structures`
Geographic data structures, branded types, and domain constants for geographic coordinates and cartographic systems.
- Branded types for coordinates: `Latitude`, `Longitude`, `LatLng`, `LngLatArray`
- Altitude types: `Altitude.EllipsoidalWGS84Meters`, `Altitude.DHHN2016Meters`
- Cartographic types: `EastingNorthingMeters`, `Cartesian3D`
- Includes type definitions and lightweight runtime constants

### `@carma-geo/helpers`
Runtime utilities for conversions and validation of geographic types.
- **Conversions**: Format and unit conversions (`latLngToLngLatArray`, `latLngDegToRad`)
- **Validators**: Range validation and normalization (`isValidLatitudeDeg`, `normalizeLatitudeDeg`)

Follows the pattern established by `@carma-units` → `@carma-units`.

### `@carma-geo/proj`
Projection transformations using proj4js with strongly typed converters.
- Typed wrapper around proj4 for coordinate transformations
- Managed projections: EPSG:4326 (WGS84), EPSG:3857 (Web Mercator), EPSG:25832 (UTM32), EPSG:4978 (WGS84 ECEF)
- Type-safe `getProj4Converter<TSource, TTarget>()` with `CoordinateFor<P>` mapping
- Converter caching for performance
- Asynchronous DHHN2016 ↔ ellipsoidal-height transforms using the verified
  BKG GCG2016 5×5 spline. Geographic, UTM32, batched, and ECEF adapters share
  the existing managed and cached Proj4js conversions; the tiled grid
  payload and provenance live in `@carma-commons/resources`.

### `@carma-geo/utils`
Higher-level geographic utilities and domain-specific calculations.
- Mercator projection calculations
- Bounding box operations
- Geographic constants and reference values

## Architecture Principles

**Separation of Concerns:**
- Data structures define the domain model
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
