import { MercatorCoordinate } from "maplibre-gl";
import type {
  Map as MaplibreMap,
  CustomLayerInterface,
  CustomRenderMethodInput,
} from "maplibre-gl";
import * as THREE from "three";

import { mapFeatures, deduplicateFeatures } from "./featureMapper";
import type {
  Carma3dConfig,
  MappedFeature,
  FactoryStats,
  ThreePerfData,
} from "./types";
// ─────────────────────────────────────────────────────────────
//  2D spatial grid for fast tree selection (replaces BVH)
// ─────────────────────────────────────────────────────────────

/** Grid cell size in scene-local meters */
const GRID_CELL_SIZE = 20;

/** Entry in the spatial grid representing a single tree */
interface GridEntry {
  sourceIndex: number;
  /** Scene-local X position */
  x: number;
  /** Scene-local Z position */
  z: number;
  /** Scene-local Y base (bottom of trunk) */
  yBase: number;
  /** Total tree height */
  height: number;
  /** Crown radius in meters */
  radius: number;
}

type SpatialGrid = Map<string, GridEntry[]>;

// Reusable vectors for ray-triangle intersection (avoid allocations)
const _edge1 = new THREE.Vector3();
const _edge2 = new THREE.Vector3();
const _h = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Vector3();
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const RAY_TRI_EPS = 1e-6;

/**
 * Moeller-Trumbore ray-triangle intersection.
 * Returns the ray parameter t if hit, or -1 if miss.
 */
function rayTriangle(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3
): number {
  _edge1.subVectors(b, a);
  _edge2.subVectors(c, a);
  _h.crossVectors(dir, _edge2);
  const det = _edge1.dot(_h);
  if (det > -RAY_TRI_EPS && det < RAY_TRI_EPS) return -1;
  const invDet = 1 / det;
  _s.subVectors(origin, a);
  const u = invDet * _s.dot(_h);
  if (u < 0 || u > 1) return -1;
  _q.crossVectors(_s, _edge1);
  const v = invDet * dir.dot(_q);
  if (v < 0 || u + v > 1) return -1;
  const t = invDet * _edge2.dot(_q);
  return t > RAY_TRI_EPS ? t : -1;
}

// Reusable objects for Lathe raycast (avoid per-call allocations)
const _invMatrix = new THREE.Matrix4();
const _instanceMatrix = new THREE.Matrix4();
const _localOrigin = new THREE.Vector3();
const _localDir = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();

/**
 * Test ray against Lathe InstancedMesh candidates.
 * Transforms the ray into each candidate instance's local space
 * and tests the shared base geometry (~100-200 triangles).
 * Hit points are transformed back to world space for correct
 * depth comparison across instances.
 * Returns { sourceIndex, t } of the closest hit, or null.
 */
function raycastLatheCandidates(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  meshes: THREE.InstancedMesh[],
  candidateSourceIndices: Set<number>
): { sourceIndex: number; t: number } | null {
  let bestDistSq = Infinity;
  let bestSourceIndex: number | undefined;

  for (const im of meshes) {
    const indices = im.userData.sourceIndices as number[] | undefined;
    if (!indices) continue;

    const geo = im.geometry;
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const idx = geo.index?.array;
    if (!idx) continue;

    const faceCount = idx.length / 3;

    for (let instId = 0; instId < indices.length; instId++) {
      if (!candidateSourceIndices.has(indices[instId])) continue;

      // Get instance matrix and invert to transform ray into local space
      im.getMatrixAt(instId, _instanceMatrix);
      _invMatrix.copy(_instanceMatrix).invert();
      _localOrigin.copy(origin).applyMatrix4(_invMatrix);
      _localDir.copy(dir).transformDirection(_invMatrix);

      for (let f = 0; f < faceCount; f++) {
        const i0 = idx[f * 3] * 3;
        const i1 = idx[f * 3 + 1] * 3;
        const i2 = idx[f * 3 + 2] * 3;
        _v0.set(pos[i0], pos[i0 + 1], pos[i0 + 2]);
        _v1.set(pos[i1], pos[i1 + 1], pos[i1 + 2]);
        _v2.set(pos[i2], pos[i2 + 1], pos[i2 + 2]);

        const tLocal = rayTriangle(_localOrigin, _localDir, _v0, _v1, _v2);
        if (tLocal > 0) {
          // Compute hit in local space, transform back to world space,
          // measure squared distance from ray origin for correct depth ordering
          _hitPoint.copy(_localOrigin).addScaledVector(_localDir, tLocal);
          _hitPoint.applyMatrix4(_instanceMatrix);
          const distSq = _hitPoint.distanceToSquared(origin);
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestSourceIndex = indices[instId];
          }
        }
      }
    }
  }

  return bestSourceIndex != null
    ? { sourceIndex: bestSourceIndex, t: Math.sqrt(bestDistSq) }
    : null;
}

