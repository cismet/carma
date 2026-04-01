# @carma-cesium API Surface

Curated raw Cesium surface for CARMA.

This package is the vendor-facing Cesium boundary. It should stay as close as
possible to Cesium itself and avoid carrying CARMA-specific helper or runtime
policy logic.

## What belongs here

- curated direct re-exports from `cesium`
- type-only or zero-runtime compatibility shims that only patch gaps in Cesium's
  own typings without introducing CARMA semantics

## What does not belong here

- CARMA guards
- serialization and codecs
- scene, terrain, picking, or camera helpers
- widget factories
- CARMA transforms
- orchestration or runtime policy
- React bindings

Those belong in [`@carma-mapping/engines/cesium/core`](../../README.md) or
further runtime/legacy layers.

## Private Shims

Vendor-near compatibility helpers for Cesium internals live in
`lib/private-shims.ts` and are re-exported via `@carma-cesium`.

Private shim verification is intentionally enforced at build time:

- `private-shims.ts` carries the single verified Cesium version constant `VERIFIED_PRIVATE_SHIMS_CESIUM_VERSION`
- `scripts/verify-private-shims.mjs` is committed with the `cesium-api` project
- `cesium-api` build and test fail if the declared or installed Cesium version
  drifts away from that verified version
- upgrading Cesium therefore requires an explicit shim re-audit before the API
  package can build again
- private shims may use a direct raw `cesium` import internally when namespace
  access is required; that does not make a public namespace escape hatch part of
  `@carma-cesium`

Examples:

- `getCesiumVersion()`
- `VERSION`
- `readCesiumPrivateSceneTweens()`

## Rule of thumb

If a symbol is still semantically “just Cesium”, it may stay in `@carma-cesium`.
If it expresses CARMA policy, convenience logic, or engine-owned helper
behavior, it belongs somewhere else.
