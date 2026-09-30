import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import {
  useCreateBlendLayer,
  type BlendLayerHandle,
} from "../../lib/caged-addons";
import type { AddonComponentProps } from "../../lib/registry";
import { placeAtSlot, useStyleSlot } from "../../lib/style-slot";
import { FRAME_LOG_PREFIX, getSharedFrameCache } from "./frame-fetch";
import {
  MAX_FRAME_REQUEST_ROUNDS,
  clockMayRun,
  shouldRequestFailedFrames,
} from "./play-gate";
import { createSnapLayer, type SnapLayerHandle } from "./snap-layer";
import {
  useTimeSeriesLauncher,
  useTimeSliderActions,
  type TimeSeriesDefinition,
} from "./timeslider-actions";

/**
 * The engine of a WMS time series: it owns the map layer and the playback
 * clock, and runs whatever series the `timeSeries` channel holds.
 *
 * It brings no series of its own. A route that wants one on the map declares
 * it in full in the config; a route that mounts the bare kind gets an idle
 * engine that a workflow card launches a series into, through
 * `useTimeSeriesLauncher`. There is no implicit demo scenario.
 *
 * This is the open half of the crossfade. The transport, the row and the
 * ribbon live in carma; the smooth interpolation between two steps is caged.
 * With cage present the slider runs in sub-steps and the layer blends; without
 * it the slider snaps to whole steps and shows a plain tiled WMS layer.
 *
 * The component draws no panel and, by default, no control button: the series
 * announces itself with its row in the layer bar. See `ADDON-UI.md`.
 *
 * A series a style launched (`anchorLayerId`) is drawn where that style's
 * `timeSlider` placeholder sits in the layer order (`style-slot.ts`), and takes
 * the style's opacity; without a placeholder its layers are on top.
 */

export type TimeSliderConfig = Partial<TimeSeriesDefinition> & {
  /** milliseconds between two sub-steps at 1x speed. Default: 60 */
  playIntervalMs?: number;
  /**
   * Milliseconds between two whole time steps at 1x speed in a build without
   * cage. Default: `(playIntervalMs * intermediateValuesCount) / 2`, twice as
   * fast as the caged crossfade covers the same series; a hard cut per step
   * reads better at a brisker pace than the smooth blend.
   *
   * It cannot be `playIntervalMs`: a slider unit is a whole step there, and
   * each one is a fresh tile load rather than a redraw of a cached frame. At
   * the sub-step interval the animation outruns the WMS and never shows a
   * finished step.
   */
  snapPlayIntervalMs?: number;
  /** whether a config-declared series goes on the map at mount. Default: true */
  startEnabled?: boolean;
  /**
   * Load the crossfade's frames from the browser's http cache whatever its
   * age, see `frame-fetch.ts`. Set by the host for a map opened with
   * `cache=forced`; not part of the series, so it does not travel with scenes.
   * Play then waits for every frame and asks again for failed ones, see
   * `play-gate.ts`. Default: false
   */
  cacheFrames?: boolean;
  /**
   * Whether the control column gets a button toggling the series. Default:
   * false; the layer-bar row is the addon's face, the button is opt-in.
   */
  showControl?: boolean;
  /** Corner the button is registered in. Default: "topleft" */
  controlPosition?: Positions;
  /** Sort order within that corner. Default: 85 */
  controlOrder?: number;
};

/** geoportal's topleft column: highlighting 70, comparison 75, terrain 80, manager 90 */
const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 85;
const DEFAULT_PLAY_INTERVAL_MS = 60;

/** the placeholder a style marks the series' place with */
const TIME_SLIDER_SLOT = "timeSlider";

const randomSuffix = () => Math.random().toString(36).slice(2, 10);

/**
 * Blue while the ribbon is open, black while it is not. Deliberately not "blue
 * while the series runs": the series announces itself with its own row in the
 * layer bar, so the button's colour is free to say whether the ribbon is up.
 */
const OPEN_COLOR = "#1677ff";
const CLOSED_COLOR = "#000000";

