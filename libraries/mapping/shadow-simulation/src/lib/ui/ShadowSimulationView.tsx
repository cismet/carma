import { lazy, Suspense, useEffect, useMemo } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import "./shadow-simulation.css";

import { faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import {
  SHADOW_CONTROL_STYLE,
  type ShadowDateState,
  type ShadowDateStateSetter,
  type ShadowSimulationConfig,
  type ShadowSimulationState,
  type ShadowSimulationStateSetter,
} from "../contracts/shadow-simulation";
import {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
} from "../core/create-shadow-simulation-state";
import {
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  DEFAULT_SHADOW_SIMULATION_TIME_ZONE,
  getSolarPosition,
} from "../core/solar-position";
import { ShadowSimulationRuntime } from "../runtime/ShadowSimulationRuntime";
import { useMapCenterSolarLocation } from "../runtime/hooks/use-map-center-solar-location";
import { useShadowAnimation } from "../runtime/hooks/use-shadow-animation";
import { ShadowSimulationSecondaryPanel } from "./ShadowSimulationSecondaryPanel";

const ShadowProjectionDebugView = lazy(() =>
  import("./ShadowProjectionDebugView").then((module) => ({
    default: module.ShadowProjectionDebugView,
  }))
);
const ShadowSimulationDisplaySettingsPanel = lazy(() =>
  import("./ShadowSimulationDisplaySettingsPanel").then((module) => ({
    default: module.ShadowSimulationDisplaySettingsPanel,
  }))
);

const ShadowSimulationCurveSettings = lazy(() =>
  import("./ShadowSimulationCurveSettings").then((module) => ({
    default: module.ShadowSimulationCurveSettings,
  }))
);

const ACTIVE_CONTROL_COLOR = "#1677ff";
export const ShadowSimulationView = ({
  config,
  libreMap,
  targeted,
  sharedState,
  setSharedState,
  sharedDateState,
  setSharedDateState,
}: {
  config?: ShadowSimulationConfig;
  libreMap: MaplibreMap | null;
  targeted: boolean;
  sharedState: ShadowSimulationState | undefined;
  setSharedState: ShadowSimulationStateSetter;
  sharedDateState: ShadowDateState | undefined;
  setSharedDateState: ShadowDateStateSetter;
}) => {
  const {
    year,
    initialDayOfYear,
    initialMinutes,
    latitude = DEFAULT_SHADOW_SIMULATION_LOCATION.latitude,
    longitude = DEFAULT_SHADOW_SIMULATION_LOCATION.longitude,
    timeZone = DEFAULT_SHADOW_SIMULATION_TIME_ZONE,
    shadowAreaMeters,
    terrain,
    terrainSources,
    mapLibreTerrain,
    controlPosition = "topleft",
    controlOrder = 70,
  } = config ?? {};
  const location = useMapCenterSolarLocation(libreMap, latitude, longitude);
  const initialState = useMemo<ShadowSimulationState>(
    () => createInitialShadowSimulationState({ terrain, terrainSources }),
    [terrain, terrainSources]
  );
  const initialDateState = useMemo<ShadowDateState>(
    () =>
      sharedDateState ??
      createInitialShadowDateState(
        { year, initialDayOfYear, initialMinutes, timeZone },
        location
      ),
    [
      sharedDateState,
      initialDayOfYear,
      initialMinutes,
      location,
      timeZone,
      year,
    ]
  );
  const state = sharedState ?? initialState;
  const dateState = sharedDateState ?? initialDateState;
  const selectableTerrainSources = useMemo(
    () =>
      terrainSources ??
      (terrain ? [{ label: terrain.id, terrain }] : undefined),
    [terrain, terrainSources]
  );
  const selectedTerrain =
    selectableTerrainSources?.find(
      ({ terrain: candidate }) => candidate.id === state.terrainSourceId
    )?.terrain ?? selectableTerrainSources?.[0]?.terrain;
  useEffect(() => {
    if (!sharedState) setSharedState(initialState);
  }, [initialState, setSharedState, sharedState]);
  useEffect(() => {
    if (!sharedDateState) setSharedDateState(initialDateState);
  }, [initialDateState, setSharedDateState, sharedDateState]);

  useShadowAnimation({
    initialDateState,
    setDateState: setSharedDateState,
    location,
    shadowState: state,
  });

  if (targeted) {
    return (
      <ShadowSimulationSecondaryPanel
        location={location}
        state={state}
        setState={setSharedState}
        dateState={dateState}
        setDateState={setSharedDateState}
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
        terrain={selectedTerrain}
        mapLibreTerrain={mapLibreTerrain}
        terrainQuality={state.terrainQuality}
        location={location}
        state={state}
        dateState={dateState}
      />
      {state.controlStyle === SHADOW_CONTROL_STYLE.CURVE && (
        <Suspense fallback={null}>
          <ShadowSimulationCurveSettings
            location={location}
            dateState={dateState}
            setDateState={setSharedDateState}
            onClose={() =>
              setSharedState({
                ...state,
                controlStyle: SHADOW_CONTROL_STYLE.QUICK,
              })
            }
          />
        </Suspense>
      )}
      {state.showDisplaySettings && (
        <Suspense fallback={null}>
          <ShadowSimulationDisplaySettingsPanel
            state={state}
            setState={setSharedState}
            terrainSources={selectableTerrainSources}
            map={libreMap}
          />
        </Suspense>
      )}
      {state.enabled && state.showProjectionDebugView && libreMap && (
        <Suspense fallback={null}>
          <ShadowProjectionDebugView
            map={libreMap}
            solarPosition={getSolarPosition(dateState, location)}
            settings={{
              showSunDebugVector: state.showSunDebugVector ?? true,
              showTileBounds: state.showTileBounds ?? true,
            }}
            onSettingsChange={(patch) => setSharedState({ ...state, ...patch })}
            onClose={() =>
              setSharedState({ ...state, showProjectionDebugView: false })
            }
          />
        </Suspense>
      )}
    </>
  );
};