/**
 * Test ray against specific face ranges of a merged Loft mesh.
 * Returns { sourceIndex, t } of the closest hit, or null.
 */
function raycastLoftCandidates(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  mesh: THREE.Mesh,
  candidateSourceIndices: Set<number>
): { sourceIndex: number; t: number } | null {
  const faceRanges = mesh.userData.faceRanges as
    | Array<{ faceStart: number; faceEnd: number; sourceIndex: number }>
    | undefined;
  if (!faceRanges) return null;

  const geo = mesh.geometry;
  const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
  const pos = posAttr.array as Float32Array;
  const idx = geo.index?.array;
  if (!idx) return null;

  let bestT = Infinity;
  let bestSourceIndex: number | undefined;

  for (const range of faceRanges) {
    if (!candidateSourceIndices.has(range.sourceIndex)) continue;

    for (let f = range.faceStart; f < range.faceEnd; f++) {
      const i0 = idx[f * 3] * 3;
      const i1 = idx[f * 3 + 1] * 3;
      const i2 = idx[f * 3 + 2] * 3;
      _v0.set(pos[i0], pos[i0 + 1], pos[i0 + 2]);
      _v1.set(pos[i1], pos[i1 + 1], pos[i1 + 2]);
      _v2.set(pos[i2], pos[i2 + 1], pos[i2 + 2]);

      const t = rayTriangle(origin, dir, _v0, _v1, _v2);
      if (t > 0 && t < bestT) {
        bestT = t;
        bestSourceIndex = range.sourceIndex;
      }
    }
  }

  return bestSourceIndex != null
    ? { sourceIndex: bestSourceIndex, t: bestT }
    : null;
}

// Wuppertal center as default Three.js origin
const WUPPERTAL_CENTER: [number, number] = [7.150764, 51.256915];
const DEFAULT_MAIN_LIGHT_COLOR = 0xfff8e8;
const DEFAULT_MAIN_LIGHT_INTENSITY = 1.1;
const DEFAULT_MAIN_LIGHT_POSITION = new THREE.Vector3(100, 300, 150);

/** Resolve Three.js origin: config > env > Wuppertal default */
export function resolveOrigin(config: Carma3dConfig): [number, number] {
  if (config.mapCenter) return config.mapCenter;
  try {
    const env = (import.meta as any).env?.VITE_THREEJS_ORIGIN;
    if (typeof env === "string") {
      const [lng, lat] = env.split(",").map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
    }
  } catch {
    // env not available (e.g. SSR or test)
  }
  return WUPPERTAL_CENTER;
}

// ─────────────────────────────────────────────────────────────
//  Factory function signature (LatheFactory / LoftFactory)
// ─────────────────────────────────────────────────────────────

export type RebuildFn = (
  features: MappedFeature[],
  scene: THREE.Scene,
  originMerc: MercatorCoordinate,
  mScale: number,
  config: Carma3dConfig
) => FactoryStats;

// ─────────────────────────────────────────────────────────────
//  Generic custom layer (extends CustomLayerInterface)
// ─────────────────────────────────────────────────────────────

/** Highlight color: CARMA selection blue */
const HIGHLIGHT_COLOR = new THREE.Color(0x3a7ceb);

