import * as THREE from "three";
import { MercatorCoordinate } from "maplibre-gl";
import type { Carma3dConfig, MappedFeature, FactoryStats } from "../types";
import { getProfile } from "../profileRegistry";

// ─────────────────────────────────────────────────────────────
//  Instanced mode: prototype geometry + InstancedMesh per type
// ─────────────────────────────────────────────────────────────

interface Prototype {
  trunk: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
  baseHeight: number;
  baseRadius: number;
}

function makeCrown(
  profileFn: (t: number) => number,
  R: number,
  H: number,
  segments = 16,
  latheSegs = 8
): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pts.push(new THREE.Vector2(profileFn(t) * R, t * H));
  }
  pts.push(new THREE.Vector2(0, H));
  return new THREE.LatheGeometry(pts, latheSegs);
}

function buildPrototype(entry: {
  profileName: string;
  baseDims: { height: number; radius: number };
  trunkFrac: number;
}): Prototype {
  const { height, radius } = entry.baseDims;
  const trunkH = height * entry.trunkFrac;
  const crownH = height - trunkH;

  const trunkTopR = 0.06 * radius;
  const trunkBotR = 0.088 * radius;
  const trunk = new THREE.CylinderGeometry(trunkTopR, trunkBotR, trunkH, 6);
  trunk.translate(0, trunkH / 2, 0);

  const profileFn = getProfile(entry.profileName);
  const crown = makeCrown(profileFn, radius, crownH, 16, 8);
  crown.translate(0, trunkH, 0);
  crown.computeVertexNormals();

  return { trunk, crown, baseHeight: height, baseRadius: radius };
}

/**
 * Build instanced meshes (2 InstancedMesh per type: crown + trunk).
 * Removes previous InstancedMesh objects from the scene first.
 */
export function buildLatheInstances(
  features: MappedFeature[],
  scene: THREE.Scene,
  originMerc: MercatorCoordinate,
  mScale: number,
  config: Carma3dConfig
): FactoryStats {
  // Remove old InstancedMesh objects (keep building meshes)
  const toRemove = scene.children.filter(
    (c): c is THREE.InstancedMesh =>
      (c as THREE.InstancedMesh).isInstancedMesh === true &&
      !(c as THREE.InstancedMesh).userData.isBuilding,
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

  // Build prototypes per type
  const prototypes = new Map<string, Prototype>();
  for (const [typeName, entry] of Object.entries(config.typeMap)) {
    prototypes.set(typeName, buildPrototype(entry));
  }

  // Group features by type
  const groups = new Map<string, MappedFeature[]>();
  for (const f of features) {
    const arr = groups.get(f.type) ?? [];
    arr.push(f);
    groups.set(f.type, arr);
  }

  const dummy = new THREE.Object3D();

  for (const [typeName, feats] of groups) {
    if (feats.length === 0) continue;
    const proto = prototypes.get(typeName);
    if (!proto) continue;
    const entry = config.typeMap[typeName];
    if (!entry) continue;

    const count = feats.length;

    const crownMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      flatShading: true,
      depthWrite: true,
    });
    const crownMesh = new THREE.InstancedMesh(proto.crown, crownMat, count);

    const trunkMat = new THREE.MeshLambertMaterial({
      color: "#ffffff",
      flatShading: true,
    });
    const trunkMesh = new THREE.InstancedMesh(proto.trunk, trunkMat, count);

    const crownColors = new Float32Array(count * 3);
    const trunkColorData = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const feat = feats[i];

      const treeMerc = MercatorCoordinate.fromLngLat(
        [feat.lng, feat.lat],
        feat.elevation
      );
      const dxMeters = (treeMerc.x - originMerc.x) / mScale;
      const dyMeters = (treeMerc.y - originMerc.y) / mScale;
      const dzMeters = (treeMerc.z - originMerc.z) / mScale;

      const sx = feat.diameterVar;
      const sy = feat.heightVar;
      const sz = feat.diameterVar;

      dummy.position.set(dxMeters, dzMeters, dyMeters);
      dummy.scale.set(sx, sy, sz);
      dummy.rotation.set(0, feat.rotation, 0);
      dummy.updateMatrix();

      crownMesh.setMatrixAt(i, dummy.matrix);
      trunkMesh.setMatrixAt(i, dummy.matrix);

      // Crown color: use mapped color if available, else type default
      const baseColor = feat.color ?? entry.defaultColor;
      const cc = new THREE.Color(baseColor);
      cc.offsetHSL(0, 0, Math.random() * 0.06 - 0.03);
      crownColors.set([cc.r, cc.g, cc.b], i * 3);

      const tc = new THREE.Color(
        config.trunkColors[
          Math.floor(Math.random() * config.trunkColors.length)
        ]
      );
      tc.offsetHSL(0, 0, Math.random() * 0.04 - 0.02);
      trunkColorData.set([tc.r, tc.g, tc.b], i * 3);
    }

    crownMesh.instanceColor = new THREE.InstancedBufferAttribute(
      crownColors,
      3
    );
    trunkMesh.instanceColor = new THREE.InstancedBufferAttribute(
      trunkColorData,
      3
    );
    crownMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.instanceMatrix.needsUpdate = true;

    // Store source indices for selection: instanceId -> _sourceIndex
    const sourceIndices = feats.map((f) => f._sourceIndex);
    crownMesh.userData.sourceIndices = sourceIndices;
    trunkMesh.userData.sourceIndices = sourceIndices;

    crownMesh.frustumCulled = false;
    trunkMesh.frustumCulled = false;

    scene.add(crownMesh);
    scene.add(trunkMesh);
  }

  // Collect perf stats
  let triangles = 0;
  let drawCalls = 0;
  for (const child of scene.children) {
    const im = child as THREE.InstancedMesh;
    if (im.isInstancedMesh && im.count > 0) {
      drawCalls++;
      const idxCount = im.geometry.index
        ? im.geometry.index.count
        : im.geometry.attributes.position.count;
      triangles += im.count * (idxCount / 3);
    }
  }

  return { treeCount: features.length, triangles, drawCalls };
}
