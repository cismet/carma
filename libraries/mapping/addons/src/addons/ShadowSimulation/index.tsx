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
import type { ShadowSimulationScene } from "./shadow-scene";
import {
  clampSelectionToDaylight,
  getSolarPosition,
  getSolarSelectionForInstant,
  type SolarLocation,
  type SolarSelection,
} from "./solar-position";

const DEFAULT_LOCATION: SolarLocation = {
  latitude: 51.256,
  longitude: 7.15,
  timeZone: "Europe/Berlin",
};
const ACTIVE_CONTROL_COLOR = "#1677ff";

export type ShadowSimulationConfig = {
  year?: number;
  initialDayOfYear?: number;
  initialMinutes?: number;
  latitude?: number;
  longitude?: number;
  timeZone?: string;
  shadowAreaMeters?: number;
  controlPosition?: Positions;
  controlOrder?: number;
};

export type ShadowSimulationState = {
  enabled: boolean;
  selection: SolarSelection;
};

const ShadowSimulationSettings = ({
  location,
  state,
  setState,
}: {
  location: SolarLocation;
  state: ShadowSimulationState;
  setState: (state: ShadowSimulationState) => void;
}) => {
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
        onChange={(selection) => setState({ ...state, selection })}
      />
    </div>
  );
};

const ShadowSimulationRuntime = ({
  libreMap,
  shadowAreaMeters,
  location,
  state,
  available,
}: {
  libreMap: AddonComponentProps<"shadowSimulation">["libreMap"];
  shadowAreaMeters?: number;
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
    const scene = buildShadowSimulationScene(libreMap, { shadowAreaMeters });
    shadowScene.current = scene;
    return () => {
      shadowScene.current = null;
      scene.dispose();
    };
  }, [available, libreMap, shadowAreaMeters, state.enabled]);

  useEffect(() => {
    shadowScene.current?.updateSolarPosition(solarPosition);
  }, [solarPosition]);

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
    latitude = DEFAULT_LOCATION.latitude,
    longitude = DEFAULT_LOCATION.longitude,
    timeZone = DEFAULT_LOCATION.timeZone,
    shadowAreaMeters,
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
      selection: clampSelectionToDaylight(candidate, location) ?? {
        ...candidate,
        minutes: 12 * 60,
      },
    };
  }, [initialDayOfYear, initialMinutes, location, timeZone, year]);
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
        location={location}
        state={state}
        available={shadowAvailable}
      />
    </>
  );
};
