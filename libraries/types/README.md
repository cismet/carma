# @carma/types

Buildable declaration package providing shared CARMA type definitions.

## Purpose

This library contains **shared high-level CARMA-specific TypeScript types and interfaces only**. It should remain a pure type definition library without runtime code.

## What belongs here

- ✅ Shared TypeScript interfaces and type aliases
- ✅ Const enum objects (e.g., `as const` patterns)
- ✅ Type-only declarations for external libraries

## What does NOT belong here

- ❌ Validators, guards, or helper functions
- ❌ Runtime code or implementations
- ❌ Type predicates (e.g., `isXXX()` functions)
- ❌ Utility functions

**Rationale**: Keeping this library pure prevents circular dependencies and ensures consistent architecture. If you need validators or helpers, they should go in a dedicated `@carma/helpers` or domain-specific utility library.

## Lint

```sh
nx build carma-types   # generates dist declarations
nx lint carma-types    # lints declaration sources
```

## Development guidelines

- Types only needed by one project should stay local to that project
- Keep this library focused on type definitions - no runtime logic
