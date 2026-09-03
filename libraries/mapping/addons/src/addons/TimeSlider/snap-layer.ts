import type { Map as MapLibreMap, MapSourceDataEvent } from "maplibre-gl";

/**
 * The no-cage fallback: one plain tiled WMS layer showing whichever time step
 * the slider is nearest to.
 *
 * Deliberately not a crippled version of the caged blend. There is no frame
 * cache and no two-source render here, because neither is useful without the
 * blend curve: a tiled WMS layer is how you would show a single time step if
 * the crossfade had never existed. What a build without cage loses is the
 * interpolation between steps, and nothing else.
 *
 * A raster source's tile url cannot be changed after the fact, so a step change
 * is a source swap. The two attachments below are what keeps that swap from
 * flashing: the step being switched to is added at opacity zero and only takes
 * over once its tiles are in, so the previous step stays on screen instead of
 * the map going blank for the length of a tile round trip. Without that the
 * animation shows nothing at all, since every step is torn down again before
 * its tiles arrive.
 */
export type SnapLayerOptions = {
  map: MapLibreMap;
  wmsUrl: string;
  layers: string[];
  styles: string;
  format?: string;
  version?: string;
  transparent?: boolean;
  opacity?: number;
  /** step shown as soon as the layer attaches, before any `setStep` */
  initialStep?: number;
  /**
   * Called whenever a step's tiles have taken over the screen, with that
   * step's index. A host flipping between this layer and the blend canvas
   * waits for it, so the flip never lands on tiles that are not there yet.
   */
  onStepShown?: (step: number) => void;
  /**
   * How long a step may take to load before it is shown regardless, in ms.
   * A safety net for a source that never reports itself loaded; the normal
   * path is the `sourcedata` handler. Default: 2500
   */
  swapTimeoutMs?: number;
  beforeId?: string;
  id?: string;
};

export type SnapLayerHandle = {
  /** index of the time step to show */
  setStep: (step: number) => void;
  /** layer opacity, 0..1; same entry point the caged blend layer has */
  setOpacity: (opacity: number) => void;
  /**
   * Show or hide the layer without tearing it down. Hidden means painted at
   * opacity zero rather than `visibility: none`, on purpose: MapLibre stops
   * loading tiles for a `none` layer, and a hidden step is supposed to stay
   * warm, following pans, so showing it again costs nothing.
   */
  setVisible: (visible: boolean) => void;
  /** the step whose tiles are on screen, or -1 while nothing is */
  getShownStep: () => number;
  destroy: () => void;
};

/** one step on the map: the source holding its tiles and the layer drawing them */
type Attachment = {
  step: number;
  sourceId: string;
  layerId: string;
};

const DEFAULT_SWAP_TIMEOUT_MS = 2500;

const tileUrl = (
  wmsUrl: string,
  layer: string,
  styles: string,
  format: string,
  version: string,
  transparent: boolean
): string => {
  const separator = wmsUrl.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    request: "GetMap",
    service: "WMS",
    version,
    srs: "EPSG:3857",
    width: "256",
    height: "256",
    layers: layer,
    styles,
    format,
    transparent: String(transparent),
  });
  // MapLibre substitutes the tile extent; the placeholder must stay unencoded,
  // which is why it is appended rather than passed through URLSearchParams.
  return `${wmsUrl}${separator}${params.toString()}&bbox={bbox-epsg-3857}`;
};

