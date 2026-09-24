# DZ_B_PRM shadow-texture assets

The source of truth is the [DZ_B_PRM STL collection](https://adhocdata.cismet.de/DZ_B_PRM/).
`build-dzb-prm-collection.py` downloads the source STLs to a separate raw
directory, invokes Blender for each part and quality, and writes a versioned
`collection.json` with the BuGa groups, bridge variants, georeference, source
and output checksums, and both official footprint GeoJSON files. It also
generates `buga.layer.json`, which `pm-show` adds to the normal layer stack
on startup; its `modelCollection` tool supplies the Secondary-Info controls.
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
The third bridge choice uses the existing `BRUECKENENTWURF_GLB` catalog GLB,
not a derived STL. Cache it separately with `--catalog-bridge-only`; the
collection manifest records its Cesium anchor, altitude, heading and SHA-256.
The runtime uses the same transform in the visible MapLibre model and shadow
capture. Its Draco decoder is copied from the installed Three.js package into
`public/assets/draco/` for self-contained deployment.
On `pm-show`, the visible catalog bridge subtracts the collection manifest's
`boardBottomHeightMeters`, matching the visible BuGa collection. Offscreen
capture keeps both bridges in the common unshifted height frame. Selecting
the collection's catalog bridge also suppresses the independent layer's
duplicate visible GLB without disabling its shadow-source registration.
Pass the matching source file explicitly; `--quality` is a provenance label,
not a source-URL selector. The outputs are Meshopt-compressed glTF 2.0 GLBs
with `EXT_mesh_gpu_instancing`. Their X/Z positions are *projected* metres
around EPSG:3857 `(791706.051, 6664825.628)`; Y is absolute DHHN2016
height. The nadir shadow canvas converts X/Z back to longitude/latitude;
it does not render the GLB material into the map.

The derivative root contains `2m/`, `5m/`, the manifest and the layer JSON.
The true 5m environment GLB is 124 MiB and exceeds GitHub's file limit.
The build script packages that one GLB as reproducible `environment.glb.gz`
(gzip mtime 0), checks that it decompresses byte-for-byte, and publishes only
the 96 MB package. Browser loading accepts both servers that pass the gzip
bytes unchanged and servers that advertise `Content-Encoding: gzip`.
A deployment can host GLBs separately by setting
`VITE_DZ_B_PRM_GLB_BASE_URL` to a root with those quality subdirectories;
the metadata JSON remains with the app. Do not use an STL URL in that
setting. The receiver remains the model's own non-flat surface; MapLibre
terrain is not required for this mode.

FFmpeg and video export belong to the localhost-only exploration workflow.
They are not bundled with the Geoportal addon or required by deployed shadow
capture; the deployed addon computes its canvas in the browser.

## Asset packaging decision

- ID / date / status: `dzb-prm-glb-package`, 2026-09-24, adopted for the 5m environment.
- Context and constraints: The verified true 5m environment is 130,467,188 bytes as a Meshopt GLB, above GitHub's 100 MB per-file limit. Geometry, normals, instance transforms, and the original source hash must remain unchanged.
- Decision: Store the exact GLB as deterministic gzip (`mtime=0`) and verify the decompressed SHA-256 against the uncompressed conversion report. The client unpacks before `GLTFLoader.parse`, except when HTTP `Content-Encoding: gzip` has already caused browser decompression. The other GLBs remain ordinary glTF files.
- Alternatives and disposition: Commit raw GLB (incompatible by inspection: over file limit); Git LFS (incompatible by inspection: absent in this checkout and not known to be materialized in the preview deployment); Draco re-encoding or spatial splits (deferred, would change the verified asset/loader contract); external-only hosting (deferred, preview would depend on an additional publishing step).
- Evidence: The true 5m GLB was 130,467,188 bytes; deterministic gzip produced 96,160,001 bytes. The build script verifies byte identity when both are present, and `--manifest-only` verifies the uncompressed SHA even if only the package is present. The local Geoportal served and rendered the packaged asset with a 4096×2288 shadow texture.
- Revisit when: The package exceeds 100 MB, a supported asset CDN or LFS deployment is specified, or measured load/decode cost favors another transport.