/** Saved state for restoring colors after unhighlight */
interface HighlightState {
  // Lathe (InstancedMesh) restore data
  instancedMeshes: THREE.InstancedMesh[];
  instanceId: number;
  instanceSavedColors: THREE.Color[];
  // Loft (merged Mesh) restore data: vertex ranges per mesh (colors restored from stashed buffer)
  vertexEntries: Array<{
    mesh: THREE.Mesh;
    ranges: Array<{ vertexStart: number; vertexEnd: number }>;
  }>;
}

/** Result of a debug raycast against the 3D scene. */
export interface RaycastDebugResult {
  /** NDC coordinates used */
  ndc: { x: number; y: number };
  /** Number of grid candidates checked */
  candidates: number;
  /** Distance from ray to the hit tree's axis (meters) */
  hitDistance?: number;
  /** Resolved source feature (if the hit could be mapped back) */
  sourceFeature?: SourceFeatureData;
  /** Resolved source index into _sourceFeatures (for highlight) */
  resolvedSourceIndex?: number;
}

export interface GenericCustomLayer extends CustomLayerInterface {
  camera: THREE.Camera;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  map: MaplibreMap;
  _originMerc: MercatorCoordinate | null;
  _mScale: number;
  _features: MappedFeature[];
  _stats: FactoryStats;
  _lastFeatureCount: number;
  _lastRadiusMix: number;
  _lastTerrain: boolean;
  _config: Carma3dConfig;
  _rebuildFn: RebuildFn;
  _hasRendered: boolean;
  /** Raw source features (from querySourceFeatures, deduplicated). Parallel to _features via _sourceIndex. */
  _sourceFeatures: SourceFeatureData[];
  /** Current highlight state (for restoring colors on unhighlight) */
  _highlightState: HighlightState | null;
  /** 2D spatial grid for fast tree selection by ray-axis distance */
  _spatialGrid: SpatialGrid;
  rebuild(): void;
  /** Debug raycast: test a screen point against the 3D scene. */
  raycast(screenX: number, screenY: number): RaycastDebugResult | null;
  /** Highlight all instanced mesh parts (crown + trunk) for a given sourceIndex */
  highlight(sourceIndex: number): void;
  /** Restore previously highlighted instances to their original colors */
  unhighlight(): void;
}

/** Minimal snapshot of a source feature for selection forwarding. */
export interface SourceFeatureData {
  id: string | number | undefined;
  properties: Record<string, unknown>;
  source: string;
  sourceLayer: string;
  geometry: GeoJSON.Geometry | null;
}

/**
 * Build a generic 3D custom layer for MapLibre.
 *
 * @param config    - Carma3dConfig driving field mapping and visuals
 * @param rebuildFn - factory that populates the THREE scene from features
 * @param layerId   - unique MapLibre layer id
 */
