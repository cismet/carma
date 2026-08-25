import * as THREE from "three";
import { Earcut } from "three/src/extras/Earcut.js";
import { MercatorCoordinate } from "maplibre-gl";
import type { FactoryStats } from "../types";

// ─────────────────────────────────────────────────────────────
//  ExtrusionFactory: polygon extrusion for buildings in Three.js
//  Merged approach: ONE mesh for walls + ONE mesh for roofs (2 draw calls)
//  Uses earcut for correct triangulation of concave polygons.
// ─────────────────────────────────────────────────────────────

/** Minimal building feature for extrusion. */
export interface BuildingFeature {
  /** Polygon ring as [[lng, lat], ...] (outer ring, closed or unclosed) */
  ring: number[][];
  /** Building height in meters */
  height: number;
  /** Ground elevation in meters (from terrain) */
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

export interface FaceRange {
  faceStart: number;
  faceEnd: number;
  sourceIndex: number;
}

export interface VertexRange {
  vertexStart: number;
  vertexEnd: number;
  sourceIndex: number;
}

/** Group vertex ranges by sourceIndex for O(1) highlight lookup. */
export function buildSourceIndexMap(
  ranges: VertexRange[],
): Map<number, VertexRange[]> {
  const map = new Map<number, VertexRange[]>();
  for (const r of ranges) {
    const existing = map.get(r.sourceIndex);
    if (existing) {
      existing.push(r);
    } else {
      map.set(r.sourceIndex, [r]);
    }
  }
  return map;
}

const COLOR_DEFAULT = new THREE.Color("#888888");
const COLOR_PUBLIC = new THREE.Color("#dca894");

/**
 * How opaque a building is when nothing says otherwise.
 *
 * Shared rather than only baked into the materials below, because the layer's
 * own opacity is applied on top of it and the multiplication needs both halves.
 */
export const DEFAULT_BUILDING_OPACITY = 0.65;

/** walls a shade darker than their roof, so the two read apart under flat light */
const WALL_DARKEN = 0.85;
const COLOR_DEFAULT_WALL = COLOR_DEFAULT.clone().multiplyScalar(WALL_DARKEN);
const COLOR_PUBLIC_WALL = COLOR_PUBLIC.clone().multiplyScalar(WALL_DARKEN);

/** GeoJSON exterior rings are counter-clockwise in longitude/latitude. The
 * MapLibre-local X/Z plane flips latitude to south, making that orientation
 * clockwise there: roof faces point up and wall faces point out. */
const orientExteriorRing = (ring: number[][]): number[][] => {
  let signedAreaTwice = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    signedAreaTwice += current[0] * next[1] - next[0] * current[1];
  }
  return signedAreaTwice < 0 ? [...ring].reverse() : ring;
};

/**
 * What a colour resolver is actually allowed to look at.
 *
 * Narrower than `BuildingFeature` on purpose: the resolvers below read nothing
 * but these three, and a factory whose features have a different shape (LoD2
 * roof surfaces rather than a footprint and a height) can then hand its own
 * buildings to the very same resolvers.
 */
export type BuildingColorSource = Pick<
  BuildingFeature,
  "isPublic" | "roofColor" | "wallColor"
>;

/**
 * Where a building's colours come from.
 *
 * A seam rather than a constant: the roof is asked for once per building and a
 * wall once per quad, which is the finest either can be given the geometry
 * below (walls carry four vertices of their own per edge, the roof cap n per
 * building). Real colours, whenever they arrive, are another implementation of
 * this and need no change to the geometry.
 */
export type BuildingColors = {
  /**
   * Whether `wall` gives different answers for different walls of one building.
   *
   * Working out which edges form which wall costs a pass over the ring, and a
   * resolver that returns one colour for the whole building has no use for the
   * answer. Left off, that pass is skipped and every quad is asked for wall 0.
   */
  perWall?: boolean;
  roof: (feature: BuildingColorSource, buildingIndex: number) => THREE.Color;
  wall: (
    feature: BuildingColorSource,
    buildingIndex: number,
    /**
     * Which wall of the building this quad belongs to.
     *
     * A wall, not a ring edge: consecutive edges that carry on in roughly the
     * same direction share an index, so a curved facade built out of many short
     * segments is one wall and a corner starts the next. See `wallRunsForRing`.
     */
    wallIndex: number
  ) => THREE.Color;
};

