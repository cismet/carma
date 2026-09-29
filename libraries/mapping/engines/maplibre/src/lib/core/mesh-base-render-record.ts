import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Group,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  LineSegments,
  MaterialLoader,
  Matrix4,
  Mesh,
  Sphere,
  Texture,
  Vector3,
  type Material,
  type Object3D,
  type TypedArray,
} from "three";
import { BatchTable, FeatureTable } from "3d-tiles-renderer/core";
import { MESH_BASE_RENDER_FORMAT } from "./mesh-base-cache-protocol";

export const MESH_BASE_NODE = {
  group: "group",
  mesh: "mesh",
  lines: "lines",
} as const;

/** Native structured-clone representation: no numeric JSON arrays for geometry
 * and no PNG/JPEG decode when restoring already decoded texture bitmaps. */

type AttributeRecord = {
  array: TypedArray;
  itemSize: number;
  normalized: boolean;
  stride?: number;
  offset?: number;
  gpuType?: BufferAttribute["gpuType"];
};
type GeometryRecord = {
  attributes: Record<string, AttributeRecord>;
  index: AttributeRecord | null;
  groups: BufferGeometry["groups"];
  range: BufferGeometry["drawRange"];
  box: number[] | null;
  sphere: number[] | null;
};
type TextureRecord = {
  image: ImageBitmap;
  properties: Record<string, string | number | boolean>;
  offset: number[];
  repeat: number[];
  center: number[];
  matrix: number[];
};
type NodeRecord = {
  kind: (typeof MESH_BASE_NODE)[keyof typeof MESH_BASE_NODE];
  name: string;
  matrix: number[];
  geometry?: number;
  material?: number | number[];
  visible: boolean;
  renderOrder: number;
  layers: number;
  frustumCulled: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  matrixAutoUpdate: boolean;
  userData: Record<string, unknown>;
  children: NodeRecord[];
};
type TableRecord = { header: object; binary: ArrayBuffer; count?: number };
export type MeshBaseRenderRecord = {
  version: typeof MESH_BASE_RENDER_FORMAT;
  root: NodeRecord;
  geometries: GeometryRecord[];
  materials: ReturnType<Material["toJSON"]>[];
  textures: Record<string, TextureRecord>;
  bytes: number;
  featureTable?: TableRecord;
  batchTable?: TableRecord;
};

const textureProperties = [
  "mapping",
  "channel",
  "wrapS",
  "wrapT",
  "magFilter",
  "minFilter",
  "anisotropy",
  "format",
  "type",
  "colorSpace",
  "rotation",
  "flipY",
  "generateMipmaps",
  "premultiplyAlpha",
  "unpackAlignment",
  "matrixAutoUpdate",
] as const;

