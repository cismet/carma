// Converts the glTF 1 payloads in the 2020 b3dm mesh to glTF 2 for GLTFLoader.

interface Gltf1Json {
  asset?: Record<string, unknown>;
  buffers?: Record<string, { byteLength?: number }>;
  bufferViews?: Record<
    string,
    {
      buffer: string;
      byteOffset?: number;
      byteLength?: number;
      target?: number;
    }
  >;
  accessors?: Record<
    string,
    {
      bufferView: string;
      byteOffset?: number;
      byteStride?: number;
      componentType: number;
      count: number;
      type: string;
      min?: number[];
      max?: number[];
    }
  >;
  images?: Record<
    string,
    {
      extensions?: {
        KHR_binary_glTF?: { bufferView: string; mimeType: string };
      };
    }
  >;
  samplers?: Record<
    string,
    { magFilter?: number; minFilter?: number; wrapS?: number; wrapT?: number }
  >;
  textures?: Record<string, { sampler?: string; source?: string }>;
  materials?: Record<string, { values?: Record<string, unknown> }>;
  meshes?: Record<
    string,
    {
      primitives: Array<{
        attributes: Record<string, string>;
        indices?: string;
        material?: string;
        mode?: number;
      }>;
    }
  >;
  nodes?: Record<
    string,
    {
      children?: string[];
      meshes?: string[];
      matrix?: number[];
      translation?: number[];
      rotation?: number[];
      scale?: number[];
    }
  >;
  scenes?: Record<string, { nodes?: string[] }>;
  scene?: string;
  extensions?: Record<string, unknown>;
}

const COMPONENT_SIZES: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};
const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT3: 9,
  MAT4: 16,
};

const indexMap = (record: Record<string, unknown> | undefined) => {
  const map = new Map<string, number>();
  Object.keys(record ?? {}).forEach((key, index) => map.set(key, index));
  return map;
};

