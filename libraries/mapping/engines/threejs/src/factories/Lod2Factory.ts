import * as THREE from "three";
import { Earcut } from "three/src/extras/Earcut.js";
import { MercatorCoordinate } from "maplibre-gl";
import type { FactoryStats } from "../types";
import {
  buildSourceIndexMap,
  createBuildingMaterial,
  defaultBuildingColors,
  removeBuildingMeshes,
} from "./ExtrusionFactory";
import type {
  BuildingColors,
  FaceRange,
  VertexRange,
} from "./ExtrusionFactory";

// ─────────────────────────────────────────────────────────────
//  Lod2Factory: real roof shapes from LoD2 roof surfaces
//
//  Where ExtrusionFactory gives every building a flat lid at one height, this
//  builds the roof the survey actually recorded: a saddle roof comes out as two
//  sloping planes meeting at a ridge, a hipped roof as four.
//
//  Two draw calls, same as the extrusion path: one merged roof mesh, one merged
//  wall mesh.
// ─────────────────────────────────────────────────────────────

/**
 * One roof surface, as it arrives from the vector tile.
 *
 * The tile carries the surface's outline in the footprint plane plus the
 * equation of the plane it lies in, not the vertex heights themselves. A LoD2
 * roof surface is flat by construction, so outline and plane pin every vertex
 * down: see `faceHeights`.
 */
export interface Lod2RoofFace {
  /** outer ring as [[lng, lat], ...], closed or unclosed */
  ring: number[][];
  /** rise per metre east, from the tile's `grad_e` */
  gradE: number;
  /** rise per metre north, from the tile's `grad_n` */
  gradN: number;
  /**
   * Height at the ring's anchor, metres above sea level, from the tile's
   * `z_ref`. The anchor is the south-west corner of the ring's bounding box,
   * see `faceHeights`.
   */
  zRef: number;
}

/** One building (or building part): its roof surfaces and where the ground is. */
export interface Lod2Building {
  faces: Lod2RoofFace[];
  /** the footprint's own ground height above sea level, from `z_ground` */
  zGround: number;
  /** terrain height under the building, metres, or 0 without terrain */
  elevation: number;
  /** Whether this is a public building */
  isPublic: boolean;
  /** Roof colour as a hex string, from the layer's `roofColorField`, if it has one */
  roofColor?: string | null;
  /** Wall colour as a hex string, from the layer's `wallColorField`, if it has one */
  wallColor?: string | null;
  /** Index into the layer's _sourceFeatures array (for selection) */
  sourceIndex: number;
}

/**
 * The radius the pipeline used when it turned the plane into a gradient.
 *
 * Hard-coded on both sides on purpose. The local metre frame is a convention
 * shared between the pipeline and this factory, not a measurement, and the two
 * have to agree to the last digit or the heights come back tilted.
 */
const EARTH_RADIUS_M = 6378137;

/**
 * Height of every vertex of a roof surface, metres above sea level.
 *
 * The plane is given in a local metre frame whose axes are east and north and
 * whose origin is the ring's anchor, so a vertex `p` sits at
 *
 *   z(p) = zRef + gradE * dEast + gradN * dNorth
 *
 * The anchor is the south-west corner of the ring's bounding box, and
 * emphatically not its first vertex: a vector tile is free to hand a ring back
 * starting anywhere and running either way round, and a plane pinned to the
 * first vertex is then out by that vertex's height difference. On the steep
 * surfaces, where the gradient reaches 82, that is tens of metres. A bounding
 * box survives both, and the pipeline pins the plane the same way.
 *
 * The frame is true east/north, not the UTM grid the survey data is delivered
 * in: the two are turned against each other by about one and a half degrees
 * this far from the zone's central meridian, which on a ten metre roof is a
 * good ten centimetres of height.
 */
