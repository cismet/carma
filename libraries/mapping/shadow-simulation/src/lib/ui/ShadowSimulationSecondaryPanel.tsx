import { useMemo } from "react";

import {
  faArrowRotateLeft,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  type ShadowDateState,
  type ShadowSimulationState,
} from "../contracts/shadow-simulation";
import { getSolarPosition, type SolarLocation } from "../core/solar-position";
import { resetShadowDateState } from "../core/shadow-date-state";
import { resetShadowSimulationState } from "../core/shadow-state";
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
        <ShadowSimulationQuickSettings
          location={location}
          state={state}
          setState={setState}
          dateState={dateState}
          setDateState={setDateState}
        />
        <section className="min-w-0">
          <h3 className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Darstellung
            <button
              type="button"
              className="inline-flex items-center justify-center p-1 text-neutral-700 hover:text-amber-700"
              aria-label="Darstellungseinstellungen"
              title="Darstellungseinstellungen"
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
            </button>
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
        </section>
      </div>
    </div>
  );
};
