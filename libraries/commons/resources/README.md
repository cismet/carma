# Resources

Shared, immutable descriptions and payloads for external services and assets.
Runtime algorithms and coordinate transformations belong in their respective
domain libraries.

## GCG2016

The spatially limited, independently loadable GCG2016 payloads and their
provenance live in this library. `@carma-geo/proj` provides the interpolation
and height-conversion API. The narrow
`@carma-commons/resources/gcg2016` entry point keeps unrelated service
configurations out of projection bundles. Derivation, licensing, coverage,
validation, and failure semantics are documented next to the payloads in
[src/lib/de/gcg2016/README.md](src/lib/de/gcg2016/README.md).

## Build

```sh
nx build resources
```

## Lint

```sh
nx lint resources
```
