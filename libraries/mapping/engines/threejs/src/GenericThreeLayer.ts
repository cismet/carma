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
  config: Carma3dConfig,
) => FactoryStats;

// ─────────────────────────────────────────────────────────────
//  Generic custom layer (extends CustomLayerInterface)
// ─────────────────────────────────────────────────────────────

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
  _config: Carma3dConfig;
  _rebuildFn: RebuildFn;
  rebuild(): void;
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
  layerId = "3d-generic",
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
    _config: config,
    _rebuildFn: rebuildFn,

    onAdd(
      map: MaplibreMap,
      gl: WebGLRenderingContext | WebGL2RenderingContext,
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
        0,
      );
      const mScale = originMerc.meterInMercatorCoordinateUnits();
      this._originMerc = originMerc;
      this._mScale = mScale;

      this._stats = this._rebuildFn(
        this._features,
        this.scene,
        originMerc,
        mScale,
        this._config,
      );
      this._lastFeatureCount = this._features.length;
    },

    render(
      _gl: WebGLRenderingContext | WebGL2RenderingContext,
      options: CustomRenderMethodInput,
    ) {
      if (!this._originMerc) return;

      const originMerc = this._originMerc;
      const mScale = this._mScale;

      // Rotation PI/2 around X: THREE.js Y-up to Mercator Z-up
      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2,
      );

      const m = new THREE.Matrix4().fromArray(
        options.defaultProjectionData.mainMatrix as unknown as number[],
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
  radiusMix = 0,
): ThreePerfData | null {
  const config = layer._config;
  const features = map.querySourceFeatures(config.sourceId, {
    sourceLayer: config.sourceLayer,
  });

  const unique = deduplicateFeatures(features as never[]);
  const mapped = mapFeatures(unique, config, radiusMix);

  // Skip rebuild if neither feature count nor radius mix changed
  if (
    mapped.length === layer._features.length &&
    mapped.length > 0 &&
    radiusMix === layer._lastRadiusMix
  ) {
    return null;
  }

  layer._features = mapped;
  layer._lastRadiusMix = radiusMix;

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
