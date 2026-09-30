import { Matrix4, Vector3, Vector4 } from "three";

import type { TileCameraSnapshot } from "../tile-camera-demand";
import type { DiagnosticViewportBasis } from "./tile-diagnostic-model";
import { buildDiagnosticPrimitives } from "./tile-diagnostic-primitives";
import {
  PRIMITIVE_FLOATS,
  TILE_RECORD_FLOATS,
  type DiagnosticLegendEntry,
  type DiagnosticSnapshot,
} from "./tile-diagnostic-scene";

export type DiagnosticLabelFace = {
  transform: readonly [number, number, number, number, number, number];
  width: number;
  height: number;
  depth: number;
  record: number;
};

type Face = {
  origin: Vector4;
  u: Vector4;
  v: Vector4;
  width: number;
  height: number;
  facing: number;
  up: number;
};
type Box = {
  world: Vector3[];
  corners: Vector4[];
  faces: Face[];
  annotation: Face | null;
};

// Corner bits are X=1, Y=2, Z=4; each face has outward winding before reflection.
const FACES = [
  [0, 4, 6, 2],
  [1, 3, 7, 5],
  [0, 1, 5, 4],
  [2, 6, 7, 3],
  [0, 2, 3, 1],
  [4, 5, 7, 6],
] as const;
const identityPlane = [0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0];
const affine = (matrix: Matrix4) =>
  matrix.elements[3] === 0 &&
  matrix.elements[7] === 0 &&
  matrix.elements[11] === 0 &&
  matrix.elements[15] !== 0;
const screenPoint = (point: Vector4) =>
  new Vector3(point.x / point.w, point.y / point.w, point.z / point.w);
const planeOf = (face: Face) => [
  ...face.origin.toArray(),
  ...face.u.toArray(),
  ...face.v.toArray(),
];