export const createSnapLayer = ({
  map,
  wmsUrl,
  layers,
  styles,
  format = "image/png",
  version = "1.1.1",
  transparent = true,
  opacity = 1,
  initialStep = 0,
  onStepShown,
  swapTimeoutMs = DEFAULT_SWAP_TIMEOUT_MS,
  beforeId,
  id = `carma-wms-snap-${Math.random().toString(36).slice(2, 10)}`,
}: SnapLayerOptions): SnapLayerHandle => {
  const clampStep = (step: number) =>
    Math.max(0, Math.min(Math.round(step), layers.length - 1));

  let currentOpacity = opacity;
  let visible = true;
  /** what a promoted layer is painted with: the opacity, or hidden */
  const effectiveOpacity = (): number => (visible ? currentOpacity : 0);
  /** the step that should be on the map */
  let currentStep = clampStep(initialStep);
  /** the step that is on screen, or null while nothing has loaded yet */
  let shown: Attachment | null = null;
  /** the step loading behind it, drawn at opacity zero until it is ready */
  let pending: Attachment | null = null;
  /** ids are unique per attachment, so a discarded one cannot collide */
  let sequence = 0;
  let swapTimer: number | undefined;
  let destroyed = false;

  const detach = (attachment: Attachment | null): void => {
    if (!attachment) return;
    if (map.getLayer(attachment.layerId)) map.removeLayer(attachment.layerId);
    if (map.getSource(attachment.sourceId)) {
      map.removeSource(attachment.sourceId);
    }
  };

  const clearSwapTimer = (): void => {
    if (swapTimer === undefined) return;
    window.clearTimeout(swapTimer);
    swapTimer = undefined;
  };

  /**
   * Hand the map over to the step that finished loading.
   *
   * The old attachment goes first and the opacity is raised after it, in the
   * same task: raising it first would stack two translucent rasters for a
   * frame, which composites darker than either of them alone.
   */
  const promote = (): void => {
    if (destroyed || !pending) return;
    clearSwapTimer();
    detach(shown);
    shown = pending;
    pending = null;
    if (map.getLayer(shown.layerId)) {
      map.setPaintProperty(shown.layerId, "raster-opacity", effectiveOpacity());
    }
    onStepShown?.(shown.step);
  };

  /**
   * Start loading `currentStep` behind whatever is on screen.
   *
   * Idempotent, and safe to call from `styledata`: a basemap swap calls
   * `setStyle`, and MapLibre drops every custom source and layer with the old
   * style, so the wanted step has to be put back without any of it being
   * treated as already attached.
   */
  const request = (): void => {
    if (destroyed || !map.getStyle()) return;
    if (shown?.step === currentStep) {
      // scrubbed away and back again before the new step ever appeared
      detach(pending);
      pending = null;
      clearSwapTimer();
      return;
    }
    if (pending?.step === currentStep) return;

    // whatever was loading is now the wrong step, and was never on screen
    detach(pending);
    pending = null;
    clearSwapTimer();

    sequence += 1;
    const attachment: Attachment = {
      step: currentStep,
      sourceId: `${id}-source-${sequence}`,
      layerId: `${id}-layer-${sequence}`,
    };

    map.addSource(attachment.sourceId, {
      type: "raster",
      tiles: [
        tileUrl(
          wmsUrl,
          layers[attachment.step],
          styles,
          format,
          version,
          transparent
        ),
      ],
      tileSize: 256,
    });
    map.addLayer(
      {
        id: attachment.layerId,
        type: "raster",
        source: attachment.sourceId,
        paint: {
          // invisible until its tiles are in. Still loads them: MapLibre skips
          // tile loading for `visibility: none`, not for a zero opacity.
          "raster-opacity": shown ? 0 : effectiveOpacity(),
          // Paint properties animate by default, ~300ms. Left on, the swap
          // showed as: old layer gone at once, a beat of nothing, the new one
          // easing in from transparent. The swap must land in one frame.
          "raster-opacity-transition": { duration: 0, delay: 0 },
          // MapLibre's own per-tile fade has nothing to fade between here
          "raster-fade-duration": 0,
        },
      },
      beforeId
    );
    pending = attachment;

    // nothing to hold on screen, so there is nothing to wait for either
    if (!shown) {
      promote();
      return;
    }

    // No isSourceLoaded shortcut here: straight after `addSource` it answers
    // true, because no tile has been *requested* yet; the requests only go out
    // with the next render. Trusting it swapped before a single tile existed,
    // which showed as old layer, gap, new layer on every step.
    swapTimer = window.setTimeout(promote, swapTimeoutMs);
  };

  const onSourceData = (event: MapSourceDataEvent): void => {
    if (!pending || event.sourceId !== pending.sourceId) return;
    // only an event carrying a tile proves loading has actually started; the
    // metadata event straight after `addSource` reports loaded on a source
    // that has not requested anything yet
    if (!event.tile) return;
    if (!map.isSourceLoaded(pending.sourceId)) return;
    promote();
  };

  /** the last tile of a slow step can land after its `sourcedata` has passed */
  const onIdle = (): void => {
    if (!pending) return;
    if (!map.isSourceLoaded(pending.sourceId)) return;
    promote();
  };

  const onStyleData = (): void => {
    if (destroyed || !map.getStyle()) return;
    if (shown && !map.getLayer(shown.layerId)) shown = null;
    if (pending && !map.getLayer(pending.layerId)) pending = null;
    if (!shown && !pending) request();
  };

  const setStep = (step: number): void => {
    if (destroyed) return;
    const next = clampStep(step);
    if (next === currentStep && (shown || pending)) return;
    currentStep = next;
    request();
  };

  const applyOpacity = (): void => {
    if (shown && map.getLayer(shown.layerId)) {
      map.setPaintProperty(shown.layerId, "raster-opacity", effectiveOpacity());
    }
  };

  const setOpacity = (next: number): void => {
    if (destroyed) return;
    currentOpacity = Math.max(0, Math.min(next, 1));
    applyOpacity();
  };

  const setVisible = (next: boolean): void => {
    if (destroyed || visible === next) return;
    visible = next;
    applyOpacity();
  };

  map.on("sourcedata", onSourceData);
  map.on("idle", onIdle);
  map.on("styledata", onStyleData);
  // Straight away rather than on the first `setStep`: the caller may never send
  // one, and a layer showing nothing until the slider is touched reads as a
  // broken service.
  request();

  return {
    setStep,
    setOpacity,
    setVisible,
    getShownStep: () => shown?.step ?? -1,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      clearSwapTimer();
      map.off("sourcedata", onSourceData);
      map.off("idle", onIdle);
      map.off("styledata", onStyleData);
      detach(pending);
      detach(shown);
      pending = null;
      shown = null;
    },
  };
};
