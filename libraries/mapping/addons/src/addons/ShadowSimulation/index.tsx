import { useEffect, useMemo, useRef, useState } from "react";

import { faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import { SolarDayTimeControl } from "./SolarDayTimeControl";
import {
  buildShadowSimulationScene,
  DEFAULT_SHADOW_QUALITY,
} from "./shadow-scene";
import type {
  ShadowQualityMultiplier,
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
const DEFAULT_BUILDING_COLOR = "#d8d1c4";

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
  buildingsFullOpacity: boolean;
  useUniformBuildingColor: boolean;
  buildingColor: string;
  shadowQuality: ShadowQualityMultiplier;
  showSunDebugVector: boolean;
};

const getMapCenterSolarLocation = (
  libreMap: AddonComponentProps<"shadowSimulation">["libreMap"],
  fallbackLatitude: number,
  fallbackLongitude: number,
  timeZone: string
): SolarLocation => {
  const center = libreMap?.getCenter();
  return {
    latitude: center?.lat ?? fallbackLatitude,
    longitude: center?.lng ?? fallbackLongitude,
    timeZone,
  };
};

const useMapCenterSolarLocation = (
  libreMap: AddonComponentProps<"shadowSimulation">["libreMap"],
  fallbackLatitude: number,
  fallbackLongitude: number,
  timeZone: string
): SolarLocation => {
  const [location, setLocation] = useState<SolarLocation>(() =>
    getMapCenterSolarLocation(
      libreMap,
      fallbackLatitude,
      fallbackLongitude,
      timeZone
    )
  );

  useEffect(() => {
    const updateLocation = () => {
      const next = getMapCenterSolarLocation(
        libreMap,
        fallbackLatitude,
        fallbackLongitude,
        timeZone
      );
      setLocation((current) =>
        current.latitude === next.latitude &&
        current.longitude === next.longitude &&
        current.timeZone === next.timeZone
          ? current
          : next
      );
    };
    updateLocation();
    if (!libreMap) return;
    libreMap.on("moveend", updateLocation);
    return () => {
      libreMap.off("moveend", updateLocation);
    };
  }, [fallbackLatitude, fallbackLongitude, libreMap, timeZone]);

  return location;
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
  const buildingsFullOpacity = state.buildingsFullOpacity ?? true;
  const useUniformBuildingColor = state.useUniformBuildingColor ?? true;
  const buildingColor = state.buildingColor ?? DEFAULT_BUILDING_COLOR;
  const shadowQuality = state.shadowQuality ?? DEFAULT_SHADOW_QUALITY;
  const showSunDebugVector = state.showSunDebugVector ?? false;
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
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-slate-700">
        <label className="flex items-center gap-2">
          <span>Schattenqualität</span>
          <select
            value={shadowQuality}
            onChange={(event) =>
              setState({
                ...state,
                shadowQuality: Number(
                  event.currentTarget.value
                ) as ShadowQualityMultiplier,
              })
            }
            className="rounded border border-slate-300 bg-white px-2 py-1"
            aria-label="Schattenqualität"
            data-test-id="shadow-simulation-quality"
          >
            <option value={1}>1× · 2048²</option>
            <option value={4}>4× · 4096²</option>
            <option value={16}>16× · 8192²</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showSunDebugVector}
            onChange={(event) =>
              setState({
                ...state,
                showSunDebugVector: event.currentTarget.checked,
              })
            }
            data-test-id="shadow-simulation-sun-debug-vector"
          />
          <span>Sonnenvektor</span>
        </label>
      </div>
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
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-slate-700">
        <span>Gebäude</span>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={buildingsFullOpacity}
            onChange={(event) =>
              setState({
                ...state,
                buildingsFullOpacity: event.currentTarget.checked,
              })
            }
            data-test-id="shadow-simulation-buildings-full-opacity"
          />
          <span>volle Deckkraft</span>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={useUniformBuildingColor}
            onChange={(event) =>
              setState({
                ...state,
                useUniformBuildingColor: event.currentTarget.checked,
              })
            }
            data-test-id="shadow-simulation-buildings-uniform-color"
          />
          <span>einheitliche Farbe</span>
        </label>
        {useUniformBuildingColor && (
          <label className="flex items-center gap-2">
            <input
              type="color"
              value={buildingColor}
              onChange={(event) =>
                setState({
                  ...state,
                  buildingColor: event.currentTarget.value,
                })
              }
              className="h-7 w-10 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5"
              aria-label="Einheitliche Gebäudefarbe"
              data-test-id="shadow-simulation-building-color"
            />
            <span className="tabular-nums text-slate-500">
              {buildingColor.toUpperCase()}
            </span>
          </label>
        )}
      </div>
    </div>
  );
};

