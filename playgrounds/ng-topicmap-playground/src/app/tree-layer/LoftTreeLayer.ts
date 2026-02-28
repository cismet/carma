import * as THREE from "three";
import type {
  Map as MaplibreMap,
  CustomLayerInterface,
  CustomRenderMethodInput,
  GeoJSONFeature,
} from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import {
  TYPE_COLORS,
  TRUNK_COLORS,
  TYPE_MAP,
  type TreeTypeName,
} from "./TreeFactory";

// ─────────────────────────────────────────────────────────────
//  Profile functions (same as TreeFactory lathe profiles)
// ─────────────────────────────────────────────────────────────

const PROFILE_FNS: Record<TreeTypeName, (t: number) => number> = {
  conical: (t) => 1 - t,
  parabolic: (t) => Math.sqrt(Math.max(0, 1 - t)),
  spherical: (t) => {
    const u = 2 * t - 1;
    return Math.sqrt(Math.max(0, 1 - u * u));
  },
  gaussian: (t) => Math.exp(-5.0 * (t - 0.35) * (t - 0.35)),
  hyperbolic: (t) => Math.sqrt(Math.max(0, 1 - t)),
};

// Per-type: fraction of height_max that is trunk below the crown
const TYPE_PARAMS: Record<TreeTypeName, { trunkFrac: number }> = {
  conical: { trunkFrac: 0.27 },
  parabolic: { trunkFrac: 0.33 },
  spherical: { trunkFrac: 0.4 },
  gaussian: { trunkFrac: 0.31 },
  hyperbolic: { trunkFrac: 0.38 },
};

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

export interface LoftTreeData {
  type: TreeTypeName;
  lng: number;
  lat: number;
  height_max: number;
  radius_max: number;
  farbe: string;
  ring: number[][] | null;
}

export interface LoftLayerConfig {
  heightScale?: number;
  diameterScale?: number;
  numSlices?: number;
  mapCenter?: [number, number];
}

// ─────────────────────────────────────────────────────────────
//  Tile source constants
// ─────────────────────────────────────────────────────────────

// Source names as defined in the einzelbaumX style.json
// (loaded by CarmaMap's libreLayers in merged mode)
export const EINZELBAUMX_SOURCE = "einzelbaum_3d-source";
export const EINZELBAUMX_LAYER = "einzelbaumX";

// ─────────────────────────────────────────────────────────────
//  Feature → tree data conversion
// ─────────────────────────────────────────────────────────────