function faceHeights(ring: number[][], face: Lod2RoofFace): Float64Array {
  let lon0 = Infinity;
  let lat0 = Infinity;
  for (const point of ring) {
    if (point[0] < lon0) lon0 = point[0];
    if (point[1] < lat0) lat0 = point[1];
  }
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  const eastPerDeg = (Math.PI * EARTH_RADIUS_M * cosLat) / 180;
  const northPerDeg = (Math.PI * EARTH_RADIUS_M) / 180;

  const out = new Float64Array(ring.length);
  for (let i = 0; i < ring.length; i++) {
    const dEast = (ring[i][0] - lon0) * eastPerDeg;
    const dNorth = (ring[i][1] - lat0) * northPerDeg;
    out[i] = face.zRef + face.gradE * dEast + face.gradN * dNorth;
  }
  return out;
}

/** A ring without its closing vertex, or null when too short to be a surface. */
function openRing(ring: number[][]): number[][] | null {
  if (!ring || ring.length < 3) {
    return null;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  const open =
    last[0] === first[0] && last[1] === first[1] ? ring.slice(0, -1) : ring;
  return open.length >= 3 ? open : null;
}

/**
 * Key for one edge, the same whichever way round it is walked and whichever
 * surface it came from.
 *
 * Seven decimal places is the precision the tile carries, so two surfaces that
 * meet along a ridge produce the identical key and cancel out.
 */
function edgeKey(a: number[], b: number[]): string {
  const ka = `${Math.round(a[0] * 1e7)}:${Math.round(a[1] * 1e7)}`;
  const kb = `${Math.round(b[0] * 1e7)}:${Math.round(b[1] * 1e7)}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

interface OuterEdge {
  count: number;
  a: number[];
  b: number[];
  /** height at `a` and at `b`, from the surface the edge was first seen on */
  hA: number;
  hB: number;
}

interface PreparedFace {
  ring: number[][];
  heights: Float64Array;
  gradE: number;
  gradN: number;
}

interface PreparedBuilding {
  b: Lod2Building;
  faces: PreparedFace[];
  outer: OuterEdge[];
}

/**
 * Which edges of a building's roof are on the outside.
 *
 * The roof surfaces of one building tile its footprint: every edge inside the
 * footprint is shared by exactly two of them, every edge on the outline belongs
 * to one. So counting each edge and keeping the ones seen once gives the
 * outline, and a wall dropped from each of those reaches the ground.
 *
 * This is what makes gables come out right without any extra data. The two
 * halves of a saddle roof share the ridge, so no wall goes up there; the sloping
 * edges at the gable end are each on one surface only, and the walls hung from
 * them are the triangle plus the rectangle underneath it, in one piece.
 *
 * It also covers the roughly one building in a hundred whose roof oversails its
 * footprint, where deriving walls from the footprint outline instead would leave
 * them standing in the wrong place.
 */
function outerEdgesOf(faces: PreparedFace[]): OuterEdge[] {
  const edges = new Map<string, OuterEdge>();
  for (const face of faces) {
    const n = face.ring.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const key = edgeKey(face.ring[i], face.ring[j]);
      const seen = edges.get(key);
      if (seen) {
        seen.count++;
      } else {
        edges.set(key, {
          count: 1,
          a: face.ring[i],
          b: face.ring[j],
          hA: face.heights[i],
          hB: face.heights[j],
        });
      }
    }
  }
  const outer: OuterEdge[] = [];
  for (const edge of edges.values()) {
    if (edge.count === 1) {
      outer.push(edge);
    }
  }
  return outer;
}

/**
 * Build merged LoD2 building geometry: real roof planes plus the walls under
 * their outline.
 *
 * All meshes are tagged with `userData.isBuilding = true`, so the appearance
 * overrides, the selection highlight and the teardown that the extrusion path
 * already has work on these unchanged.
 */
export function buildLod2Meshes(
  buildings: Lod2Building[],
  scene: THREE.Scene,
  originMerc: MercatorCoordinate,
  mScale: number,
  colors: BuildingColors = defaultBuildingColors,
): FactoryStats {
  removeBuildingMeshes(scene);

  // Pass 1: reconstruct the heights, find the outline, and count what the
  // buffers have to hold.
  const prepared: PreparedBuilding[] = [];
  let totalRoofVerts = 0;
  let totalRoofIdx = 0;
  let totalWallVerts = 0;
  let totalWallIdx = 0;

  for (const b of buildings) {
    const faces: PreparedFace[] = [];
    for (const face of b.faces) {
      const ring = openRing(face.ring);
      if (!ring) continue;
      faces.push({
        ring,
        heights: faceHeights(ring, face),
        gradE: face.gradE,
        gradN: face.gradN,
      });
      totalRoofVerts += ring.length;
      totalRoofIdx += (ring.length - 2) * 3;
    }
    if (faces.length === 0) continue;

    const outer = outerEdgesOf(faces);
    totalWallVerts += outer.length * 4;
    totalWallIdx += outer.length * 6;
    prepared.push({ b, faces, outer });
  }

  if (prepared.length === 0) {
    return { treeCount: 0, triangles: 0, drawCalls: 0 };
  }

  const wP = new Float32Array(totalWallVerts * 3);
  const wN = new Float32Array(totalWallVerts * 3);
  const wC = new Float32Array(totalWallVerts * 3);
  const wI = new Uint32Array(totalWallIdx);

  const rP = new Float32Array(totalRoofVerts * 3);
  const rN = new Float32Array(totalRoofVerts * 3);
  const rC = new Float32Array(totalRoofVerts * 3);
  const rI = new Uint32Array(totalRoofIdx);

  let wv = 0;
  let wi = 0;
  let rv = 0;
  let ri = 0;

  const wallFaceRanges: FaceRange[] = [];
  const wallVertexRanges: VertexRange[] = [];
  const roofFaceRanges: FaceRange[] = [];
  const roofVertexRanges: VertexRange[] = [];

  // Pass 2: geometry.
  for (let bIdx = 0; bIdx < prepared.length; bIdx++) {
    const { b, faces, outer } = prepared[bIdx];

    // The building sits on the terrain by its own ground height: a vertex at
    // z metres above sea level goes to elevation + (z - zGround). Where the
    // terrain model and the survey disagree about the ground, the building
    // still meets the ground rather than floating or sinking into it.
    const toScene = (lng: number, lat: number, z: number) => {
      const m = MercatorCoordinate.fromLngLat(
        [lng, lat],
        b.elevation + (z - b.zGround),
      );
      return [
        (m.x - originMerc.x) / mScale,
        (m.z - originMerc.z) / mScale,
        (m.y - originMerc.y) / mScale,
      ] as const;
    };

    const roofColor = colors.roof(b, bIdx);
    const cr = roofColor.r;
    const cg = roofColor.g;
    const cb = roofColor.b;

    // Walls are hung from the roof outline, not walked around a ring, so there
    // are no runs of edges to group into one facade. Every quad is wall 0.
    const wallColor = colors.wall(b, bIdx, 0);
    const wcr = wallColor.r;
    const wcg = wallColor.g;
    const wcb = wallColor.b;

    const roofVertStart = rv;
    const roofFaceStart = ri / 3;
    const wallVertStart = wv;
    const wallFaceStart = wi / 3;

    for (const face of faces) {
      const n = face.ring.length;
      const faceBaseIdx = rv;
      const flatXZ: number[] = [];

      // Normal of the plane in scene axes: x east, y up, z south. The surface
      // is y = c + gradE * x - gradN * z, so its normal is (-gradE, 1, gradN).
      let nx = -face.gradE;
      let ny = 1;
      let nz = face.gradN;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;

      for (let i = 0; i < n; i++) {
        const [x, y, z] = toScene(face.ring[i][0], face.ring[i][1], face.heights[i]);
        const v3 = rv * 3;
        rP[v3] = x; rP[v3 + 1] = y; rP[v3 + 2] = z;
        rN[v3] = nx; rN[v3 + 1] = ny; rN[v3 + 2] = nz;
        rC[v3] = cr; rC[v3 + 1] = cg; rC[v3 + 2] = cb;
        rv++;
        flatXZ.push(x, z);
      }

      // Triangulated in the footprint plane rather than in the plane of the
      // roof surface: the surface is flat, so the two triangulations have the
      // same topology, and the heights set above carry it back into the slope.
      const indices = Earcut.triangulate(flatXZ, undefined, 2);
      for (const idx of indices) {
        rI[ri++] = faceBaseIdx + idx;
      }
    }

    for (const edge of outer) {
      const [ax, ay, az] = toScene(edge.a[0], edge.a[1], edge.hA);
      const [bx, by, bz] = toScene(edge.b[0], edge.b[1], edge.hB);
      const [gax, gay, gaz] = toScene(edge.a[0], edge.a[1], b.zGround);
      const [gbx, gby, gbz] = toScene(edge.b[0], edge.b[1], b.zGround);

      // The outer rings arrive counter-clockwise, so this points away from the
      // building, the same way the extrusion path works it out.
      const edgeX = gbx - gax;
      const edgeZ = gbz - gaz;
      const len = Math.hypot(edgeX, edgeZ) || 1;
      const nx = -edgeZ / len;
      const nz = edgeX / len;

      const base = wv;
      const put = (x: number, y: number, z: number) => {
        const v3 = wv * 3;
        wP[v3] = x; wP[v3 + 1] = y; wP[v3 + 2] = z;
        wN[v3] = nx; wN[v3 + 1] = 0; wN[v3 + 2] = nz;
        wC[v3] = wcr; wC[v3 + 1] = wcg; wC[v3 + 2] = wcb;
        wv++;
      };
      put(gax, gay, gaz);
      put(gbx, gby, gbz);
      put(ax, ay, az);
      put(bx, by, bz);

      // ground-a, ground-b, top-b then ground-a, top-b, top-a
      wI[wi++] = base;
      wI[wi++] = base + 1;
      wI[wi++] = base + 3;
      wI[wi++] = base;
      wI[wi++] = base + 3;
      wI[wi++] = base + 2;
    }

    roofFaceRanges.push({
      faceStart: roofFaceStart,
      faceEnd: ri / 3,
      sourceIndex: b.sourceIndex,
    });
    roofVertexRanges.push({
      vertexStart: roofVertStart,
      vertexEnd: rv,
      sourceIndex: b.sourceIndex,
    });
    wallFaceRanges.push({
      faceStart: wallFaceStart,
      faceEnd: wi / 3,
      sourceIndex: b.sourceIndex,
    });
    wallVertexRanges.push({
      vertexStart: wallVertStart,
      vertexEnd: wv,
      sourceIndex: b.sourceIndex,
    });
  }

  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute("position", new THREE.BufferAttribute(wP.subarray(0, wv * 3), 3));
  wallGeo.setAttribute("normal", new THREE.BufferAttribute(wN.subarray(0, wv * 3), 3));
  wallGeo.setAttribute("color", new THREE.BufferAttribute(wC.subarray(0, wv * 3), 3));
  wallGeo.setIndex(new THREE.BufferAttribute(wI.subarray(0, wi), 1));

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute("position", new THREE.BufferAttribute(rP.subarray(0, rv * 3), 3));
  roofGeo.setAttribute("normal", new THREE.BufferAttribute(rN.subarray(0, rv * 3), 3));
  roofGeo.setAttribute("color", new THREE.BufferAttribute(rC.subarray(0, rv * 3), 3));
  roofGeo.setIndex(new THREE.BufferAttribute(rI.subarray(0, ri), 1));

  const wallMesh = new THREE.Mesh(wallGeo, createBuildingMaterial());
  wallMesh.userData.isBuilding = true;
  wallMesh.userData.isBuildingWall = true;
  wallMesh.userData.faceRanges = wallFaceRanges;
  wallMesh.userData.vertexRanges = wallVertexRanges;
  wallMesh.userData.originalColors = wC.subarray(0, wv * 3).slice();
  wallMesh.userData.sourceIndexMap = buildSourceIndexMap(wallVertexRanges);
  wallMesh.frustumCulled = false;
  scene.add(wallMesh);

  const roofMesh = new THREE.Mesh(roofGeo, createBuildingMaterial());
  roofMesh.userData.isBuilding = true;
  roofMesh.userData.faceRanges = roofFaceRanges;
  roofMesh.userData.vertexRanges = roofVertexRanges;
  roofMesh.userData.originalColors = rC.subarray(0, rv * 3).slice();
  roofMesh.userData.sourceIndexMap = buildSourceIndexMap(roofVertexRanges);
  roofMesh.frustumCulled = false;
  scene.add(roofMesh);

  return {
    treeCount: prepared.length,
    triangles: wi / 3 + ri / 3,
    drawCalls: 2,
  };
}
