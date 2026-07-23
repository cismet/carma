#!/usr/bin/env node

import { open, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { B3DMLoaderBase } from "3d-tiles-renderer/core";
import { WGS84_ELLIPSOID } from "3d-tiles-renderer/three";
import proj4 from "proj4";
import { Matrix4, Quaternion, Vector3 } from "three";

const manifestPath = process.argv[2] ? resolve(process.argv[2]) : null;
if (!manifestPath) {
  throw new Error("Usage: extract-mesh-ao-triangles.mjs MESH_MANIFEST.json");
}
const sourceDirectory = dirname(manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schema !== "carma.mesh-ao-source") {
  throw new Error("Unsupported mesh AO manifest");
}

proj4.defs(
  "EPSG:25832",
  "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs"
);
const rootTransform = new Matrix4().fromArray(manifest.rootTransformEcef);
const yUpToZUp = new Matrix4().set(
  1,
  0,
  0,
  0,
  0,
  0,
  -1,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  0,
  1
);
const outputOrigin = new Vector3(
  ...manifest.target.triangleOriginUtmEllipsoidal
);
const cartographic = { lat: 0, lon: 0, height: 0 };

const componentReaders = {
  5121: [1, "getUint8"],
  5123: [2, "getUint16"],
  5125: [4, "getUint32"],
  5126: [4, "getFloat32"],
};
const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

const parseGlb = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Not a GLB");
  let offset = 12;
  let json;
  let binary;
  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const payload = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(payload).trim());
    } else if (type === 0x004e4942) {
      binary = payload;
    }
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error("Incomplete GLB");
  return { json, binary };
};

const readAccessor = (gltf, binary, accessorIndex) => {
  const accessor = gltf.accessors[accessorIndex];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const [componentSize, getter] =
    componentReaders[accessor.componentType] ?? [];
  const componentCount = componentCounts[accessor.type];
  if (!componentSize || !componentCount || accessor.sparse) {
    throw new Error(`Unsupported accessor ${accessorIndex}`);
  }
  const stride = bufferView.byteStride ?? componentSize * componentCount;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(
    binary.buffer,
    binary.byteOffset,
    binary.byteLength
  );
  return {
    count: accessor.count,
    componentCount,
    get(index, component = 0) {
      return view[getter](
        base + index * stride + component * componentSize,
        true
      );
    },
  };
};

const nodeMatrix = (node) => {
  if (node.matrix) return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(
    new Vector3(...(node.translation ?? [0, 0, 0])),
    new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
    new Vector3(...(node.scale ?? [1, 1, 1]))
  );
};

const binaryPath = join(sourceDirectory, "triangles-utm32-relative.f32");
const triangleFile = await open(binaryPath, "w");
let tileTriangles = [];
let triangleValueCount = 0;
let meshCount = 0;
let vertexCount = 0;
const writeAll = async (bytes) => {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await triangleFile.write(
      bytes,
      offset,
      bytes.byteLength - offset
    );
    if (bytesWritten < 1) throw new Error("Triangle file write stalled");
    offset += bytesWritten;
  }
};
const position = new Vector3();
const convertPosition = (x, y, z, modelMatrix, tileTransform) => {
  position
    .set(x, y, z)
    .applyMatrix4(modelMatrix)
    .applyMatrix4(yUpToZUp)
    .applyMatrix4(tileTransform)
    .applyMatrix4(rootTransform);
  WGS84_ELLIPSOID.getPositionToCartographic(position, cartographic);
  const [easting, northing] = proj4("EPSG:4326", "EPSG:25832", [
    (cartographic.lon * 180) / Math.PI,
    (cartographic.lat * 180) / Math.PI,
  ]);
  tileTriangles.push(
    easting - outputOrigin.x,
    northing - outputOrigin.y,
    cartographic.height - outputOrigin.z
  );
};

const visitNode = (gltf, binary, nodeIndex, parentMatrix, tileTransform) => {
  const node = gltf.nodes[nodeIndex];
  const world = parentMatrix.clone().multiply(nodeMatrix(node));
  if (node.mesh !== undefined) {
    meshCount++;
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const positions = readAccessor(
        gltf,
        binary,
        primitive.attributes.POSITION
      );
      const indices =
        primitive.indices === undefined
          ? null
          : readAccessor(gltf, binary, primitive.indices);
      const count = indices?.count ?? positions.count;
      vertexCount += positions.count;
      for (let index = 0; index + 2 < count; index += 3) {
        for (let corner = 0; corner < 3; corner++) {
          const vertexIndex = indices?.get(index + corner) ?? index + corner;
          convertPosition(
            positions.get(vertexIndex, 0),
            positions.get(vertexIndex, 1),
            positions.get(vertexIndex, 2),
            world,
            tileTransform
          );
        }
      }
    }
  }
  for (const child of node.children ?? []) {
    visitNode(gltf, binary, child, world, tileTransform);
  }
};

try {
  for (const file of manifest.files) {
    tileTriangles = [];
    const raw = await readFile(join(sourceDirectory, file.filename));
    const arrayBuffer = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength
    );
    const b3dm = new B3DMLoaderBase().parse(arrayBuffer);
    const { json: gltf, binary } = parseGlb(b3dm.glbBytes);
    const tileTransform = new Matrix4().fromArray(file.transform);
    const scene = gltf.scenes?.[gltf.scene ?? 0];
    const roots = scene?.nodes ?? gltf.nodes.map((_, index) => index);
    for (const root of roots) {
      visitNode(gltf, binary, root, new Matrix4(), tileTransform);
    }
    const values = new Float32Array(tileTriangles);
    await writeAll(
      new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
    );
    triangleValueCount += values.length;
  }
} finally {
  await triangleFile.close();
}

const metadata = {
  schema: "carma.mesh-ao-triangles",
  version: 1,
  sourceManifest: "manifest.json",
  crs: "EPSG:25832 with WGS84 ellipsoidal heights",
  origin: outputOrigin.toArray(),
  layout: "triangle,corner,xyz",
  dataType: "float32 little-endian",
  triangleCount: triangleValueCount / 9,
  meshCount,
  sourceVertexCount: vertexCount,
  file: "triangles-utm32-relative.f32",
};
await writeFile(
  join(sourceDirectory, "triangles.json"),
  `${JSON.stringify(metadata, null, 2)}\n`
);
process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
