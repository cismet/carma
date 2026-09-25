# DZ_B_PRM shadow-texture assets

The BuGa layer eye hides its visible 3D meshes while keeping the selected parts
active in shadow capture. The separate catalog bridge casts only while its layer
is visible. "Nur Schatten" hides both sets of visible meshes without changing
their participation in capture. The BuGa secondary view has no separate
"Modell anzeigen" switch.

The generated `*.asset.json` provenance reports retain source/GLB checksums,
georeferencing, conversion parameters, and aggregate GPU-instancing results.
Individual instance-family diagnostics are intentionally omitted from the
checked-in reports; rerunning the converter reproduces the summary and GLB.

The source of truth is the [DZ_B_PRM STL collection](https://adhocdata.cismet.de/DZ_B_PRM/).
`build-dzb-prm-collection.py` downloads the source STLs to a separate raw
directory, invokes Blender for each part and quality, and writes a versioned
`collection.json` with the BuGa groups, bridge variants, georeference, source
and output checksums, and both official footprint GeoJSON files. It also
generates `buga.layer.json`, which the shadow workflow (or an explicit
`shadow=` URL) adds to the normal `pm-show` layer stack; its `modelCollection`
tool supplies the Secondary-Info controls.
Raw STLs
are never modified. The adjacent `*.asset.json` files record Blender version,
cleanup and instancing statistics as well as per-part bounds.

```sh
python3 apps/geoportal/scripts/build-dzb-prm-collection.py \
  --raw-dir /path/to/dz-b-prm-raw \
  --output-dir /path/to/dz-b-prm-derived \
  --qualities 2m 5m
```

`--qualities original` additionally builds the roughly 31-million-triangle
source; this is optional and expensive. Completed GLBs are reused only after
both source and derivative SHA-256 checks pass. `--dry-run` prints the fetch
and build plan without network or writes. `--manifest-only` indexes existing
derivatives after validating their output checksums; it is useful when a
deployment hosts only selected quality tiers. When both 2m and 5m are
published, the script rejects matching source checksums across quality tiers
to prevent a mislabeled LOD.

Run `convert-dzb-prm-stl.py` with Blender 5.2 to regenerate one part without
modifying its source STL. For example:

```sh
blender --background --factory-startup \
  --python apps/geoportal/scripts/convert-dzb-prm-stl.py -- \
  --part environment --quality 5m --min-instances 10 \
  --input /path/to/umgebung.stl --output-dir /path/to/derived/5m
```

The other part IDs are `zoo`, `bridge`, `bridge-existing`, and `station`.
The Brückenvergleich workflow uses the existing `BRUECKENENTWURF_GLB` catalog GLB
alongside BuGa Bestand, or BuGa Entwurf without that separate GLB.
Cache it separately with `--catalog-bridge-only`; the
collection manifest records its Cesium anchor, altitude, heading and SHA-256.
The runtime uses the same transform in the visible MapLibre model and shadow
capture. Its Draco decoder is copied from the installed Three.js package into
`public/assets/draco/` for self-contained deployment.
On `pm-show`, the visible catalog bridge subtracts the collection manifest's
`boardBottomHeightMeters`, matching the visible BuGa collection. Offscreen
capture keeps both bridges in the common unshifted height frame.
The catalog layer is added last and hidden by the
shadow workflows; its eye also controls whether it contributes a shadow.
Pass the matching source file explicitly; `--quality` is a provenance label,
not a source-URL selector. The outputs are Meshopt-compressed glTF 2.0 GLBs
with `EXT_mesh_gpu_instancing`. Their X/Z positions are *projected* metres
around EPSG:3857 `(791706.051, 6664825.628)`; Y is absolute DHHN2016
height. The nadir shadow canvas converts X/Z back to longitude/latitude;
it does not render the GLB material into the map.

The derivative root contains `2m/`, `5m/`, the manifest and the layer JSON.
The ten GLB files are published separately at
`https://wupp-3d-data.cismet.de/dz-b-prm/derived/`, not in Git. The small
`collection.json`, layer JSON, and provenance reports remain in the app. Local
GLBs can stay in the ignored `public/assets/dz-b-prm/` tree for reproduction.
The true 5m environment GLB is 124 MiB and exceeds GitHub's file limit.
The build script packages that one GLB as reproducible `environment.glb.gz`
(gzip mtime 0), checks that it decompresses byte-for-byte, and publishes only
the 96 MB package. Browser loading accepts both servers that pass the gzip
bytes unchanged and servers that advertise `Content-Encoding: gzip`.
A deployment defaults to the public 3D-data host; set
`VITE_DZ_B_PRM_GLB_BASE_URL` only to override its root with the same quality
subdirectories. Do not use an STL URL in that setting. The receiver remains
the model's own non-flat surface; MapLibre
terrain is not required for this mode.

FFmpeg and video export belong to the localhost-only exploration workflow.
They are not bundled with the Geoportal addon or required by deployed shadow
capture; the deployed addon computes its canvas in the browser.

## Asset packaging decision

- ID / date / status: `dzb-prm-glb-package`, 2026-09-24, adopted for the 5m environment.
- Context and constraints: The verified true 5m environment is 130,467,188 bytes as a Meshopt GLB, above GitHub's 100 MB per-file limit. Geometry, normals, instance transforms, and the original source hash must remain unchanged.
- Decision: Store the exact GLB as deterministic gzip (`mtime=0`) and verify the decompressed SHA-256 against the uncompressed conversion report. The client unpacks before `GLTFLoader.parse`, except when HTTP `Content-Encoding: gzip` has already caused browser decompression. The other GLBs remain ordinary glTF files.
- Alternatives and disposition: Commit raw GLB (incompatible by inspection: over file limit); Git LFS (not used); Draco re-encoding or spatial splits (deferred, would change the verified asset/loader contract). All ten GLBs now use the separate public 3D-data host; a deployment depends on those URLs remaining available.
- Evidence: The true 5m GLB was 130,467,188 bytes; deterministic gzip produced 96,160,001 bytes. The build script verifies byte identity when both are present, and `--manifest-only` verifies the uncompressed SHA even if only the package is present. The local Geoportal served and rendered the packaged asset with a 4096×2288 shadow texture.
- Revisit when: The 3D-data host or its cache policy changes, or measured load/decode cost favors another transport.
