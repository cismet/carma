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
}

const COLOR_DEFAULT = new THREE.Color("#888888");
const COLOR_PUBLIC = new THREE.Color("#dca894");

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
): FactoryStats {
  // Remove old building meshes (keep trees and lights)
  const toRemove = scene.children.filter(
    (c): c is THREE.Mesh =>
      (c as THREE.Mesh).isMesh === true &&
      (c as THREE.Mesh).userData.isBuilding === true,
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

  // Pass 2: build geometry
  for (const { f, ring } of validFeatures) {
    const n = ring.length;
    const color = f.isPublic ? COLOR_PUBLIC : COLOR_DEFAULT;
    const cr = color.r;
    const cg = color.g;
    const cb = color.b;

    // Slightly darken walls vs roof for visual separation
    const wcr = cr * 0.85;
    const wcg = cg * 0.85;
    const wcb = cb * 0.85;

    // Pre-compute scene-space positions for each vertex at ground and roof height
    const roofBaseIdx = rv;
    const flatXZ: number[] = []; // flat [x, z, x, z, ...] for 2D triangulation

    for (let i = 0; i < n; i++) {
      const [lng, lat] = ring[i];
      const mH = MercatorCoordinate.fromLngLat([lng, lat], f.elevation + f.height);
      const rx = (mH.x - originMerc.x) / mScale;
      const ry = (mH.z - originMerc.z) / mScale;
      const rz = (mH.y - originMerc.y) / mScale;

      // Roof vertex
      let v3 = rv * 3;
      rP[v3] = rx; rP[v3 + 1] = ry; rP[v3 + 2] = rz;
      rN[v3] = 0; rN[v3 + 1] = 1; rN[v3 + 2] = 0;
      rC[v3] = cr; rC[v3 + 1] = cg; rC[v3 + 2] = cb;
      rv++;

      // earcut uses 2D coords: we project onto XZ plane
      flatXZ.push(rx, rz);

      // Wall quad for edge i -> (i+1)%n
      const j = (i + 1) % n;
      const [lng1, lat1] = ring[j];

      const m0 = MercatorCoordinate.fromLngLat([lng, lat], f.elevation);
      const m1 = MercatorCoordinate.fromLngLat([lng1, lat1], f.elevation);
      const mH1 = MercatorCoordinate.fromLngLat([lng1, lat1], f.elevation + f.height);

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
      wP[v3] = ax; wP[v3 + 1] = ay; wP[v3 + 2] = az;
      wN[v3] = nx; wN[v3 + 1] = 0; wN[v3 + 2] = nz;
      wC[v3] = wcr; wC[v3 + 1] = wcg; wC[v3 + 2] = wcb;
      wv++;

      v3 = wv * 3;
      wP[v3] = bx; wP[v3 + 1] = by; wP[v3 + 2] = bz;
      wN[v3] = nx; wN[v3 + 1] = 0; wN[v3 + 2] = nz;
      wC[v3] = wcr; wC[v3 + 1] = wcg; wC[v3 + 2] = wcb;
      wv++;

      v3 = wv * 3;
      wP[v3] = dx; wP[v3 + 1] = dy; wP[v3 + 2] = dz;
      wN[v3] = nx; wN[v3 + 1] = 0; wN[v3 + 2] = nz;
      wC[v3] = wcr; wC[v3 + 1] = wcg; wC[v3 + 2] = wcb;
      wv++;

      v3 = wv * 3;
      wP[v3] = ex; wP[v3 + 1] = ey; wP[v3 + 2] = ez;
      wN[v3] = nx; wN[v3 + 1] = 0; wN[v3 + 2] = nz;
      wC[v3] = wcr; wC[v3 + 1] = wcg; wC[v3 + 2] = wcb;
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
    for (const idx of roofIndices) {
      rI[ri++] = roofBaseIdx + idx;
    }
  }

  // Build BufferGeometry objects
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

  const wallMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    transparent: true,
    opacity: 0.65,
    depthWrite: true,
    side: THREE.DoubleSide,
  });

  const roofMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    transparent: true,
    opacity: 0.65,
    depthWrite: true,
    side: THREE.DoubleSide,
  });

  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.userData.isBuilding = true;
  wallMesh.frustumCulled = false;
  scene.add(wallMesh);

  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.userData.isBuilding = true;
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
