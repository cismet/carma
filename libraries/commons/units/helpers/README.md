# @carma/units/helpers

Runtime utilities for unit conversions and operations with branded types defined in `@carma/units/types`.

## Modules

### Unit Conversions

Degree ↔ Radian conversions:

- `degToRad()` - Convert degrees to radians
- `radToDeg()` - Convert radians to degrees

### Branded Arithmetic

Type-safe arithmetic operations that preserve branded types:

- `brandedAdd()` - Addition preserving the brand
- `brandedSub()` - Subtraction preserving the brand
- `brandedMul()` - Multiplication by scalar preserving the brand
- `brandedDiv()` - Division by scalar preserving the brand
- `brandedNegate()` - Negation preserving the brand
- `brandedAbs()` - Absolute value preserving the brand
- `brandedMin()` - Minimum of two values preserving the brand
- `brandedMax()` - Maximum of two values preserving the brand
- `brandedClamp()` - Clamp value between min and max preserving the brand
- `clamp()` - Flexible clamp with optional min/max bounds
- `isClose()` - Check if two branded values are within epsilon

### Angle Normalization

Angle normalization functions:

- `negativeOneEightyToOneEighty()` - Normalize degrees to [-180, 180]
- `negativePiToPi()` - Normalize radians to [-π, π]
- `zeroToTwoPi()` - Normalize radians to [0, 2π]

### Constants

Pre-defined radian constants:

- `PI` - π as Radians
- `TWO_PI` - 2π as Radians
- `PI_OVER_TWO` - π/2 as Radians
- `PI_OVER_FOUR` - π/4 as Radians

## Usage

```typescript
import { 
  degToRad,
  radToDeg,
  brandedAdd,
  negativeOneEightyToOneEighty,
  PI,
  TWO_PI
} from '@carma/units/helpers';
import type { Degrees, Radians } from '@carma/units/types';

// Unit conversion
const angle = 90 as Degrees;
const rad = degToRad(angle); // π/2 as Radians
const backToDeg = radToDeg(rad); // 90 as Degrees

// Branded arithmetic
const a = 45 as Degrees;
const b = 30 as Degrees;
const sum = brandedAdd(a, b); // 75 as Degrees (preserves type)

// Normalization
const wrapped = negativeOneEightyToOneEighty(370 as Degrees); // 10 as Degrees

// Constants
const fullCircle = TWO_PI; // 2π as Radians
```

## Design Philosophy

This library ensures **type safety through branded types** while providing runtime utilities. The branded arithmetic operations guarantee that:
- You cannot accidentally mix incompatible units
- Type information is preserved through operations
- The compiler catches unit mismatches at build time

## Related Libraries

- **[`@carma/units/types`](../types/README.md)** - Unit type definitions with branded types
- **[`@carma/geo/helpers`](../../../geo/helpers/README.md)** - Geographic coordinate helpers (uses these utilities)