export function loftTreesFromFeatures(
  features: GeoJSONFeature[]
): LoftTreeData[] {
  const result: LoftTreeData[] = [];

  for (const f of features) {
    const geom = f.geometry;
    if (!geom || geom.type !== "Point") continue;
    const props = f.properties ?? {};
    const [lng, lat] = geom.coordinates as [number, number];

    const rawType = String(props["templ_typ"] ?? "")
      .toUpperCase()
      .trim();
    const type: TreeTypeName = TYPE_MAP[rawType] ?? "spherical";
    const height_max = parseFloat(props["height_max"] as string) || 12;
    const radius_max = parseFloat(props["radius_max"] as string) || 3;
    const farbe =
      props["farbe"] && (props["farbe"] as string) !== "#000000"
        ? (props["farbe"] as string)
        : TYPE_COLORS[type];

    // Parse ring JSON: ST_AsGeoJSON of LineString → { type, coordinates }
    let ring: number[][] | null = null;
    if (props["ring"]) {
      try {
        const parsed = JSON.parse(props["ring"] as string);
        ring = (parsed.coordinates as number[][]) ?? (parsed as number[][]);
      } catch {
        // ignore malformed ring data
      }
    }

    result.push({ type, lng, lat, height_max, radius_max, farbe, ring });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
//  Circular ring fallback (when ring data is unavailable)
// ─────────────────────────────────────────────────────────────

const CIRCLE_SEGMENTS = 12;
const DEG_TO_M_LAT = 111320;

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

// ─────────────────────────────────────────────────────────────
//  Merged lofted geometry builder
//  All visible trees → ONE crown mesh + ONE trunk mesh (2 draw calls)
// ─────────────────────────────────────────────────────────────

interface BuildResult {
  crownGeo: THREE.BufferGeometry;
  trunkGeo: THREE.BufferGeometry;
  treeCount: number;
  crownTris: number;
  trunkTris: number;
}

function buildMergedGeometry(
  trees: LoftTreeData[],
  originMerc: MercatorCoordinate,
  mScale: number,
  hScale: number,
  dScale: number,
  numSlices: number
): BuildResult {
  const TSEG = 8; // trunk polygon segments

  // Pass 1: count totals
  let totalCV = 0;
  let totalCI = 0;
  let totalTV = 0;
  let totalTI = 0;
  const validTrees: LoftTreeData[] = [];

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

  const trunkBaseCol = new THREE.Color(TRUNK_COLORS[0]);

  // Pass 2: build geometry
  for (const tree of validTrees) {
    const ring = tree.ring!;
    const nR = ring.length;
    const profileFn = PROFILE_FNS[tree.type];
    const params = TYPE_PARAMS[tree.type];

    const totalH = tree.height_max * hScale;
    const trunkH = totalH * params.trunkFrac;
    const crownH = totalH - trunkH;

    // Stamm position in scene-local meters
    const mrc = MercatorCoordinate.fromLngLat([tree.lng, tree.lat], 0);
    const bx = (mrc.x - originMerc.x) / mScale;
    const bz = (mrc.y - originMerc.y) / mScale;

    // Ring coordinates to local meter offsets from stamm
    const mlng = degToMLng(tree.lat);
    const rl = new Float64Array(nR * 2);
    for (let i = 0; i < nR; i++) {
      rl[i * 2] = (ring[i][0] - tree.lng) * mlng * dScale;
      rl[i * 2 + 1] = -(ring[i][1] - tree.lat) * DEG_TO_M_LAT * dScale;
    }

    // Crown color
    const cc = new THREE.Color(tree.farbe);
    cc.offsetHSL(0, 0, Math.random() * 0.06 - 0.03);

    const cvBase = cv;

    // Crown slices
    for (let s = 0; s < numSlices; s++) {
      const t = s / (numSlices - 1);
      const sc = profileFn(t);
      const y = trunkH + t * crownH;

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
    cP[v3 + 1] = trunkH + crownH;
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
    cP[v3 + 1] = trunkH;
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
    const tR = Math.max(0.08, 0.15 * dScale * (tree.radius_max / 3));
    const tvBase = tv;

    const tc = trunkBaseCol.clone();
    tc.offsetHSL(0, 0, Math.random() * 0.04 - 0.02);

    for (let half = 0; half < 2; half++) {
      const y = half === 0 ? 0 : trunkH;
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
    tP[v3 + 1] = 0;
    tP[v3 + 2] = bz;
    tN[v3] = 0;
    tN[v3 + 1] = -1;
    tN[v3 + 2] = 0;
    tC[v3] = tc.r;
    tC[v3 + 1] = tc.g;
    tC[v3 + 2] = tc.b;
    v3 = tci * 3;
    tP[v3] = bx;
    tP[v3 + 1] = trunkH;
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

// ─────────────────────────────────────────────────────────────
//  Custom layer builder
// ─────────────────────────────────────────────────────────────

const DEFAULT_CENTER: [number, number] = [7.130127, 51.227527];

interface LoftCustomLayer extends CustomLayerInterface {
  camera: THREE.Camera;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  map: MaplibreMap;
  _crownMat: THREE.MeshLambertMaterial;
  _trunkMat: THREE.MeshLambertMaterial;
  _originMerc: MercatorCoordinate | null;
  _mScale: number;
  _treeData: LoftTreeData[];
  _heightScale: number;
  _diameterScale: number;
  _numSlices: number;
  _mapCenter: [number, number];
  _useLoft: boolean;
  _buildScene(): void;
}

export function buildLoftLayer(config: LoftLayerConfig = {}): LoftCustomLayer {
  const heightScale = config.heightScale ?? 1.0;
  const diameterScale = config.diameterScale ?? 1.0;
  const numSlices = config.numSlices ?? 14;
  const mapCenter = config.mapCenter ?? DEFAULT_CENTER;

  const layer: LoftCustomLayer = {
    id: "3d-trees-loft",
    type: "custom",
    renderingMode: "3d",

    camera: null!,
    scene: null!,
    renderer: null!,
    map: null!,
    _crownMat: null!,
    _trunkMat: null!,
    _originMerc: null,
    _mScale: 0,
    _treeData: [],
    _heightScale: heightScale,
    _diameterScale: diameterScale,
    _numSlices: numSlices,
    _mapCenter: mapCenter,
    _useLoft: true,

    onAdd(
      map: MaplibreMap,
      gl: WebGLRenderingContext | WebGL2RenderingContext
    ) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.map = map;

      // Lighting (same as instanced layer)
      const ambient = new THREE.AmbientLight(0xffffff, 0.55);
      this.scene.add(ambient);

      const sun = new THREE.DirectionalLight(0xfff8e8, 1.1);
      sun.position.set(100, 300, 150);
      this.scene.add(sun);

      const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35);
      fill.position.set(-80, 100, -60);
      this.scene.add(fill);

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;

      this._crownMat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
      });
      this._trunkMat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
      });
    },

    _buildScene() {
      // Remove old meshes (keep lights)
      const toRemove = this.scene.children.filter(
        (c): c is THREE.Mesh => (c as THREE.Mesh).isMesh === true
      );
      for (const m of toRemove) {
        m.geometry.dispose();
        this.scene.remove(m);
      }

      const originMerc = MercatorCoordinate.fromLngLat(this._mapCenter, 0);
      const mScale = originMerc.meterInMercatorCoordinateUnits();
      this._originMerc = originMerc;
      this._mScale = mScale;

      if (this._treeData.length === 0) return;

      // When loft is off, replace real rings with circles
      const treesForBuild = this._useLoft
        ? this._treeData
        : this._treeData.map((t) => ({
            ...t,
            ring: makeCircleRing(t.lng, t.lat, t.radius_max),
          }));

      // Filter out trees without ring data
      const treesWithRings = treesForBuild.filter(
        (t) => t.ring && t.ring.length >= 3
      );

      const result = buildMergedGeometry(
        treesWithRings,
        originMerc,
        mScale,
        this._heightScale,
        this._diameterScale,
        this._numSlices
      );

      if (result.treeCount > 0) {
        this.scene.add(new THREE.Mesh(result.crownGeo, this._crownMat));
        this.scene.add(new THREE.Mesh(result.trunkGeo, this._trunkMat));
      }
    },

    render(
      _gl: WebGLRenderingContext | WebGL2RenderingContext,
      options: CustomRenderMethodInput
    ) {
      if (!this._originMerc) return;

      const originMerc = this._originMerc;
      const mScale = this._mScale;

      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      const m = new THREE.Matrix4().fromArray(
        options.defaultProjectionData.mainMatrix as unknown as number[]
      );
      const l = new THREE.Matrix4()
        .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
        .scale(new THREE.Vector3(mScale, -mScale, mScale))
        .multiply(rotationX);

      this.camera.projectionMatrix = m.multiply(l);

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    },

    onRemove() {
      this.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) {
          (obj as THREE.Mesh).geometry.dispose();
        }
        const material = (obj as THREE.Mesh).material;
        if (material) {
          if (Array.isArray(material)) {
            material.forEach((mat) => mat.dispose());
          } else {
            material.dispose();
          }
        }
      });
      this._crownMat.dispose();
      this._trunkMat.dispose();
      this.renderer.dispose();
    },
  };

  return layer;
}

// ─────────────────────────────────────────────────────────────
//  Source sync helper
// ─────────────────────────────────────────────────────────────

export function syncLoftTreesFromSource(
  map: MaplibreMap,
  layer: LoftCustomLayer
): void {
  const features = map.querySourceFeatures(EINZELBAUMX_SOURCE, {
    sourceLayer: EINZELBAUMX_LAYER,
  });

  // Deduplicate (vector tiles return dupes at tile boundaries)
  const seen = new Set<string>();
  const unique = features.filter((f) => {
    const geom = f.geometry;
    if (!geom || geom.type !== "Point") return false;
    const coords = geom.coordinates as [number, number];
    const key = `${coords[0].toFixed(7)},${coords[1].toFixed(7)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const newData = loftTreesFromFeatures(unique);

  // Skip rebuild if feature count hasn't changed
  if (newData.length === layer._treeData.length && newData.length > 0) return;

  layer._treeData = newData;
  layer._buildScene();
  map.triggerRepaint();
}
