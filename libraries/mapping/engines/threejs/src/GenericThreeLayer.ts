import * as THREE from "three";
import type {
  Map as MaplibreMap,
  CustomLayerInterface,
  CustomRenderMethodInput,
} from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import type {
  Carma3dConfig,
  MappedFeature,
  FactoryStats,
  ThreePerfData,
} from "./types";
import { mapFeatures, deduplicateFeatures } from "./featureMapper";

// Wuppertal center as default Three.js origin
const WUPPERTAL_CENTER: [number, number] = [7.150764, 51.256915];

/** Resolve Three.js origin: config > env > Wuppertal default */
function resolveOrigin(config: Carma3dConfig): [number, number] {
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

/** Highlight color: bright cyan, stands out against green crowns and brown trunks */
const HIGHLIGHT_COLOR = new THREE.Color(0x00e5ff);

/** Saved state for restoring colors after unhighlight */
interface HighlightState {
  // Lathe (InstancedMesh) restore data
  instancedMeshes: THREE.InstancedMesh[];
  instanceId: number;
  instanceSavedColors: THREE.Color[];
  // Loft (merged Mesh) restore data
  vertexEntries: Array<{
    mesh: THREE.Mesh;
    vertexIndices: number[];
    savedColors: Float32Array; // flat r,g,b per vertex
  }>;
}

/** Result of a debug raycast against the 3D scene. */
export interface RaycastDebugResult {
  /** NDC coordinates used */
  ndc: { x: number; y: number };
  /** Total intersections found */
  intersectionCount: number;
  /** Details of each intersection */
  intersections: Array<{
    distance: number;
    objectType: string;
    instanceId?: number;
    faceIndex?: number | null;
  }>;
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

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    },

    raycast(screenX: number, screenY: number): RaycastDebugResult | null {
      if (!this._hasRendered || !this.map) {
        console.log("[3D-SELECT] raycast skipped: not yet rendered");
        return null;
      }

      const canvas = this.map.getCanvas();
      // MapLibre pixel coords use CSS pixels; canvas size is device pixels
      const rect = canvas.getBoundingClientRect();
      const ndcX = (screenX / rect.width) * 2 - 1;
      const ndcY = -(screenY / rect.height) * 2 + 1;

      console.log("[3D-SELECT] raycast input:", {
        screenX,
        screenY,
        canvasW: rect.width,
        canvasH: rect.height,
        ndcX: ndcX.toFixed(4),
        ndcY: ndcY.toFixed(4),
      });

      // Manually build ray from inverse MVP (base Camera doesn't support setFromCamera)
      const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(this.camera);
      const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(this.camera);
      const direction = far.sub(near).normalize();

      console.log("[3D-SELECT] ray:", {
        origin: `(${near.x.toFixed(2)}, ${near.y.toFixed(2)}, ${near.z.toFixed(2)})`,
        direction: `(${direction.x.toFixed(4)}, ${direction.y.toFixed(4)}, ${direction.z.toFixed(4)})`,
      });

      const raycaster = new THREE.Raycaster();
      raycaster.set(near, direction);

      // Log scene contents for debugging
      const meshChildren = this.scene.children.filter(
        (c) => (c as THREE.Mesh).isMesh || (c as THREE.InstancedMesh).isInstancedMesh,
      );
      console.log("[3D-SELECT] scene meshes:", meshChildren.length, "total children:", this.scene.children.length);

      const intersections = raycaster.intersectObjects(this.scene.children, true);

      const result: RaycastDebugResult = {
        ndc: { x: ndcX, y: ndcY },
        intersectionCount: intersections.length,
        intersections: intersections.slice(0, 5).map((isect) => ({
          distance: isect.distance,
          objectType: (isect.object as THREE.InstancedMesh).isInstancedMesh
            ? "InstancedMesh"
            : (isect.object as THREE.Mesh).isMesh
              ? "Mesh"
              : isect.object.type,
          instanceId: isect.instanceId,
          faceIndex: isect.faceIndex,
        })),
      };

      if (intersections.length > 0) {
        const firstHit = intersections[0];
        console.log(
          "[3D-SELECT] HIT!",
          result.intersectionCount,
          "intersections. Closest:",
          result.intersections[0],
        );

        // Resolve source feature: InstancedMesh (Lathe) or Mesh (Loft)
        const hitObj = firstHit.object;
        const ud = hitObj.userData ?? {};
        let srcIdx: number | undefined;

        if (ud.sourceIndices && firstHit.instanceId != null) {
          // Lathe: instanceId -> sourceIndices[instanceId]
          srcIdx = (ud.sourceIndices as number[])[firstHit.instanceId];
          console.log("[3D-SELECT] Lathe lookup: instanceId", firstHit.instanceId, "-> srcIdx", srcIdx);
        } else if (ud.faceRanges && firstHit.faceIndex != null) {
          // Loft: binary search faceRanges for faceIndex
          const ranges = ud.faceRanges as Array<{ faceStart: number; faceEnd: number; sourceIndex: number }>;
          const fi = firstHit.faceIndex;
          let lo = 0;
          let hi = ranges.length - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (fi < ranges[mid].faceStart) {
              hi = mid - 1;
            } else if (fi >= ranges[mid].faceEnd) {
              lo = mid + 1;
            } else {
              srcIdx = ranges[mid].sourceIndex;
              break;
            }
          }
          console.log("[3D-SELECT] Loft lookup: faceIndex", fi, "-> srcIdx", srcIdx);
        } else {
          console.log("[3D-SELECT] no sourceIndices or faceRanges on hit object");
        }

        if (srcIdx != null) {
          result.resolvedSourceIndex = srcIdx;
          const srcFeature = this._sourceFeatures[srcIdx];
          if (srcFeature) {
            result.sourceFeature = srcFeature;
            console.log(
              "[3D-SELECT] resolved source feature:",
              { id: srcFeature.id, source: srcFeature.source, sourceLayer: srcFeature.sourceLayer },
            );
            console.log("[3D-SELECT] feature properties:", srcFeature.properties);
          } else {
            console.log("[3D-SELECT] srcIdx", srcIdx, "but no source feature at that index (_sourceFeatures.length:", this._sourceFeatures.length, ")");
          }
        }
      } else {
        console.log("[3D-SELECT] no intersections");
      }

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

        // --- Loft path: regular Mesh with faceRanges ---
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) continue;
        const ranges = mesh.userData.faceRanges as
          | Array<{ faceStart: number; faceEnd: number; sourceIndex: number }>
          | undefined;
        if (!ranges) continue;

        const geom = mesh.geometry;
        const colorAttr = geom.getAttribute("color") as THREE.BufferAttribute | undefined;
        const indexAttr = geom.getIndex();
        if (!colorAttr || !indexAttr) continue;

        // Collect unique vertex indices for all matching face ranges
        const vertexSet = new Set<number>();
        for (const range of ranges) {
          if (range.sourceIndex !== sourceIndex) continue;
          const idxArray = indexAttr.array;
          for (let i = range.faceStart * 3; i < range.faceEnd * 3; i++) {
            vertexSet.add(idxArray[i]);
          }
        }
        if (vertexSet.size === 0) continue;

        const vertexIndices = Array.from(vertexSet);
        const savedColors = new Float32Array(vertexIndices.length * 3);
        const colorArray = colorAttr.array as Float32Array;

        // Save originals and write highlight color
        const hr = HIGHLIGHT_COLOR.r;
        const hg = HIGHLIGHT_COLOR.g;
        const hb = HIGHLIGHT_COLOR.b;
        for (let i = 0; i < vertexIndices.length; i++) {
          const vi = vertexIndices[i];
          const off = vi * 3;
          savedColors[i * 3] = colorArray[off];
          savedColors[i * 3 + 1] = colorArray[off + 1];
          savedColors[i * 3 + 2] = colorArray[off + 2];
          colorArray[off] = hr;
          colorArray[off + 1] = hg;
          colorArray[off + 2] = hb;
        }
        colorAttr.needsUpdate = true;

        vertexEntries.push({ mesh, vertexIndices, savedColors });
        console.log("[3D-SELECT] Loft highlight: mesh", mesh.name || "(unnamed)", "vertices:", vertexIndices.length);
      }

      if (instancedMeshes.length > 0 || vertexEntries.length > 0) {
        this._highlightState = {
          instancedMeshes,
          instanceId: foundInstanceId,
          instanceSavedColors,
          vertexEntries,
        };
        if (instancedMeshes.length > 0) {
          console.log("[3D-SELECT] Lathe highlighted sourceIndex", sourceIndex, "instanceId", foundInstanceId, "across", instancedMeshes.length, "meshes");
        }
        if (vertexEntries.length > 0) {
          console.log("[3D-SELECT] Loft highlighted sourceIndex", sourceIndex, "across", vertexEntries.length, "meshes");
        }
        this.map.triggerRepaint();
      }
    },

    unhighlight() {
      if (!this._highlightState) return;

      const { instancedMeshes, instanceId, instanceSavedColors, vertexEntries } =
        this._highlightState;

      // Restore Lathe (InstancedMesh) colors
      for (let i = 0; i < instancedMeshes.length; i++) {
        instancedMeshes[i].setColorAt(instanceId, instanceSavedColors[i]);
        instancedMeshes[i].instanceColor!.needsUpdate = true;
      }
      if (instancedMeshes.length > 0) {
        console.log("[3D-SELECT] unhighlighted Lathe instanceId", instanceId, "across", instancedMeshes.length, "meshes");
      }

      // Restore Loft (merged Mesh) vertex colors
      for (const entry of vertexEntries) {
        const colorArray = (
          entry.mesh.geometry.getAttribute("color") as THREE.BufferAttribute
        ).array as Float32Array;
        for (let i = 0; i < entry.vertexIndices.length; i++) {
          const off = entry.vertexIndices[i] * 3;
          colorArray[off] = entry.savedColors[i * 3];
          colorArray[off + 1] = entry.savedColors[i * 3 + 1];
          colorArray[off + 2] = entry.savedColors[i * 3 + 2];
        }
        (entry.mesh.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
      }
      if (vertexEntries.length > 0) {
        console.log("[3D-SELECT] unhighlighted Loft across", vertexEntries.length, "meshes");
      }

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

  // Skip rebuild if nothing changed
  if (
    mapped.length === layer._features.length &&
    mapped.length > 0 &&
    radiusMix === layer._lastRadiusMix &&
    hasTerrain === layer._lastTerrain
  ) {
    return null;
  }

  layer._features = mapped;
  layer._lastRadiusMix = radiusMix;
  layer._lastTerrain = hasTerrain;

  // Snapshot source features for selection forwarding (MapLibre may recycle objects)
  layer._sourceFeatures = (unique as Array<{
    id?: string | number;
    properties?: Record<string, unknown> | null;
    source?: string;
    sourceLayer?: string;
    geometry?: GeoJSON.Geometry | null;
  }>).map((f) => ({
    id: f.id,
    properties: { ...(f.properties ?? {}) },
    source: f.source ?? config.sourceId,
    sourceLayer: f.sourceLayer ?? config.sourceLayer,
    geometry: f.geometry ?? null,
  }));

  const t0 = performance.now();
  layer.rebuild();
  const syncMs = performance.now() - t0;

  map.triggerRepaint();

  return {
    mode: "generic",
    treeCount: layer._stats.treeCount,
    triangles: layer._stats.triangles,
    drawCalls: layer._stats.drawCalls,
    syncMs,
  };
}