export const TimeSlider = ({
  config = {},
  libreMap,
}: AddonComponentProps<"timeSlider">) => {
  const {
    title,
    wmsUrl: configWmsUrl,
    layers: configLayers,
    labels: configLabels,
    styles: configStyles,
    intermediateValuesCount: configIntermediateValuesCount,
    opacity: configOpacity,
    initialStep: configInitialStep,
    autoplay: configAutoplay,
    permanent: configPermanent,
    anchorLayerId: configAnchorLayerId,
    playIntervalMs = DEFAULT_PLAY_INTERVAL_MS,
    snapPlayIntervalMs,
    startEnabled = true,
    cacheFrames = false,
    showControl = false,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
  } = config;

  const {
    isOn,
    toggle,
    value,
    max,
    isPlaying,
    speed,
    panelOpen,
    opacity: liveOpacity,
    wmsUrl,
    layers,
    styles,
    stepsPerUnit,
    intermediateValuesCount,
    loaded,
    isHidden,
    anchorLayerId,
    setOn,
    setValue,
    setLoaded,
    setFrameGate,
  } = useTimeSliderActions();

  const { startSeries } = useTimeSeriesLauncher();

  // the flag-aware factory, so `?ff=nocage` exercises the fallback without
  // unlinking the cage submodule
  const createBlendLayer = useCreateBlendLayer();
  const isBlending = Boolean(createBlendLayer);

  const slot = useStyleSlot(libreMap, TIME_SLIDER_SLOT, anchorLayerId);
  /** what the map layers are painted with: the series' and the style's */
  const opacity = liveOpacity * (slot?.opacity ?? 1);

  const blendRef = useRef<BlendLayerHandle | null>(null);
  /** the blend's map layer, named by cage from the id it is given */
  const blendLayerIdRef = useRef<string | null>(null);
  const snapRef = useRef<SnapLayerHandle | null>(null);
  /** whether the blend canvas is the visible surface right now */
  const blendShownRef = useRef(false);
  /** step whose tiles have to be up before the canvas may hand over */
  const pendingRestStepRef = useRef<number | null>(null);

  /**
   * Frames of the current viewport the crossfade gave up on. Cage does not ask
   * for them again; see `clockMayRun` for what the clock makes of them.
   */
  const [failedFrames, setFailedFrames] = useState(0);
  /**
   * Bumped to rebuild the blend layer, which is how failed frames are asked
   * for again: cage has no call for a single frame. The ones that did load
   * come back from the http cache, see `frame-fetch.ts`.
   */
  const [frameRequest, setFrameRequest] = useState(0);
  /** rounds of that since play was last pressed */
  const frameRequestRoundsRef = useRef(0);

  // read where the slider stands without making the mount effect depend on it,
  // which would tear the layer down and rebuild it on every scrub
  const valueRef = useRef(value);
  valueRef.current = value;
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

  /**
   * A route that declares its series in full gets it on the map at mount; the
   * teardown takes it off again, so suspending the kind in the addon manager
   * does not leave the layer-bar row behind. A config without a series makes
   * this a no-op and the engine idles until a workflow launches one.
   */
  useEffect(() => {
    if (!startEnabled || !configWmsUrl || !configLayers?.length) {
      return undefined;
    }
    startSeries({
      title: title ?? "Zeitreihe",
      wmsUrl: configWmsUrl,
      layers: configLayers,
      labels: configLabels ?? [],
      styles: configStyles ?? "",
      intermediateValuesCount: configIntermediateValuesCount,
      opacity: configOpacity,
      initialStep: configInitialStep,
      autoplay: configAutoplay,
      permanent: configPermanent,
      anchorLayerId: configAnchorLayerId,
    });
    return () => setOn(false);
  }, [
    startEnabled,
    title,
    configWmsUrl,
    configLayers,
    configLabels,
    configStyles,
    configIntermediateValuesCount,
    configOpacity,
    configInitialStep,
    configAutoplay,
    configPermanent,
    configAnchorLayerId,
    startSeries,
    setOn,
  ]);

  // Mount the layers for the channel's series. Both implementations attach
  // themselves on `styledata` and re-attach after a basemap swap.
  //
  // With cage present BOTH are mounted: the tile layer is the resting
  // surface, since a resting slider always sits on a whole step and tiles pan
  // the way tiles pan; the blend canvas takes over only while the series is
  // in motion. Without cage the tile layer is simply all there is. Two effects,
  // so the blend layer can be rebuilt without the tiles, see `frameRequest`.
  //
  // The position and opacity are handed over at construction through refs: the
  // effects below have already seen their current values and will not run
  // again for them.
  //
  // Hidden, nothing is mounted: the eye of a launching style is off and its
  // placeholder is gone from the map, so there is nowhere to draw either.
  useEffect(() => {
    if (!libreMap || !isOn || isHidden || !wmsUrl || layers.length === 0) {
      return undefined;
    }

    let disposed = false;

    snapRef.current = createSnapLayer({
      id: `carma-wms-snap-${randomSuffix()}`,
      map: libreMap,
      wmsUrl,
      layers: layers as string[],
      styles,
      opacity: opacityRef.current,
      initialStep: Math.round(valueRef.current / stepsPerUnit),
      // the canvas hands back to the tiles only when the resting step is
      // actually on them, so the flip never shows tiles that are not there
      onStepShown: (step) => {
        if (disposed || !blendShownRef.current) return;
        if (pendingRestStepRef.current !== step) return;
        pendingRestStepRef.current = null;
        blendShownRef.current = false;
        snapRef.current?.setVisible(true);
        blendRef.current?.setVisible(false);
      },
    });

    return () => {
      disposed = true;
      // new tiles start as the surface, so the canvas goes back to rest
      blendShownRef.current = false;
      pendingRestStepRef.current = null;
      blendRef.current?.setVisible(false);
      snapRef.current?.destroy();
      snapRef.current = null;
    };
  }, [
    libreMap,
    isOn,
    isHidden,
    wmsUrl,
    styles,
    stepsPerUnit,
    // the array identity changes exactly when the launcher writes a new series
    layers,
  ]);

  useEffect(() => {
    if (
      !createBlendLayer ||
      !libreMap ||
      !isOn ||
      isHidden ||
      !wmsUrl ||
      layers.length === 0
    ) {
      return undefined;
    }

    let disposed = false;
    const blendId = `cage-wms-blend-${randomSuffix()}`;
    // cage's `createBlendLayer` names its layer `${id}-layer`
    blendLayerIdRef.current = `${blendId}-layer`;
    blendRef.current = createBlendLayer({
      id: blendId,
      map: libreMap,
      wmsUrl,
      layers: layers as string[],
      styles,
      intermediateValuesCount,
      opacity: opacityRef.current,
      fetchFrame: cacheFrames ? getSharedFrameCache() : undefined,
      onFrameLoaded: (count) => {
        if (!disposed) setLoaded(count);
      },
      // a pan drops every cached frame, and the load line runs while they
      // come back; the tiles keep the map filled in the meantime
      onFramesReset: () => {
        if (disposed) return;
        setLoaded(0);
        setFailedFrames(0);
      },
      onError: (index, error) => {
        if (disposed) return;
        console.warn(FRAME_LOG_PREFIX, "frame failed", {
          index,
          layer: layers[index],
          error: error instanceof Error ? error.message : error,
        });
        setFailedFrames((count) => count + 1);
      },
    });
    blendRef.current.setPosition(valueRef.current);
    // at rest until the visibility machine below says otherwise; hidden, the
    // frame cache still follows the viewport, so takeover is instant
    blendRef.current.setVisible(false);

    return () => {
      disposed = true;
      // the count belongs to this layer's frames: a series that comes back
      // must not start on the last one's 24
      setLoaded(0);
      setFailedFrames(0);
      if (blendShownRef.current) {
        blendShownRef.current = false;
        snapRef.current?.setVisible(true);
      }
      pendingRestStepRef.current = null;
      blendRef.current?.destroy();
      blendRef.current = null;
      blendLayerIdRef.current = null;
    };
  }, [
    libreMap,
    isOn,
    isHidden,
    wmsUrl,
    styles,
    intermediateValuesCount,
    setLoaded,
    createBlendLayer,
    cacheFrames,
    layers,
    frameRequest,
  ]);

  // Push the position down. Separate from mounting so scrubbing never tears the
  // layer down and rebuilds it. The tiles are not stepped while the canvas is
  // the visible surface: they hold the last resting step instead of fetching
  // a source per animation frame nobody sees.
  useEffect(() => {
    blendRef.current?.setPosition(value);
    if (!blendShownRef.current) {
      snapRef.current?.setStep(Math.round(value / stepsPerUnit));
    }
  }, [value, stepsPerUnit]);

  useEffect(() => {
    blendRef.current?.setOpacity(opacity);
    snapRef.current?.setOpacity(opacity);
  }, [opacity]);

  // Keep the layers at the style's slot. Both put themselves back on the map on
  // top: after a style swap, and the tiles with every step they load. Each of
  // those fires `styledata`, as does every reorder of the stack, and that moves
  // them back under the placeholder. Without a slot they stay where they were
  // added.
  const placeholderId = slot?.placeholderId;
  useEffect(() => {
    if (!libreMap || !isOn || isHidden || !placeholderId) {
      return undefined;
    }
    const place = () =>
      placeAtSlot(
        libreMap,
        [
          ...(snapRef.current?.getLayerIds() ?? []),
          ...(blendLayerIdRef.current ? [blendLayerIdRef.current] : []),
        ],
        placeholderId
      );
    place();
    libreMap.on("styledata", place);
    return () => {
      libreMap.off("styledata", place);
    };
  }, [
    libreMap,
    isOn,
    isHidden,
    placeholderId,
    // a rebuilt pair of layers, see the mount effect above
    wmsUrl,
    layers,
    styles,
    stepsPerUnit,
    intermediateValuesCount,
    createBlendLayer,
    frameRequest,
  ]);

  /**
   * Which of the two layers owns the screen.
   *
   * The canvas takes over while the series is in motion (playing, or dragged
   * between two steps) and its cache holds every frame; until the cache is
   * warm the tiles keep stepping, a hard cut per step, the fallback's look.
   * Coming to rest goes the other way round and asynchronously: the resting
   * step's tiles load behind the canvas, `onStepShown` flips when they are up.
   */
  const cacheComplete = layers.length > 0 && loaded === layers.length;
  const needsBlend = isPlaying || value % stepsPerUnit !== 0;
  const frameStatus = {
    isBlending,
    cacheFrames,
    total: layers.length,
    loaded: loaded ?? 0,
    failed: failedFrames,
  };
  /**
   * Whether the clock may advance; until then it holds on the step it stands
   * on, see `clockMayRun`. With frames from the http cache that means all of
   * them, so the tiles never step while the series plays.
   */
  const mayRun = clockMayRun(frameStatus);
  const requestFailedFrames = shouldRequestFailedFrames(
    frameStatus,
    isPlaying,
    frameRequestRoundsRef.current
  );

  // into the channel, where the outlet reads it for its remote (`RemoteSeries`)
  useEffect(() => {
    setFrameGate(failedFrames, mayRun);
  }, [failedFrames, mayRun, setFrameGate]);

  // A press of play asks again for the frames that failed, and so does a
  // series that is playing when they fail, a limited number of times; the
  // clock waits for them either way. Pausing starts the count afresh.
  useEffect(() => {
    if (!isPlaying) {
      frameRequestRoundsRef.current = 0;
      return;
    }
    if (!requestFailedFrames) return;
    frameRequestRoundsRef.current += 1;
    console.warn(FRAME_LOG_PREFIX, "asking again for failed frames", {
      failed: failedFrames,
      loaded: loaded ?? 0,
      total: layers.length,
      round: frameRequestRoundsRef.current,
      // none left: the frames stay missing until play is pressed again
      roundsLeft: MAX_FRAME_REQUEST_ROUNDS - frameRequestRoundsRef.current,
    });
    setFrameRequest((count) => count + 1);
    // the counts are for the log; the decision is `requestFailedFrames`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, requestFailedFrames]);

  useEffect(() => {
    const blend = blendRef.current;
    const snap = snapRef.current;
    // a build without cage: the tiles are always the surface
    if (!blend || !snap) return;

    if (needsBlend && cacheComplete) {
      pendingRestStepRef.current = null;
      if (!blendShownRef.current) {
        blendShownRef.current = true;
        blend.setVisible(true);
        snap.setVisible(false);
      }
      return;
    }

    if (!blendShownRef.current) return;

    const step = Math.round(value / stepsPerUnit);
    if (snap.getShownStep() === step) {
      pendingRestStepRef.current = null;
      blendShownRef.current = false;
      snap.setVisible(true);
      blend.setVisible(false);
      return;
    }
    pendingRestStepRef.current = step;
    snap.setStep(step);
  }, [needsBlend, cacheComplete, value, stepsPerUnit]);

  useEffect(() => {
    if (!isPlaying || !isOn || isHidden || max <= 0 || !mayRun) {
      return undefined;
    }
    // sub-steps with cage, whole steps without: the interval grows by the same
    // factor as the unit
    const unitIntervalMs = isBlending
      ? playIntervalMs
      : snapPlayIntervalMs ?? (playIntervalMs * intermediateValuesCount) / 2;
    const interval = Math.max(
      1,
      Math.round(unitIntervalMs / Math.max(speed, 0.1))
    );
    const handle = window.setInterval(() => {
      // read the position through the ref, so the interval does not have to be
      // rebuilt on every tick
      setValue(valueRef.current >= max ? 0 : valueRef.current + 1);
    }, interval);
    return () => window.clearInterval(handle);
  }, [
    isPlaying,
    isOn,
    isHidden,
    max,
    mayRun,
    isBlending,
    playIntervalMs,
    snapPlayIntervalMs,
    intermediateValuesCount,
    speed,
    setValue,
  ]);

  if (!libreMap || !showControl) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <Tooltip
        title={isOn ? "Zeitreihe ausschalten" : "Zeitreihe einschalten"}
        placement="right"
      >
        <ControlButtonStyler onClick={toggle} dataTestId="time-slider-control">
          <FontAwesomeIcon
            icon={faClock}
            style={{ color: panelOpen ? OPEN_COLOR : CLOSED_COLOR }}
          />
        </ControlButtonStyler>
      </Tooltip>
    </Control>
  );
};
