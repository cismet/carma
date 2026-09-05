import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faPause,
  faPlay,
} from "@fortawesome/free-solid-svg-icons";

import type { InteractionButton, Layer } from "@carma-mapping/layers";

import {
  useVehicleAnimationActions,
  useVehicleAnimationLauncher,
  type VehicleAnimationDefinition,
} from "./vehicle-actions";
import type { VehicleAnimationConfig } from "./VehicleAnimation";

export const VEHICLE_ANIMATION_LAYER_ID = "__vehicleAnimation__";

/** the readout the row shows instead of opening anything */
export const VEHICLE_ANIMATION_STATUS_ID = "vehicle-animation-status";
/** stop the vehicles where they are, and let them go again */
export const VEHICLE_ANIMATION_PLAY_ID = "vehicle-animation-play";
/** fly the map to one of them, for when there is no vehicle in view */
export const VEHICLE_ANIMATION_FOCUS_ID = "vehicle-animation-focus";

const ICON_COLOR = { running: "#1677ff", idle: "#8c8c8c" };

/** pulls the readout away from the title and towards the buttons */
const READOUT_STYLE: CSSProperties = {
  marginLeft: "6px",
  paddingLeft: "8px",
  borderLeft: "1px solid rgb(0 0 0 / 0.12)",
  fontSize: "11px",
};

/**
 * The row the layer bar shows while the animation is on the map. Same shape as
 * the flow field's row, so a route's tools read as one family.
 *
 * It has no ribbon: the animation has no position worth scrubbing, so the row's
 * whole job is to say the vehicle is running, say why it is not when it is not,
 * hold it still, and switch it off.
 */
export const VEHICLE_ANIMATION_LAYER: Layer = {
  id: VEHICLE_ANIMATION_LAYER_ID,
  title: "Fahrzeug",
  type: "object",
  icon: "vehicleAnimation",
  iconColor: ICON_COLOR.running,
  visible: true,
  pinned: "last",
  skipSelection: true,
};

/** seconds as the minutes-and-seconds a timetable is written in */
const headwayLabel = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest === 0
    ? `${minutes}-Min-Takt`
    : `${minutes}:${String(rest).padStart(2, "0")}-Takt`;
};

/**
 * What the readout says.
 *
 * An animation whose route failed to load is the case worth spelling out:
 * everything else about the row looks exactly as it does while the fleet is
 * running, so without a word an empty map reads as broken rather than as a
 * missing file. With a timetable the fleet size is the interesting number,
 * because it is counted from the route rather than configured.
 */
const statusLabel = ({
  isLoading,
  error,
  isPaused,
  speedKmh,
  fleetSize,
  headwaySeconds,
}: {
  isLoading: boolean;
  error: string | null;
  isPaused: boolean;
  speedKmh: number;
  fleetSize: number;
  headwaySeconds: number;
}): string => {
  if (error) return "Strecke fehlt";
  if (isLoading) return "lädt";
  if (isPaused) return "angehalten";
  if (headwaySeconds > 0 && fleetSize > 0) {
    return `${fleetSize} Bahnen · ${headwayLabel(headwaySeconds)}`;
  }
  return `${Math.round(speedKmh)} km/h`;
};

const buildInteractionButtons = (
  label: string,
  isPaused: boolean,
  canPlay: boolean,
  onTogglePaused: () => void,
  onFocus: () => void
): InteractionButton[] => [
  ...(canPlay
    ? [
        {
          id: VEHICLE_ANIMATION_PLAY_ID,
          icon: <FontAwesomeIcon icon={isPaused ? faPlay : faPause} />,
          tooltip: isPaused ? "Fahrten fortsetzen" : "Fahrten anhalten",
          onClick: onTogglePaused,
        },
      ]
    : []),
  {
    id: VEHICLE_ANIMATION_STATUS_ID,
    icon: <span style={READOUT_STYLE}>{label}</span>,
    tooltip: "Zustand der Fahrten",
  },
  // last, so the magnifier keeps the same place whatever the readout says
  ...(canPlay
    ? [
        {
          id: VEHICLE_ANIMATION_FOCUS_ID,
          icon: <FontAwesomeIcon icon={faMagnifyingGlass} />,
          tooltip: "Zu einer Bahn springen",
          onClick: onFocus,
        },
      ]
    : []),
];

/**
 * The service a rehydrated row carries in its `vehicleAnimation` tool entry, if
 * it is complete enough to relaunch. The row embeds it in the same encoding a
 * workflow card uses, so the persisted layer stack is the only storage the
 * animation needs to survive a reload.
 */
export const getVehicleAnimationRowSeed = (
  layer?: { tools?: unknown } | null
): VehicleAnimationDefinition | undefined => {
  const tools = Array.isArray(layer?.tools) ? (layer.tools as unknown[]) : [];
  const entry = tools.find(
    (tool): tool is { kind: string; config?: VehicleAnimationConfig } =>
      typeof tool === "object" &&
      tool !== null &&
      (tool as { kind?: unknown }).kind === "vehicleAnimation"
  );
  const config = entry?.config;
  if (!config?.trackUrl) return undefined;
  return {
    ...config,
    title: config.title ?? "Fahrzeug",
    trackUrl: config.trackUrl,
  };
};

