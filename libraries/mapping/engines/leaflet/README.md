# engines/leaflet

Leaflet-specific utilities and conversions.

## Purpose

This package contains utilities that work directly with Leaflet types and instances:
- **Bounds conversions**: `latLngBoundsToProjectedBBox()` - converts Leaflet `LatLngBounds` to projected bounding boxes
- **Coordinate helpers**: `latLngToTypedLngLatArr()` - converts Leaflet `LatLng` to typed arrays
- **Map utilities**: `getBoundingBoxForLeafletMap()` - extracts and transforms map bounds
- **Event names**: Type-safe Leaflet map event constants
- **React hooks**: `useLeafletZoomControls()` - programmatic zoom controls

## Architecture Rule

⚠️ **This package imports from `leaflet`** - that's its purpose!

Framework-agnostic conversions (turf, proj4, plain arrays) belong in `@carma/geo/*` packages.
Only conversions that require Leaflet types/instances belong here.

## Build

```sh
nx build engines/leaflet
```

## Test

```sh
nx test engines/leaflet
```

## Lint

```sh
nx lint engines/leaflet
```
