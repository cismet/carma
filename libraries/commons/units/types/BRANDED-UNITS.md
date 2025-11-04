# Branded Units: Radians‑first, IO‑only conversions

Guidelines for type‑safe units (Radians, Degrees, Meters) with zero runtime overhead.

*implementation is in progress

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

### Import tips
- For Node tests, prefer importing specific modules (e.g., `lib/mercator.ts`) over the utils barrel to avoid pulling browser-only code (DOMParser).

## Examples
- Math.* expects radians; internal APIs take/return `Radians`.

### 1) Convert only at IO boundaries (e.g., GeoJSON deg input)
```ts
import { type Degrees } from "@carma/units";
import { degToRad } from "../utils/src/lib/units";

// incoming lon/lat in degrees
const lonDeg = 7.0 as Degrees;
const latDeg = 51.0 as Degrees;

const lonRad = degToRad(lonDeg);
const latRad = degToRad(latDeg);
// Use lonRad/latRad everywhere internally
```

### 2) Safe conversions with stable types
```ts
import { type Degrees } from "@carma/units";
import { degToRad, radToDeg } from "../utils/src/lib/units";

const r = degToRad(180 as Degrees); // Radians
const d = radToDeg(r);              // Degrees

const maybeR = degToRad(undefined); // undefined passes through
```

## Further reading
https://prosopo.io/blog/typescript-branding/
