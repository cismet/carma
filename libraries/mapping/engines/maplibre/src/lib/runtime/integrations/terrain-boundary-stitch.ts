import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { clamp } from "@carma-commons/math";
import { computeMeshVertexNormals } from "@carma-mapping/engines/three/primitives/core";
import { terrainTileKey, type TerrainTileId } from "./raster-dem-tile";
import {
  refineTerrainBoundaryTriangles,
  type TerrainEdgeSubdivision,
} from "./terrain-boundary-refinement";

type TerrainBoundarySide = "west" | "south" | "east" | "north";

type TerrainBoundaryEdges = Record<TerrainBoundarySide, Uint32Array>;

type TerrainBoundaryVertex = {
  accumulator: TerrainBoundaryNormalAccumulator;
  parameter: number;
  height: number;
  normal: Vector3;
};

type TerrainBoundaryNormalAccumulator = {
  record: StitchTerrainRecord;
  index: number;
  normalSum: Vector3;
  contributorCount: number;
};

type TerrainBoundaryEdge = {
  side: TerrainBoundarySide;
  level: number;
  vertices: TerrainBoundaryVertex[];
  minimum: number;
  maximum: number;
};

type StitchTerrainRecord = {
  id: TerrainTileId;
  reliefMesh: { geometry: BufferGeometry } | null;
  boundaryEdges: TerrainBoundaryEdges;
  boundaryBaseHeights: Record<TerrainBoundarySide, Float32Array>;
};

const TERRAIN_BOUNDARY_KEY_PRECISION = 1_000;
const TERRAIN_BOUNDARY_OVERLAP_EPSILON = 1e-3;

const oppositeTerrainBoundarySide = (
  side: TerrainBoundarySide
): TerrainBoundarySide => {
  switch (side) {
    case "west":
      return "east";
    case "east":
      return "west";
    case "south":
      return "north";
    case "north":
      return "south";
  }
};

const terrainBoundaryAxis = (side: TerrainBoundarySide) =>
  side === "west" || side === "east" ? "x" : "z";