export function buildGenericLayer(
  config: Carma3dConfig,
  rebuildFn: RebuildFn,
  layerId = "3d-generic"
): GenericCustomLayer {
  const layer: GenericCustomLayer = {
    id: layerId,
    type: "custom",
    renderingMode: "3d",

    camera: null!,
    scene: null!,
    renderer: null!,
    map: null!,
    _originMerc: null,
    _mScale: 0,
    _features: [],
    _stats: { treeCount: 0, triangles: 0, drawCalls: 0 },
    _lastFeatureCount: 0,
    _lastRadiusMix: -1,
    _lastTerrain: false,
    _config: config,
    _rebuildFn: rebuildFn,
    _hasRendered: false,
    _sourceFeatures: [],
    _highlightState: null,
    _spatialGrid: new Map(),

    onAdd(
      map: MaplibreMap,
      gl: WebGLRenderingContext | WebGL2RenderingContext
    ) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.map = map;

      // Lighting (matches original tree layers)
      const ambient = new THREE.AmbientLight(0xffffff, 0.55);
      this.scene.add(ambient);

      const sun = new THREE.DirectionalLight(
        DEFAULT_MAIN_LIGHT_COLOR,
        DEFAULT_MAIN_LIGHT_INTENSITY
      );
      sun.position.copy(DEFAULT_MAIN_LIGHT_POSITION);
      this.scene.add(sun);
      this.scene.add(sun.target);

      const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35);
      fill.position.set(-80, 100, -60);
      this.scene.add(fill);

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;
    },

    rebuild() {
      const originMerc = MercatorCoordinate.fromLngLat(
        resolveOrigin(this._config),
        0
      );
      const mScale = originMerc.meterInMercatorCoordinateUnits();
      this._originMerc = originMerc;
      this._mScale = mScale;

      this._stats = this._rebuildFn(
        this._features,
        this.scene,
        originMerc,
        mScale,
        this._config
      );
      this._lastFeatureCount = this._features.length;

      // Build 2D spatial grid for fast raycast selection
      const grid: SpatialGrid = new Map();
      for (const f of this._features) {
        const mrc = MercatorCoordinate.fromLngLat([f.lng, f.lat], f.elevation);
        const x = (mrc.x - originMerc.x) / mScale;
        const z = (mrc.y - originMerc.y) / mScale;
        const yBase = (mrc.z - originMerc.z) / mScale;

        const entry: GridEntry = {
          sourceIndex: f._sourceIndex,
          x,
          z,
          yBase,
          height: f.heightMax,
          radius: f.radiusMax,
        };

        const cellX = Math.floor(x / GRID_CELL_SIZE);
        const cellZ = Math.floor(z / GRID_CELL_SIZE);
        const key = `${cellX},${cellZ}`;
        const bucket = grid.get(key);
        if (bucket) {
          bucket.push(entry);
        } else {
          grid.set(key, [entry]);
        }
      }
      this._spatialGrid = grid;
    },

    render(
      _gl: WebGLRenderingContext | WebGL2RenderingContext,
      options: CustomRenderMethodInput
    ) {
      if (!this._originMerc) return;

      const originMerc = this._originMerc;
      const mScale = this._mScale;

      // Rotation PI/2 around X: THREE.js Y-up to Mercator Z-up
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
      this.camera.projectionMatrixInverse
        .copy(this.camera.projectionMatrix)
        .invert();
      this._hasRendered = true;

      const gl = _gl;

      // Save MapLibre's depth range before Three.js resets GL state.
      // Three.js resetState() disables depth test; its render() re-enables it
      // but may use a default depth range that differs from MapLibre's 3D range.
      const savedDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;

      // Disable frustum culling on all scene objects: the base Camera's
      // projection matrix comes from MapLibre and the default bounding-sphere
      // test incorrectly culls InstancedMesh crowns at steep tilt angles.
      this.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);

      // Restore MapLibre's depth range so subsequent symbol layers
      // test against the same depth space the trees wrote to.
      gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
    },

    raycast(screenX: number, screenY: number): RaycastDebugResult | null {
      if (!this._hasRendered || !this.map) {
        console.log("[3D-SELECT] raycast skipped: not yet rendered");
        return null;
      }

      const canvas = this.map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const ndcX = (screenX / rect.width) * 2 - 1;
      const ndcY = -(screenY / rect.height) * 2 + 1;

      // Build ray from inverse MVP (base Camera doesn't support setFromCamera)
      const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(this.camera);
      const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(this.camera);
      const dir = far.sub(near).normalize();

      // Two-phase raycast (same approach for Lathe and Loft):
      // 1. Spatial grid cylinder pre-filter -> ~30-40 candidate sourceIndices
      // 2. Precise Moeller-Trumbore ray-triangle on candidate geometry only

      let candidates = 0;
      let bestSourceIndex: number | undefined;
      let bestT = Infinity;

      if (this._spatialGrid.size > 0 && Math.abs(dir.y) > 1e-6) {
        // Find Y extent of all trees in the grid
        let minY = Infinity;
        let maxY = -Infinity;
        for (const bucket of this._spatialGrid.values()) {
          for (const entry of bucket) {
            if (entry.yBase < minY) minY = entry.yBase;
            const top = entry.yBase + entry.height;
            if (top > maxY) maxY = top;
          }
        }

        // Compute t values where ray enters/exits the Y range
        let t1 = (minY - near.y) / dir.y;
        let t2 = (maxY - near.y) / dir.y;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        t1 = Math.max(t1, 0);

        if (t2 > 0) {
          const x1 = near.x + t1 * dir.x;
          const z1 = near.z + t1 * dir.z;
          const x2 = near.x + t2 * dir.x;
          const z2 = near.z + t2 * dir.z;

          const minCellX = Math.floor(Math.min(x1, x2) / GRID_CELL_SIZE) - 1;
          const maxCellX = Math.floor(Math.max(x1, x2) / GRID_CELL_SIZE) + 1;
          const minCellZ = Math.floor(Math.min(z1, z2) / GRID_CELL_SIZE) - 1;
          const maxCellZ = Math.floor(Math.max(z1, z2) / GRID_CELL_SIZE) + 1;

          // Collect candidate sourceIndices from the grid (cylinder pre-filter)
          const candidateSet = new Set<number>();
          for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cz = minCellZ; cz <= maxCellZ; cz++) {
              const key = `${cx},${cz}`;
              const bucket = this._spatialGrid.get(key);
              if (!bucket) continue;

              for (const entry of bucket) {
                const ox = near.x - entry.x;
                const oz = near.z - entry.z;
                const a = dir.x * dir.x + dir.z * dir.z;
                if (a < 1e-10) continue;
                const bv = 2 * (ox * dir.x + oz * dir.z);
                const cv = ox * ox + oz * oz - entry.radius * entry.radius;
                const disc = bv * bv - 4 * a * cv;
                if (disc < 0) continue;
                candidateSet.add(entry.sourceIndex);
              }
            }
          }
          candidates = candidateSet.size;

          // Precise ray-triangle on candidate geometry
          for (const child of this.scene.children) {
            // Loft: merged Mesh with faceRanges
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh && mesh.userData.faceRanges) {
              const loftHit = raycastLoftCandidates(
                near,
                dir,
                mesh,
                candidateSet
              );
              if (loftHit && loftHit.t < bestT) {
                bestT = loftHit.t;
                bestSourceIndex = loftHit.sourceIndex;
              }
              continue;
            }

            // Lathe: InstancedMesh with sourceIndices
            const im = child as THREE.InstancedMesh;
            if (im.isInstancedMesh) {
              const latheHit = raycastLatheCandidates(
                near,
                dir,
                [im],
                candidateSet
              );
              if (latheHit && latheHit.t < bestT) {
                bestT = latheHit.t;
                bestSourceIndex = latheHit.sourceIndex;
              }
            }
          }
        }
      }

      const result: RaycastDebugResult = {
        ndc: { x: ndcX, y: ndcY },
        candidates,
      };

      if (bestSourceIndex != null) {
        result.resolvedSourceIndex = bestSourceIndex;
        result.hitDistance = bestT;
        const srcFeature = this._sourceFeatures[bestSourceIndex];
        if (srcFeature) {
          result.sourceFeature = srcFeature;
          // [3D-SELECT] HIT log suppressed
        }
      } else {
        // [3D-SELECT] no hit log suppressed
      }

      // [3D-PERF] raycast log suppressed

      return result;
    },

    highlight(sourceIndex: number) {
      this.unhighlight();

      const instancedMeshes: THREE.InstancedMesh[] = [];
      const instanceSavedColors: THREE.Color[] = [];
      let foundInstanceId = -1;

      const vertexEntries: HighlightState["vertexEntries"] = [];

      for (const child of this.scene.children) {
        // --- Lathe path: InstancedMesh with sourceIndices ---
        const im = child as THREE.InstancedMesh;
        if (im.isInstancedMesh) {
          const indices = im.userData.sourceIndices as number[] | undefined;
          if (!indices) continue;

          const instId = indices.indexOf(sourceIndex);
          if (instId === -1) continue;

          foundInstanceId = instId;

          const original = new THREE.Color();
          im.getColorAt(instId, original);
          instanceSavedColors.push(original.clone());

          im.setColorAt(instId, HIGHLIGHT_COLOR);
          im.instanceColor!.needsUpdate = true;
          instancedMeshes.push(im);
          continue;
        }

        // --- Loft path: regular Mesh with sourceIndexMap (fast vertex-range highlight) ---
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) continue;
        const srcMap = mesh.userData.sourceIndexMap as
          | Map<number, Array<{ vertexStart: number; vertexEnd: number }>>
          | undefined;
        if (!srcMap) continue;

        const vRanges = srcMap.get(sourceIndex);
        if (!vRanges || vRanges.length === 0) continue;

        const colorAttr = mesh.geometry.getAttribute("color") as
          | THREE.BufferAttribute
          | undefined;
        if (!colorAttr) continue;
        const colorArray = colorAttr.array as Float32Array;

        const hr = HIGHLIGHT_COLOR.r;
        const hg = HIGHLIGHT_COLOR.g;
        const hb = HIGHLIGHT_COLOR.b;
        let totalVerts = 0;
        for (const range of vRanges) {
          const start = range.vertexStart * 3;
          const end = range.vertexEnd * 3;
          for (let off = start; off < end; off += 3) {
            colorArray[off] = hr;
            colorArray[off + 1] = hg;
            colorArray[off + 2] = hb;
          }
          totalVerts += range.vertexEnd - range.vertexStart;
        }
        colorAttr.needsUpdate = true;

        vertexEntries.push({ mesh, ranges: vRanges });
        // [3D-SELECT] Loft highlight detail log suppressed
      }

      if (instancedMeshes.length > 0 || vertexEntries.length > 0) {
        this._highlightState = {
          instancedMeshes,
          instanceId: foundInstanceId,
          instanceSavedColors,
          vertexEntries,
        };
        if (instancedMeshes.length > 0) {
          // [3D-SELECT] Lathe highlight log suppressed
        }
        if (vertexEntries.length > 0) {
          // [3D-SELECT] Loft highlight log suppressed
        }
        // [3D-PERF] highlight log suppressed
        this.map.triggerRepaint();
      }
    },

    unhighlight() {
      if (!this._highlightState) return;

      const {
        instancedMeshes,
        instanceId,
        instanceSavedColors,
        vertexEntries,
      } = this._highlightState;

      // Restore Lathe (InstancedMesh) colors
      for (let i = 0; i < instancedMeshes.length; i++) {
        instancedMeshes[i].setColorAt(instanceId, instanceSavedColors[i]);
        instancedMeshes[i].instanceColor!.needsUpdate = true;
      }
      if (instancedMeshes.length > 0) {
        // [3D-SELECT] unhighlight Lathe log suppressed
      }

      // Restore Loft (merged Mesh) vertex colors: only the highlighted ranges
      for (const entry of vertexEntries) {
        const origColors = entry.mesh.userData.originalColors as
          | Float32Array
          | undefined;
        if (!origColors) continue;
        const colorAttr = entry.mesh.geometry.getAttribute(
          "color"
        ) as THREE.BufferAttribute;
        const colorArray = colorAttr.array as Float32Array;
        for (const range of entry.ranges) {
          const start = range.vertexStart * 3;
          const end = range.vertexEnd * 3;
          colorArray.set(origColors.subarray(start, end), start);
        }
        colorAttr.needsUpdate = true;
      }
      if (vertexEntries.length > 0) {
        // [3D-SELECT] unhighlight Loft log suppressed
      }

      // [3D-PERF] unhighlight log suppressed
      this._highlightState = null;
      this.map.triggerRepaint();
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
      this.renderer.dispose();
    },
  };

  return layer;
}

