# @carma/geo/helpers

Runtime utilities for conversions and validation of geographic types defined in `@carma/geo/types`.

## Modules

### Conversions

Format and unit conversions:

- `latLngToLngLatArray()`, `lngLatArrayToLatLng()` - Format conversions
- `latLngDegToRad()`, `latLngRadToDeg()` - Unit conversions
- `lngLatArrayDegToRad()`, `lngLatArrayRadToDeg()` - Array unit conversions

### Validators

Range validation and normalization:

- `isValidLatitudeDeg()`, `isValidLongitudeDeg()` - Range validation
- `isValidLatitudeRad()`, `isValidLongitudeRad()` - Radian range validation
- `normalizeLatitudeDeg()`, `normalizeLatitudeRad()` - Latitude clamping (poles can't wrap)
- `normalizeLongitudeDeg()`, `normalizeLongitudeRad()` - Longitude wrapping (uses `negativeOneEightyToOneEighty` and `negativePiToPi` from `@carma/units/helpers`)

## Usage

```typescript
import { 
  latLngToLngLatArray, 
  isValidLatitudeDeg,
  normalizeLongitudeDeg
} from '@carma/geo/helpers';
import type { LatLng, Latitude, Longitude } from '@carma/geo/types';

const position: LatLng.deg = { 
  latitude: 52.0 as Latitude.deg, 
  longitude: 7.0 as Longitude.deg 
};

const array = latLngToLngLatArray(position); // [7.0, 52.0]

const normalized = normalizeLongitudeDeg(370.0 as Longitude.deg); // 10.0
```

## Related Libraries

- **[`@carma/geo/types`](../types/README.md)** - Geographic type definitions (coordinates, altitudes, cartographic types)
- **[`@carma/geo/proj`](../proj/README.md)** - Projection transformations using proj4
- **[`@carma/geo/utils`](../utils/README.md)** - Higher-level geographic utilities
- **[`@carma/units/helpers`](../../commons/units/helpers/README.md)** - Unit conversion helpers (used for angle normalization)

