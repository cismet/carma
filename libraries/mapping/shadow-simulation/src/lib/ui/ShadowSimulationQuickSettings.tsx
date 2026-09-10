import { getDayOfYear } from "@carma-commons/utils";

import {
  SHADOW_ANIMATION_MODE,
  type ShadowAnimationMode,
  type ShadowDateState,
  type ShadowSimulationState,
} from "../contracts/shadow-simulation";
import type { SolarLocation } from "../core/solar-position";
import {
  updateShadowCalendarDate,
  updateShadowDateState,
  updateShadowToCurrentDate,
} from "../core/shadow-date-state";
import {
  formatHour,
  QUICK_BUTTON_CLASS_NAME,
  SEGMENT_BUTTON_CLASS_NAME,
} from "./shadow-control-utils";

export const ShadowSimulationQuickSettings = ({
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
  const animationMode = state.animationMode ?? SHADOW_ANIMATION_MODE.DAY;
  const animationSpeed = state.animationSpeed ?? 4;

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
    <>
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
    </>
  );
};
