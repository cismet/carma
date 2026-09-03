import { useEffect, useRef } from "react";
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
    playIntervalMs = DEFAULT_PLAY_INTERVAL_MS,
    snapPlayIntervalMs,
    startEnabled = true,
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
    setOn,
    setValue,
    setLoaded,
  } = useTimeSliderActions();

  const { startSeries } = useTimeSeriesLauncher();

  // the flag-aware factory, so `?ff=nocage` exercises the fallback without
  // unlinking the cage submodule
  const createBlendLayer = useCreateBlendLayer();
  const isBlending = Boolean(createBlendLayer);

  const blendRef = useRef<BlendLayerHandle | null>(null);
  const snapRef = useRef<SnapLayerHandle | null>(null);
  /** whether the blend canvas is the visible surface right now */
  const blendShownRef = useRef(false);
  /** step whose tiles have to be up before the canvas may hand over */
  const pendingRestStepRef = useRef<number | null>(null);

  // read where the slider stands without making the mount effect depend on it,
  // which would tear the layer down and rebuild it on every scrub
  const valueRef = useRef(value);
  valueRef.current = value;
  const opacityRef = useRef(liveOpacity);
  opacityRef.current = liveOpacity;

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
    startSeries,
    setOn,
  ]);

  // Mount the layers for the channel's series. Both implementations attach
  // themselves on `styledata` and re-attach after a basemap swap.
  //
  // With cage present BOTH are mounted: the tile layer is the resting
  // surface, since a resting slider always sits on a whole step and tiles pan
  // the way tiles pan; the blend canvas takes over only while the series is
  // in motion. Without cage the tile layer is simply all there is.
  //
  // The position and opacity are handed over at construction through refs: the
  // effects below have already seen their current values and will not run
  // again for them.
  useEffect(() => {
    if (!libreMap || !isOn || !wmsUrl || layers.length === 0) {
      return undefined;
    }

    let disposed = false;
    const layerList = layers as string[];

    snapRef.current = createSnapLayer({
      map: libreMap,
      wmsUrl,
      layers: layerList,
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

    if (createBlendLayer) {
      blendRef.current = createBlendLayer({
        map: libreMap,
        wmsUrl,
        layers: layerList,
        styles,
        intermediateValuesCount,
        opacity: opacityRef.current,
        onFrameLoaded: (count) => {
          if (!disposed) setLoaded(count);
        },
        // a pan drops every cached frame, and the load line runs while they
        // come back; the tiles keep the map filled in the meantime
        onFramesReset: () => {
          if (!disposed) setLoaded(0);
        },
      });
      blendRef.current.setPosition(valueRef.current);
      // at rest until the visibility machine below says otherwise; hidden, the
      // frame cache still follows the viewport, so takeover is instant
      blendRef.current.setVisible(false);
    }

    return () => {
      disposed = true;
      blendShownRef.current = false;
      pendingRestStepRef.current = null;
      blendRef.current?.destroy();
      blendRef.current = null;
      snapRef.current?.destroy();
      snapRef.current = null;
    };
  }, [
    libreMap,
    isOn,
    wmsUrl,
    styles,
    stepsPerUnit,
    intermediateValuesCount,
    setLoaded,
    createBlendLayer,
    // the array identity changes exactly when the launcher writes a new series
    layers,
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
    blendRef.current?.setOpacity(liveOpacity);
    snapRef.current?.setOpacity(liveOpacity);
  }, [liveOpacity]);

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
    if (!isPlaying || !isOn || max <= 0) return undefined;
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
    max,
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
