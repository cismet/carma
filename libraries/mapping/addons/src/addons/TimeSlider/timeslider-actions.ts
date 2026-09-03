import { useCallback } from "react";

import { useAddonState } from "../../lib/AddonStateContext";
import { useIsCagedAvailable } from "../../lib/caged-addons";

/**
 * Everything about the running time series, in one channel.
 *
 * Three places read it and none of them owns it: the layer-bar row draws the
 * title and the current step, the ribbon in the interaction view scrubs it, and
 * the addon itself keeps the map layer in step with it. Local state in any of
 * the three would be invisible to the other two.
 */
export type TimeSliderState = {
  /** whether the series is on the map; the row exists exactly while it is */
  isOn: boolean;
  /** what the row and the ribbon call the series */
  title: string;
  /**
   * The series source, verbatim from its `TimeSeriesDefinition`. In the
   * channel rather than in the addon's config, so a workflow card can launch
   * a series into an engine that was mounted bare.
   */
  wmsUrl: string;
  layers: readonly string[];
  styles: string;
  /** sub-steps between two steps while blending; kept raw for pacing */
  intermediateValuesCount: number;
  /** slider position, in sub-steps when blending and in whole steps when not */
  value: number;
  /** highest position the slider may take */
  max: number;
  /** sub-steps per time step; 1 without cage */
  stepsPerUnit: number;
  /** what the ribbon shows per time step */
  labels: readonly string[];
  isPlaying: boolean;
  /** multiplies the configured play interval */
  speed: number;
  /** layer opacity, 0..1 */
  opacity: number;
  /**
   * Frames the caged layer has cached for the current viewport. Undefined until
   * the first one lands, which is also what a failing WMS looks like, so it
   * must not be shown as a count.
   */
  loaded?: number;
  /** whether the caged interpolation is in this build */
  isBlending: boolean;
  /**
   * Whether the ribbon is open. The host app owns that fact, so it is mirrored
   * in here: the control-column button and the layer-bar row both colour
   * themselves from it, and neither may read the app's store.
   */
  panelOpen: boolean;
};

export const TIME_SLIDER_STATE_DEFAULT: TimeSliderState = {
  isOn: false,
  title: "Zeitreihe",
  wmsUrl: "",
  layers: [],
  styles: "",
  intermediateValuesCount: 20,
  value: 0,
  max: 0,
  stepsPerUnit: 1,
  labels: [],
  isPlaying: false,
  speed: 1,
  opacity: 1,
  isBlending: false,
  panelOpen: false,
};

/**
 * What a route or a workflow declares to run a series: the data and nothing
 * derived. `useTimeSeriesLauncher` turns it into channel state; the blending
 * unit and the slider range are computed there, since only the build knows
 * whether the caged interpolation is present.
 */
export type TimeSeriesDefinition = {
  /** what the layer-bar row and the ribbon call the series */
  title: string;
  /** base url, everything up to and including `?SERVICE=WMS` */
  wmsUrl: string;
  /** one WMS layer per time step, in order */
  layers: readonly string[];
  /** what the slider shows per step, e.g. the elapsed time */
  labels: readonly string[];
  styles: string;
  /** sub-steps between two steps while blending. Default: 20 */
  intermediateValuesCount?: number;
  /** layer opacity, 0..1. Default: 1 */
  opacity?: number;
  /** whole step the slider starts on. Default: 0 */
  initialStep?: number;
};

/**
 * The nearest whole time step. The only positions the slider may *rest* on: a
 * blend between two steps is a transient for the eye during a drag or the
 * animation, not a state, since it shows data no simulation step ever produced.
 */
const snappedValue = (state: TimeSliderState, raw: number): number => {
  const unit = Math.max(state.stepsPerUnit, 1);
  const value = Math.round(raw / unit) * unit;
  return Math.max(0, Math.min(value, state.max));
};

const sameSeriesDefinition = (
  state: TimeSliderState,
  def: TimeSeriesDefinition
): boolean =>
  state.title === def.title &&
  state.wmsUrl === def.wmsUrl &&
  state.styles === def.styles &&
  state.layers.length === def.layers.length &&
  state.layers.every((layer, index) => layer === def.layers[index]);

/**
 * One entry point for all three writers, so the row, the ribbon and the map
 * layer cannot drift. Session-only on purpose: the series a route declares is
 * config, not something a visitor picks, so there is nothing worth restoring.
 */
