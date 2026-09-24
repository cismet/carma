# Resources

Shared, immutable descriptions and payloads for external services and assets.
Runtime algorithms and coordinate transformations belong in their respective
domain libraries.

## Nordhelle landmarks

Mapped tower positions, independently sampled NRW DGM1 ground anchors and
approximate procedural silhouettes are documented with their source and licence
boundaries in [src/lib/de.nrw.sauerland/README.md](src/lib/de.nrw.sauerland/README.md).
The same immutable silhouette schema also describes the two Langenberg masts;
see [their provenance](src/lib/de.nrw.ruhr/README.landmarks.md).

## Wuppertal camera corridors

The Schwebebahn and B 7 corridors used by the camera flights are an
OpenStreetMap extract, captured reproducibly by
[capture-wuppertal-corridors.mjs](src/lib/de.nrw.wuppertal/capture-wuppertal-corridors.mjs)
and reduced by its derive sibling. OpenStreetMap data is licensed under the
Open Database License (ODbL 1.0), which is share-alike and requires attribution:
© OpenStreetMap contributors. That notice travels with the payloads in their
own `license`/`attribution` fields, so it survives import and re-export. This
is third-party data under a licence other than the repository’s MIT licence;
see [camera-corridors-source.md](src/lib/de.nrw.wuppertal/camera-corridors-source.md)
for the query, bounding box and snapshot date.

## Build

```sh
nx build resources
```

## Lint

```sh
nx lint resources
```