const ShadowSimulationRuntime = ({
  libreMap,
  shadowAreaMeters,
  terrain,
  location,
  state,
}: {
  libreMap: AddonComponentProps<"shadowSimulation">["libreMap"];
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
  location: SolarLocation;
  state: ShadowSimulationState;
}) => {
  const shadowScene = useRef<ShadowSimulationScene | null>(null);
  const solarPosition = useMemo(
    () => getSolarPosition(state.selection, location),
    [location, state.selection]
  );

  useEffect(() => {
    if (!libreMap || !state.enabled) return;
    const scene = buildShadowSimulationScene(libreMap, {
      shadowAreaMeters,
      terrain,
    });
    shadowScene.current = scene;
    return () => {
      shadowScene.current = null;
      scene.dispose();
    };
  }, [libreMap, shadowAreaMeters, state.enabled, terrain]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSolarPosition(solarPosition);
  }, [solarPosition, state.enabled]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateShadowQuality(
      state.shadowQuality ?? DEFAULT_SHADOW_QUALITY
    );
  }, [state.enabled, state.shadowQuality]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSunDebugVectorVisibility(
      state.showSunDebugVector ?? false
    );
  }, [state.enabled, state.showSunDebugVector]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateTerrainColor(
      state.terrainColor ?? DEFAULT_TERRAIN_COLOR
    );
  }, [state.enabled, state.terrainColor]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateBuildingAppearance({
      fullOpacity: state.buildingsFullOpacity ?? true,
      uniformColor:
        state.useUniformBuildingColor ?? true
          ? state.buildingColor ?? DEFAULT_BUILDING_COLOR
          : null,
    });
  }, [
    state.buildingColor,
    state.buildingsFullOpacity,
    state.enabled,
    state.useUniformBuildingColor,
  ]);

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
  const location = useMapCenterSolarLocation(
    libreMap,
    latitude,
    longitude,
    timeZone
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
      buildingsFullOpacity: true,
      useUniformBuildingColor: true,
      buildingColor: DEFAULT_BUILDING_COLOR,
      shadowQuality: DEFAULT_SHADOW_QUALITY,
      showSunDebugVector: false,
      selection: clampSelectionToDaylight(candidate, location) ?? {
        ...candidate,
        minutes: 12 * 60,
      },
    };
  }, [initialDayOfYear, initialMinutes, location, terrain, timeZone, year]);
  const [sharedState, setSharedState] = useAddonState("shadowSimulation");
  const state = sharedState ?? initialState;
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
              state.enabled
                ? "Schattensimulation ausschalten"
                : "Schattensimulation einschalten"
            }
            placement="right"
          >
            <ControlButtonStyler
              onClick={() =>
                setSharedState({
                  ...state,
                  enabled: !state.enabled,
                  useUniformBuildingColor: state.enabled
                    ? state.useUniformBuildingColor
                    : true,
                })
              }
              dataTestId="shadow-simulation-control-button"
              aria-label={
                state.enabled
                  ? "Schattensimulation ausschalten"
                  : "Schattensimulation einschalten"
              }
              aria-pressed={state.enabled}
            >
              <FontAwesomeIcon
                icon={faSun}
                style={
                  state.enabled ? { color: ACTIVE_CONTROL_COLOR } : undefined
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
      />
    </>
  );
};