export const useTimeSliderActions = () => {
  const [sessionState, setSessionState] = useAddonState("timeSeries");
  const state = sessionState ?? TIME_SLIDER_STATE_DEFAULT;

  const setState = useCallback(
    (updater: (previous: TimeSliderState) => TimeSliderState) =>
      setSessionState((previous) =>
        updater(previous ?? TIME_SLIDER_STATE_DEFAULT)
      ),
    [setSessionState]
  );

  const setOn = useCallback(
    (next: boolean) =>
      setState((previous) =>
        previous.isOn === next
          ? previous
          : {
              ...previous,
              isOn: next,
              // stopping the animation with it, so switching back on does not
              // resume something the user cannot see running; and parking the
              // position on a whole step, so it does not come back mid-blend
              isPlaying: next && previous.isPlaying,
              value: next
                ? previous.value
                : snappedValue(previous, previous.value),
            }
      ),
    [setState]
  );

  const toggle = useCallback(
    () => setState((previous) => ({ ...previous, isOn: !previous.isOn })),
    [setState]
  );

  const setValue = useCallback(
    (next: number) =>
      setState((previous) => {
        const value = Math.max(0, Math.min(Math.round(next), previous.max));
        return previous.value === value ? previous : { ...previous, value };
      }),
    [setState]
  );

  /** one whole time step in either direction, from the ribbon's chevrons */
  const stepBy = useCallback(
    (steps: number) =>
      setState((previous) => {
        const stepIndex = Math.round(previous.value / previous.stepsPerUnit);
        const value = Math.max(
          0,
          Math.min((stepIndex + steps) * previous.stepsPerUnit, previous.max)
        );
        return previous.value === value ? previous : { ...previous, value };
      }),
    [setState]
  );

  const setPlaying = useCallback(
    (next: boolean) =>
      setState((previous) =>
        previous.isPlaying === next
          ? previous
          : {
              ...previous,
              isPlaying: next,
              // stopping between two steps is not a state; see `snappedValue`
              value: next
                ? previous.value
                : snappedValue(previous, previous.value),
            }
      ),
    [setState]
  );

  const togglePlay = useCallback(
    () =>
      setState((previous) => ({
        ...previous,
        isPlaying: !previous.isPlaying,
        value: previous.isPlaying
          ? snappedValue(previous, previous.value)
          : previous.value,
      })),
    [setState]
  );

  /** where a released drag lands: the whole step nearest to `raw` */
  const snapValue = useCallback(
    (raw: number) =>
      setState((previous) => {
        const value = snappedValue(previous, raw);
        return previous.value === value ? previous : { ...previous, value };
      }),
    [setState]
  );

  const setSpeed = useCallback(
    (next: number) =>
      setState((previous) =>
        previous.speed === next ? previous : { ...previous, speed: next }
      ),
    [setState]
  );

  const setOpacity = useCallback(
    (next: number) =>
      setState((previous) => {
        const opacity = Math.max(0, Math.min(next, 1));
        return previous.opacity === opacity
          ? previous
          : { ...previous, opacity };
      }),
    [setState]
  );

  /** written by the app-side row hook, which is where the panel state lives */
  const setPanelOpen = useCallback(
    (next: boolean) =>
      setState((previous) =>
        previous.panelOpen === next
          ? previous
          : { ...previous, panelOpen: next }
      ),
    [setState]
  );

  const setLoaded = useCallback(
    (next: number) =>
      setState((previous) =>
        previous.loaded === next ? previous : { ...previous, loaded: next }
      ),
    [setState]
  );

  const total = state.labels.length;
  const stepIndex = Math.min(
    Math.round(state.value / Math.max(state.stepsPerUnit, 1)),
    Math.max(total - 1, 0)
  );
  const label = state.labels[stepIndex] ?? `Schritt ${stepIndex + 1}`;

  return {
    ...state,
    /** how many time steps the series has */
    total,
    /** the step the position is nearest to */
    stepIndex,
    /** that step's label, or its number when the series brought none */
    label,
    setOn,
    toggle,
    setValue,
    snapValue,
    stepBy,
    setPlaying,
    togglePlay,
    setSpeed,
    setOpacity,
    setPanelOpen,
    setLoaded,
  };
};

/**
 * Launches a `TimeSeriesDefinition` into the `timeSeries` channel.
 *
 * This is the configuration mechanism: the engine (`TimeSlider`) runs whatever
 * series the channel holds, and this hook is the only writer of a series. A
 * route with a full config uses `startSeries` at mount; a workflow card uses
 * `toggleSeries` on click, so the same card switches the series on and off.
 *
 * The derived fields are computed here because only the build knows whether
 * the caged interpolation is present: with cage the slider counts in
 * sub-steps, without it in whole steps.
 */
export const useTimeSeriesLauncher = () => {
  const [, setSessionState] = useAddonState("timeSeries");
  const isBlending = useIsCagedAvailable();

  const setState = useCallback(
    (updater: (previous: TimeSliderState) => TimeSliderState) =>
      setSessionState((previous) =>
        updater(previous ?? TIME_SLIDER_STATE_DEFAULT)
      ),
    [setSessionState]
  );

  const launchedState = useCallback(
    (previous: TimeSliderState, def: TimeSeriesDefinition): TimeSliderState => {
      const intermediateValuesCount = Math.max(
        1,
        Math.round(def.intermediateValuesCount ?? 20)
      );
      const stepsPerUnit = isBlending ? intermediateValuesCount : 1;
      const max = Math.max(def.layers.length - 1, 0) * stepsPerUnit;
      if (
        sameSeriesDefinition(previous, def) &&
        previous.stepsPerUnit === stepsPerUnit
      ) {
        // the series is already in the channel; keep its position and settings
        return previous.isOn ? previous : { ...previous, isOn: true };
      }
      return {
        ...TIME_SLIDER_STATE_DEFAULT,
        title: def.title,
        wmsUrl: def.wmsUrl,
        layers: def.layers,
        labels: def.labels,
        styles: def.styles,
        intermediateValuesCount,
        stepsPerUnit,
        max,
        isBlending,
        opacity: def.opacity ?? 1,
        value: Math.min(
          Math.max(0, Math.round(def.initialStep ?? 0)) * stepsPerUnit,
          max
        ),
        isOn: true,
        // the ribbon's visibility is the host's fact, not the series'
        panelOpen: previous.panelOpen,
      };
    },
    [isBlending]
  );

  const startSeries = useCallback(
    (def: TimeSeriesDefinition) =>
      setState((previous) => launchedState(previous, def)),
    [setState, launchedState]
  );

  /** the same, but a second launch of the running series switches it off */
  const toggleSeries = useCallback(
    (def: TimeSeriesDefinition) =>
      setState((previous) =>
        sameSeriesDefinition(previous, def) && previous.isOn
          ? {
              ...previous,
              isOn: false,
              isPlaying: false,
              value: snappedValue(previous, previous.value),
            }
          : launchedState(previous, def)
      ),
    [setState, launchedState]
  );

  return { startSeries, toggleSeries };
};
