import type { Latitude, Longitude } from "@carma-geo/data-structures";
import { getGcg2016HeightAnomaly } from "@carma-geo/proj";
import {
  normalizePropertyExpression,
  v8,
  type StylePropertyExpression,
} from "@maplibre/maplibre-gl-style-spec";
import type {
  MapGeoJSONFeature,
  MapSourceDataEvent,
  Map as MaplibreMap,
  Point,
} from "maplibre-gl";
import * as THREE from "three";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import { registerClickHitProvider } from "../../../utils/clickHitProviders";
import {
  metersPerPixelAt,
  readPointCloudElevationConfig,
  type PointCloudElevationConfig,
} from "../../core/pointcloud-elevation-config";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
} from "../../core/shared-three-scene-types";
import { registerSharedThreeSceneRuntime } from "./shared-three-scene-content-registry";
import { acquireSharedThreeScene } from "./shared-three-scene-registry";

// ─────────────────────────────────────────────────────────────
//  Symbols lifted onto a point cloud, see pointcloud-elevation-config.
//
//  While active, every symbol layer carrying `pointcloudElevation` is drawn
//  in the shared three.js scene at the height its features carry, and the
//  2D layer is faded to nearly zero opacity. Faded, not hidden: it keeps
//  answering queries, which is how a click on a lifted icon resolves to its
//  feature (the same trick TiltedModels uses). The icon's image, size,
//  rotation and opacity are evaluated from the 2D layer's own style values,
//  feature-state included, so a selection highlight carries over.
// ─────────────────────────────────────────────────────────────

/** Not zero: a layer at zero opacity is dropped from the click hits. */
const FADED_OPACITY = 0.00001;
const FADED_PROPERTIES = ["icon-opacity", "text-opacity"] as const;
/** Instances below this evaluated opacity are not drawn. */
const MIN_DRAWN_OPACITY = 0.01;
/** Smallest click radius around a lifted icon, CSS pixels. */
const MIN_PICK_RADIUS_PX = 10;
const RENDER_ORDER = 1000;

type IconFeature = {
  id: string | number;
  lngLat: [number, number];
  /** height in the feature's datum, offset already applied */
  height: number;
  properties: Record<string, unknown>;
  imageName: string;
};

type IconMesh = {
  imageName: string;
  mesh: THREE.InstancedMesh;
  texture: THREE.DataTexture;
  material: THREE.MeshBasicMaterial;
  /** image size in CSS pixels at icon-size 1 */
  widthPx: number;
  heightPx: number;
  features: IconFeature[];
};

type Expressions = {
  image: StylePropertyExpression;
  size: StylePropertyExpression;
  rotate: StylePropertyExpression;
  opacity: StylePropertyExpression;
};

type LayerEntry = {
  layerId: string;
  sourceId: string;
  sourceLayer?: string;
  config: PointCloudElevationConfig;
  /** paint values as the style had them before the fade */
  savedPaint: Map<string, unknown> | null;
  expressions: Expressions | null;
  expressionKey: string;
  featureKey: string;
  group: THREE.Group;
  meshes: IconMesh[];
};

/** Where an instance was last drawn, for picking. */
type DrawnIcon = {
  entry: LayerEntry;
  feature: IconFeature;
  scenePosition: THREE.Vector3;
  radiusPx: number;
};

export type PointCloudElevatedSymbols = {
  setActive: (active: boolean) => void;
  dispose: () => void;
};

/** The style's own layer id, without the "<layer-id>-" prefix a merge adds. */
const ownLayerId = (layerId: string, prefix?: unknown): string =>
  typeof prefix === "string" && layerId.startsWith(`${prefix}-`)
    ? layerId.slice(prefix.length + 1)
    : layerId;

const mapIsUsable = (map: MaplibreMap): boolean => {
  const candidate = map as unknown as { _removed?: boolean; style?: unknown };
  return !candidate._removed && !!candidate.style;
};

const spec = v8 as {
  layout_symbol: Record<string, never>;
  paint_symbol: Record<string, never>;
};

const buildExpression = (
  value: unknown,
  specification: never,
  fallback: unknown
): StylePropertyExpression => {
  try {
    return normalizePropertyExpression(
      (value ?? fallback) as never,
      specification
    );
  } catch {
    return normalizePropertyExpression(fallback as never, specification);
  }
};