const findTerrainBoundaryInterpolationSpan = (
  edge: TerrainBoundaryEdge,
  parameter: number
): readonly [TerrainBoundaryVertex, TerrainBoundaryVertex] | null => {
  const { vertices } = edge;
  if (vertices.length === 0) return null;
  if (
    parameter < edge.minimum - TERRAIN_BOUNDARY_OVERLAP_EPSILON ||
    parameter > edge.maximum + TERRAIN_BOUNDARY_OVERLAP_EPSILON
  ) {
    return null;
  }
  if (vertices.length === 1) return [vertices[0], vertices[0]];

  let lower = 1;
  let upper = vertices.length - 1;
  while (lower < upper) {
    const middle = (lower + upper) >> 1;
    if (
      vertices[middle].parameter <
      parameter - TERRAIN_BOUNDARY_OVERLAP_EPSILON
    ) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  return [vertices[lower - 1], vertices[lower]];
};

const interpolateTerrainBoundaryNormal = (
  edge: TerrainBoundaryEdge,
  parameter: number
): Vector3 | null => {
  const interpolationSpan = findTerrainBoundaryInterpolationSpan(
    edge,
    parameter
  );
  if (!interpolationSpan) return null;
  const [before, after] = interpolationSpan;
  const span = after.parameter - before.parameter;
  if (Math.abs(span) <= TERRAIN_BOUNDARY_OVERLAP_EPSILON) {
    return before.normal.clone();
  }
  return before.normal
    .clone()
    .lerp(after.normal, clamp((parameter - before.parameter) / span, 0, 1))
    .normalize();
};

const interpolateTerrainBoundaryHeight = (
  edge: TerrainBoundaryEdge,
  parameter: number
): number | null => {
  const interpolationSpan = findTerrainBoundaryInterpolationSpan(
    edge,
    parameter
  );
  if (!interpolationSpan) return null;
  const [before, after] = interpolationSpan;
  const span = after.parameter - before.parameter;
  if (Math.abs(span) <= TERRAIN_BOUNDARY_OVERLAP_EPSILON) {
    return before.height;
  }
  return (
    before.height +
    (after.height - before.height) *
      clamp((parameter - before.parameter) / span, 0, 1)
  );
};

export type TerrainStitchInput = {
  key: string;
  id: TerrainTileId;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
  boundaryEdges: TerrainBoundaryEdges;
  boundaryBaseHeights: Record<TerrainBoundarySide, Float32Array>;
};

export type TerrainBoundaryStitchOptions = {
  outputKeys?: string[];
  captureBoundaryState?: boolean;
  prepareShellKeys?: string[];
  probeOnly?: boolean;
};

export const stitchTerrainBoundaries = (
  inputs: TerrainStitchInput[],
  options: TerrainBoundaryStitchOptions = {}
) => {
  const meshes = new Map<string, StitchTerrainRecord>(
    inputs.map((input) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(input.positions, 3)
      );
      geometry.setAttribute("normal", new BufferAttribute(input.normals, 3));
      geometry.setIndex(new BufferAttribute(input.indices, 1));
      return [
        input.key,
        {
          id: input.id,
          reliefMesh: { geometry },
          boundaryEdges: input.boundaryEdges,
          boundaryBaseHeights: input.boundaryBaseHeights,
        },
      ];
    })
  );
  const activeKeys = new Set(meshes.keys());
  const boundaries = new Map<string, TerrainBoundaryEdge[]>();
  const normalAccumulators = new Map<
    string,
    TerrainBoundaryNormalAccumulator
  >();
  for (const [key, record] of meshes) {
    if (!activeKeys.has(key)) continue;
    const { reliefMesh } = record;
    if (!reliefMesh) continue;
    const position = reliefMesh.geometry.getAttribute("position");
    for (const side of ["west", "south", "east", "north"] as const) {
      const indices = record.boundaryEdges[side];
      const baseHeights = record.boundaryBaseHeights[side];
      for (let offset = 0; offset < indices.length; offset += 1) {
        position.setY(indices[offset], baseHeights[offset]);
      }
    }
    position.needsUpdate = true;
    const normal = reliefMesh.geometry.getAttribute("normal");
    for (const side of ["west", "south", "east", "north"] as const) {
      const indices = record.boundaryEdges[side];
      const axis = terrainBoundaryAxis(side);
      const edgeVertices: TerrainBoundaryVertex[] = [];
      for (const index of indices) {
        const vertexNormal = new Vector3(
          normal.getX(index),
          normal.getY(index),
          normal.getZ(index)
        );
        if (vertexNormal.lengthSq() <= Number.EPSILON) continue;
        const vertexKey = `${key}/${index}`;
        const accumulator =
          normalAccumulators.get(vertexKey) ??
          ({
            record,
            index,
            normalSum: vertexNormal.clone(),
            contributorCount: 0,
          } satisfies TerrainBoundaryNormalAccumulator);
        normalAccumulators.set(vertexKey, accumulator);
        edgeVertices.push({
          accumulator,
          parameter: axis === "x" ? position.getZ(index) : position.getX(index),
          height: position.getY(index),
          normal: vertexNormal,
        });
      }
      edgeVertices.sort((left, right) => left.parameter - right.parameter);
      if (edgeVertices.length === 0) continue;
      const lineCoordinate =
        axis === "x"
          ? position.getX(edgeVertices[0].accumulator.index)
          : position.getZ(edgeVertices[0].accumulator.index);
      const lineKey = `${axis}/${Math.round(
        lineCoordinate * TERRAIN_BOUNDARY_KEY_PRECISION
      )}`;
      const edge: TerrainBoundaryEdge = {
        side,
        level: record.id.level,
        vertices: edgeVertices,
        minimum: edgeVertices[0].parameter,
        maximum: edgeVertices[edgeVertices.length - 1].parameter,
      };
      const lineEdges = boundaries.get(lineKey) ?? [];
      lineEdges.push(edge);
      boundaries.set(lineKey, lineEdges);
    }
  }

  const heightTargets = new Map<
    string,
    {
      record: StitchTerrainRecord;
      index: number;
      sum: number;
      count: number;
      referenceLevel: number;
    }
  >();
  const addHeightTarget = (
    vertex: TerrainBoundaryVertex,
    height: number,
    referenceLevel = vertex.accumulator.record.id.level
  ) => {
    const { record, index } = vertex.accumulator;
    const key = `${terrainTileKey(record.id)}/${index}`;
    const target = heightTargets.get(key) ?? {
      record,
      index,
      sum: 0,
      count: 0,
      referenceLevel,
    };
    if (referenceLevel > target.referenceLevel) return;
    if (referenceLevel < target.referenceLevel) {
      target.sum = 0;
      target.count = 0;
      target.referenceLevel = referenceLevel;
    }
    target.sum += height;
    target.count += 1;
    heightTargets.set(key, target);
  };

  for (const edges of boundaries.values()) {
    for (let leftIndex = 0; leftIndex < edges.length; leftIndex += 1) {
      const left = edges[leftIndex];
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < edges.length;
        rightIndex += 1
      ) {
        const right = edges[rightIndex];
        if (oppositeTerrainBoundarySide(left.side) !== right.side) {
          continue;
        }
        if (left.level === right.level) {
          for (const vertex of left.vertices) {
            const neighborHeight = interpolateTerrainBoundaryHeight(
              right,
              vertex.parameter
            );
            if (neighborHeight !== null) {
              addHeightTarget(vertex, (vertex.height + neighborHeight) / 2);
            }
          }
          for (const vertex of right.vertices) {
            const neighborHeight = interpolateTerrainBoundaryHeight(
              left,
              vertex.parameter
            );
            if (neighborHeight !== null) {
              addHeightTarget(vertex, (vertex.height + neighborHeight) / 2);
            }
          }
        }
      }
    }
  }

  for (const target of heightTargets.values()) {
    const geometry = target.record.reliefMesh!.geometry;
    geometry
      .getAttribute("position")
      .setY(target.index, target.sum / target.count);
  }

  // Pairwise averaging alone gives different results at a 3/4-tile corner.
  // Reconcile coincident boundary vertices once, with coarser references
  // taking precedence at mixed-LOD junctions.
  const junctions = new Map<
    string,
    {
      members: TerrainBoundaryNormalAccumulator[];
      level: number;
      sum: number;
      count: number;
    }
  >();
  for (const accumulator of normalAccumulators.values()) {
    const { record, index } = accumulator;
    const position = record.reliefMesh!.geometry.getAttribute("position");
    const key = `${Math.round(
      position.getX(index) * TERRAIN_BOUNDARY_KEY_PRECISION
    )}/${Math.round(position.getZ(index) * TERRAIN_BOUNDARY_KEY_PRECISION)}`;
    const level = record.id.level;
    const junction = junctions.get(key) ?? {
      members: [],
      level,
      sum: 0,
      count: 0,
    };
    junction.members.push(accumulator);
    if (level < junction.level) {
      junction.level = level;
      junction.sum = 0;
      junction.count = 0;
    }
    if (level === junction.level) {
      junction.sum += position.getY(index);
      junction.count += 1;
    }
    junctions.set(key, junction);
  }
  for (const junction of junctions.values()) {
    if (junction.members.length < 2) continue;
    for (const { record, index } of junction.members) {
      record
        .reliefMesh!.geometry.getAttribute("position")
        .setY(index, junction.sum / junction.count);
    }
  }

  // Coarse corners can themselves have changed during same-level stitching.
  // Reproject in ascending LOD order onto those FINAL edges, not their original
  // heights. Otherwise a fine edge follows a different line between corners.
  const levels = [...new Set(inputs.map((input) => input.id.level))].sort(
    (a, b) => a - b
  );
  for (const level of levels.slice(1)) {
    heightTargets.clear();
    for (const edges of boundaries.values()) {
      for (const edge of edges) {
        for (const vertex of edge.vertices)
          vertex.height = vertex.accumulator.record
            .reliefMesh!.geometry.getAttribute("position")
            .getY(vertex.accumulator.index);
      }
      for (const fine of edges) {
        if (fine.level !== level) continue;
        for (const coarse of edges) {
          if (
            coarse.level >= level ||
            oppositeTerrainBoundarySide(fine.side) !== coarse.side
          )
            continue;
          for (const vertex of fine.vertices) {
            const height = interpolateTerrainBoundaryHeight(
              coarse,
              vertex.parameter
            );
            if (height !== null) addHeightTarget(vertex, height, coarse.level);
          }
        }
      }
    }
    for (const target of heightTargets.values()) {
      target.record
        .reliefMesh!.geometry.getAttribute("position")
        .setY(target.index, target.sum / target.count);
    }
    for (const junction of junctions.values()) {
      const present = junction.members.filter(
        (member) => member.record.id.level <= level
      );
      if (!present.length) continue;
      const coarsest = Math.min(
        ...present.map((member) => member.record.id.level)
      );
      let winners = present.filter(
        (member) => member.record.id.level === coarsest
      );
      if (coarsest === level) {
        const reference = (member: TerrainBoundaryNormalAccumulator) =>
          heightTargets.get(
            `${terrainTileKey(member.record.id)}/${member.index}`
          )?.referenceLevel ?? Number.POSITIVE_INFINITY;
        const best = Math.min(...winners.map(reference));
        winners = winners.filter((member) => reference(member) === best);
      }
      const height =
        winners.reduce(
          (sum, member) =>
            sum +
            member.record
              .reliefMesh!.geometry.getAttribute("position")
              .getY(member.index),
          0
        ) / winners.length;
      for (const member of present) {
        if (member.record.id.level === level)
          member.record
            .reliefMesh!.geometry.getAttribute("position")
            .setY(member.index, height);
      }
    }
  }
  // The probe retains pre-normal heights too: later coarse-edge projection can
  // hide a height change that already affected adjacent interior normals.
  const boundaryStates = options.captureBoundaryState
    ? new Map(
        [...meshes].map(([key, record]) => {
          const indices = [
            ...new Set(
              Object.values(record.boundaryEdges).flatMap((edge) => [...edge])
            ),
          ].sort((a, b) => a - b);
          const position = record.reliefMesh!.geometry.getAttribute("position");
          return [
            key,
            { indices, values: indices.map((index) => position.getY(index)) },
          ];
        })
      )
    : null;
  // One normals pass after all height changes, on the worker, rather than
  // scanning every triangle both before and after pairwise stitching.
  for (const record of meshes.values()) {
    const geometry = record.reliefMesh!.geometry;
    geometry.getAttribute("position").needsUpdate = true;
    computeMeshVertexNormals(geometry);
  }
  for (const accumulator of normalAccumulators.values()) {
    const normal =
      accumulator.record.reliefMesh!.geometry.getAttribute("normal");
    accumulator.normalSum.set(
      normal.getX(accumulator.index),
      normal.getY(accumulator.index),
      normal.getZ(accumulator.index)
    );
    accumulator.contributorCount = 0;
  }
  for (const edges of boundaries.values()) {
    for (const edge of edges) {
      for (const vertex of edge.vertices) {
        const { record, index } = vertex.accumulator;
        const normal = record.reliefMesh!.geometry.getAttribute("normal");
        vertex.normal.set(
          normal.getX(index),
          normal.getY(index),
          normal.getZ(index)
        );
      }
    }
  }

  for (const edges of boundaries.values()) {
    for (let leftIndex = 0; leftIndex < edges.length; leftIndex += 1) {
      const left = edges[leftIndex];
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < edges.length;
        rightIndex += 1
      ) {
        const right = edges[rightIndex];
        if (oppositeTerrainBoundarySide(left.side) !== right.side) continue;
        const overlapMinimum = Math.max(left.minimum, right.minimum);
        const overlapMaximum = Math.min(left.maximum, right.maximum);
        if (
          overlapMaximum - overlapMinimum <=
          TERRAIN_BOUNDARY_OVERLAP_EPSILON
        ) {
          continue;
        }
        for (const vertex of left.vertices) {
          const neighborNormal = interpolateTerrainBoundaryNormal(
            right,
            vertex.parameter
          );
          if (!neighborNormal) continue;
          vertex.accumulator.normalSum.add(neighborNormal);
          vertex.accumulator.contributorCount += 1;
        }
        for (const vertex of right.vertices) {
          const neighborNormal = interpolateTerrainBoundaryNormal(
            left,
            vertex.parameter
          );
          if (!neighborNormal) continue;
          vertex.accumulator.normalSum.add(neighborNormal);
          vertex.accumulator.contributorCount += 1;
        }
      }
    }
  }

  const updatedAttributes = new Set<
    ReturnType<BufferGeometry["getAttribute"]>
  >();
  for (const accumulator of normalAccumulators.values()) {
    if (
      accumulator.contributorCount === 0 ||
      accumulator.normalSum.lengthSq() === 0
    ) {
      continue;
    }
    accumulator.normalSum.normalize();
    const attribute =
      accumulator.record.reliefMesh!.geometry.getAttribute("normal");
    attribute.setXYZ(
      accumulator.index,
      accumulator.normalSum.x,
      accumulator.normalSum.y,
      accumulator.normalSum.z
    );
    updatedAttributes.add(attribute);
  }
  for (const attribute of updatedAttributes) attribute.needsUpdate = true;

  // A four-tile corner must include the diagonal neighbor too. Pairwise edge
  // averaging visits only three of those four normals from each tile.
  for (const { members, level } of junctions.values()) {
    if (members.length < 2) continue;
    const sum = new Vector3();
    for (const { record, index } of members) {
      if (record.id.level !== level) continue;
      sum.add(
        new Vector3().fromBufferAttribute(
          record.reliefMesh!.geometry.getAttribute("normal"),
          index
        )
      );
    }
    if (sum.lengthSq() === 0) continue;
    sum.normalize();
    for (const { record, index } of members) {
      record
        .reliefMesh!.geometry.getAttribute("normal")
        .setXYZ(index, sum.x, sum.y, sum.z);
    }
  }

  // Share the actual piecewise-linear edge, not merely similar heights. The
  // coarse side also gets the fine side's breakpoints, eliminating T-junctions.
  // Transport the UNNORMALIZED interpolated normal: normalizing each inserted
  // vertex would change the field between vertices and reintroduce a light seam.
  const subdivisions = new Map<
    StitchTerrainRecord,
    Map<string, TerrainEdgeSubdivision>
  >();
  for (const edges of boundaries.values()) {
    for (const coarse of [...edges].sort((a, b) => a.level - b.level)) {
      const record = coarse.vertices[0]?.accumulator.record;
      if (!record) continue;
      const geometry = record.reliefMesh!.geometry;
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      for (const fine of edges) {
        if (
          fine.level <= coarse.level ||
          fine.side !== oppositeTerrainBoundarySide(coarse.side)
        )
          continue;
        for (const vertex of fine.vertices) {
          const span = findTerrainBoundaryInterpolationSpan(
            coarse,
            vertex.parameter
          );
          if (!span) continue;
          const [before, after] = span;
          const a = before.accumulator.index;
          const b = after.accumulator.index;
          const distance = after.parameter - before.parameter;
          const t =
            distance > 0
              ? clamp((vertex.parameter - before.parameter) / distance, 0, 1)
              : 0;
          const fineGeometry = vertex.accumulator.record.reliefMesh!.geometry;
          const finePosition = fineGeometry.getAttribute("position");
          const fineNormal = fineGeometry.getAttribute("normal");
          const i = vertex.accumulator.index;
          const p = new Vector3()
            .fromBufferAttribute(position, a)
            .lerp(new Vector3().fromBufferAttribute(position, b), t);
          const n = new Vector3()
            .fromBufferAttribute(normal, a)
            .lerp(new Vector3().fromBufferAttribute(normal, b), t);
          finePosition.setXYZ(i, p.x, p.y, p.z);
          fineNormal.setXYZ(i, n.x, n.y, n.z);
          if (t <= 1e-6 || t >= 1 - 1e-6) continue;
          const recordSplits =
            subdivisions.get(record) ??
            new Map<string, TerrainEdgeSubdivision>();
          subdivisions.set(record, recordSplits);
          const key = `${a}/${b}`;
          const split = recordSplits.get(key) ?? { a, b, vertices: [] };
          recordSplits.set(key, split);
          // Read back Float32 so the opposite triangles use bit-identical ends.
          const point = new Vector3()
            .fromBufferAttribute(finePosition, i)
            .toArray();
          if (
            !split.vertices.some(
              (v) => v.position[0] === point[0] && v.position[2] === point[2]
            )
          ) {
            split.vertices.push({
              position: point,
              normal: new Vector3()
                .fromBufferAttribute(fineNormal, i)
                .toArray(),
            });
          }
        }
      }
    }
  }
  for (const [record, splits] of subdivisions) {
    const geometry = record.reliefMesh!.geometry;
    const positions = geometry.getAttribute("position");
    for (const { a, b, vertices } of splits.values()) {
      const axis =
        Math.abs(positions.getX(b) - positions.getX(a)) >
        Math.abs(positions.getZ(b) - positions.getZ(a))
          ? 0
          : 2;
      vertices.sort(
        (left, right) => left.position[axis] - right.position[axis]
      );
    }
    refineTerrainBoundaryTriangles(geometry, [...splits.values()]);
  }

  const outputKeys = options.outputKeys && new Set(options.outputKeys);
  return [...meshes].flatMap(([key, record]) => {
    const geometry = record.reliefMesh!.geometry;
    if (outputKeys && !outputKeys.has(key)) {
      geometry.dispose();
      return [];
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const captured = boundaryStates?.get(key);
    if (captured) {
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      for (const index of captured.indices) {
        captured.values.push(
          position.getX(index),
          position.getY(index),
          position.getZ(index),
          normal.getX(index),
          normal.getY(index),
          normal.getZ(index)
        );
      }
      // Boundary ordinals, unlike geometry indices, agree for full and compact
      // meshes. Split order and values fully determine refinement topology.
      const ordinals = new Map(
        captured.indices.map((index, offset) => [index, offset])
      );
      const splits = subdivisions.get(record);
      captured.values.push(splits?.size ?? 0);
      for (const split of splits?.values() ?? []) {
        captured.values.push(
          ordinals.get(split.a)!,
          ordinals.get(split.b)!,
          split.vertices.length
        );
        for (const vertex of split.vertices)
          captured.values.push(...vertex.position, ...vertex.normal);
      }
    }
    const result = {
      key,
      positions: geometry.getAttribute("position").array as Float32Array,
      normals: geometry.getAttribute("normal").array as Float32Array,
      indices: geometry.index!.array as Uint16Array | Uint32Array,
      box: {
        min: geometry.boundingBox!.min.toArray(),
        max: geometry.boundingBox!.max.toArray(),
      },
      sphere: {
        center: geometry.boundingSphere!.center.toArray(),
        radius: geometry.boundingSphere!.radius,
      },
      ...(captured ? { boundaryState: new Float32Array(captured.values) } : {}),
    };
    geometry.dispose();
    return [result];
  });
};