/** The real box faces, source diagnostic marks and labels share one affine/projective plane. */
export const buildDiagnosticBoxScene = (
  snapshot: DiagnosticSnapshot,
  basis: DiagnosticViewportBasis,
  observerCamera?: TileCameraSnapshot
) => {
  let legend: DiagnosticLegendEntry[] = [];
  const labelFaces: DiagnosticLabelFace[] = [];
  const edgeRanges = new Map<number, { start: number; count: number }>();
  const count = snapshot.tiles.length / TILE_RECORD_FLOATS;
  const bounds = basis.rectBounds;
  if (!bounds || bounds.length < count * 6) {
    const primitives = buildDiagnosticPrimitives(snapshot, (entries) => {
      legend = entries;
    });
    const localTiles = snapshot.tiles.slice();
    for (let record = 0; record < count; record++) {
      labelFaces.push({
        record,
        transform: [
          1,
          0,
          0,
          1,
          snapshot.tiles[record * TILE_RECORD_FLOATS],
          snapshot.tiles[record * TILE_RECORD_FLOATS + 1],
        ],
        depth: 0,
        width: snapshot.tiles[record * TILE_RECORD_FLOATS + 2],
        height: snapshot.tiles[record * TILE_RECORD_FLOATS + 3],
      });
      localTiles[record * TILE_RECORD_FLOATS] = 0;
      localTiles[record * TILE_RECORD_FLOATS + 1] = 0;
    }
    return {
      primitives,
      planes: new Float32Array(
        Array.from(
          { length: primitives.length / PRIMITIVE_FLOATS },
          () => identityPlane
        ).flat()
      ),
      annotationSnapshot: { ...snapshot, tiles: localTiles },
      labelFaces,
      edgeRanges,
      legend,
      depthRange: [0, 1] as [number, number],
    };
  }
  const projection = new Matrix4().fromArray(basis.worldToOverview);
  const isAffine = affine(projection) && !basis.cameraProjection;
  const original = new Matrix4().fromArray(
    snapshot.viewportBasis?.worldToOverview ?? basis.worldToOverview
  );
  const up =
    affine(original) && !snapshot.viewportBasis?.cameraProjection
      ? new Vector3(0, 1, 0).transformDirection(original.clone().invert())
      : new Vector3(0, 1, 0);
  const observerDirection = isAffine
    ? new Vector3(0, 1, 0).transformDirection(projection.clone().invert())
    : observerCamera
    ? new Vector3().fromArray(observerCamera.matrixWorld, 8).normalize()
    : new Vector3(0, 1, 0);
  const eye = observerCamera
    ? new Vector3().fromArray(observerCamera.matrixWorld, 12)
    : null;
  const perspective = !isAffine && observerCamera?.projectionMatrix[15] === 0;
  const [scale, offsetX, offsetY, scaleY = scale] = basis.screen;
  const pixels = Math.abs(scale);
  const clipPoint = (point: Vector3) => {
    const c = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
      projection
    );
    return new Vector4(
      scale * c.x + offsetX * c.w,
      scaleY * c.z + offsetY * c.w,
      isAffine
        ? -pixels * c.y
        : c.y * (basis.cameraProjection?.reversedDepth ? -1 : 1),
      c.w
    );
  };
  const tiles = snapshot.tiles.slice();
  const boxes: Array<Box | null> = [];
  let minimumDepth = Infinity,
    maximumDepth = -Infinity;
  const localToWorld = new Matrix4();
  for (let record = 0; record < count; record++) {
    const offset = record * TILE_RECORD_FLOATS;
    const boundOffset = record * 6;
    const min = new Vector3().fromArray(bounds, boundOffset);
    const max = new Vector3().fromArray(bounds, boundOffset + 3);
    if (basis.rectTransforms)
      localToWorld.fromArray(basis.rectTransforms, record * 16);
    else localToWorld.identity();
    const valid =
      [...min.toArray(), ...max.toArray(), ...localToWorld.elements].every(
        Number.isFinite
      ) &&
      min.x <= max.x &&
      min.y <= max.y &&
      min.z <= max.z &&
      pixels > 0;
    const world = valid
      ? Array.from({ length: 8 }, (_, i) =>
          new Vector3(
            i & 1 ? max.x : min.x,
            i & 2 ? max.y : min.y,
            i & 4 ? max.z : min.z
          ).applyMatrix4(localToWorld)
        )
      : [];
    const corners = world.map(clipPoint);
    const good =
      valid &&
      corners.every((point) => point.toArray().every(Number.isFinite)) &&
      corners.some((point) => Math.abs(point.w) > 1e-9);
    if (!good) {
      boxes.push(null);
      tiles.fill(0, offset, offset + TILE_RECORD_FLOATS);
      tiles[offset] = NaN;
      tiles[offset + 1] = NaN;
      tiles[offset + 4] = -1;
      continue;
    }
    for (const corner of corners)
      if (Math.abs(corner.w) > 1e-9) {
        minimumDepth = Math.min(minimumDepth, corner.z / corner.w);
        maximumDepth = Math.max(maximumDepth, corner.z / corner.w);
      }
    const center = world
      .reduce((sum, point) => sum.add(point), new Vector3())
      .multiplyScalar(1 / 8);
    const faces: Face[] = [];
    for (const indices of FACES) {
      const a = world[indices[0]],
        b = world[indices[1]],
        d = world[indices[3]];
      const edgeU = b.clone().sub(a),
        edgeV = d.clone().sub(a);
      const width = edgeU.length() * pixels,
        height = edgeV.length() * pixels;
      if (!(width > 1e-8 && height > 1e-8)) continue;
      const normal = edgeU.clone().cross(edgeV).normalize();
      const faceCenter = indices
        .reduce((sum, i) => sum.add(world[i]), new Vector3())
        .multiplyScalar(0.25);
      if (normal.dot(faceCenter.clone().sub(center)) < 0) normal.negate();
      const direction =
        perspective && eye
          ? eye.clone().sub(faceCenter).normalize()
          : observerDirection;
      let origin = corners[indices[0]].clone();
      let u = corners[indices[1]].clone().sub(origin).divideScalar(width);
      let v = corners[indices[3]].clone().sub(origin).divideScalar(height);
      let w = width,
        h = height;
      const aScreen = screenPoint(origin);
      const uScreen = screenPoint(
        origin.clone().add(u.clone().multiplyScalar(w))
      )
        .sub(aScreen)
        .divideScalar(w);
      const vScreen = screenPoint(
        origin.clone().add(v.clone().multiplyScalar(h))
      )
        .sub(aScreen)
        .divideScalar(h);
      if (Math.abs(vScreen.x) > Math.abs(uScreen.x)) {
        [u, v] = [v, u];
        [w, h] = [h, w];
      }
      const uEnd = screenPoint(origin.clone().add(u.clone().multiplyScalar(w)));
      if (uEnd.x < screenPoint(origin).x) {
        origin.add(u.clone().multiplyScalar(w));
        u.negate();
      }
      const vEnd = screenPoint(origin.clone().add(v.clone().multiplyScalar(h)));
      if (vEnd.y < screenPoint(origin).y) {
        origin.add(v.clone().multiplyScalar(h));
        v.negate();
      }
      faces.push({
        origin,
        u,
        v,
        width: w,
        height: h,
        facing: normal.dot(direction),
        up: normal.dot(up),
      });
    }
    if (!faces.length) {
      boxes.push(null);
      tiles.fill(0, offset, offset + TILE_RECORD_FLOATS);
      tiles[offset] = NaN;
      tiles[offset + 1] = NaN;
      tiles[offset + 4] = -1;
      continue;
    }
    const candidates = faces.filter((face) => {
      const points = [
        face.origin,
        face.origin.clone().add(face.u.clone().multiplyScalar(face.width)),
        face.origin.clone().add(face.v.clone().multiplyScalar(face.height)),
        face.origin
          .clone()
          .add(face.u.clone().multiplyScalar(face.width))
          .add(face.v.clone().multiplyScalar(face.height)),
      ];
      const projected = points.map(screenPoint);
      const [a, b, d] = projected;
      return (
        face.facing > 1e-8 &&
        (isAffine || points.every((point) => point.w > 1e-9)) &&
        projected.every((point) => point.toArray().every(Number.isFinite)) &&
        Math.abs((b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x)) > 1e-8
      );
    });
    const best = candidates.reduce<Face | null>(
      (chosen, face) =>
        !chosen || face.facing > chosen.facing ? face : chosen,
      null
    );
    const top = candidates.reduce<Face | null>(
      (chosen, face) => (!chosen || face.up > chosen.up ? face : chosen),
      null
    );
    const annotation =
      top && best && top.up > 0 && top.facing >= best.facing - 0.05
        ? top
        : best;
    boxes.push({ world, corners, faces, annotation });
    tiles[offset] = 0;
    tiles[offset + 1] = 0;
    tiles[offset + 2] = annotation?.width ?? faces[0]?.width ?? 0;
    tiles[offset + 3] = annotation?.height ?? faces[0]?.height ?? 0;
    if (annotation) {
      const a = screenPoint(annotation.origin);
      const b = screenPoint(
        annotation.origin
          .clone()
          .add(annotation.u.clone().multiplyScalar(annotation.width))
      );
      const d = screenPoint(
        annotation.origin
          .clone()
          .add(annotation.v.clone().multiplyScalar(annotation.height))
      );
      labelFaces.push({
        record,
        width: annotation.width,
        height: annotation.height,
        depth: screenPoint(
          annotation.origin
            .clone()
            .add(annotation.u.clone().multiplyScalar(annotation.width / 2))
            .add(annotation.v.clone().multiplyScalar(annotation.height / 2))
        ).z,
        transform: [
          (b.x - a.x) / annotation.width,
          (b.y - a.y) / annotation.width,
          (d.x - a.x) / annotation.height,
          (d.y - a.y) / annotation.height,
          a.x,
          a.y,
        ],
      });
    }
  }
  const annotationSnapshot = { ...snapshot, tiles, extent: null };
  const ownership: number[] = [];
  const source = buildDiagnosticPrimitives(
    annotationSnapshot,
    (entries) => {
      legend = entries;
    },
    (_, record) => {
      ownership.push(record);
    }
  );
  const primitives: number[] = [],
    planes: number[] = [];
  const emittedBoxes = new Set<number>();
  const emit = (primitive: readonly number[], plane: readonly number[]) => {
    primitives.push(...primitive);
    planes.push(...plane);
  };
  for (
    let offset = 0, index = 0;
    offset < source.length;
    offset += PRIMITIVE_FLOATS, index++
  ) {
    const record = ownership[index],
      box = boxes[record];
    if (!box) continue;
    const primitive = Array.from(
      source.subarray(offset, offset + PRIMITIVE_FLOATS)
    );
    if (!emittedBoxes.has(record)) {
      emittedBoxes.add(record);
      for (const face of box.faces) {
        const filled = [...primitive];
        filled.splice(
          0,
          6,
          face.width / 2,
          face.height / 2,
          face.width / 2,
          face.height / 2,
          0,
          0
        );
        filled[15] = 1 - Math.sqrt(1 - Math.max(0, Math.min(1, filled[15])));
        emit(filled, planeOf(face));
      }
      const edgeStart = primitives.length / PRIMITIVE_FLOATS;
      for (let corner = 0; corner < 8; corner++)
        for (const bit of [1, 2, 4]) {
          if (corner & bit) continue;
          const a = box.corners[corner],
            b = box.corners[corner | bit];
          const first = screenPoint(a),
            last = screenPoint(b);
          const length =
            box.world[corner].distanceTo(box.world[corner | bit]) * pixels;
          const screenLength = Math.hypot(last.x - first.x, last.y - first.y);
          const projectedEdge =
            Number.isFinite(screenLength) && screenLength > 1e-8;
          if (!(length > 1e-8)) continue;
          const edge = [...primitive];
          edge.splice(0, 8, 0, 0, length, 0, 3, primitive[5], 0, 0);
          edge.fill(0, 12, 16);
          emit(edge, [
            ...a.toArray(),
            ...b.clone().sub(a).divideScalar(length).toArray(),
            projectedEdge ? (-(last.y - first.y) / screenLength) * a.w : a.w,
            projectedEdge ? ((last.x - first.x) / screenLength) * a.w : 0,
            0,
            0,
          ]);
        }
      edgeRanges.set(record, {
        start: edgeStart,
        count: primitives.length / PRIMITIVE_FLOATS - edgeStart,
      });
    } else if (box.annotation) emit(primitive, planeOf(box.annotation));
  }
  const depthRange: [number, number] = !isAffine
    ? [-1, 1]
    : Number.isFinite(minimumDepth + maximumDepth)
    ? [minimumDepth, Math.max(maximumDepth, minimumDepth + 1e-6)]
    : [0, 1];
  return {
    primitives: new Float32Array(primitives),
    planes: new Float32Array(planes),
    annotationSnapshot,
    labelFaces,
    edgeRanges,
    legend,
    depthRange,
  };
};