/** what the buildings looked like before there was anything to choose */
export const defaultBuildingColors: BuildingColors = {
  roof: (f) => (f.isPublic ? COLOR_PUBLIC : COLOR_DEFAULT),
  wall: (f) => (f.isPublic ? COLOR_PUBLIC_WALL : COLOR_DEFAULT_WALL),
};

/**
 * A hex string as a colour, or null when it is not one.
 *
 * `#rrggbb` and `#rgb`, with the `#` optional because a column of bare hex is
 * common. Anything else is a miss: `THREE.Color` would take an unknown string
 * as a warning and a black building, and one bad value in a property is a bad
 * value in tens of thousands of features.
 */
const HEX = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Parsed colours, keyed by the raw string.
 *
 * Two reasons, both about the size of the input: a rebuild runs this once per
 * building, so an uncached parse allocates a `THREE.Color` per building per
 * rebuild; and a miss is cached as null as well, so an unreadable value is
 * complained about once instead of once per building per rebuild.
 */
const colorCache = new Map<string, THREE.Color | null>();

const parseHexColor = (
  value: string | null | undefined
): THREE.Color | null => {
  if (!value) {
    return null;
  }
  const cached = colorCache.get(value);
  if (cached !== undefined) {
    return cached;
  }
  const trimmed = value.trim();
  let parsed: THREE.Color | null = null;
  if (HEX.test(trimmed)) {
    parsed = new THREE.Color(trimmed.startsWith("#") ? trimmed : `#${trimmed}`);
  } else {
    console.warn(
      `[3D-BUILDINGS] not a hex colour, falling back: ${JSON.stringify(value)}`
    );
  }
  colorCache.set(value, parsed);
  return parsed;
};

/**
 * The colours the features themselves carry, for a layer that names a
 * `roofColorField`.
 *
 * A feature with nothing usable falls back to what it would have been given
 * anyway, so a half-filled colour column shows the buildings that have one and
 * leaves the rest alone rather than blacking them out. Walls with no colour of
 * their own stay a shade of their roof, which is what they have always been.
 */
export const featureBuildingColors: BuildingColors = {
  roof: (f) => parseHexColor(f.roofColor) ?? defaultBuildingColors.roof(f, 0),
  wall: (f) => {
    const own = parseHexColor(f.wallColor);
    if (own) {
      return own;
    }
    const roof = parseHexColor(f.roofColor);
    return roof
      ? roof.clone().multiplyScalar(WALL_DARKEN)
      : defaultBuildingColors.wall(f, 0, 0);
  },
};

/**
 * How sharp a turn has to be to count as a corner, in degrees.
 *
 * Below it, the next edge is taken as more of the same wall. Twenty keeps a
 * curved facade in one piece (its segments turn a few degrees each) while every
 * real corner of a building is well past it.
 */
const DEFAULT_WALL_ANGLE = 20;

/**
 * Which wall each edge of a ring belongs to.
 *
 * The polygon has one edge per vertex, but a wall in the sense anyone means it
 * is a run of edges that carry on straight: a curved front is dozens of short
 * segments and is still one wall. So this walks the ring, opens a new wall only
 * where the direction turns by more than `angleThreshold`, and returns the wall
 * index for every edge.
 *
 * The ring is closed, so the run holding edge 0 may have begun before it. When
 * the seam is not itself a corner the last run is merged back into the first,
 * or a building whose ring happens to start in the middle of a facade would
 * have that facade cut in two.
 *
 * Longitude is scaled by the cosine of the latitude before the angles are
 * taken. Degrees are not square that far north, and without it every wall
 * running east would look bent.
 */
export const wallRunsForRing = (
  ring: number[][],
  angleThreshold = DEFAULT_WALL_ANGLE
): number[] => {
  const n = ring.length;
  if (n < 2) {
    return new Array<number>(n).fill(0);
  }

  const latScale = Math.cos((ring[0][1] * Math.PI) / 180) || 1;
  const headings = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [lng, lat] = ring[i];
    const [lng1, lat1] = ring[(i + 1) % n];
    headings[i] = Math.atan2(lat1 - lat, (lng1 - lng) * latScale);
  }

  const maxTurn = (angleThreshold * Math.PI) / 180;
  /** the smaller angle between two headings, so the wrap at pi is not a corner */
  const turnAt = (i: number) => {
    let delta = Math.abs(headings[i] - headings[(i - 1 + n) % n]);
    if (delta > Math.PI) {
      delta = 2 * Math.PI - delta;
    }
    return delta;
  };

  const walls = new Array<number>(n);
  let wall = 0;
  walls[0] = 0;
  for (let i = 1; i < n; i++) {
    if (turnAt(i) > maxTurn) {
      wall++;
    }
    walls[i] = wall;
  }

  // the seam: edge 0 continues the last run, so they are one wall
  if (wall > 0 && turnAt(0) <= maxTurn) {
    const last = wall;
    for (let i = n - 1; i >= 0 && walls[i] === last; i--) {
      walls[i] = 0;
    }
  }

  return walls;
};

