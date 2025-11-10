# @carma/units/types

Buildable declaration package providing unit and measurement type definitions with branded types.

## Purpose

This library contains **Unit / Quantity of Measurements specific TypeScript type definitions only**. It must remain a pure type definition library without runtime code.

## What belongs here

- Type-only declarations

## What does NOT belong here

- Converters or helper functions
- Validators or type guards
- Runtime code or implementations
- Arithmetic operations

**For runtime utilities, use [`@carma/units/helpers`](../helpers/README.md)** which provides:

- Unit conversions (degrees ↔ radians)
- Branded arithmetic operations
- Normalization functions
- Validation helpers

## Lint

```sh
nx build units/types   # generates dist declarations
nx lint units/types    # lints declaration sources
```

## Development guidelines

- Types only needed by one project should stay local to that project
- Keep this library focused on type definitions - no runtime logic
- See [BRANDED-UNITS.md](BRANDED-UNITS.md) for more details on unit branding

## Related Libraries

- **[`@carma/units/helpers`](../helpers/README.md)** - Runtime utilities for unit conversions and operations
- **[`@carma/geo/types`](../../../geo/types/README.md)** - Geographic coordinate types
- **[`@carma/geo/helpers`](../../../geo/helpers/README.md)** - Geographic coordinate helpers