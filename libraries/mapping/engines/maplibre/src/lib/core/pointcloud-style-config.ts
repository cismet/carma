/**
 * A point cloud named by a style layer's `metadata.carmaConf["3d"]` block with
 * `renderMode: "pointcloud"`.
 *
 * The layer carrying the block (usually an invisible `background` layer) only
 * exists to bring it through the style merge, which keeps layers and drops
 * everything else. Its `minzoom` / `maxzoom` gate the cloud, so a style that
 * switches content by zoom switches the cloud along with it.
 *
 * `metadata["pointcloud-visibility"]: "none"` on the carrier stops drawing the
 * cloud but keeps it mounted, so the map stays three dimensional (free camera,
 * terrain). The carrier's own `layout.visibility` cannot do that, since
 * carriers are usually hidden themselves; a dynamic styling toggle can flip
 * this key.
 *
 * `classFilter` in the 3d block filters the points by class through a MapLibre
 * global state that holds a filter expression, the one the filter buttons
 * write as `filter:<layerPattern>`. The expression is evaluated once per class
 * id, as if each class were a feature whose `property` is that id, so a button
 * with `"propertyName": "class", "propertyValue": [6, 8]` shows classes 6 and
 * 8. Needs a tileset whose points carry `_CLASSIFICATION`; a cloud without it
 * draws all of its points.
 *
 * The payload is the shared `carma-pointcloud-v1` contract
 * (`CarmaConf3DPointCloud` in `@carma-appframeworks/portals`). This engine
 * cannot depend on that package, so the fields it reads are declared here.
 */

export const POINTCLOUD_RENDER_MODE = "pointcloud";

/** Carrier layer metadata key; "none" stops drawing the cloud. */
export const POINTCLOUD_VISIBILITY_KEY = "pointcloud-visibility";

export type PointCloudStylePayload = {
  format: "carma-pointcloud-v1";
  /** Only "3d-tiles" is rendered; COPC is not supported by this engine. */
  delivery: "3d-tiles";
  /** The tileset.json. */
  url: string;
  bounds?: {
    crs: string;
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  };
  hasRgb?: boolean;
};

export type PointCloudClassFilter = {
  /** The global state holding the filter expression; null shows all classes. */
  state: string;
  /** The property name the expression reads the class id from. */
  property: string;
};

export const DEFAULT_CLASS_FILTER_PROPERTY = "class";

export interface PointCloudLayerConfig {
  renderMode: typeof POINTCLOUD_RENDER_MODE;
  pointcloud: PointCloudStylePayload;
  /** Point size in CSS pixels. */
  pointSize?: number;
  /** Screen-space error target in pixels; lower loads finer tiles. */
  errorTarget?: number;
  /** From the carrier layer; the cloud draws from this zoom on. */
  minzoom?: number;
  /** From the carrier layer; the cloud draws below this zoom. */
  maxzoom?: number;
  /** The opacity the layer bar asked of the carrier layer, 0 to 1. */
  layerOpacity: number;
  /** False when the carrier's pointcloud-visibility is "none". */
  visible: boolean;
  classFilter?: PointCloudClassFilter;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isTriple = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);

const readBounds = (value: unknown): PointCloudStylePayload["bounds"] => {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    typeof value.crs !== "string" ||
    !isTriple(value.min) ||
    !isTriple(value.max)
  ) {
    return undefined;
  }
  return { crs: value.crs, min: value.min, max: value.max };
};

const readClassFilter = (value: unknown): PointCloudClassFilter | undefined => {
  if (
    !isRecord(value) ||
    typeof value.state !== "string" ||
    value.state.length === 0
  ) {
    return undefined;
  }
  return {
    state: value.state,
    property:
      typeof value.property === "string" && value.property.length > 0
        ? value.property
        : DEFAULT_CLASS_FILTER_PROPERTY,
  };
};

/**
 * The point cloud a style layer declares, or null when it declares none or
 * one this engine cannot draw. Unknown or invalid payloads are ignored rather
 * than thrown on, so one broken layer does not take the style down.
 */
export const readPointCloudLayerConfig = (
  layer: unknown
): PointCloudLayerConfig | null => {
  if (!isRecord(layer)) {
    return null;
  }
  const metadata = isRecord(layer.metadata) ? layer.metadata : undefined;
  const carmaConf = isRecord(metadata?.carmaConf)
    ? metadata.carmaConf
    : undefined;
  const block = carmaConf?.["3d"];
  if (!isRecord(block) || block.renderMode !== POINTCLOUD_RENDER_MODE) {
    return null;
  }
  const payload = block.pointcloud;
  if (
    !isRecord(payload) ||
    payload.format !== "carma-pointcloud-v1" ||
    payload.delivery !== "3d-tiles" ||
    typeof payload.url !== "string" ||
    payload.url.length === 0
  ) {
    return null;
  }

  const bounds = readBounds(payload.bounds);
  const classFilter = readClassFilter(block.classFilter);
  const carriedOpacity = metadata?.["layer-opacity"];
  return {
    renderMode: POINTCLOUD_RENDER_MODE,
    pointcloud: {
      format: "carma-pointcloud-v1",
      delivery: "3d-tiles",
      url: payload.url,
      ...(bounds ? { bounds } : {}),
      ...(typeof payload.hasRgb === "boolean"
        ? { hasRgb: payload.hasRgb }
        : {}),
    },
    ...(isFiniteNumber(block.pointSize) && block.pointSize > 0
      ? { pointSize: block.pointSize }
      : {}),
    ...(isFiniteNumber(block.errorTarget) && block.errorTarget > 0
      ? { errorTarget: block.errorTarget }
      : {}),
    ...(isFiniteNumber(layer.minzoom) ? { minzoom: layer.minzoom } : {}),
    ...(isFiniteNumber(layer.maxzoom) ? { maxzoom: layer.maxzoom } : {}),
    layerOpacity: isFiniteNumber(carriedOpacity) ? carriedOpacity : 1,
    visible: metadata?.[POINTCLOUD_VISIBILITY_KEY] !== "none",
    ...(classFilter ? { classFilter } : {}),
  };
};

/** MapLibre's own rule: visible from `minzoom` on, hidden from `maxzoom` on. */
export const isPointCloudZoomInRange = (
  config: Pick<PointCloudLayerConfig, "minzoom" | "maxzoom">,
  zoom: number
): boolean =>
  (config.minzoom === undefined || zoom >= config.minzoom) &&
  (config.maxzoom === undefined || zoom < config.maxzoom);
