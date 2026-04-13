# @carma-units

Buildable unit package for branded measurement types, constants, conversions, formatting, and validation helpers.

## Purpose

This library contains the shared units domain for the monorepo. It combines branded unit types with the small runtime helpers that naturally belong to the same model.

## What belongs here

- Branded unit types
- Unit constants and tokens
- Conversions such as degrees/radians
- Formatting helpers for angles, lengths, and coordinates
- Validation helpers and small unit-oriented predicates

## What does NOT belong here

- Unrelated domain DTOs
- Geo coordinates and extents
- Generic math helpers that are not unit-specific

## Lint

```sh
nx build units
nx lint units
```

## Development guidelines

- Unit-specific types and runtime helpers should stay together here unless a clearer owning package exists
- Keep generic numeric helpers in `@carma-commons/math`
- See `src/lib/` for the current split into base, applied, and formatting modules

## Related Libraries

- **[`@carma-geo/data-structures`](/Users/friedrich/cisgit/carma/libraries/geo/data-structures/README.md)** - Geographic coordinate and direction types
- **[`@carma-geo/helpers`](../../../geo/helpers/README.md)** - Geographic coordinate helpers
