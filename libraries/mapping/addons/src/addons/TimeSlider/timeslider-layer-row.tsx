import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPause, faPlay } from "@fortawesome/free-solid-svg-icons";

import type { InteractionButton, Layer } from "@carma-mapping/layers";

import type { TimeSliderConfig } from "./TimeSlider";
import {
  useTimeSeriesLauncher,
  useTimeSliderActions,
  type TimeSeriesDefinition,
} from "./timeslider-actions";

export const TIME_SLIDER_LAYER_ID = "__timeSlider__";

/** the ribbon the row opens, registered by the host */
export const TIME_SLIDER_TOOLS_INTERACTION_ID = "time-slider-tools";

/** the row's own play/pause, which acts instead of opening anything */
export const TIME_SLIDER_PLAY_TOGGLE_ID = "time-slider-play-toggle";

/** blue while the ribbon is open, black while it is not */
export const TIME_SLIDER_ICON_COLOR = { open: "#1677ff", closed: "#000000" };

/** pulls the readout away from the title and towards the buttons */
const READOUT_STYLE: CSSProperties = {
  marginLeft: "6px",
  paddingLeft: "8px",
  borderLeft: "1px solid rgb(0 0 0 / 0.12)",
};

/**
 * The row the layer bar shows while the series is on the map: the title, the
 * step the slider sits on, and play/pause. Same shape as the comparison's and
 * the selection's rows, so a route's tools all read as one family.
 */
export const TIME_SLIDER_LAYER: Layer = {
  id: TIME_SLIDER_LAYER_ID,
  title: "Zeitreihe",
  type: "object",
  icon: "timeSeries",
  iconColor: TIME_SLIDER_ICON_COLOR.closed,
  visible: true,
  pinned: "last",
  skipSelection: true,
  rowClickInteractionId: TIME_SLIDER_TOOLS_INTERACTION_ID,
};

const buildInteractionButtons = ({
  label,
  isPlaying,
  togglePlay,
}: {
  label: string;
  isPlaying: boolean;
  togglePlay: () => void;
}): InteractionButton[] => [
  {
    // same id as `rowClickInteractionId`, so the readout is lit while the
    // ribbon is open and clicking it closes the ribbon again
    id: TIME_SLIDER_TOOLS_INTERACTION_ID,
    icon: (
      <span className="tabular-nums" style={READOUT_STYLE}>
        {label}
      </span>
    ),
    tooltip: "Zeitreihe einstellen",
  },
  {
    id: TIME_SLIDER_PLAY_TOGGLE_ID,
    icon: <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />,
    tooltip: isPlaying ? "Animation anhalten" : "Animation abspielen",
    onClick: togglePlay,
  },
];

/**
 * The series a rehydrated row carries in its `timeSlider` tool entry, if it is
 * complete enough to relaunch. The row embeds it in the same encoding a
 * workflow card uses, so the persisted layer stack is the only storage the
 * series needs to survive a reload.
 */
export const getTimeSliderRowSeed = (
  layer?: { tools?: unknown } | null
): TimeSeriesDefinition | undefined => {
  const tools = Array.isArray(layer?.tools) ? (layer.tools as unknown[]) : [];
  const entry = tools.find(
    (tool): tool is { kind: string; config?: TimeSliderConfig } =>
      typeof tool === "object" &&
      tool !== null &&
      (tool as { kind?: unknown }).kind === "timeSlider"
  );
  const config = entry?.config;
  if (!config?.wmsUrl || !config.layers?.length) return undefined;
  return {
    title: config.title ?? "Zeitreihe",
    wmsUrl: config.wmsUrl,
    layers: config.layers,
    labels: config.labels ?? [],
    styles: config.styles ?? "",
    intermediateValuesCount: config.intermediateValuesCount,
    opacity: config.opacity,
    initialStep: config.initialStep,
  };
};

export type UseTimeSliderLayerRowOptions = {
  /** whether the host already shows the row */
  hasRow: boolean;
  /**
   * Whether this route mounts the addon that draws the series. The row is
   * persisted and the channel is not, so a row can arrive on a route that
   * declares no `timeSlider`: the label and the play button come back, and
   * nothing is able to put a layer on the map. Such a row is dropped rather
   * than shown, see `useHasAddonStateProducer`.
   */
  hasEngine: boolean;
  /**
   * The series found in a row restored from a persisted session, from
   * `getTimeSliderRowSeed`. Relaunched once at boot instead of the row being
   * treated as stale; ignored as soon as the series has run in this session.
   */
  restoredSeed?: TimeSeriesDefinition;
  /**
   * Whether the host is showing the ribbon. The row's icon is blue while it is
   * and black while it is not, so the colour says "open", not "running".
   */
  panelOpen: boolean;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  /** the host keeps a snapshot, so a changed row has to be handed over again */
  onUpdate?: (layer: Layer) => void;
};

