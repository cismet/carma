import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import {
  getShadowSimulationContentStatus,
  subscribeShadowSimulationContentStatus,
} from "@carma-mapping/engines/maplibre";
import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import { SolarDayTimeControl } from "./SolarDayTimeControl";
import { buildShadowSimulationScene } from "./shadow-scene";
import type {
  ShadowSimulationScene,
  ShadowTerrainOptions,
} from "./shadow-scene";
import {
  clampSelectionToDaylight,
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  getSolarPosition,
  getSolarSelectionForInstant,
  type SolarLocation,
  type SolarSelection,
} from "./solar-position";

const ACTIVE_CONTROL_COLOR = "#1677ff";
const DEFAULT_TERRAIN_COLOR = "#d8d1c4";

const resolveTerrainColor = (value: unknown) => {
  if (typeof value === "string" && /^#[\da-f]{6}$/i.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `#${Math.max(0, Math.min(0xffffff, Math.round(value)))
      .toString(16)
      .padStart(6, "0")}`;
  }
  return DEFAULT_TERRAIN_COLOR;
};

export type ShadowSimulationConfig = {
  year?: number;
  initialDayOfYear?: number;
  initialMinutes?: number;
  latitude?: number;
  longitude?: number;
  timeZone?: string;
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
  controlPosition?: Positions;
  controlOrder?: number;
};

export type ShadowSimulationState = {
  enabled: boolean;
  selection: SolarSelection;
  terrainColor: string;
};

const ShadowSimulationSettings = ({
  location,
  state,
  setState,
  showTerrainColor,
}: {
  location: SolarLocation;
  state: ShadowSimulationState;
  setState: (state: ShadowSimulationState) => void;
  showTerrainColor: boolean;
}) => {
  const terrainColor = state.terrainColor ?? DEFAULT_TERRAIN_COLOR;
  const solarPosition = useMemo(
    () => getSolarPosition(state.selection, location),
    [location, state.selection]
  );

  return (
    <div className="w-full" data-test-id="shadow-simulation-settings-pane">
      <SolarDayTimeControl
        expanded
        location={location}
        selection={state.selection}
        position={solarPosition}
        onChange={(selection) =>
          setState({ ...state, selection, terrainColor })
        }
      />
      {showTerrainColor && (
        <label className="mt-1 flex items-center gap-2 px-1 text-sm text-slate-700">
          <span>Terrainfarbe</span>
          <input
            type="color"
            value={terrainColor}
            onChange={(event) =>
              setState({
                ...state,
                terrainColor: event.currentTarget.value,
              })
            }
            className="h-7 w-10 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5"
            aria-label="Terrainfarbe"
            data-test-id="shadow-simulation-terrain-color"
          />
          <span className="tabular-nums text-slate-500">
            {terrainColor.toUpperCase()}
          </span>
        </label>
      )}
    </div>
  );
};

const ShadowSimulationRuntime = ({
  libreMap,
  shadowAreaMeters,
  terrain,
  location,
  state,
  available,
}: {
  libreMap: AddonComponentProps<"shadowSimulation">["libreMap"];
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
  location: SolarLocation;
  state: ShadowSimulationState;
  available: boolean;
}) => {
  const shadowScene = useRef<ShadowSimulationScene | null>(null);
  const solarPosition = useMemo(
    () => getSolarPosition(state.selection, location),
    [location, state.selection]
  );

  useEffect(() => {
    if (!libreMap || !state.enabled || !available) return;
    const scene = buildShadowSimulationScene(libreMap, {
      shadowAreaMeters,
      terrain,
    });
    shadowScene.current = scene;
    return () => {
      shadowScene.current = null;
      scene.dispose();
    };
  }, [available, libreMap, shadowAreaMeters, state.enabled, terrain]);

  useEffect(() => {
    shadowScene.current?.updateSolarPosition(solarPosition);
  }, [solarPosition]);

  useEffect(() => {
    shadowScene.current?.updateTerrainColor(
      state.terrainColor ?? DEFAULT_TERRAIN_COLOR
    );
  }, [state.terrainColor]);

  return null;
};

export const ShadowSimulation = ({
  config,
  libreMap,
  target,
}: AddonComponentProps<"shadowSimulation">) => {
  const {
    year,
    initialDayOfYear,
    initialMinutes,
    latitude = DEFAULT_SHADOW_SIMULATION_LOCATION.latitude,
    longitude = DEFAULT_SHADOW_SIMULATION_LOCATION.longitude,
    timeZone = DEFAULT_SHADOW_SIMULATION_LOCATION.timeZone,
    shadowAreaMeters,
    terrain,
    controlPosition = "topleft",
    controlOrder = 70,
  } = config ?? {};
  const location = useMemo(
    () => ({ latitude, longitude, timeZone }),
    [latitude, longitude, timeZone]
  );
  const initialState = useMemo<ShadowSimulationState>(() => {
    const now = getSolarSelectionForInstant(new Date(), timeZone);
    const candidate = {
      year: year ?? now.year,
      dayOfYear: initialDayOfYear ?? now.dayOfYear,
      minutes: initialMinutes ?? now.minutes,
    };
    return {
      enabled: false,
      terrainColor: resolveTerrainColor(terrain?.material?.color),
      selection: clampSelectionToDaylight(candidate, location) ?? {
        ...candidate,
        minutes: 12 * 60,
      },
    };
  }, [initialDayOfYear, initialMinutes, location, terrain, timeZone, year]);
  const [sharedState, setSharedState] = useAddonState("shadowSimulation");
  const state = sharedState ?? initialState;
  const shadowAvailable = useSyncExternalStore(
    (listener) =>
      libreMap
        ? subscribeShadowSimulationContentStatus(libreMap, listener)
        : () => undefined,
    () => {
      if (!libreMap) return false;
      return getShadowSimulationContentStatus(libreMap).available;
    },
    () => false
  );

  useEffect(() => {
    if (!sharedState) setSharedState(initialState);
  }, [initialState, setSharedState, sharedState]);

  if (target) {
    return (
      <ShadowSimulationSettings
        location={location}
        state={state}
        setState={setSharedState}
        showTerrainColor={!!terrain}
      />
    );
  }

  return (
    <>
      {libreMap && (
        <Control position={controlPosition} order={controlOrder}>
          <Tooltip
            title={
              !shadowAvailable
                ? "Kein sichtbarer 3D-Inhalt"
                : state.enabled
                ? "Schattensimulation ausschalten"
                : "Schattensimulation einschalten"
            }
            placement="right"
          >
            <ControlButtonStyler
              onClick={() =>
                setSharedState({ ...state, enabled: !state.enabled })
              }
              dataTestId="shadow-simulation-control-button"
              disabled={!shadowAvailable}
              useDisabledStyle
              aria-label={
                state.enabled
                  ? "Schattensimulation ausschalten"
                  : "Schattensimulation einschalten"
              }
              aria-pressed={state.enabled && shadowAvailable}
            >
              <FontAwesomeIcon
                icon={faSun}
                style={
                  state.enabled && shadowAvailable
                    ? { color: ACTIVE_CONTROL_COLOR }
                    : undefined
                }
              />
            </ControlButtonStyler>
          </Tooltip>
        </Control>
      )}
      <ShadowSimulationRuntime
        libreMap={libreMap}
        shadowAreaMeters={shadowAreaMeters}
        terrain={terrain}
        location={location}
        state={state}
        available={shadowAvailable}
      />
    </>
  );
};
