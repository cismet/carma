import { useMemo } from "react";

import {
  faArrowRotateLeft,
  faBug,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  SHADOW_CONTROL_STYLE,
  type ShadowDateState,
  type ShadowSimulationState,
} from "../contracts/shadow-simulation";
import {
  getSolarPosition,
  type SolarLocation,
} from "../core/solar-position";
import { resetShadowDateState } from "../core/shadow-date-state";
import { resetShadowSimulationState } from "../core/shadow-state";
import { ShadowSimulationCurveSettings } from "./ShadowSimulationCurveSettings";
import { ShadowSimulationQuickSettings } from "./ShadowSimulationQuickSettings";

export const ShadowSimulationSecondaryPanel = ({
  location,
  state,
  setState,
  dateState,
  setDateState,
}: {
  location: SolarLocation;
  state: ShadowSimulationState;
  setState: (state: ShadowSimulationState) => void;
  dateState: ShadowDateState;
  setDateState: (state: ShadowDateState) => void;
}) => {
  const controlStyle = state.controlStyle ?? SHADOW_CONTROL_STYLE.QUICK;
  const position = useMemo(
    () => getSolarPosition(dateState, location),
    [dateState, location]
  );

  return (
    <div className="w-full" data-test-id="shadow-simulation-secondary-panel">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="whitespace-nowrap text-sm tabular-nums text-neutral-500">
          Höhe {position.elevationDegrees.toFixed(0)}° · Azimut{" "}
          {position.azimuthDegrees.toFixed(0)}°
        </span>
        <div className="flex items-center gap-5 text-sm text-neutral-600">
          {/* TODO(pre-merge): the Kurvenansicht and Debug controls ship
              stealthed (visible on hover only) for development - remove
              them or decide on their productized form before merging. */}
          <button
            type="button"
            className={`flex items-center gap-2 whitespace-nowrap transition-opacity hover:text-amber-700 hover:opacity-100 focus-visible:opacity-100 ${
              controlStyle === SHADOW_CONTROL_STYLE.CURVE
                ? "opacity-100"
                : "opacity-0"
            }`}
            onClick={() =>
              setState({
                ...state,
                controlStyle:
                  controlStyle === SHADOW_CONTROL_STYLE.QUICK
                    ? SHADOW_CONTROL_STYLE.CURVE
                    : SHADOW_CONTROL_STYLE.QUICK,
              })
            }
            data-test-id="shadow-simulation-style-toggle"
          >
            <FontAwesomeIcon icon={faSliders} />
            {controlStyle === SHADOW_CONTROL_STYLE.QUICK
              ? "Kurvenansicht"
              : "Schnellauswahl"}
          </button>
          <button
            type="button"
            className={`flex items-center gap-2 whitespace-nowrap transition-opacity hover:text-amber-700 hover:opacity-100 focus-visible:opacity-100 ${
              state.showProjectionDebugView
                ? "text-amber-700 opacity-100"
                : "opacity-0"
            }`}
            aria-pressed={state.showProjectionDebugView ?? false}
            onClick={() =>
              setState({
                ...state,
                showProjectionDebugView: !state.showProjectionDebugView,
              })
            }
            data-test-id="shadow-simulation-projection-debug"
          >
            <FontAwesomeIcon icon={faBug} />
            Debug
          </button>
          <button
            type="button"
            className="flex items-center gap-2 whitespace-nowrap hover:text-amber-700"
            onClick={() => {
              setState(resetShadowSimulationState(state));
              setDateState(resetShadowDateState(dateState, location));
            }}
          >
            <FontAwesomeIcon icon={faArrowRotateLeft} />
            Zurücksetzen
          </button>
        </div>
      </div>
      {controlStyle === SHADOW_CONTROL_STYLE.QUICK ? (
        <ShadowSimulationQuickSettings
          location={location}
          state={state}
          setState={setState}
          dateState={dateState}
          setDateState={setDateState}
        />
      ) : (
        <ShadowSimulationCurveSettings
          location={location}
          dateState={dateState}
          setDateState={setDateState}
        />
      )}
    </div>
  );
};
