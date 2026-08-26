import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
//  CESIUM_primitive_outline for three.js.
//
//  The extension a CityGML conversion writes to say which edges of a building
//  are real edges rather than artefacts of triangulation: eaves, ridges, the
//  corners of a wall, but not the diagonal across a rectangular roof face.
//  Cesium draws them without being asked and offers no way to stop; three.js
//  ignores the extension entirely. This reads it and hangs the lines on the
//  mesh, where they can be switched off again.
//
//  https://github.com/CesiumGS/glTF/tree/main/extensions/2.0/Vendor/CESIUM_primitive_outline
// ─────────────────────────────────────────────────────────────

const EXT_NAME = "CESIUM_primitive_outline";

/** Marks the line objects this plugin adds, so they can be found again. */
export const TILE_OUTLINE_FLAG = "isTileOutline";

interface GltfParserLike {
  json: {
    meshes?: Array<{
      primitives: Array<{ extensions?: Record<string, { indices?: number }> }>;
    }>;
  };
  associations: Map<object, { meshes?: number; primitives?: number }>;
  getDependency: (type: string, index: number) => Promise<unknown>;
}

export interface PrimitiveOutlineOptions {
  color?: THREE.ColorRepresentation;
  opacity?: number;
}

/**
 * A `GLTFLoader` plugin. Register it through `GLTFExtensionsPlugin`:
 *
 *   new GLTFExtensionsPlugin({
 *     plugins: [(parser) => new GLTFPrimitiveOutlineExtension(parser, options)],
 *   })
 */
export class GLTFPrimitiveOutlineExtension {
  name = EXT_NAME;
  private parser: GltfParserLike;
  private options: PrimitiveOutlineOptions;

  constructor(parser: GltfParserLike, options: PrimitiveOutlineOptions = {}) {
    this.parser = parser;
    this.options = options;
  }

  async afterRoot(result: { scene: THREE.Object3D }): Promise<void> {
    const parser = this.parser;
    const pending: Array<Promise<void>> = [];

    result.scene.traverse((child) => {
      const association = parser.associations.get(child);
      if (!association) return;
      const { meshes, primitives } = association;
      if (meshes === undefined || primitives === undefined) return;

      const primitive = parser.json.meshes?.[meshes]?.primitives?.[primitives];
      const def = primitive?.extensions?.[EXT_NAME];
      if (!def || def.indices === undefined) return;

      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;

      pending.push(this.attach(mesh, def.indices));
    });

    await Promise.all(pending);
  }

  private async attach(mesh: THREE.Mesh, accessorIndex: number): Promise<void> {
    const attribute = (await this.parser.getDependency(
      "accessor",
      accessorIndex
    )) as THREE.BufferAttribute;
    const position = mesh.geometry.getAttribute("position");
    if (!attribute || !position) return;

    // The accessor holds vertex indices in pairs, one pair per edge, pointing
    // into the primitive's own POSITION. Sharing that attribute rather than
    // copying it means the lines cost indices and nothing else.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", position);
    const source = attribute.array;
    const indices =
      source instanceof Uint32Array || source instanceof Uint16Array
        ? source
        : Uint32Array.from(source as ArrayLike<number>);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const material = new THREE.LineBasicMaterial({
      color: this.options.color ?? 0x000000,
      transparent: (this.options.opacity ?? 1) < 1,
      opacity: this.options.opacity ?? 1,
      // The lines lie exactly on the surfaces they outline, so without help
      // they fight the roof for the same depth and break up as the camera
      // moves. Pushing the faces back leaves the lines in front.
      depthTest: true,
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.userData[TILE_OUTLINE_FLAG] = true;
    // A child of the mesh, so it inherits the tile's transform and goes away
    // with it when the tile is unloaded.
    mesh.add(lines);

    for (const meshMaterial of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      meshMaterial.polygonOffset = true;
      meshMaterial.polygonOffsetFactor = 1;
      meshMaterial.polygonOffsetUnits = 1;
      meshMaterial.needsUpdate = true;
    }
  }
}
