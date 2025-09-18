# Branded Units: Radians‑first, IO‑only conversions

Guidelines for type‑safe units (Radians, Degrees, Meters) with zero runtime overhead.

*implementation is in progress, so far only for common utils and [constants](/libraries/commons/utils/src/lib/constants.ts) for [geo](/libraries/commons/utils/src/lib/geo.ts) and [mercator](/libraries/commons/utils/src/lib/mercator.ts)*

## Principles
- **Radians inside**: All core math expects/returns `Radians`. Conversions are only for IO (user input, GeoJSON, external APIs).
- **Brand, don’t guess**: Use `Degrees`, `Radians`, `Meters` brands instead of naked `number`.
- **Convert at boundaries**: Use `degToRad`/`radToDeg` only where data enters/leaves our system.
- **Math.* is rad**: Call `Math.sin/cos/tan` on `Radians` values.
- [Branded arithmetic operations](/libraries/commons/utils/src/lib/typescript-branded-ops.ts) keep brands intact
- **Unbrand sparingly**: Use `unbrandNumber(x)` only when an external API truly needs a plain `number`, usually you can just use the branded Number as is since it is a subtype of number.

## Benefits
- **Prevents unit confusion**: Avoids `deg`↔`rad` bugs and `meters`↔`pixels/km` mixups at compile time.
- **Stable APIs**: Function intent is clear; overloads keep types stable (including `undefined` passthroughs).
- **Zero runtime cost**: Brands are TypeScript‑only; no extra JS overhead.
- **Self‑documenting**: Code reads with units, not ambiguous numbers.

## Locations
- Types: [/libraries/commons/types/src/lib/units.d.ts](/libraries/commons/types/src/lib/units.d.ts)
- Types barrel: [/libraries/commons/types/src/index.ts](/libraries/commons/types/src/index.ts)
- Unit helpers: [/libraries/commons/utils/src/lib/units.ts](/libraries/commons/utils/src/lib/units.ts)
- Constants: [/libraries/commons/utils/src/lib/constants.ts](/libraries/commons/utils/src/lib/constants.ts)
- Geo helpers: [/libraries/commons/utils/src/lib/geo.ts](/libraries/commons/utils/src/lib/geo.ts)
- Mercator utils: [/libraries/commons/utils/src/lib/mercator.ts](/libraries/commons/utils/src/lib/mercator.ts)
- Branded ops: [/libraries/commons/utils/src/lib/typescript-branded-ops.ts](/libraries/commons/utils/src/lib/typescript-branded-ops.ts)
- Utils barrel: [/libraries/commons/utils/src/index.ts](/libraries/commons/utils/src/index.ts)
- Tests: [/libraries/commons/utils/src/lib/mercator.spec.ts](/libraries/commons/utils/src/lib/mercator.spec.ts)

### Import tips
- For Node tests, prefer importing specific modules (e.g., `lib/mercator.ts`) over the utils barrel to avoid pulling browser-only code (DOMParser).

## Examples
- Math.* expects radians; internal APIs take/return `Radians`.

### 1) Convert only at IO boundaries (e.g., GeoJSON deg input)
```ts
import { asDegrees, degToRad } from "../utils/src/lib/units";

// incoming lon/lat in degrees
const lonDeg = asDegrees(7.0);
const latDeg = asDegrees(51.0);

const lonRad = degToRad(lonDeg);
const latRad = degToRad(latDeg);
// Use lonRad/latRad everywhere internally
```

### 2) Safe conversions with stable types
```ts
import { degToRad, radToDeg } from "../utils/src/lib/units";

const r = degToRad(asDegrees(180)); // Radians
const d = radToDeg(r);              // Degrees

const maybeR = degToRad(undefined); // undefined passes through
```

## Further reading
https://prosopo.io/blog/typescript-branding/