type TerrainStitchUpdate = ReturnType<typeof stitchTerrainBoundaries>[number];
type TerrainBoundaryStitchEntry = {
  base: TerrainStitchInput;
  shell: TerrainStitchInput;
  boundaryState: Float32Array;
};
export type TerrainBoundaryStitchState = ReadonlyMap<
  string,
  TerrainBoundaryStitchEntry
>;

const sameStitchBase = (a: TerrainStitchInput, b: TerrainStitchInput) =>
  a.id.level === b.id.level &&
  a.id.x === b.id.x &&
  a.id.y === b.id.y &&
  a.positions === b.positions &&
  a.normals === b.normals &&
  a.indices === b.indices &&
  a.boundaryEdges === b.boundaryEdges &&
  a.boundaryBaseHeights === b.boundaryBaseHeights;

const sameStitchArray = (
  a: Float32Array | Uint16Array | Uint32Array | undefined,
  b: Float32Array | Uint16Array | Uint32Array | undefined
) =>
  !!a &&
  !!b &&
  a.constructor === b.constructor &&
  a.length === b.length &&
  a.every((value, index) => Object.is(value, b[index]));

// All faces incident to a boundary vertex are retained in their original order.
// Consequently its normal accumulates exactly the same Float32 contributions
// as the full mesh. Interior shell normals are not used as neighbor references.
const createTerrainBoundaryShell = (
  input: TerrainStitchInput
): TerrainStitchInput => {
  const boundary = new Uint8Array(input.positions.length / 3);
  for (const edge of Object.values(input.boundaryEdges)) {
    for (const index of edge) boundary[index] = 1;
  }
  const vertices = boundary.slice();
  const triangles: number[] = [];
  for (let offset = 0; offset < input.indices.length; offset += 3) {
    const a = input.indices[offset];
    const b = input.indices[offset + 1];
    const c = input.indices[offset + 2];
    if (!boundary[a] && !boundary[b] && !boundary[c]) continue;
    triangles.push(a, b, c);
    vertices[a] = vertices[b] = vertices[c] = 1;
  }
  const sourceIndices: number[] = [];
  const remap = new Uint32Array(vertices.length);
  for (let index = 0; index < vertices.length; index++) {
    if (!vertices[index]) continue;
    remap[index] = sourceIndices.length;
    sourceIndices.push(index);
  }
  const positions = new Float32Array(sourceIndices.length * 3);
  const normals = new Float32Array(positions.length);
  sourceIndices.forEach((index, offset) => {
    positions.set(
      input.positions.subarray(index * 3, index * 3 + 3),
      offset * 3
    );
    normals.set(input.normals.subarray(index * 3, index * 3 + 3), offset * 3);
  });
  const indices =
    input.indices instanceof Uint16Array
      ? new Uint16Array(triangles.length)
      : new Uint32Array(triangles.length);
  triangles.forEach((index, offset) => {
    indices[offset] = remap[index];
  });
  const remapEdge = (side: TerrainBoundarySide) =>
    input.boundaryEdges[side].map((index) => remap[index]);
  return {
    ...input,
    positions,
    normals,
    indices,
    boundaryEdges: {
      west: remapEdge("west"),
      south: remapEdge("south"),
      east: remapEdge("east"),
      north: remapEdge("north"),
    },
  };
};