/** Unsupported dynamic/material features keep the native source path. */
export const snapshotMeshBaseRenderRecord = (
  scene: Object3D,
  tileTransform: Matrix4
): MeshBaseRenderRecord | null => {
  const geometryIds = new Map<BufferGeometry, number>();
  const materialIds = new Map<Material, number>();
  const geometries: GeometryRecord[] = [],
    materials: ReturnType<Material["toJSON"]>[] = [];
  const textures: Record<string, TextureRecord> = {};
  let bytes = 0;
  const attribute = (
    value: BufferAttribute | InterleavedBufferAttribute
  ): AttributeRecord => {
    const interleaved = value instanceof InterleavedBufferAttribute;
    // postMessage clones these arrays once when the idle writer dispatches.
    // Retain source buffers here; never detach buffers owned by live geometry.
    const array = (interleaved ? value.data.array : value.array) as TypedArray;
    bytes += array.byteLength;
    return {
      array,
      itemSize: value.itemSize,
      normalized: value.normalized,
      ...(interleaved
        ? { stride: value.data.stride, offset: value.offset }
        : { gpuType: value.gpuType }),
    };
  };
  const geometry = (source: BufferGeometry): number => {
    const existing = geometryIds.get(source);
    if (existing !== undefined) return existing;
    if (Object.keys(source.morphAttributes).length)
      throw new Error("Morph geometry");
    const id = geometries.length;
    geometryIds.set(source, id);
    geometries.push({
      attributes: Object.fromEntries(
        Object.entries(source.attributes).map(([key, value]) => [
          key,
          attribute(value),
        ])
      ),
      index: source.index ? attribute(source.index) : null,
      groups: source.groups.map((group) => ({ ...group })),
      range: { ...source.drawRange },
      box: source.boundingBox
        ? [
            ...source.boundingBox.min.toArray(),
            ...source.boundingBox.max.toArray(),
          ]
        : null,
      sphere: source.boundingSphere
        ? [
            ...source.boundingSphere.center.toArray(),
            source.boundingSphere.radius,
          ]
        : null,
    });
    return id;
  };
  const material = (source: Material): number => {
    const existing = materialIds.get(source);
    if (existing !== undefined) return existing;
    if (
      ![
        "MeshBasicMaterial",
        "MeshStandardMaterial",
        "MeshPhysicalMaterial",
        "LineBasicMaterial",
      ].includes(source.type) ||
      Object.hasOwn(source, "onBeforeCompile")
    )
      throw new Error("Custom material");
    const meta = {
      textures: {} as Record<string, { uuid: string }>,
      images: {},
    };
    for (const value of Object.values(source)) {
      if (!(value instanceof Texture)) continue;
      if (!(value.image instanceof ImageBitmap) || value.mipmaps.length)
        throw new Error("Unsupported texture representation");
      meta.textures[value.uuid] = { uuid: value.uuid };
      if (textures[value.uuid]) continue;
      textures[value.uuid] = {
        image: value.image,
        properties: Object.fromEntries(
          textureProperties.map((key) => [key, value[key]])
        ),
        offset: value.offset.toArray(),
        repeat: value.repeat.toArray(),
        center: value.center.toArray(),
        matrix: value.matrix.toArray(),
      };
      bytes += value.image.width * value.image.height * 4;
    }
    const json = source.toJSON(meta);
    const id = materials.length;
    materialIds.set(source, id);
    materials.push(json);
    bytes += JSON.stringify(json).length * 2;
    return id;
  };
  const node = (source: Object3D, root = false): NodeRecord => {
    if (
      source.animations.length ||
      !["Group", "Object3D", "Mesh", "LineSegments"].includes(source.type)
    )
      throw new Error("Dynamic or unsupported node");
    const drawable = source instanceof Mesh || source instanceof LineSegments;
    const matrix = source.matrix.clone();
    if (root) matrix.premultiply(tileTransform.clone().invert());
    const result: NodeRecord = {
      kind:
        source instanceof Mesh
          ? MESH_BASE_NODE.mesh
          : source instanceof LineSegments
          ? MESH_BASE_NODE.lines
          : MESH_BASE_NODE.group,
      name: source.name,
      matrix: matrix.toArray(),
      visible: source.visible,
      renderOrder: source.renderOrder,
      layers: source.layers.mask,
      frustumCulled: source.frustumCulled,
      castShadow: source.castShadow,
      receiveShadow: source.receiveShadow,
      matrixAutoUpdate: source.matrixAutoUpdate,
      userData: structuredClone(
        Object.fromEntries(
          Object.entries(source.userData).filter(([key]) => key !== "tile")
        )
      ),
      children: source.children.map((child) => node(child)),
    };
    if (drawable) {
      result.geometry = geometry(source.geometry);
      result.material = Array.isArray(source.material)
        ? source.material.map(material)
        : material(source.material);
    }
    return result;
  };
  try {
    const root = node(scene, true);
    bytes += JSON.stringify(root).length * 2;
    const table = (
      source?: FeatureTable & { count?: number }
    ): TableRecord | undefined => {
      if (!source) return undefined;
      const binary = source.buffer.slice(
        source.binOffset,
        source.binOffset + source.binLength
      );
      bytes += binary.byteLength + JSON.stringify(source.header).length * 2;
      return {
        header: structuredClone(source.header),
        binary,
        count: source.count,
      };
    };
    const source = scene as Object3D & {
      featureTable?: FeatureTable;
      batchTable?: BatchTable;
    };
    const featureTable = table(source.featureTable),
      batchTable = table(source.batchTable);
    return {
      version: MESH_BASE_RENDER_FORMAT,
      root,
      geometries,
      materials,
      textures,
      bytes,
      featureTable,
      batchTable,
    };
  } catch {
    return null;
  }
};

