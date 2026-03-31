import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";

import { getProfile } from "../profileRegistry";
import type { Carma3dConfig, MappedFeature, FactoryStats } from "../types";
// ─────────────────────────────────────────────────────────────
//  Merged loft mode: all features -> ONE crown mesh + ONE trunk mesh
// ─────────────────────────────────────────────────────────────

const CIRCLE_SEGMENTS = 12;
const DEG_TO_M_LAT = 111320;
const TSEG = 8; // trunk polygon segments

function degToMLng(lat: number): number {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

function makeCircleRing(
  lng: number,
  lat: number,
  radiusMeters: number
): number[][] {
  const mlng = degToMLng(lat);
  const ring: number[][] = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    ring.push([
      lng + (Math.cos(a) * radiusMeters) / mlng,
      lat + (Math.sin(a) * radiusMeters) / DEG_TO_M_LAT,
    ]);
  }
  return ring;
}

interface BuildResult {
  crownGeo: THREE.BufferGeometry;
  trunkGeo: THREE.BufferGeometry;
  treeCount: number;
  crownTris: number;
  trunkTris: number;
}

function buildMergedGeometry(
  trees: MappedFeature[],
  originMerc: MercatorCoordinate,
  mScale: number,
  config: Carma3dConfig,
  numSlices: number
): BuildResult {
  // Pass 1: count totals
  let totalCV = 0;
  let totalCI = 0;
  let totalTV = 0;
  let totalTI = 0;
  const validTrees: MappedFeature[] = [];

  for (const tree of trees) {
    const ring = tree.ring;
    const nR = ring ? ring.length : 0;
    if (nR < 3) continue;
    validTrees.push(tree);

    // Crown: slices x ring verts + tip + bottom center
    totalCV += nR * numSlices + 2;
    // Sides + tip fan + bottom fan
    totalCI += (numSlices - 1) * nR * 6 + nR * 3 + nR * 3;

    // Trunk: top ring + bottom ring + 2 cap centers
    totalTV += TSEG * 2 + 2;
    // Side quads + bottom fan + top fan
    totalTI += TSEG * 6 + TSEG * 3 + TSEG * 3;
  }

  if (validTrees.length === 0) {
    return {
      crownGeo: new THREE.BufferGeometry(),
      trunkGeo: new THREE.BufferGeometry(),
      treeCount: 0,
      crownTris: 0,
      trunkTris: 0,
    };
  }

  // Allocate typed arrays
  const cP = new Float32Array(totalCV * 3);
  const cN = new Float32Array(totalCV * 3);
  const cC = new Float32Array(totalCV * 3);
  const cI = new Uint32Array(totalCI);

  const tP = new Float32Array(totalTV * 3);
  const tN = new Float32Array(totalTV * 3);
  const tC = new Float32Array(totalTV * 3);
  const tI = new Uint32Array(totalTI);

  let cv = 0;
  let ci = 0;
  let tv = 0;
  let ti = 0;

  const trunkBaseCol = new THREE.Color(config.trunkColors[0]);

  // Pass 2: build geometry
  for (const tree of validTrees) {
    const ring = tree.ring!;
    const nR = ring.length;
    const entry = config.typeMap[tree.type];
    if (!entry) continue;
    const profileFn = getProfile(entry.profileName);

    const totalH = tree.heightMax;
    const trunkH = totalH * entry.trunkFrac;
    const crownH = totalH - trunkH;

    // Position in scene-local meters
    const mrc = MercatorCoordinate.fromLngLat(
      [tree.lng, tree.lat],
      tree.elevation
    );
    const bx = (mrc.x - originMerc.x) / mScale;
    const by = (mrc.z - originMerc.z) / mScale;
    const bz = (mrc.y - originMerc.y) / mScale;

    // Ring coordinates to local meter offsets
    const mlng = degToMLng(tree.lat);
    const rl = new Float64Array(nR * 2);
    for (let i = 0; i < nR; i++) {
      rl[i * 2] = (ring[i][0] - tree.lng) * mlng;
      rl[i * 2 + 1] = -(ring[i][1] - tree.lat) * DEG_TO_M_LAT;
    }

    // Crown color
    const crownColor = tree.color ?? entry.defaultColor;
    const cc = new THREE.Color(crownColor);
    cc.offsetHSL(0, 0, Math.random() * 0.06 - 0.03);

    const cvBase = cv;

    // Crown slices
    for (let s = 0; s < numSlices; s++) {
      const t = s / (numSlices - 1);
      const sc = profileFn(t);
      const y = by + trunkH + t * crownH;

      for (let r = 0; r < nR; r++) {
        const dx = rl[r * 2] * sc;
        const dz = rl[r * 2 + 1] * sc;
        const v3 = (cv + s * nR + r) * 3;

        cP[v3] = bx + dx;
        cP[v3 + 1] = y;
        cP[v3 + 2] = bz + dz;

        // Normal: outward radial + slight upward
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        cN[v3] = dx / len;
        cN[v3 + 1] = 0.3;
        cN[v3 + 2] = dz / len;

        cC[v3] = cc.r;
        cC[v3 + 1] = cc.g;
        cC[v3 + 2] = cc.b;
      }
    }

    // Tip vertex
    const tipI = cv + numSlices * nR;
    let v3 = tipI * 3;
    cP[v3] = bx;
    cP[v3 + 1] = by + trunkH + crownH;
    cP[v3 + 2] = bz;
    cN[v3] = 0;
    cN[v3 + 1] = 1;
    cN[v3 + 2] = 0;
    cC[v3] = cc.r;
    cC[v3 + 1] = cc.g;
    cC[v3 + 2] = cc.b;

    // Bottom center vertex
    const btmI = tipI + 1;
    v3 = btmI * 3;
    cP[v3] = bx;
    cP[v3 + 1] = by + trunkH;
    cP[v3 + 2] = bz;
    cN[v3] = 0;
    cN[v3 + 1] = -1;
    cN[v3 + 2] = 0;
    cC[v3] = cc.r * 0.7;
    cC[v3 + 1] = cc.g * 0.7;
    cC[v3 + 2] = cc.b * 0.7;

    // Side quads
    for (let s = 0; s < numSlices - 1; s++) {
      for (let r = 0; r < nR; r++) {
        const rn = (r + 1) % nR;
        const a = cvBase + s * nR + r;
        const b = cvBase + s * nR + rn;
        const c = cvBase + (s + 1) * nR + r;
        const d = cvBase + (s + 1) * nR + rn;
        cI[ci++] = a;
        cI[ci++] = b;
        cI[ci++] = c;
        cI[ci++] = b;
        cI[ci++] = d;
        cI[ci++] = c;
      }
    }

    // Tip fan
    const topBase = cvBase + (numSlices - 1) * nR;
    for (let r = 0; r < nR; r++) {
      cI[ci++] = topBase + r;
      cI[ci++] = topBase + ((r + 1) % nR);
      cI[ci++] = tipI;
    }

    // Bottom cap fan
    for (let r = 0; r < nR; r++) {
      cI[ci++] = cvBase + ((r + 1) % nR);
      cI[ci++] = cvBase + r;
      cI[ci++] = btmI;
    }

    cv += numSlices * nR + 2;

    // Trunk cylinder
    const tR = Math.max(0.08, 0.05 * tree.radiusMax);
    const tvBase = tv;

    const tc = trunkBaseCol.clone();
    tc.offsetHSL(0, 0, Math.random() * 0.04 - 0.02);

    for (let half = 0; half < 2; half++) {
      const y = half === 0 ? by : by + trunkH;
      const rad = half === 0 ? tR * 1.2 : tR;
      for (let seg = 0; seg < TSEG; seg++) {
        const ang = (seg / TSEG) * Math.PI * 2;
        const co = Math.cos(ang);
        const si = Math.sin(ang);
        v3 = (tv + half * TSEG + seg) * 3;
        tP[v3] = bx + co * rad;
        tP[v3 + 1] = y;
        tP[v3 + 2] = bz + si * rad;
        tN[v3] = co;
        tN[v3 + 1] = 0;
        tN[v3 + 2] = si;
        tC[v3] = tc.r;
        tC[v3 + 1] = tc.g;
        tC[v3 + 2] = tc.b;
      }
    }

    // Cap centers
    const bci = tv + TSEG * 2;
    const tci = bci + 1;
    v3 = bci * 3;
    tP[v3] = bx;
    tP[v3 + 1] = by;
    tP[v3 + 2] = bz;
    tN[v3] = 0;
    tN[v3 + 1] = -1;
    tN[v3 + 2] = 0;
    tC[v3] = tc.r;
    tC[v3 + 1] = tc.g;
    tC[v3 + 2] = tc.b;
    v3 = tci * 3;
    tP[v3] = bx;
    tP[v3 + 1] = by + trunkH;
    tP[v3 + 2] = bz;
    tN[v3] = 0;
    tN[v3 + 1] = 1;
    tN[v3 + 2] = 0;
    tC[v3] = tc.r;
    tC[v3 + 1] = tc.g;
    tC[v3 + 2] = tc.b;

    // Side quads
    for (let seg = 0; seg < TSEG; seg++) {
      const sn = (seg + 1) % TSEG;
      tI[ti++] = tvBase + seg;
      tI[ti++] = tvBase + sn;
      tI[ti++] = tvBase + TSEG + seg;
      tI[ti++] = tvBase + sn;
      tI[ti++] = tvBase + TSEG + sn;
      tI[ti++] = tvBase + TSEG + seg;
    }
    // Bottom cap
    for (let seg = 0; seg < TSEG; seg++) {
      tI[ti++] = tvBase + ((seg + 1) % TSEG);
      tI[ti++] = tvBase + seg;
      tI[ti++] = bci;
    }
    // Top cap
    for (let seg = 0; seg < TSEG; seg++) {
      tI[ti++] = tvBase + TSEG + seg;
      tI[ti++] = tvBase + TSEG + ((seg + 1) % TSEG);
      tI[ti++] = tci;
    }

    tv += TSEG * 2 + 2;
  }

  // Build BufferGeometry objects
  const crownGeo = new THREE.BufferGeometry();
  crownGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(cP.subarray(0, cv * 3), 3)
  );
  crownGeo.setAttribute(
    "normal",
    new THREE.BufferAttribute(cN.subarray(0, cv * 3), 3)
  );
  crownGeo.setAttribute(
    "color",
    new THREE.BufferAttribute(cC.subarray(0, cv * 3), 3)
  );
  crownGeo.setIndex(new THREE.BufferAttribute(cI.subarray(0, ci), 1));

  const trunkGeo = new THREE.BufferGeometry();
  trunkGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(tP.subarray(0, tv * 3), 3)
  );
  trunkGeo.setAttribute(
    "normal",
    new THREE.BufferAttribute(tN.subarray(0, tv * 3), 3)
  );
  trunkGeo.setAttribute(
    "color",
    new THREE.BufferAttribute(tC.subarray(0, tv * 3), 3)
  );
  trunkGeo.setIndex(new THREE.BufferAttribute(tI.subarray(0, ti), 1));

  return {
    crownGeo,
    trunkGeo,
    treeCount: validTrees.length,
    crownTris: ci / 3,
    trunkTris: ti / 3,
  };
}

