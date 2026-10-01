import {
  BufferAttribute,
  Mesh,
  Matrix4,
  type BufferGeometry,
  type Scene,
} from "three";

import {
  compensateMeshNormalsForScale,
  quantizeMeshPositions,
  type MeshPositionBits,
} from "../../../../../../libraries/mapping/engines/three/primitives/src/lib/common/quantize-mesh-positions";

const geometryBytes = (geometry: BufferGeometry) =>
  Object.values(geometry.attributes).reduce(
    (sum, attribute) => sum + attribute.array.byteLength,
    geometry.index?.array.byteLength ?? 0
  );

/** Borrow the real manager's ECEF cut; independently own only encoded geometry. */
export function createTerrainEncodingPresentation(
  source: Scene,
  panels: readonly Scene[]
) {
  const records = new Map<
    Mesh,
    {
      reference: Mesh;
      encoded: Mesh;
      sourceGeometry: BufferGeometry;
      positionVersion: number;
      normalVersion: number;
      indexVersion: number;
      bits: MeshPositionBits;
      decode: Matrix4;
      maximumError: number;
      errorBound: number;
    }
  >();
  const remove = (mesh: Mesh) => {
    const record = records.get(mesh)!;
    record.reference.removeFromParent();
    record.encoded.removeFromParent();
    record.encoded.geometry.dispose();
    records.delete(mesh);
  };
  return {
    update(bits: MeshPositionBits) {
      source.updateMatrixWorld(true);
      const visible = new Set<Mesh>();
      let referenceBytes = 0,
        encodedBytes = 0,
        maximumError = 0,
        errorBound = 0;
      source.traverseVisible((object) => {
        if (!(object instanceof Mesh)) return;
        visible.add(object);
        const positions = object.geometry.getAttribute("position");
        const normals = object.geometry.getAttribute("normal");
        if (
          !(positions instanceof BufferAttribute) ||
          !(normals instanceof BufferAttribute)
        )
          throw new TypeError(
            "Terrain encoding requires standalone position and normal buffers"
          );
        let record = records.get(object);
        const changed =
          !record ||
          record.sourceGeometry !== object.geometry ||
          record.positionVersion !== positions.version ||
          record.normalVersion !== normals.version ||
          record.indexVersion !== (object.geometry.index?.version ?? 0) ||
          record.bits !== bits;
        if (changed) {
          if (record) remove(object);
          const quantized = quantizeMeshPositions(positions.array, bits);
          const geometry = object.geometry.clone();
          geometry.setAttribute(
            "position",
            new BufferAttribute(quantized.values, 3, true)
          );
          geometry.setAttribute(
            "normal",
            new BufferAttribute(
              compensateMeshNormalsForScale(
                normals.array,
                quantized.decodeScale
              ),
              3
            )
          );
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          const reference = object.clone(false),
            encoded = object.clone(false);
          encoded.geometry = geometry;
          reference.matrixAutoUpdate = encoded.matrixAutoUpdate = false;
          const decode = new Matrix4()
            .makeScale(...quantized.decodeScale)
            .setPosition(...quantized.offset);
          panels[0].add(reference);
          panels[1].add(encoded);
          record = {
            reference,
            encoded,
            decode,
            bits,
            sourceGeometry: object.geometry,
            positionVersion: positions.version,
            normalVersion: normals.version,
            indexVersion: object.geometry.index?.version ?? 0,
            maximumError: quantized.maximumError,
            errorBound: quantized.errorBound,
          };
          records.set(object, record);
        }
        const current = record!;
        current.reference.matrix.copy(object.matrixWorld);
        current.encoded.matrix
          .copy(object.matrixWorld)
          .multiply(current.decode);
        current.reference.matrixWorldNeedsUpdate = true;
        current.encoded.matrixWorldNeedsUpdate = true;
        current.reference.material = current.encoded.material = object.material;
        current.reference.castShadow = current.encoded.castShadow =
          object.castShadow;
        current.reference.receiveShadow = current.encoded.receiveShadow =
          object.receiveShadow;
        referenceBytes += geometryBytes(current.reference.geometry);
        encodedBytes += geometryBytes(current.encoded.geometry);
        const scale = object.matrixWorld.getMaxScaleOnAxis();
        maximumError = Math.max(maximumError, current.maximumError * scale);
        errorBound = Math.max(errorBound, current.errorBound * scale);
      });
      for (const mesh of records.keys()) if (!visible.has(mesh)) remove(mesh);
      return { referenceBytes, encodedBytes, maximumError, errorBound };
    },
    dispose() {
      for (const mesh of records.keys()) remove(mesh);
    },
  };
}