export type UseVehicleAnimationLayerRowOptions = {
  /** whether the host currently shows the row */
  hasRow: boolean;
  /**
   * Whether this route mounts the addon that draws the animation. A row that
   * outlived its route has nothing behind it and is dropped.
   */
  hasEngine: boolean;
  /**
   * The service found in a row restored from a persisted session, from
   * `getVehicleAnimationRowSeed`. Relaunched once at boot instead of the row
   * being dropped as stale.
   */
  restoredSeed?: VehicleAnimationDefinition;
  onAdd: (layer: Layer) => void;
  onRemove: (id: string) => void;
  /** the host keeps a snapshot, so a changed row has to be handed over again */
  onUpdate?: (layer: Layer) => void;
};

/**
 * Keeps the row and the animation in step. The row belongs to the host: the
 * addon only says when it should appear and what it contains, so no store
 * reaches into this library.
 */
export const useVehicleAnimationLayerRow = ({
  hasRow,
  hasEngine,
  restoredSeed,
  onAdd,
  onRemove,
  onUpdate,
}: UseVehicleAnimationLayerRowOptions) => {
  const {
    isOn,
    setOn,
    title,
    trackUrl,
    lengthMeters,
    widthMeters,
    sectionShares,
    jointMeters,
    mode,
    stations,
    dwellSeconds,
    stationRadiusMeters,
    showStations,
    bodyColor,
    jointColor,
    outlineColor,
    opacity,
    showTrack,
    trackColor,
    structureUrl,
    isPaused,
    isLoading,
    error,
    speedKmh,
    fleetSize,
    headwaySeconds,
    togglePaused,
    requestFocus,
  } = useVehicleAnimationActions();
  const { startVehicle } = useVehicleAnimationLauncher();

  const label = statusLabel({
    isLoading,
    error,
    isPaused,
    speedKmh,
    fleetSize,
    headwaySeconds,
  });
  const canPlay = !error && !isLoading;

  const layer = useMemo(
    () => ({
      ...VEHICLE_ANIMATION_LAYER,
      title,
      iconColor: canPlay && !isPaused ? ICON_COLOR.running : ICON_COLOR.idle,
      interactionButtons: buildInteractionButtons(
        label,
        isPaused,
        canPlay,
        togglePaused,
        requestFocus
      ),
      // The row's rebirth config, in the encoding a workflow card uses. The row
      // is what the host persists (the rehydrate filter keeps mode rows that
      // carry tools), so a reload finds the service right here.
      tools: trackUrl
        ? [
            {
              kind: "vehicleAnimation",
              config: {
                title,
                trackUrl,
                lengthMeters,
                widthMeters,
                sectionShares,
                jointMeters,
                speedKmh,
                mode,
                ...(headwaySeconds > 0 && stations.length > 0
                  ? {
                      schedule: {
                        headwaySeconds,
                        dwellSeconds,
                        stations,
                        stationRadiusMeters,
                        showStations,
                      },
                    }
                  : {}),
                bodyColor,
                jointColor,
                outlineColor,
                opacity,
                showTrack,
                trackColor,
                ...(structureUrl ? { structureUrl } : {}),
              } satisfies VehicleAnimationConfig,
            },
          ]
        : undefined,
    }),
    [
      title,
      label,
      isPaused,
      canPlay,
      togglePaused,
      requestFocus,
      trackUrl,
      lengthMeters,
      widthMeters,
      sectionShares,
      jointMeters,
      speedKmh,
      mode,
      headwaySeconds,
      dwellSeconds,
      stations,
      stationRadiusMeters,
      showStations,
      bodyColor,
      jointColor,
      outlineColor,
      opacity,
      showTrack,
      trackColor,
      structureUrl,
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

  // the readout changes with the route load and with pausing, so the row goes
  // stale without the animation itself changing
  useEffect(() => {
    if (hasEngine && hasRow) {
      onUpdateRef.current?.(layer);
    }
  }, [hasEngine, hasRow, layer]);

  /** whether the fleet has run in this session; a restore only happens before */
  const everOnRef = useRef(isOn);
  if (isOn) everOnRef.current = true;
  const restoredSeedRef = useRef(restoredSeed);
  restoredSeedRef.current = restoredSeed;

  const prevRef = useRef({ isOn, hasRow });
  /** what we last asked the host for, so a re-render before the host's state
   *  catches up does not send the same request twice */
  const requestedRef = useRef<"add" | "remove" | null>(null);
  /** the warning is about the route's configuration, so once is enough */
  const warnedRef = useRef(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { isOn, hasRow };

    // No engine on this route: nothing can draw the animation, so the row goes
    // instead of offering a control with nothing behind it.
    if (!hasEngine) {
      if (hasRow) {
        if (!warnedRef.current) {
          warnedRef.current = true;
          console.warn(
            "[ADDON STATE] a vehicle-animation row reached a route that mounts no " +
              '"vehicleAnimation" addon; dropping the row. A route that offers the ' +
              "animation has to declare the addon."
          );
        }
        requestedRef.current = null;
        onRemoveRef.current(VEHICLE_ANIMATION_LAYER_ID);
      }
      return;
    }

    // a row restored from a persisted session, with its service in its tools:
    // relaunch that service instead of removing the row as stale
    if (!isOn && hasRow && !everOnRef.current && restoredSeedRef.current) {
      requestedRef.current = null;
      startVehicle(restoredSeedRef.current);
      return;
    }

    // removed via the row's ✕ while the animation is still on the map
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

    // a restored row without a usable service in its tools ends up here: stale
    if (!isOn && requestedRef.current !== "remove") {
      requestedRef.current = "remove";
      onRemoveRef.current(VEHICLE_ANIMATION_LAYER_ID);
    }
  }, [hasEngine, hasRow, isOn, setOn, startVehicle]);
};
