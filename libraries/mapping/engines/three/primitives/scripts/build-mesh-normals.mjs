// Regeneration only: pass a wabt 1.0.39 module path, or install it externally.
// Runtime consumers have no compiler dependency and make no WASM request.
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const wabt = await require(process.argv[2] || "wabt")();
const source = new URL("../src/lib/common/mesh-normals.wat", import.meta.url);
const module = wabt.parseWat(source.pathname, await readFile(source, "utf8"));
module.validate();
const { buffer } = module.toBinary({ canonicalize_lebs: true });
await writeFile(
  new URL("../src/lib/common/mesh-normals-bytes.ts", import.meta.url),
  "// Generated from mesh-normals.wat by scripts/build-mesh-normals.mjs; do not edit.\n" +
    "export const MESH_NORMALS_WASM_BYTES = new Uint8Array([\n" +
    Array.from(
      { length: Math.ceil(buffer.length / 24) },
      (_, i) =>
        "  " + Array.from(buffer.slice(i * 24, (i + 1) * 24)).join(", ") + ","
    ).join("\n") +
    "\n]);\n"
);
module.destroy();