/**
 * The material both building meshes are made of.
 *
 * One function rather than two literals, and shared with the other building
 * factories: walls and roof have to agree on transparency and shading, or the
 * two halves of one building read as two objects.
 */
export function createBuildingMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    transparent: true,
    opacity: DEFAULT_BUILDING_OPACITY,
    depthWrite: true,
    side: THREE.FrontSide,
  });
}

/**
 * Drop the building meshes a rebuild is about to replace, leaving trees and
 * lights where they are.
 */
export function removeBuildingMeshes(scene: THREE.Scene): void {
  const toRemove = scene.children.filter(
    (c): c is THREE.Mesh =>
      (c as THREE.Mesh).isMesh === true &&
      (c as THREE.Mesh).userData.isBuilding === true
  );
  for (const m of toRemove) {
    m.geometry.dispose();
    if (Array.isArray(m.material)) {
      m.material.forEach((mat) => mat.dispose());
    } else {
      m.material.dispose();
    }
    scene.remove(m);
  }
}

/**
 * Build merged extruded building geometry for all features.
 * Walls: 2 triangles per polygon edge (vertical quad).
 * Roof: earcut triangulation of the polygon at height.
 *
 * All meshes are tagged with `userData.isBuilding = true`.
 */
export function buildExtrusionMeshes(
  features: BuildingFeature[],
  scene: THREE.Scene,
  originMerc: MercatorCoordinate,
  mScale: number,
  colors: BuildingColors = defaultBuildingColors,
  wallAngleThreshold: number = DEFAULT_WALL_ANGLE,
): FactoryStats {
  removeBuildingMeshes(scene);

  // Pre-filter valid features and strip closing vertex if ring is closed
  const validFeatures: Array<{ f: BuildingFeature; ring: number[][] }> = [];
  for (const f of features) {
    let ring = f.ring;
    if (ring.length < 3 || f.height <= 0) continue;
    // Strip closing vertex if it duplicates the first
    const last = ring[ring.length - 1];
    const first = ring[0];
    if (last[0] === first[0] && last[1] === first[1]) {
      ring = ring.slice(0, -1);
    }
    if (ring.length < 3) continue;
    ring = orientExteriorRing(ring);
    validFeatures.push({ f, ring });
  }

  if (validFeatures.length === 0) {
    return { treeCount: 0, triangles: 0, drawCalls: 0 };
  }

  // Pass 1: count totals for pre-allocation
  let totalWallVerts = 0;
  let totalWallIdx = 0;
  let totalRoofVerts = 0;
  let totalRoofIdx = 0;

  for (const { ring } of validFeatures) {
    const n = ring.length;
    // Walls: 4 verts per edge, 6 indices per edge
    totalWallVerts += n * 4;
    totalWallIdx += n * 6;
    // Roof: n perimeter verts, earcut produces at most (n-2) triangles
    totalRoofVerts += n;
    totalRoofIdx += (n - 2) * 3;
  }

  // Allocate typed arrays
  const wP = new Float32Array(totalWallVerts * 3);
  const wN = new Float32Array(totalWallVerts * 3);
  const wC = new Float32Array(totalWallVerts * 3);
  const wI = new Uint32Array(totalWallIdx);

  const rP = new Float32Array(totalRoofVerts * 3);
  const rN = new Float32Array(totalRoofVerts * 3);
  const rC = new Float32Array(totalRoofVerts * 3);
  const rI = new Uint32Array(totalRoofIdx);

  let wv = 0; // wall vertex cursor
  let wi = 0; // wall index cursor
  let rv = 0; // roof vertex cursor
  let ri = 0; // roof index cursor

  // Selection metadata: face and vertex ranges per building
  const wallFaceRanges: FaceRange[] = [];
  const wallVertexRanges: VertexRange[] = [];
  const roofFaceRanges: FaceRange[] = [];
  const roofVertexRanges: VertexRange[] = [];

  // Pass 2: build geometry
  for (let bIdx = 0; bIdx < validFeatures.length; bIdx++) {
    const { f, ring } = validFeatures[bIdx];
    const n = ring.length;
    // the cap is one colour for the whole building; the walls are asked for
    // again per quad further down
    const roofColor = colors.roof(f, bIdx);
    const cr = roofColor.r;
    const cg = roofColor.g;
    const cb = roofColor.b;

    // Edges that carry on straight are one wall, so a per-wall resolver never
    // colours a curved facade segment by segment. Only worked out when the
    // resolver says it distinguishes walls; otherwise every quad is wall 0.
    const wallOfEdge = colors.perWall
      ? wallRunsForRing(ring, wallAngleThreshold)
      : null;

    // Track range starts for this building (face index = index cursor / 3)
    const wallVertStart = wv;
    const wallFaceStart = wi / 3;

    const roofVertStart = rv;
    const roofFaceStart = ri / 3;

    // Pre-compute scene-space positions for each vertex at ground and roof height
    const roofBaseIdx = rv;
    const flatXZ: number[] = []; // flat [x, z, x, z, ...] for 2D triangulation

    for (let i = 0; i < n; i++) {
      const [lng, lat] = ring[i];
      const mH = MercatorCoordinate.fromLngLat(
        [lng, lat],
        f.elevation + f.height
      );
      const rx = (mH.x - originMerc.x) / mScale;
      const ry = (mH.z - originMerc.z) / mScale;
      const rz = (mH.y - originMerc.y) / mScale;

      // Roof vertex
      let v3 = rv * 3;
      rP[v3] = rx;
      rP[v3 + 1] = ry;
      rP[v3 + 2] = rz;
      rN[v3] = 0;
      rN[v3 + 1] = 1;
      rN[v3 + 2] = 0;
      rC[v3] = cr;
      rC[v3 + 1] = cg;
      rC[v3 + 2] = cb;
      rv++;

      // earcut uses 2D coords: we project onto XZ plane
      flatXZ.push(rx, rz);

      // Wall quad for edge i -> (i+1)%n
      const j = (i + 1) % n;
      const [lng1, lat1] = ring[j];

      // the colour of the wall this quad is part of, which is not the same as
      // the ring edge: a curve's segments all report the same wall
      const wallColor = colors.wall(f, bIdx, wallOfEdge ? wallOfEdge[i] : 0);
      const wcr = wallColor.r;
      const wcg = wallColor.g;
      const wcb = wallColor.b;

      const m0 = MercatorCoordinate.fromLngLat([lng, lat], f.elevation);
      const m1 = MercatorCoordinate.fromLngLat([lng1, lat1], f.elevation);
      const mH1 = MercatorCoordinate.fromLngLat(
        [lng1, lat1],
        f.elevation + f.height
      );

      const ax = (m0.x - originMerc.x) / mScale;
      const ay = (m0.z - originMerc.z) / mScale;
      const az = (m0.y - originMerc.y) / mScale;

      const bx = (m1.x - originMerc.x) / mScale;
      const by = (m1.z - originMerc.z) / mScale;
      const bz = (m1.y - originMerc.y) / mScale;

      const dx = rx;
      const dy = ry;
      const dz = rz;

      const ex = (mH1.x - originMerc.x) / mScale;
      const ey = (mH1.z - originMerc.z) / mScale;
      const ez = (mH1.y - originMerc.y) / mScale;

      // Wall normal: perpendicular to edge in XZ plane
      const edgeX = bx - ax;
      const edgeZ = bz - az;
      const len = Math.sqrt(edgeX * edgeX + edgeZ * edgeZ) || 1;
      const nx = -edgeZ / len;
      const nz = edgeX / len;

      // 4 wall verts: A (ground-left), B (ground-right), D (top-left), E (top-right)
      const wallBase = wv;

      v3 = wv * 3;
      wP[v3] = ax;
      wP[v3 + 1] = ay;
      wP[v3 + 2] = az;
      wN[v3] = nx;
      wN[v3 + 1] = 0;
      wN[v3 + 2] = nz;
      wC[v3] = wcr;
      wC[v3 + 1] = wcg;
      wC[v3 + 2] = wcb;
      wv++;

      v3 = wv * 3;
      wP[v3] = bx;
      wP[v3 + 1] = by;
      wP[v3 + 2] = bz;
      wN[v3] = nx;
      wN[v3 + 1] = 0;
      wN[v3 + 2] = nz;
      wC[v3] = wcr;
      wC[v3 + 1] = wcg;
      wC[v3 + 2] = wcb;
      wv++;

      v3 = wv * 3;
      wP[v3] = dx;
      wP[v3 + 1] = dy;
      wP[v3 + 2] = dz;
      wN[v3] = nx;
      wN[v3 + 1] = 0;
      wN[v3 + 2] = nz;
      wC[v3] = wcr;
      wC[v3 + 1] = wcg;
      wC[v3 + 2] = wcb;
      wv++;

      v3 = wv * 3;
      wP[v3] = ex;
      wP[v3 + 1] = ey;
      wP[v3 + 2] = ez;
      wN[v3] = nx;
      wN[v3 + 1] = 0;
      wN[v3 + 2] = nz;
      wC[v3] = wcr;
      wC[v3 + 1] = wcg;
      wC[v3 + 2] = wcb;
      wv++;

      // Wall indices: A-B-E, A-E-D
      wI[wi++] = wallBase;
      wI[wi++] = wallBase + 1;
      wI[wi++] = wallBase + 3;
      wI[wi++] = wallBase;
      wI[wi++] = wallBase + 3;
      wI[wi++] = wallBase + 2;
    }

    // Roof triangulation via earcut (handles concave polygons, winding-insensitive)
    const roofIndices = Earcut.triangulate(flatXZ, undefined, 2);
    // Earcut faces down when its 2D X/Z output is interpreted in Three's
    // Y-up space. Reverse every triangle so its face winding agrees with the
    // explicit +Y roof normals and FrontSide material below.
    for (let index = 0; index < roofIndices.length; index += 3) {
      rI[ri++] = roofBaseIdx + roofIndices[index];
      rI[ri++] = roofBaseIdx + roofIndices[index + 2];
      rI[ri++] = roofBaseIdx + roofIndices[index + 1];
    }

    // Record face/vertex ranges for this building (selection metadata)
    const wallFaceEnd = wi / 3;
    wallFaceRanges.push({
      faceStart: wallFaceStart,
      faceEnd: wallFaceEnd,
      sourceIndex: f.sourceIndex,
    });
    wallVertexRanges.push({
      vertexStart: wallVertStart,
      vertexEnd: wv,
      sourceIndex: f.sourceIndex,
    });

    const roofFaceEnd = ri / 3;
    roofFaceRanges.push({
      faceStart: roofFaceStart,
      faceEnd: roofFaceEnd,
      sourceIndex: f.sourceIndex,
    });
    roofVertexRanges.push({
      vertexStart: roofVertStart,
      vertexEnd: rv,
      sourceIndex: f.sourceIndex,
    });
  }

  // Build BufferGeometry objects
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(wP.subarray(0, wv * 3), 3)
  );
  wallGeo.setAttribute(
    "normal",
    new THREE.BufferAttribute(wN.subarray(0, wv * 3), 3)
  );
  wallGeo.setAttribute(
    "color",
    new THREE.BufferAttribute(wC.subarray(0, wv * 3), 3)
  );
  wallGeo.setIndex(new THREE.BufferAttribute(wI.subarray(0, wi), 1));

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(rP.subarray(0, rv * 3), 3)
  );
  roofGeo.setAttribute(
    "normal",
    new THREE.BufferAttribute(rN.subarray(0, rv * 3), 3)
  );
  roofGeo.setAttribute(
    "color",
    new THREE.BufferAttribute(rC.subarray(0, rv * 3), 3)
  );
  roofGeo.setIndex(new THREE.BufferAttribute(rI.subarray(0, ri), 1));

  const wallMat = createBuildingMaterial();
  const roofMat = createBuildingMaterial();

  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.userData.isBuilding = true;
  wallMesh.userData.isBuildingWall = true;
  wallMesh.userData.faceRanges = wallFaceRanges;
  wallMesh.userData.vertexRanges = wallVertexRanges;
  wallMesh.userData.originalColors = wC.subarray(0, wv * 3).slice();
  wallMesh.userData.sourceIndexMap = buildSourceIndexMap(wallVertexRanges);
  wallMesh.frustumCulled = false;
  scene.add(wallMesh);

  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.userData.isBuilding = true;
  roofMesh.userData.faceRanges = roofFaceRanges;
  roofMesh.userData.vertexRanges = roofVertexRanges;
  roofMesh.userData.originalColors = rC.subarray(0, rv * 3).slice();
  roofMesh.userData.sourceIndexMap = buildSourceIndexMap(roofVertexRanges);
  roofMesh.frustumCulled = false;
  scene.add(roofMesh);

  const wallTris = wi / 3;
  const roofTris = ri / 3;

  return {
    treeCount: validFeatures.length,
    triangles: wallTris + roofTris,
    drawCalls: 2,
  };
}
