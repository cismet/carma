import type { Map as MaplibreMap } from "maplibre-gl";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

const CONTENT_EVENTS = [
  MAPLIBRE_EVENT.SOURCE_DATA,
  MAPLIBRE_EVENT.SOURCE_DATA_LOADING,
  MAPLIBRE_EVENT.TERRAIN,
  MAPLIBRE_EVENT.MOVE,
  MAPLIBRE_EVENT.RESIZE,
  MAPLIBRE_EVENT.WEBGL_CONTEXT_LOST,
  MAPLIBRE_EVENT.WEBGL_CONTEXT_RESTORED,
] as const;

const STYLE_EVENTS = [
  MAPLIBRE_EVENT.STYLE_DATA,
  MAPLIBRE_EVENT.STYLE_DATA_LOADING,
  MAPLIBRE_EVENT.STYLE_LOAD,
] as const;

/**
 * Cache only an idle MapLibre ground pass during our own lighting replay.
 * `loaded()` alone is insufficient: it becomes true before placement/paint
 * fades finish inside MapLibre's render method. IDLE is the public completion
 * signal, including on frames requested by a custom layer's triggerRepaint().
 * Unknown/dynamic ground passes deliberately keep the old per-frame copy.
 */
export const createMapStyleFramebufferCache = (
  map: MaplibreMap,
  layerId: string
) => {
  let idle = false;
  let staticStyle: boolean | undefined;
  let revision = 0;
  let capturedRevision = -1;
  let capturedSignature = "";
  let captures = 0;
  let reuses = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelayMs = 100;
  let disposed = false;
  let imageVersions: Array<readonly [id: string, version: number]> = [];

  const cancelRetry = () => {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
  };

  const invalidate = () => {
    idle = false;
    revision += 1;
  };
  const invalidateStyle = () => {
    staticStyle = undefined;
    invalidate();
  };
  const hasStaticGround = () => {
    const style = map.getStyle();
    if (!style?.layers || !style.sources) return false;
    // getStyle() deliberately omits custom layers. The public order/getLayer
    // APIs include them, including this receiver and earlier custom passes.
    const layerOrder = map.getLayersOrder();
    const receiverIndex = layerOrder.indexOf(layerId);
    if (receiverIndex < 0) return false;
    // Custom layers and animated image/source callbacks can change pixels
    // without styledata/sourcedata, even when MapLibre reports idle.
    if (
      layerOrder
        .slice(0, receiverIndex)
        .some((id) => map.getLayer(id)?.type === "custom")
    )
      return false;
    if (
      Object.values(style.sources).some(
        ({ type }) => String(type) === "canvas" || type === "video"
      )
    )
      return false;
    // setFeatureState has no public content event in MapLibre 5.18. Its
    // source-dirty flag is already cleared before custom layers render.
    // Preserve live highlights rather than caching state-dependent paint.
    if (
      style.layers.some((layer) =>
        JSON.stringify(layer).includes('"feature-state"')
      )
    )
      return false;
    imageVersions = [];
    for (const id of map.listImages()) {
      const image = map.getImage(id);
      if (image?.userImage?.render) return false;
      if (image) imageVersions.push([id, image.version]);
    }
    return true;
  };
  const refreshImages = () => {
    // updateImage also emits no content event; getImage is a public API.
    // Keep only IDs/versions, not image objects or pixel buffers.
    if (
      idle &&
      staticStyle === true &&
      imageVersions.some(
        ([id, version]) => map.getImage(id)?.version !== version
      )
    )
      invalidateStyle();
  };
  const markIdle = () => {
    if (staticStyle === undefined) staticStyle = hasStaticGround();
    // Capture one final fully faded frame, then restart lighting with those
    // pixels. Do not keep resetting the accumulator on every uncached copy:
    // dynamic/custom sources intentionally use the non-cached fallback.
    if (!idle) {
      revision += 1;
      map.triggerRepaint();
    }
    idle = true;
  };
  CONTENT_EVENTS.forEach((event) => map.on(event, invalidate));
  STYLE_EVENTS.forEach((event) => map.on(event, invalidateStyle));
  map.on(MAPLIBRE_EVENT.IDLE, markIdle);

  return {
    invalidate,
    /** A capture exception need not produce another source/camera event. Retry
     * without a hot render loop; arrivals and a successful copy still win. */
    captureFailed() {
      if (disposed || retryTimer !== undefined) return;
      invalidate();
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (!disposed) map.triggerRepaint();
      }, retryDelayMs);
      retryDelayMs = Math.min(2_000, retryDelayMs * 2);
    },
    /** Exact camera/viewport/depth registration; no screen-space rounding. */
    canReuse(signature: string, lightingReplay: boolean): boolean {
      refreshImages();
      const reuse =
        lightingReplay &&
        idle &&
        staticStyle === true &&
        !map.isMoving() &&
        map.loaded() &&
        capturedRevision === revision &&
        capturedSignature === signature;
      if (reuse) reuses += 1;
      return reuse;
    },
    captured(signature: string) {
      cancelRetry();
      retryDelayMs = 100;
      capturedRevision = revision;
      capturedSignature = signature;
      captures += 1;
    },
    get revision() {
      refreshImages();
      return revision;
    },
    get stats() {
      return { captures, reuses };
    },
    dispose() {
      disposed = true;
      cancelRetry();
      CONTENT_EVENTS.forEach((event) => map.off(event, invalidate));
      STYLE_EVENTS.forEach((event) => map.off(event, invalidateStyle));
      map.off(MAPLIBRE_EVENT.IDLE, markIdle);
    },
  };
};