const imageNameOf = (value: unknown): string | null => {
  if (typeof value === "string") return value || null;
  const name = (value as { name?: unknown } | null)?.name;
  return typeof name === "string" && name.length > 0 ? name : null;
};

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** A style image as a texture, rows flipped to GL order. */
const textureFromImage = (
  image: NonNullable<ReturnType<MaplibreMap["getImage"]>>
): THREE.DataTexture => {
  const { width, height, data } = image.data;
  const flipped = new Uint8Array(width * height * 4);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row++) {
    flipped.set(
      data.subarray(row * rowBytes, (row + 1) * rowBytes),
      (height - 1 - row) * rowBytes
    );
  }
  const texture = new THREE.DataTexture(
    flipped,
    width,
    height,
    THREE.RGBAFormat
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

/** A unit quad lying flat, its texture top pointing north (scene -Z). */
const createFlatQuad = (): THREE.PlaneGeometry => {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
};

export const startPointCloudElevatedSymbols = (
  map: MaplibreMap
): PointCloudElevatedSymbols => {
  const lease = acquireSharedThreeScene(map);
  const root = new THREE.Group();
  root.name = "pointcloud-elevated-symbols";
  const geometry = createFlatQuad();
  const entries = new Map<string, LayerEntry>();

  let active = false;
  let disposed = false;
  let camera: THREE.Camera | null = null;
  let drawn: DrawnIcon[] = [];
  /** ellipsoidal height of DHHN zero near the features; null until known */
  let heightAnomaly: number | null = null;
  let anomalyRequested = false;
  let collectScheduled: ReturnType<typeof setTimeout> | null = null;

  const needsAnomaly = () =>
    [...entries.values()].some(
      (entry) => entry.config.verticalDatum === "ellipsoidal"
    );

  /** Ready to draw: heights can be put into the scene's DHHN frame. */
  const isReady = () => heightAnomaly !== null || !needsAnomaly();

  const layerShown = (entry: LayerEntry, zoom: number): boolean => {
    const layer = map.getLayer(entry.layerId);
    if (!layer) return false;
    if (map.getLayoutProperty(entry.layerId, "visibility") === "none") {
      return false;
    }
    if (typeof layer.minzoom === "number" && zoom < layer.minzoom) return false;
    if (typeof layer.maxzoom === "number" && zoom >= layer.maxzoom) {
      return false;
    }
    return true;
  };

  // ── fading the 2D layers ──────────────────────────────────

  /** A paint value as the style has it, ahead of our fade. */
  const bakedPaint = (entry: LayerEntry, property: string): unknown =>
    entry.savedPaint?.has(property)
      ? entry.savedPaint.get(property)
      : map.getPaintProperty(entry.layerId, property);

  const fade = (entry: LayerEntry) => {
    if (!map.getLayer(entry.layerId)) return;
    const saved = entry.savedPaint ?? new Map<string, unknown>();
    for (const property of FADED_PROPERTIES) {
      const current = map.getPaintProperty(entry.layerId, property);
      if (current === FADED_OPACITY) continue;
      // first fade, or a style diff put the style's value back since
      saved.set(property, current);
      map.setPaintProperty(entry.layerId, property, FADED_OPACITY);
    }
    entry.savedPaint = saved;
  };

  const restore = (entry: LayerEntry) => {
    const saved = entry.savedPaint;
    entry.savedPaint = null;
    if (!saved || !map.getLayer(entry.layerId)) return;
    for (const [property, value] of saved) {
      if (map.getPaintProperty(entry.layerId, property) === FADED_OPACITY) {
        map.setPaintProperty(entry.layerId, property, value as never);
      }
    }
  };

  const applyFades = () => {
    if (!mapIsUsable(map)) return;
    const lifted = active && isReady();
    for (const entry of entries.values()) {
      if (lifted) fade(entry);
      else restore(entry);
    }
  };

  // ── expressions from the 2D layer ─────────────────────────

  const ensureExpressions = (entry: LayerEntry): Expressions => {
    const values = {
      image: map.getLayoutProperty(entry.layerId, "icon-image"),
      size: map.getLayoutProperty(entry.layerId, "icon-size"),
      rotate: map.getLayoutProperty(entry.layerId, "icon-rotate"),
      opacity: bakedPaint(entry, "icon-opacity"),
    };
    const key = JSON.stringify(values);
    if (entry.expressions && entry.expressionKey === key) {
      return entry.expressions;
    }
    entry.expressionKey = key;
    entry.expressions = {
      image: buildExpression(
        values.image,
        spec.layout_symbol["icon-image"],
        ""
      ),
      size: buildExpression(values.size, spec.layout_symbol["icon-size"], 1),
      rotate: buildExpression(
        values.rotate,
        spec.layout_symbol["icon-rotate"],
        0
      ),
      opacity: buildExpression(
        values.opacity,
        spec.paint_symbol["icon-opacity"],
        1
      ),
    };
    // the image grouping depends on the image expression
    entry.featureKey = "";
    return entry.expressions;
  };

  // ── layers and features ───────────────────────────────────

  const disposeMeshes = (entry: LayerEntry) => {
    for (const iconMesh of entry.meshes) {
      entry.group.remove(iconMesh.mesh);
      iconMesh.mesh.dispose();
      iconMesh.material.dispose();
      iconMesh.texture.dispose();
    }
    entry.meshes = [];
  };

  const removeEntry = (entry: LayerEntry) => {
    restore(entry);
    disposeMeshes(entry);
    root.remove(entry.group);
    entries.delete(entry.layerId);
  };

  const scanLayers = () => {
    if (!mapIsUsable(map)) return;
    let order: string[] = [];
    try {
      order = map.getLayersOrder();
    } catch {
      return;
    }
    const seen = new Set<string>();
    for (const layerId of order) {
      const layer = map.getLayer(layerId);
      if (!layer) continue;
      const config = readPointCloudElevationConfig({
        type: layer.type,
        metadata: layer.metadata,
      });
      const sourceId = (layer as { source?: unknown }).source;
      if (!config || typeof sourceId !== "string") continue;
      seen.add(layerId);
      const sourceLayer = (layer as { sourceLayer?: unknown }).sourceLayer;
      const existing = entries.get(layerId);
      if (existing) {
        existing.config = config;
        continue;
      }
      const group = new THREE.Group();
      group.name = `elevated-symbols:${layerId}`;
      root.add(group);
      entries.set(layerId, {
        layerId,
        sourceId,
        sourceLayer: typeof sourceLayer === "string" ? sourceLayer : undefined,
        config,
        savedPaint: null,
        expressions: null,
        expressionKey: "",
        featureKey: "",
        group,
        meshes: [],
      });
    }
    for (const entry of [...entries.values()]) {
      if (!seen.has(entry.layerId)) removeEntry(entry);
    }
  };

  const requestAnomaly = (lngLat: [number, number]) => {
    if (anomalyRequested) return;
    anomalyRequested = true;
    getGcg2016HeightAnomaly(
      lngLat[0] as Longitude.deg,
      lngLat[1] as Latitude.deg
    ).then(
      (anomaly) => {
        if (disposed) return;
        heightAnomaly = anomaly;
        applyFades();
        map.triggerRepaint();
      },
      (error: unknown) => {
        // without it the icons would sit ~46 m too high; stay in 2D instead
        console.warn("[ELEVATED SYMBOLS] no GCG2016 height anomaly", {
          lngLat,
          error,
        });
      }
    );
  };

  const buildMeshes = (entry: LayerEntry, features: IconFeature[]) => {
    disposeMeshes(entry);
    const byImage = new Map<string, IconFeature[]>();
    for (const feature of features) {
      const list = byImage.get(feature.imageName) ?? [];
      list.push(feature);
      byImage.set(feature.imageName, list);
    }
    let complete = true;
    for (const [imageName, imageFeatures] of byImage) {
      const image = map.getImage(imageName);
      if (!image?.data) {
        complete = false; // sprite not loaded yet, a later collect retries
        continue;
      }
      const texture = textureFromImage(image);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.02,
        depthTest: entry.config.occlude,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.InstancedMesh(
        geometry,
        material,
        imageFeatures.length
      );
      mesh.name = `elevated-symbols:${entry.layerId}:${imageName}`;
      mesh.frustumCulled = false;
      mesh.renderOrder = RENDER_ORDER;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      entry.group.add(mesh);
      const pixelRatio = image.pixelRatio || 1;
      entry.meshes.push({
        imageName,
        mesh,
        texture,
        material,
        widthPx: image.data.width / pixelRatio,
        heightPx: image.data.height / pixelRatio,
        features: imageFeatures,
      });
    }
    return complete;
  };

  const collectEntry = (entry: LayerEntry) => {
    const expressions = ensureExpressions(entry);
    let raw: ReturnType<MaplibreMap["querySourceFeatures"]> = [];
    try {
      // The layer's own filter, e.g. one driving direction of two layers on
      // the same source; without it every layer would draw every feature.
      const filter = map.getFilter(entry.layerId);
      raw = map.querySourceFeatures(entry.sourceId, {
        sourceLayer: entry.sourceLayer,
        ...(filter ? { filter } : {}),
      });
    } catch {
      return;
    }
    const globals = { zoom: map.getZoom() };
    const byId = new Map<string | number, IconFeature>();
    for (const feature of raw) {
      if (feature.id === undefined || feature.id === null) continue;
      if (byId.has(feature.id)) continue; // repeated once per tile
      if (feature.geometry.type !== "Point") continue;
      const height = Number(feature.properties?.[entry.config.property]);
      if (!Number.isFinite(height)) continue;
      const imageName = imageNameOf(
        expressions.image.evaluate(globals, feature as never)
      );
      if (!imageName) continue;
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      byId.set(feature.id, {
        id: feature.id,
        lngLat: [lng, lat],
        height: height + entry.config.offset,
        properties: feature.properties ?? {},
        imageName,
      });
    }
    const features = [...byId.values()];
    const key = features
      .map((feature) => `${feature.id}:${feature.imageName}`)
      .sort()
      .join("|");
    if (key === entry.featureKey) return;
    if (
      features[0] &&
      entry.config.verticalDatum === "ellipsoidal" &&
      !anomalyRequested
    ) {
      requestAnomaly(features[0].lngLat);
    }
    const complete = buildMeshes(entry, features);
    // an incomplete build is redone by the next collect
    entry.featureKey = complete ? key : "";
  };

  const collect = () => {
    collectScheduled = null;
    if (disposed || !mapIsUsable(map)) return;
    scanLayers();
    for (const entry of entries.values()) collectEntry(entry);
    applyFades();
    map.triggerRepaint();
  };

  const scheduleCollect = () => {
    if (disposed || collectScheduled !== null) return;
    collectScheduled = setTimeout(collect, 50);
  };

  const onSourceData = (event: MapSourceDataEvent) => {
    if (!event.tile && event.sourceDataType !== "metadata") return;
    for (const entry of entries.values()) {
      if (entry.sourceId === event.sourceId) {
        scheduleCollect();
        return;
      }
    }
  };

  // ── drawing ───────────────────────────────────────────────

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const zeroScale = new THREE.Vector3(0, 0, 0);

  const update = (frame: SharedThreeSceneFrame) => {
    camera = frame.renderCamera;
    const nextDrawn: DrawnIcon[] = [];
    const lifted = active && isReady() && mapIsUsable(map);
    root.visible = lifted;
    if (!lifted) {
      drawn = nextDrawn;
      return;
    }
    const zoom = map.getZoom();
    const globals = { zoom };
    for (const entry of entries.values()) {
      const shown = layerShown(entry, zoom);
      entry.group.visible = shown;
      if (!shown) continue;
      const expressions = ensureExpressions(entry);
      const carried = (
        map.getLayer(entry.layerId)?.metadata as
          | { "layer-opacity"?: unknown }
          | undefined
      )?.["layer-opacity"];
      const layerOpacity = finiteOr(carried, 1);
      const sceneOffset =
        entry.config.verticalDatum === "ellipsoidal"
          ? -(heightAnomaly ?? 0)
          : 0;
      const pickable = !ownLayerId(
        entry.layerId,
        (
          map.getLayer(entry.layerId)?.metadata as
            | { "layer-id"?: unknown }
            | undefined
        )?.["layer-id"]
      ).includes("selection");
      for (const iconMesh of entry.meshes) {
        iconMesh.material.opacity = layerOpacity;
        iconMesh.features.forEach((feature, index) => {
          let state: Record<string, unknown> = {};
          try {
            state = map.getFeatureState({
              source: entry.sourceId,
              sourceLayer: entry.sourceLayer,
              id: feature.id,
            });
          } catch {
            // source gone mid-frame, the next collect drops the layer
          }
          const evaluated = {
            type: 1,
            id: feature.id,
            properties: feature.properties,
          } as never;
          const opacity = finiteOr(
            expressions.opacity.evaluate(globals, evaluated, state),
            1
          );
          const projected = lease.layer.projectLngLatToScene(
            feature.lngLat,
            feature.height + sceneOffset,
            position
          );
          if (!projected) {
            matrix.compose(position, quaternion.identity(), zeroScale);
            iconMesh.mesh.setMatrixAt(index, matrix);
            return;
          }
          const iconSize = finiteOr(
            expressions.size.evaluate(globals, evaluated, state),
            1
          );
          // Picking goes through the selectable layer even where its icon is
          // hidden (the selected one, drawn by the selection layer instead);
          // a selection layer's hit would be dropped by the click handler.
          if (pickable) {
            nextDrawn.push({
              entry,
              feature,
              scenePosition: position.clone(),
              radiusPx: Math.max(
                MIN_PICK_RADIUS_PX,
                (Math.max(iconMesh.widthPx, iconMesh.heightPx) * iconSize) / 2
              ),
            });
          }
          if (opacity < MIN_DRAWN_OPACITY) {
            matrix.compose(position, quaternion.identity(), zeroScale);
            iconMesh.mesh.setMatrixAt(index, matrix);
            return;
          }
          const rotate = finiteOr(
            expressions.rotate.evaluate(globals, evaluated, state),
            0
          );
          const metersPerPx = metersPerPixelAt(zoom, feature.lngLat[1]);
          // icon-rotate is clockwise seen from above, a +Y turn is not
          quaternion.setFromAxisAngle(up, (-rotate * Math.PI) / 180);
          scale.set(
            iconMesh.widthPx * iconSize * metersPerPx,
            1,
            iconMesh.heightPx * iconSize * metersPerPx
          );
          matrix.compose(position, quaternion, scale);
          iconMesh.mesh.setMatrixAt(index, matrix);
        });
        iconMesh.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    drawn = nextDrawn;
  };

  // ── clicks ────────────────────────────────────────────────

  const inverseView = new THREE.Matrix4();
  const projected = new THREE.Vector3();

  /** the 2D hit for a lifted icon: the faded layer still answers queries */
  const hitsFor = (icon: DrawnIcon): MapGeoJSONFeature[] | null => {
    const { entry, feature } = icon;
    const hits = map
      .queryRenderedFeatures({
        layers: [entry.layerId],
        filter: ["==", ["id"], feature.id],
      })
      .slice(0, 1);
    if (hits.length > 0) return hits;
    // the 2D icon may be off screen while its lifted one is not
    const sourceHit = map.querySourceFeatures(entry.sourceId, {
      sourceLayer: entry.sourceLayer,
      filter: ["==", ["id"], feature.id],
    })[0];
    const styleLayer = map
      .getStyle()
      ?.layers?.find((layer) => layer.id === entry.layerId);
    if (!sourceHit || !styleLayer) return null;
    (sourceHit as { layer?: unknown }).layer = styleLayer;
    return [sourceHit as MapGeoJSONFeature];
  };

  const provideHits = (point: Point): MapGeoJSONFeature[] | null => {
    if (!camera || drawn.length === 0 || !root.visible) return null;
    const canvas = map.getCanvas();
    root.updateWorldMatrix(true, false);
    inverseView.copy(camera.matrixWorld).invert();
    let nearest: { icon: DrawnIcon; distance: number } | null = null;
    for (const icon of drawn) {
      projected
        .copy(icon.scenePosition)
        .applyMatrix4(root.matrixWorld)
        .applyMatrix4(inverseView)
        .applyMatrix4(camera.projectionMatrix);
      if (projected.z < -1 || projected.z > 1) continue;
      const x = ((projected.x + 1) / 2) * canvas.clientWidth;
      const y = ((1 - projected.y) / 2) * canvas.clientHeight;
      const distance = Math.hypot(x - point.x, y - point.y);
      if (distance > icon.radiusPx) continue;
      if (!nearest || distance < nearest.distance) {
        nearest = { icon, distance };
      }
    }
    return nearest ? hitsFor(nearest.icon) : null;
  };

  // ── wiring ────────────────────────────────────────────────

  const runtime: SharedThreeSceneRuntime = {
    id: "pointcloud-elevated-symbols",
    originLngLat: [map.getCenter().lng, map.getCenter().lat],
    root,
    update,
    dispose: () => {
      for (const entry of entries.values()) disposeMeshes(entry);
      root.clear();
    },
  };
  lease.layer.addRuntime(runtime);
  const unregisterRuntime = registerSharedThreeSceneRuntime(map, runtime);
  const unregisterHits = registerClickHitProvider(map, provideHits);

  map.on(MAPLIBRE_EVENT.STYLE_DATA, scheduleCollect);
  map.on(MAPLIBRE_EVENT.SOURCE_DATA, onSourceData);
  map.on(MAPLIBRE_EVENT.MOVE_END, scheduleCollect);
  collect();

  return {
    setActive: (next) => {
      if (active === next) return;
      active = next;
      applyFades();
      map.triggerRepaint();
    },
    dispose: () => {
      disposed = true;
      if (collectScheduled !== null) clearTimeout(collectScheduled);
      map.off(MAPLIBRE_EVENT.STYLE_DATA, scheduleCollect);
      map.off(MAPLIBRE_EVENT.SOURCE_DATA, onSourceData);
      map.off(MAPLIBRE_EVENT.MOVE_END, scheduleCollect);
      unregisterHits();
      if (mapIsUsable(map)) {
        for (const entry of entries.values()) restore(entry);
      }
      unregisterRuntime();
      if (lease.layer.hasRuntime(runtime.id)) {
        lease.layer.removeRuntime(runtime.id);
      } else {
        runtime.dispose();
      }
      geometry.dispose();
      lease.release();
    },
  };
};
