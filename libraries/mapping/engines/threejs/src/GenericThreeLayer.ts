import * as THREE from "three";
import type {
  Map as MaplibreMap,
  CustomLayerInterface,
  CustomRenderMethodInput,
} from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import type { SceneColorSnapshot, SceneDirectionalLightSnapshot } from "@carma/types";
import type {
  Carma3dConfig,
  MappedFeature,
  FactoryStats,
  ThreePerfData,
} from "./types";
import { mapFeatures, deduplicateFeatures } from "./featureMapper";

// Wuppertal center as default Three.js origin
const WUPPERTAL_CENTER: [number, number] = [7.150764, 51.256915];
const DEFAULT_MAIN_LIGHT_COLOR = 0xfff8e8;
const DEFAULT_MAIN_LIGHT_INTENSITY = 1.1;
const DEFAULT_MAIN_LIGHT_POSITION = new THREE.Vector3(100, 300, 150);
const DEFAULT_MAIN_LIGHT_DISTANCE = DEFAULT_MAIN_LIGHT_POSITION.length();

const applySceneColorSnapshot = (
  color: SceneColorSnapshot | undefined,
  target: THREE.Color,
  fallbackHex: number,
) => {
  if (!color) {
    target.setHex(fallbackHex);
    return;
  }

  target.setRGB(color.red, color.green, color.blue);
};

const applyMainDirectionalLight = (
  light: THREE.DirectionalLight,
  snapshot: SceneDirectionalLightSnapshot | undefined,
) => {
  const explicitPosition = snapshot?.positionWorld;
  const directionWorld = snapshot?.directionWorld;

  if (
    explicitPosition &&
    Number.isFinite(explicitPosition.x) &&
    Number.isFinite(explicitPosition.y) &&
    Number.isFinite(explicitPosition.z)
  ) {
    light.position.set(
      explicitPosition.x,
      explicitPosition.y,
      explicitPosition.z,
    );
  } else if (
    directionWorld &&
    Number.isFinite(directionWorld.x) &&
    Number.isFinite(directionWorld.y) &&
    Number.isFinite(directionWorld.z)
  ) {
    const emittedDirection = new THREE.Vector3(
      directionWorld.x,
      directionWorld.y,
      directionWorld.z,
    );
    if (emittedDirection.lengthSq() > 1e-6) {
      emittedDirection.normalize();
      light.position.copy(
        emittedDirection.multiplyScalar(-DEFAULT_MAIN_LIGHT_DISTANCE),
      );
    } else {
      light.position.copy(DEFAULT_MAIN_LIGHT_POSITION);
    }
  } else {
    light.position.copy(DEFAULT_MAIN_LIGHT_POSITION);
  }

  applySceneColorSnapshot(snapshot?.color, light.color, DEFAULT_MAIN_LIGHT_COLOR);
  light.intensity =
    typeof snapshot?.intensity === "number" && Number.isFinite(snapshot.intensity)
      ? snapshot.intensity
      : DEFAULT_MAIN_LIGHT_INTENSITY;
  light.target.position.set(0, 0, 0);
  light.target.updateMatrixWorld();
};

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

export interface GenericCustomLayer extends CustomLayerInterface {
  camera: THREE.Camera;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  map: MaplibreMap;
  _mainDirectionalLight: THREE.DirectionalLight;
  _originMerc: MercatorCoordinate | null;
  _mScale: number;
  _features: MappedFeature[];
  _stats: FactoryStats;
  _lastFeatureCount: number;
  _lastRadiusMix: number;
  _lastTerrain: boolean;
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
    _mainDirectionalLight: null!,
    _originMerc: null,
    _mScale: 0,
    _features: [],
    _stats: { treeCount: 0, triangles: 0, drawCalls: 0 },
    _lastFeatureCount: 0,
    _lastRadiusMix: -1,
    _lastTerrain: false,
    _config: config,
    _rebuildFn: rebuildFn,

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
        DEFAULT_MAIN_LIGHT_INTENSITY,
      );
      this._mainDirectionalLight = sun;
      applyMainDirectionalLight(
        sun,
        this._config.scene?.lighting?.mainDirectionalLight,
      );
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
    },

    render(
      _gl: WebGLRenderingContext | WebGL2RenderingContext,
      options: CustomRenderMethodInput
    ) {
      if (!this._originMerc) return;

      applyMainDirectionalLight(
        this._mainDirectionalLight,
        this._config.scene?.lighting?.mainDirectionalLight,
      );

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