const upgradeGltf1Json = (gltf1: Gltf1Json): Record<string, unknown> => {
  const bufferViewIds = indexMap(gltf1.bufferViews);
  const accessorIds = indexMap(gltf1.accessors);
  const imageIds = indexMap(gltf1.images);
  const samplerIds = indexMap(gltf1.samplers);
  const textureIds = indexMap(gltf1.textures);
  const materialIds = indexMap(gltf1.materials);
  const meshIds = indexMap(gltf1.meshes);
  const nodeIds = indexMap(gltf1.nodes);
  const sceneIds = indexMap(gltf1.scenes);

  const binaryByteLength =
    gltf1.buffers?.["binary_glTF"]?.byteLength ??
    Object.values(gltf1.buffers ?? {})[0]?.byteLength ??
    0;

  const bufferViews = Object.values(gltf1.bufferViews ?? {}).map((view) => ({
    buffer: 0,
    byteOffset: view.byteOffset ?? 0,
    byteLength: view.byteLength ?? 0,
    ...(view.target !== undefined ? { target: view.target } : {}),
  }));

  const accessors = Object.values(gltf1.accessors ?? {}).map((accessor) => {
    const viewIndex = bufferViewIds.get(accessor.bufferView) ?? 0;
    // glTF1 keeps byteStride on the accessor, glTF2 on the bufferView;
    // only interleaved (non-packed) strides must be carried over
    const packed =
      (COMPONENT_SIZES[accessor.componentType] ?? 4) *
      (TYPE_COMPONENTS[accessor.type] ?? 1);
    if (accessor.byteStride && accessor.byteStride !== packed) {
      (bufferViews[viewIndex] as { byteStride?: number }).byteStride =
        accessor.byteStride;
    }
    return {
      bufferView: viewIndex,
      byteOffset: accessor.byteOffset ?? 0,
      componentType: accessor.componentType,
      count: accessor.count,
      type: accessor.type,
      ...(accessor.min ? { min: accessor.min } : {}),
      ...(accessor.max ? { max: accessor.max } : {}),
    };
  });

  const images = Object.values(gltf1.images ?? {}).map((image) => {
    const binary = image.extensions?.KHR_binary_glTF;
    return {
      bufferView: bufferViewIds.get(binary?.bufferView ?? "") ?? 0,
      mimeType: binary?.mimeType ?? "image/jpeg",
    };
  });

  const samplers = Object.values(gltf1.samplers ?? {}).map((sampler) => ({
    ...(sampler.magFilter !== undefined
      ? { magFilter: sampler.magFilter }
      : {}),
    ...(sampler.minFilter !== undefined
      ? { minFilter: sampler.minFilter }
      : {}),
    ...(sampler.wrapS !== undefined ? { wrapS: sampler.wrapS } : {}),
    ...(sampler.wrapT !== undefined ? { wrapT: sampler.wrapT } : {}),
  }));

  const textures = Object.values(gltf1.textures ?? {}).map((texture) => ({
    ...(texture.sampler !== undefined
      ? { sampler: samplerIds.get(texture.sampler) ?? 0 }
      : {}),
    ...(texture.source !== undefined
      ? { source: imageIds.get(texture.source) ?? 0 }
      : {}),
  }));

  const materials = Object.values(gltf1.materials ?? {}).map((material) => {
    const diffuse = material.values?.["diffuse"];
    const pbr: Record<string, unknown> = {
      metallicFactor: 0,
      roughnessFactor: 1,
    };
    if (typeof diffuse === "string") {
      pbr.baseColorTexture = { index: textureIds.get(diffuse) ?? 0 };
    } else if (Array.isArray(diffuse)) {
      pbr.baseColorFactor =
        diffuse.length === 4 ? diffuse : [...diffuse, 1].slice(0, 4);
    }
    // Photogrammetry textures are already lit — render them unlit
    return {
      pbrMetallicRoughness: pbr,
      extensions: { KHR_materials_unlit: {} },
    };
  });

  const meshes = Object.values(gltf1.meshes ?? {}).map((mesh) => ({
    primitives: mesh.primitives.map((primitive) => ({
      attributes: Object.fromEntries(
        Object.entries(primitive.attributes).map(([semantic, accessorId]) => [
          semantic,
          accessorIds.get(accessorId) ?? 0,
        ])
      ),
      ...(primitive.indices !== undefined
        ? { indices: accessorIds.get(primitive.indices) ?? 0 }
        : {}),
      ...(primitive.material !== undefined
        ? { material: materialIds.get(primitive.material) ?? 0 }
        : {}),
      mode: primitive.mode ?? 4,
    })),
  }));

  const nodes = Object.values(gltf1.nodes ?? {}).map((node) => ({
    ...(node.children?.length
      ? { children: node.children.map((child) => nodeIds.get(child) ?? 0) }
      : {}),
    ...(node.matrix ? { matrix: node.matrix } : {}),
    ...(node.translation ? { translation: node.translation } : {}),
    ...(node.rotation ? { rotation: node.rotation } : {}),
    ...(node.scale ? { scale: node.scale } : {}),
    // glTF1 allows multiple meshes per node — the 2020 tiles use one
    ...(node.meshes?.length ? { mesh: meshIds.get(node.meshes[0]) ?? 0 } : {}),
  }));

  const scenes = Object.values(gltf1.scenes ?? {}).map((scene) => ({
    nodes: (scene.nodes ?? []).map((node) => nodeIds.get(node) ?? 0),
  }));

  const extensionsUsed = ["KHR_materials_unlit"];
  const extensions: Record<string, unknown> = {};
  if (gltf1.extensions?.["CESIUM_RTC"]) {
    extensions["CESIUM_RTC"] = gltf1.extensions["CESIUM_RTC"];
    extensionsUsed.push("CESIUM_RTC");
  }

  return {
    asset: { version: "2.0", generator: "carma glTF1 on-the-fly upgrade" },
    buffers: [{ byteLength: binaryByteLength }],
    bufferViews,
    accessors,
    images,
    samplers,
    textures,
    materials,
    meshes,
    nodes,
    scenes,
    scene: gltf1.scene !== undefined ? sceneIds.get(gltf1.scene) ?? 0 : 0,
    extensionsUsed,
    ...(Object.keys(extensions).length ? { extensions } : {}),
  };
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const glb1ToGlb2 = (glb: Uint8Array): Uint8Array | null => {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) return null; // "glTF"
  if (view.getUint32(4, true) !== 1) return null; // already glTF 2
  const contentLength = view.getUint32(12, true);
  const contentFormat = view.getUint32(16, true);
  if (contentFormat !== 0) return null; // 0 = JSON

  const json1 = JSON.parse(
    textDecoder.decode(glb.subarray(20, 20 + contentLength))
  ) as Gltf1Json;
  const body = glb.subarray(20 + contentLength);
  const json2 = upgradeGltf1Json(json1);

  let jsonBytes = textEncoder.encode(JSON.stringify(json2));
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPadding) {
    const padded = new Uint8Array(jsonBytes.length + jsonPadding).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }
  const binPadding = (4 - (body.length % 4)) % 4;

  const total = 12 + 8 + jsonBytes.length + 8 + body.length + binPadding;
  const out = new Uint8Array(total);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 0x46546c67, true); // glTF
  outView.setUint32(4, 2, true);
  outView.setUint32(8, total, true);
  outView.setUint32(12, jsonBytes.length, true);
  outView.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(jsonBytes, 20);
  const binChunkOffset = 20 + jsonBytes.length;
  outView.setUint32(binChunkOffset, body.length + binPadding, true);
  outView.setUint32(binChunkOffset + 4, 0x004e4942, true); // BIN
  out.set(body, binChunkOffset + 8);
  return out;
};

export const upgradeB3dmGltf1 = (buffer: ArrayBuffer): ArrayBuffer | null => {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x6d643362) return null; // "b3dm"
  const featureTableJson = view.getUint32(12, true);
  const featureTableBinary = view.getUint32(16, true);
  const batchTableJson = view.getUint32(20, true);
  const batchTableBinary = view.getUint32(24, true);
  const glbOffset =
    28 +
    featureTableJson +
    featureTableBinary +
    batchTableJson +
    batchTableBinary;

  const glb2 = glb1ToGlb2(bytes.subarray(glbOffset));
  if (!glb2) return null;

  const out = new Uint8Array(glbOffset + glb2.length);
  out.set(bytes.subarray(0, glbOffset));
  out.set(glb2, glbOffset);
  new DataView(out.buffer).setUint32(8, out.length, true); // b3dm byteLength
  return out.buffer;
};

export class Gltf1UpgradePlugin {
  name = "GLTF1_UPGRADE_PLUGIN";

  async fetchData(url: string | URL, options: RequestInit): Promise<Response> {
    const response = await fetch(url, options);
    if (!/\.b3dm(\?|$)/.test(String(url)) || !response.ok) return response;

    const buffer = await response.arrayBuffer();
    const upgraded = upgradeB3dmGltf1(buffer);
    return new Response(upgraded ?? buffer, { status: 200 });
  }
}