/**
 * Build a lightweight overlay custom layer that re-renders the same 3D scene.
 * Insert this AFTER symbol layers so it paints trees over any labels
 * that should be occluded. The main layer renders before fill-extrusion
 * (for building transparency), this overlay handles label occlusion.
 */
export function buildOverlayLayer(
  mainLayer: GenericCustomLayer,
  overlayId = "3d-generic-overlay"
): maplibregl.CustomLayerInterface {
  return {
    id: overlayId,
    type: "custom" as const,
    renderingMode: "3d" as const,

    onAdd() {
      // No-op: shares main layer's renderer/scene/camera
    },

    render(
      _gl: WebGLRenderingContext | WebGL2RenderingContext,
      options: CustomRenderMethodInput
    ) {
      if (!mainLayer._originMerc || !mainLayer.renderer) return;

      const originMerc = mainLayer._originMerc;
      const mScale = mainLayer._mScale;

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

      mainLayer.camera.projectionMatrix = m.multiply(l);
      mainLayer.camera.projectionMatrixInverse
        .copy(mainLayer.camera.projectionMatrix)
        .invert();

      mainLayer.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });
      mainLayer.renderer.resetState();
      mainLayer.renderer.render(mainLayer.scene, mainLayer.camera);
    },

    onRemove() {
      // No-op: main layer owns the resources
    },
  };
}

