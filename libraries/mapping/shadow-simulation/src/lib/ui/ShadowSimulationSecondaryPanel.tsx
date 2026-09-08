import { useMemo } from "react";

import {
  faArrowRotateLeft,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  SHADOW_CONTROL_STYLE,
  type ShadowDateState,
  type ShadowSimulationState,
} from "../contracts/shadow-simulation";
import { getSolarPosition, type SolarLocation } from "../core/solar-position";
import { resetShadowDateState } from "../core/shadow-date-state";
import { resetShadowSimulationState } from "../core/shadow-state";
import { ShadowSimulationCurveSettings } from "./ShadowSimulationCurveSettings";
import { ShadowSimulationQuickSettings } from "./ShadowSimulationQuickSettings";
import { getRangeProgressStyle } from "./shadow-control-utils";

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
  const intensity = state.shadowIntensity ?? 1;
  const position = useMemo(
    () => getSolarPosition(dateState, location),
    [dateState, location]
  );

  return (
    <div className="w-full" data-test-id="shadow-simulation-secondary-panel">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="whitespace-nowrap text-sm tabular-nums text-neutral-500">
          Höhe {position.elevationDegrees.toFixed(0)}° · Azimut{" "}
          {position.azimuthDegrees.toFixed(0)}°
        </span>
        <div className="flex items-center gap-5 text-sm text-neutral-600">
          {/* TODO(pre-merge): the Kurvenansicht control ships
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
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
        {controlStyle === SHADOW_CONTROL_STYLE.QUICK ? (
          <ShadowSimulationQuickSettings
            location={location}
            state={state}
            setState={setState}
            dateState={dateState}
            setDateState={setDateState}
          />
        ) : (
          <div className="min-w-0 lg:col-span-2">
            <ShadowSimulationCurveSettings
              location={location}
              dateState={dateState}
              setDateState={setDateState}
            />
          </div>
        )}
        <section className="min-w-0">
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Darstellung
          </h3>
          <label className="grid grid-cols-[110px_minmax(0,1fr)_42px] items-center gap-3 text-sm text-neutral-700">
            <span>Intensität</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={intensity}
              onChange={(event) =>
                setState({
                  ...state,
                  shadowIntensity: Number(event.currentTarget.value),
                })
              }
              className="shadow-simulation-range min-w-0 cursor-pointer"
              style={getRangeProgressStyle(intensity, 0, 1)}
              aria-label="Schattenintensität"
              data-test-id="shadow-simulation-intensity"
            />
            <span className="text-right tabular-nums">
              {Math.round(intensity * 100)}%
            </span>
          </label>
          <button
            type="button"
            className="mt-2 flex items-center gap-2 text-sm text-neutral-700 hover:text-amber-700"
            aria-expanded={state.showDisplaySettings ?? false}
            onClick={() =>
              setState({
                ...state,
                showDisplaySettings: !state.showDisplaySettings,
              })
            }
            data-test-id="shadow-simulation-display-settings"
          >
            <FontAwesomeIcon icon={faSliders} />
            Darstellungseinstellungen
          </button>
        </section>
      </div>
    </div>
  );
};
