import { useEffect, useMemo } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import "./shadow-simulation.css";

import { faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import { clamp } from "@carma-commons/math";
import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import {
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
import {
  DEFAULT_MESH_ERROR_TARGET_PIXELS,
  DEFAULT_SHADOW_BUILDING_COLOR,
  DEFAULT_SHADOW_BUILDING_COLOR_MIX,
  DEFAULT_SHADOW_BUILDING_TEXTURE_SATURATION,
  DEFAULT_SHADOW_SURFACE_COLOR,
  resolveShadowQuality,
} from "../core/shadow-types";
import { ShadowSimulationRuntime } from "../runtime/ShadowSimulationRuntime";
import { useMapCenterSolarLocation } from "../runtime/hooks/use-map-center-solar-location";
import { useShadowAnimation } from "../runtime/hooks/use-shadow-animation";
import { ShadowProjectionDebugView } from "./ShadowProjectionDebugView";
import { ShadowSimulationSecondaryPanel } from "./ShadowSimulationSecondaryPanel";

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
    controlPosition = "topleft",
    controlOrder = 70,
  } = config ?? {};
  const location = useMapCenterSolarLocation(libreMap, latitude, longitude);
  const initialState = useMemo<ShadowSimulationState>(
    () => createInitialShadowSimulationState({ terrain }),
    [terrain]
  );
  const initialDateState = useMemo<ShadowDateState>(
    () =>
      createInitialShadowDateState(
        { year, initialDayOfYear, initialMinutes, timeZone },
        location
      ),
    [initialDayOfYear, initialMinutes, location, timeZone, year]
  );
  const state = sharedState ?? initialState;
  const dateState = sharedDateState ?? initialDateState;
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
        terrain={terrain}
        location={location}
        state={state}
        dateState={dateState}
      />
      {state.showProjectionDebugView && libreMap && (
        <ShadowProjectionDebugView
          map={libreMap}
          solarPosition={getSolarPosition(dateState, location)}
          settings={{
            shadowQuality: resolveShadowQuality(state.shadowQuality),
            meshErrorTarget:
              state.meshErrorTarget ?? DEFAULT_MESH_ERROR_TARGET_PIXELS,
            terrainColor: state.terrainColor ?? DEFAULT_SHADOW_SURFACE_COLOR,
            buildingsFullOpacity: state.buildingsFullOpacity ?? true,
            buildingColorMix: clamp(
              state.buildingColorMix ?? DEFAULT_SHADOW_BUILDING_COLOR_MIX,
              0,
              1
            ),
            meshTextureSaturation: clamp(
              state.meshTextureSaturation ??
                DEFAULT_SHADOW_BUILDING_TEXTURE_SATURATION,
              0,
              1
            ),
            buildingColor:
              state.buildingColor ?? DEFAULT_SHADOW_BUILDING_COLOR,
            showSunDebugVector: state.showSunDebugVector ?? false,
            showTileBounds: state.showTileBounds ?? false,
            useTransmittanceLut: state.useTransmittanceLut ?? true,
            useSkyIrradianceLut: state.useSkyIrradianceLut ?? true,
          }}
          onSettingsChange={(patch) => setSharedState({ ...state, ...patch })}
        />
      )}
    </>
  );
};
