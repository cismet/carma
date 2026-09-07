import { getDayOfYear } from "@carma-commons/utils";

import {
  SHADOW_ANIMATION_MODE,
  type ShadowAnimationMode,
  type ShadowDateState,
  type ShadowSimulationState,
  type ShadowTerrainSourceOption,
} from "../contracts/shadow-simulation";
import type { SolarLocation } from "../core/solar-position";
import { selectShadowQualityPreset } from "../core/create-shadow-simulation-state";
import {
  updateShadowCalendarDate,
  updateShadowDateState,
  updateShadowToCurrentDate,
} from "../core/shadow-date-state";
import { resolveShadowQuality } from "../core/shadow-types";
import { ShadowSimulationRenderSettings } from "./ShadowSimulationRenderSettings";
import {
  formatHour,
  getRangeProgressStyle,
  QUICK_BUTTON_CLASS_NAME,
  SEGMENT_BUTTON_CLASS_NAME,
  SHADOW_QUALITY_LEVELS,
} from "./shadow-control-utils";

export const ShadowSimulationQuickSettings = ({
  location,
  state,
  setState,
  dateState,
  setDateState,
  terrainSources,
}: {
  location: SolarLocation;
  state: ShadowSimulationState;
  setState: (state: ShadowSimulationState) => void;
  dateState: ShadowDateState;
  setDateState: (state: ShadowDateState) => void;
  terrainSources?: readonly ShadowTerrainSourceOption[];
}) => {
  const animationMode = state.animationMode ?? SHADOW_ANIMATION_MODE.DAY;
  const animationSpeed = state.animationSpeed ?? 4;
  const intensity = state.shadowIntensity ?? 1;

  const setCalendarDate = (month: number, day: number) =>
    setDateState(
      updateShadowCalendarDate(
        dateState,
        dateState.year,
        getDayOfYear(dateState.year, month, day),
        location
      )
    );

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
      <section className="min-w-0">
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Datum
        </h3>
        <div
          className="grid grid-cols-2 gap-2"
          data-test-id="shadow-date-shortcuts"
        >
          <button
            type="button"
            className={QUICK_BUTTON_CLASS_NAME}
            onClick={() =>
              setDateState(updateShadowToCurrentDate(dateState, location))
            }
          >
            Heute
          </button>
          <button
            type="button"
            className={QUICK_BUTTON_CLASS_NAME}
            onClick={() => setCalendarDate(2, 21)}
          >
            21. März
          </button>
          <button
            type="button"
            className={QUICK_BUTTON_CLASS_NAME}
            onClick={() => setCalendarDate(5, 21)}
          >
            21. Juni
          </button>
          <button
            type="button"
            className={QUICK_BUTTON_CLASS_NAME}
            onClick={() => setCalendarDate(11, 21)}
          >
            21. Dezember
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Uhrzeit
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {[9, 12, 15, 18].map((hour) => (
            <button
              key={hour}
              type="button"
              className={QUICK_BUTTON_CLASS_NAME}
              onClick={() =>
                setDateState(
                  updateShadowDateState(
                    dateState,
                    { ...dateState, minutes: hour * 60 },
                    location
                  )
                )
              }
            >
              {formatHour(hour)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Animation
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex shrink-0 overflow-hidden rounded-md border border-neutral-300">
            {[
              [SHADOW_ANIMATION_MODE.DAY, "Tagesverlauf"],
              [SHADOW_ANIMATION_MODE.YEAR, "Jahresverlauf"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`${SEGMENT_BUTTON_CLASS_NAME} ${
                  animationMode === mode
                    ? "bg-amber-50 font-medium text-amber-700"
                    : "bg-white"
                }`}
                aria-pressed={animationMode === mode}
                onClick={() => {
                  const nextMode = mode as ShadowAnimationMode;
                  setState({
                    ...state,
                    animationMode: nextMode,
                    isAnimating:
                      animationMode === nextMode ? !state.isAnimating : true,
                  });
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 overflow-hidden rounded-md border border-neutral-300">
            {([1, 4, 12] as const).map((speed) => (
              <button
                key={speed}
                type="button"
                className={`${SEGMENT_BUTTON_CLASS_NAME} px-3 ${
                  animationSpeed === speed
                    ? "bg-amber-50 font-medium text-amber-700"
                    : "bg-white"
                }`}
                aria-pressed={animationSpeed === speed}
                onClick={() => setState({ ...state, animationSpeed: speed })}
              >
                {speed}×
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Darstellung
        </h3>
        <div className="space-y-1.5 text-sm text-neutral-700">
          <label className="grid grid-cols-[110px_1fr_42px] items-center gap-3">
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
              className="shadow-simulation-range cursor-pointer"
              style={getRangeProgressStyle(intensity, 0, 1)}
              data-test-id="shadow-simulation-intensity"
            />
            <span className="text-right text-sm text-neutral-700 tabular-nums">
              {Math.round(intensity * 100)}%
            </span>
          </label>
          <label className="grid grid-cols-[110px_1fr] items-center gap-3">
            <span>Punktlichtquelle</span>
            <input
              type="checkbox"
              checked={!(state.softSunShadows ?? true)}
              onChange={(event) =>
                setState({
                  ...state,
                  softSunShadows: !event.currentTarget.checked,
                })
              }
              className="h-4 w-4 cursor-pointer justify-self-start accent-amber-600"
              data-test-id="shadow-simulation-point-light"
              aria-label="Punktlichtquelle statt Sonnenscheibe verwenden"
            />
          </label>
          {terrainSources && terrainSources.length > 1 && (
            <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
              <span>Höhenmodell</span>
              <select
                aria-label="Höhenmodell für die Verschattung"
                title="Höhenmodell für die Verschattung. Die Basiskarte bleibt auf dem Geländemodell (DGM)."
                className="min-w-0 rounded-md border border-neutral-300 bg-white px-2 py-1"
                value={
                  terrainSources.find(
                    ({ terrain }) => terrain.id === state.terrainSourceId
                  )?.terrain.id ?? terrainSources[0].terrain.id
                }
                onChange={(event) =>
                  setState({ ...state, terrainSourceId: event.target.value })
                }
              >
                {terrainSources.map(({ label, terrain }) => (
                  <option key={terrain.id} value={terrain.id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="grid grid-cols-[110px_1fr] items-center gap-3">
            <span>Basiskarte</span>
            <input
              type="checkbox"
              checked={state.showMapStyleContent ?? true}
              onChange={(event) =>
                setState({
                  ...state,
                  showMapStyleContent: event.currentTarget.checked,
                })
              }
              className="h-4 w-4 cursor-pointer justify-self-start accent-amber-600"
              data-test-id="shadow-simulation-map-style-content"
              aria-label="Basiskarte auf dem Terrain anzeigen"
            />
          </label>
          <label className="grid grid-cols-[110px_1fr] items-center gap-3">
            <span className="pl-3 text-neutral-500">Beschriftungen</span>
            <input
              type="checkbox"
              checked={
                (state.showMapStyleContent ?? true) &&
                (state.showMapStyleLabels ?? true)
              }
              disabled={!(state.showMapStyleContent ?? true)}
              onChange={(event) =>
                setState({
                  ...state,
                  showMapStyleLabels: event.currentTarget.checked,
                })
              }
              className="h-4 w-4 cursor-pointer justify-self-start accent-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
              data-test-id="shadow-simulation-map-style-labels"
              aria-label="Freigestellte Kartenbeschriftungen über dem Modell anzeigen"
            />
          </label>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
            <span>Qualitätsziel</span>
            <div
              className="flex w-fit max-w-full flex-wrap overflow-hidden rounded-md border border-neutral-300"
              data-test-id="shadow-simulation-quality"
            >
              {SHADOW_QUALITY_LEVELS.map(({ label, value }) => (
                <button
                  key={label}
                  type="button"
                  className={`${SEGMENT_BUTTON_CLASS_NAME} px-2.5 ${
                    resolveShadowQuality(state.shadowQuality) === value
                      ? "bg-amber-50"
                      : "bg-white"
                  }`}
                  aria-pressed={
                    resolveShadowQuality(state.shadowQuality) === value
                  }
                  onClick={() =>
                    setState(selectShadowQualityPreset(state, value))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            Ziel beim Bewegen in 1440p (physische Pixel), abhängig von Gerät und
            Szene. Karte und Beschriftungen bleiben in voller Auflösung.
          </p>
        </div>
      </section>
      <ShadowSimulationRenderSettings state={state} setState={setState} />
    </div>
  );
};