export const restoreMeshBaseRenderRecord = (
  record: MeshBaseRenderRecord
): Object3D => {
  if (record.version !== MESH_BASE_RENDER_FORMAT)
    throw new Error("Stale mesh render record");
  const textures: Record<string, Texture> = {};
  for (const [id, source] of Object.entries(record.textures)) {
    const texture = new Texture(source.image);
    Object.assign(texture, source.properties);
    texture.offset.fromArray(source.offset);
    texture.repeat.fromArray(source.repeat);
    texture.center.fromArray(source.center);
    texture.matrix.fromArray(source.matrix);
    texture.needsUpdate = true;
    textures[id] = texture;
  }
  const loader = new MaterialLoader().setTextures(textures);
  const materials = record.materials.map((value) => loader.parse(value));
  const attribute = (source: AttributeRecord) => {
    if (source.stride !== undefined)
      return new InterleavedBufferAttribute(
        new InterleavedBuffer(source.array, source.stride),
        source.itemSize,
        source.offset!,
        source.normalized
      );
    const result = new BufferAttribute(
      source.array,
      source.itemSize,
      source.normalized
    );
    if (source.gpuType !== undefined) result.gpuType = source.gpuType;
    return result;
  };
  const geometries = record.geometries.map((source) => {
    const geometry = new BufferGeometry();
    for (const [key, value] of Object.entries(source.attributes))
      geometry.setAttribute(key, attribute(value));
    if (source.index)
      geometry.setIndex(attribute(source.index) as BufferAttribute);
    geometry.groups = source.groups;
    geometry.setDrawRange(source.range.start, source.range.count);
    if (source.box)
      geometry.boundingBox = new Box3(
        new Vector3().fromArray(source.box),
        new Vector3().fromArray(source.box, 3)
      );
    if (source.sphere)
      geometry.boundingSphere = new Sphere(
        new Vector3().fromArray(source.sphere),
        source.sphere[3]
      );
    return geometry;
  });
  const node = (source: NodeRecord): Object3D => {
    if (!Object.values(MESH_BASE_NODE).includes(source.kind))
      throw new Error("Invalid cached mesh node");
    const material = Array.isArray(source.material)
      ? source.material.map((id) => materials[id])
      : materials[source.material!];
    const result =
      source.kind === MESH_BASE_NODE.mesh
        ? new Mesh(geometries[source.geometry!], material)
        : source.kind === MESH_BASE_NODE.lines
        ? new LineSegments(geometries[source.geometry!], material)
        : new Group();
    result.name = source.name;
    result.visible = source.visible;
    result.renderOrder = source.renderOrder;
    result.layers.mask = source.layers;
    result.frustumCulled = source.frustumCulled;
    result.castShadow = source.castShadow;
    result.receiveShadow = source.receiveShadow;
    result.matrixAutoUpdate = source.matrixAutoUpdate;
    result.userData = source.userData;
    result.matrix
      .fromArray(source.matrix)
      .decompose(result.position, result.quaternion, result.scale);
    for (const child of source.children) result.add(node(child));
    return result;
  };
  const result = node(record.root) as Object3D & {
    featureTable?: FeatureTable;
    batchTable?: BatchTable;
  };
  const table = (source: TableRecord) => {
    const header = new TextEncoder().encode(JSON.stringify(source.header));
    const length = Math.ceil(header.byteLength / 8) * 8;
    const bytes = new Uint8Array(length + source.binary.byteLength);
    bytes.fill(32, 0, length);
    bytes.set(header);
    bytes.set(new Uint8Array(source.binary), length);
    return source.count === undefined
      ? new FeatureTable(bytes.buffer, 0, length, source.binary.byteLength)
      : new BatchTable(
          bytes.buffer,
          source.count,
          0,
          length,
          source.binary.byteLength
        );
  };
  if (record.featureTable) result.featureTable = table(record.featureTable);
  if (record.batchTable)
    result.batchTable = table(record.batchTable) as BatchTable;
  return result;
};