/**
 * Build merged lofted geometry for all features.
 * Produces ONE crown Mesh + ONE trunk Mesh (2 draw calls total).
 *
 * Features without ring data get a circular ring fallback.
 */
export function buildLoftMeshes(
  features: MappedFeature[],
  scene: THREE.Scene,
  originMerc: MercatorCoordinate,
  mScale: number,
  config: Carma3dConfig,
  numSlices = 14
): FactoryStats {
  // Remove old meshes (keep lights)
  const toRemove = scene.children.filter(
    (c): c is THREE.Mesh => (c as THREE.Mesh).isMesh === true
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

  if (features.length === 0) {
    return { treeCount: 0, triangles: 0, drawCalls: 0 };
  }

  // Ensure every feature has a ring (fall back to circle)
  const withRings = features.map((f) =>
    f.ring && f.ring.length >= 3
      ? f
      : { ...f, ring: makeCircleRing(f.lng, f.lat, f.radiusMax) }
  );

  const result = buildMergedGeometry(
    withRings,
    originMerc,
    mScale,
    config,
    numSlices
  );

  if (result.treeCount > 0) {
    const crownMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
    });
    const trunkMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
    });

    scene.add(new THREE.Mesh(result.crownGeo, crownMat));
    scene.add(new THREE.Mesh(result.trunkGeo, trunkMat));
  }

  return {
    treeCount: result.treeCount,
    triangles: result.crownTris + result.trunkTris,
    drawCalls: result.treeCount > 0 ? 2 : 0,
  };
}