/** Worker-side shell extraction: never scan a new full mesh on the render thread. */
export const executeTerrainBoundaryStitch = (
  inputs: TerrainStitchInput[],
  options: TerrainBoundaryStitchOptions = {}
) => {
  const prepare = new Set(options.prepareShellKeys);
  const shells = inputs
    .filter((input) => prepare.has(input.key))
    .map(createTerrainBoundaryShell);
  const byKey = new Map(shells.map((shell) => [shell.key, shell]));
  const workInputs = options.probeOnly
    ? inputs.map((input) => {
        const shell = byKey.get(input.key);
        // Return pristine shells for reuse; only the worker's scratch copy mutates.
        return shell
          ? {
              ...shell,
              positions: shell.positions.slice(),
              normals: shell.normals.slice(),
              indices: shell.indices.slice(),
            }
          : input;
      })
    : inputs;
  return {
    updates: stitchTerrainBoundaries(workInputs, options),
    ...(shells.length > 0 ? { shells } : {}),
  };
};

/** Prepare from immutable bases; publish `state` only after the result is accepted. */
export const prepareTerrainBoundaryStitch = (
  inputs: TerrainStitchInput[],
  previous: TerrainBoundaryStitchState = new Map()
) => {
  const prepareShellKeys: string[] = [];
  const probeInputs = inputs.map((input) => {
    const cached = previous.get(input.key);
    if (cached && sameStitchBase(cached.base, input)) return cached.shell;
    prepareShellKeys.push(input.key);
    return input;
  });
  return {
    probeInputs,
    prepareShellKeys,
    allNew: prepareShellKeys.length === inputs.length,
    resolve: (
      probes: TerrainStitchUpdate[],
      shells: TerrainStitchInput[] = []
    ) => {
      const byKey = new Map(probes.map((probe) => [probe.key, probe]));
      const shellByKey = new Map(shells.map((shell) => [shell.key, shell]));
      const state = new Map<string, TerrainBoundaryStitchEntry>();
      const outputKeys: string[] = [];
      const workInputs = inputs.map((base) => {
        const old = previous.get(base.key);
        const sameBase = old && sameStitchBase(old.base, base);
        const shell = sameBase ? old.shell : shellByKey.get(base.key);
        if (!shell) throw new Error("Missing terrain boundary shell");
        const probe = byKey.get(base.key);
        if (!probe?.boundaryState)
          throw new Error("Missing terrain boundary probe");
        const unchanged =
          sameBase && sameStitchArray(old.boundaryState, probe.boundaryState);
        state.set(base.key, {
          base,
          shell,
          boundaryState: probe.boundaryState,
        });
        if (unchanged) return shell;
        outputKeys.push(base.key);
        return base;
      });
      return { inputs: workInputs, outputKeys, state };
    },
  };
};
