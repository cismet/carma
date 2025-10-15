# Bounding Box Formats in CARMA

## Standard Format: Turf BBox2d

**Use this everywhere possible:**
```typescript
import type { BBox2d } from '@turf/helpers';
const bbox: BBox2d = [minX, minY, maxX, maxY]; // [west, south, east, north]
```

## Leaflet Bounds Array

**For Leaflet `map.fitBounds()`:**
```typescript
import type { LeafletBoundsArray } from '@carma-mapping/engines/leaflet';
const bounds: LeafletBoundsArray = [[lat_sw, lng_sw], [lat_ne, lng_ne]];
```

## Legacy: RoutedMapBoundingBox (Deprecated)

**react-cismap only - migrate away from this:**
```typescript
import type { RoutedMapBoundingBox } from '@carma-mapping/engines/carma-cismap';
// { left: minX, top: maxY, right: maxX, bottom: minY }
```

**Problem:** Confusing naming (`top` = north/maxY, `bottom` = south/minY)

## Conversion Flow

```
Leaflet LatLngBounds (WGS84)
    ↓ project to target CRS
Turf BBox2d [minX, minY, maxX, maxY]  ← Standard intermediate format
    ↓ convert for react-cismap only
RoutedMapBoundingBox { left, top, right, bottom }  ← Legacy
```

**Rule:** Always use Turf `BBox2d` as intermediate format. Only convert to `RoutedMapBoundingBox` at react-cismap boundaries.

## Migration Path

1. Replace `RoutedMapBoundingBox` with `BBox2d` in internal code
2. Use `routedMapBBoxToTurfBBox()` at react-cismap boundaries
3. Remove `RoutedMapBoundingBox` after react-cismap migration