/**
 * Keeps the row and the series in step. The row belongs to the host: the addon
 * only says when it should appear and what it contains, so no store reaches
 * into this library.
 */
export const useTimeSliderLayerRow = ({
  hasRow,
  hasEngine,
  panelOpen,
  restoredSeed,
  onAdd,
  onRemove,
  onUpdate,
}: UseTimeSliderLayerRowOptions) => {
  const {
    isOn,
    setOn,
    title,
    label,
    isPlaying,
    togglePlay,
    setPanelOpen,
    wmsUrl,
    layers: seriesLayers,
    labels,
    styles,
    intermediateValuesCount,
    opacity,
    stepIndex,
  } = useTimeSliderActions();
  const { startSeries } = useTimeSeriesLauncher();

  // the app owns the panel state; the control-column button reads it from here
  useEffect(() => {
    setPanelOpen(panelOpen);
  }, [panelOpen, setPanelOpen]);

  const layer = useMemo(
    () => ({
      ...TIME_SLIDER_LAYER,
      title,
      iconColor: panelOpen
        ? TIME_SLIDER_ICON_COLOR.open
        : TIME_SLIDER_ICON_COLOR.closed,
      interactionButtons: buildInteractionButtons({
        label,
        isPlaying,
        togglePlay,
      }),
      // The row's rebirth config, in the encoding a workflow card uses. The
      // row is what the host persists (the rehydrate filter keeps mode rows
      // that carry tools), so a reload finds the series right here.
      tools: wmsUrl
        ? [
            {
              kind: "timeSlider",
              config: {
                title,
                wmsUrl,
                layers: seriesLayers,
                labels,
                styles,
                intermediateValuesCount,
                opacity,
                initialStep: stepIndex,
              } satisfies TimeSliderConfig,
            },
          ]
        : undefined,
    }),
    [
      title,
      label,
      panelOpen,
      isPlaying,
      togglePlay,
      wmsUrl,
      seriesLayers,
      labels,
      styles,
      intermediateValuesCount,
      opacity,
      stepIndex,
    ]
  );
  const layerRef = useRef(layer);
  layerRef.current = layer;

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // the row carries the current step, so it goes stale on every slider move
  useEffect(() => {
    if (hasEngine && hasRow) {
      onUpdateRef.current?.(layer);
    }
  }, [hasEngine, hasRow, layer]);

  const prevRef = useRef({ isOn, hasRow });
  /** what we last asked the host for, so a re-render before the host's state
   *  catches up does not send the same request twice */
  const requestedRef = useRef<"add" | "remove" | null>(null);

  /** whether the series has run in this session; a restore only happens before */
  const everOnRef = useRef(isOn);
  if (isOn) everOnRef.current = true;
  const restoredSeedRef = useRef(restoredSeed);
  restoredSeedRef.current = restoredSeed;

  /** the warning is about the route's configuration, so once is enough */
  const warnedRef = useRef(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { isOn, hasRow };

    // No engine on this route: nothing can draw the series, so the row goes
    // instead of offering a control with nothing behind it. Reached by a row
    // that outlived the route it was added on, which is a configuration
    // mistake rather than something a visitor can cause.
    if (!hasEngine) {
      if (hasRow) {
        if (!warnedRef.current) {
          warnedRef.current = true;
          console.warn(
            '[ADDON STATE] a time-series row reached a route that mounts no "timeSlider" ' +
              "addon; dropping the row. A route that offers the series has to declare the addon."
          );
        }
        requestedRef.current = null;
        onRemoveRef.current(TIME_SLIDER_LAYER_ID);
      }
      return;
    }

    // a row restored from a persisted session, with its series in its tools:
    // relaunch that series instead of removing the row as stale
    if (!isOn && hasRow && !everOnRef.current && restoredSeedRef.current) {
      requestedRef.current = null;
      startSeries(restoredSeedRef.current);
      return;
    }

    // removed via the row's ✕ while the series is still on the map
    if (isOn && !hasRow && prev.hasRow) {
      requestedRef.current = null;
      setOn(false);
      return;
    }

    if (isOn === hasRow) {
      requestedRef.current = null;
      return;
    }

    if (isOn && requestedRef.current !== "add") {
      requestedRef.current = "add";
      onAddRef.current(layerRef.current);
      return;
    }

    // a restored row without a usable series in its tools ends up here: stale
    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(TIME_SLIDER_LAYER_ID);
    }
  }, [hasEngine, hasRow, isOn, setOn, startSeries]);
};