// ─────────────────────────────────────────────────────────────
//  Source sync helper
// ─────────────────────────────────────────────────────────────

/**
 * Query features from the map source, deduplicate, map fields,
 * and rebuild the 3D layer if the data changed.
 *
 * Returns perf data on rebuild, or null if no rebuild was needed.
 */
export function syncGenericLayerFromSource(
  map: MaplibreMap,
  layer: GenericCustomLayer,
  radiusMix = 0
): ThreePerfData | null {
  const config = layer._config;
  const features = map.querySourceFeatures(config.sourceId, {
    sourceLayer: config.sourceLayer,
  });
  const unique = deduplicateFeatures(features as never[]);
  const mapped = mapFeatures(unique, config, radiusMix);

  // Only apply elevation when terrain is active
  const hasTerrain = map.getTerrain() != null;
  if (!hasTerrain) {
    for (const f of mapped) {
      f.elevation = 0;
    }
  }

  // Optionally filter to viewport bounds to avoid building geometry
  // for thousands of off-screen features from pre-fetched tiles
  let visible: MappedFeature[];
  if (config.viewportPadding != null) {
    const bounds = map.getBounds();
    const lngPad =
      (bounds.getEast() - bounds.getWest()) * config.viewportPadding;
    const latPad =
      (bounds.getNorth() - bounds.getSouth()) * config.viewportPadding;
    const west = bounds.getWest() - lngPad;
    const east = bounds.getEast() + lngPad;
    const south = bounds.getSouth() - latPad;
    const north = bounds.getNorth() + latPad;

    visible = mapped.filter(
      (f) => f.lng >= west && f.lng <= east && f.lat >= south && f.lat <= north
    );
  } else {
    visible = mapped;
  }

  // Skip rebuild if nothing changed
  if (
    visible.length === layer._features.length &&
    visible.length > 0 &&
    radiusMix === layer._lastRadiusMix &&
    hasTerrain === layer._lastTerrain
  ) {
    return null;
  }

  layer._features = visible;
  layer._lastRadiusMix = radiusMix;
  layer._lastTerrain = hasTerrain;

  // Snapshot source features for selection forwarding (MapLibre may recycle objects)
  layer._sourceFeatures = (
    unique as Array<{
      id?: string | number;
      properties?: Record<string, unknown> | null;
      source?: string;
      sourceLayer?: string;
      geometry?: GeoJSON.Geometry | null;
    }>
  ).map((f) => ({
    id: f.id,
    properties: { ...(f.properties ?? {}) },
    source: f.source ?? config.sourceId,
    sourceLayer: f.sourceLayer ?? config.sourceLayer,
    geometry: f.geometry ?? null,
  }));

  const t0 = performance.now();
  layer.rebuild();
  const rebuildMs = performance.now() - t0;

  map.triggerRepaint();

  // [3D-PERF] sync log suppressed (fires on every moveend/idle)

  return {
    mode: "generic",
    treeCount: layer._stats.treeCount,
    sourceCount: mapped.length,
    triangles: layer._stats.triangles,
    drawCalls: layer._stats.drawCalls,
    syncMs: rebuildMs,
  };
}
