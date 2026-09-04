import { useMemo, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import {
  faCalendarDays,
  faChevronLeft,
  faChevronRight,
  faClock,
  faPause,
  faPlay,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DatePicker } from "antd";
import deDE from "antd/locale/de_DE";
import dayjs from "dayjs";

import { getDayOfYear, offsetYearDay } from "@carma-commons/utils";

import type {
  ShadowDateState,
  ShadowDateStateSetter,
  ShadowSimulationConfig,
  ShadowSimulationState,
  ShadowSimulationStateSetter,
} from "../contracts/shadow-simulation";
import {
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  getDaylightWindow,
  type SolarSelection,
} from "../core/solar-position";
import { updateShadowDateState } from "../core/shadow-date-state";
import { useMapCenterSolarLocation } from "../runtime/hooks/use-map-center-solar-location";
import {
  formatClockMinutes,
  formatSolarSelectionDate,
} from "./format-shadow-selection";
import { getRangeProgressStyle } from "./shadow-control-utils";

import "dayjs/locale/de";

export const ShadowSimulationHeaderControlsView = ({
  config,
  libreMap,
  state,
  setState,
  dateState,
  setDateState,
}: {
  config?: ShadowSimulationConfig;
  libreMap: MaplibreMap | null;
  state: ShadowSimulationState | undefined;
  setState: ShadowSimulationStateSetter;
  dateState: ShadowDateState | undefined;
  setDateState: ShadowDateStateSetter;
}) => {
  const {
    latitude = DEFAULT_SHADOW_SIMULATION_LOCATION.latitude,
    longitude = DEFAULT_SHADOW_SIMULATION_LOCATION.longitude,
  } = config ?? {};
  const location = useMapCenterSolarLocation(libreMap, latitude, longitude);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const selection = dateState;
  const daylight = useMemo(
    () =>
      selection
        ? getDaylightWindow(selection, location)
        : null,
    [location, selection]
  );
  const selectedDate = useMemo(
    () =>
      selection
        ? dayjs(
            new Date(Date.UTC(selection.year, 0, selection.dayOfYear))
          ).locale("de")
        : null,
    [selection]
  );
  if (!state || !selection || !daylight || !selectedDate) return null;
  const minimumMinutes = Math.ceil(daylight.sunriseMinutes);
  const maximumMinutes = Math.floor(daylight.sunsetMinutes);

  const publishSelection = (candidate: SolarSelection) => {
    setDateState(updateShadowDateState(selection, candidate, location));
  };

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-neutral-700"
      data-test-id="shadow-simulation-header-controls"
    >
      <div className="grid shrink-0 grid-cols-[28px_118px_28px] items-center">
        <button
          type="button"
          className="flex h-9 w-7 items-center justify-center rounded-full hover:bg-neutral-100"
          aria-label="Vorheriger Tag"
          onClick={() =>
            publishSelection({
              ...selection,
              ...offsetYearDay(selection, -1),
            })
          }
        >
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <div className="relative min-w-0 justify-self-center">
          <button
            type="button"
            className="flex h-9 max-w-full items-center gap-1.5 whitespace-nowrap rounded-md px-1 tabular-nums hover:bg-neutral-100"
            aria-label="Datum auswählen"
            aria-expanded={datePickerOpen}
            onClick={() => setDatePickerOpen(true)}
          >
            <FontAwesomeIcon
              icon={faCalendarDays}
              className="shrink-0 text-neutral-500"
            />
            <span className="truncate">
              {formatSolarSelectionDate(selection, false)}
            </span>
          </button>
          <DatePicker
            open={datePickerOpen}
            value={selectedDate}
            locale={deDE.DatePicker}
            format="D. MMMM YYYY"
            allowClear={false}
            inputReadOnly
            getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
            onOpenChange={setDatePickerOpen}
            onChange={(date) => {
              if (!date) return;
              publishSelection({
                ...selection,
                year: date.year(),
                dayOfYear: getDayOfYear(date.year(), date.month(), date.date()),
              });
              setDatePickerOpen(false);
            }}
            className="pointer-events-none absolute left-0 top-full h-0 w-0 overflow-hidden p-0 opacity-0"
            aria-label="Datum auswählen"
          />
        </div>
        <button
          type="button"
          className="flex h-9 w-7 items-center justify-center rounded-full hover:bg-neutral-100"
          aria-label="Nächster Tag"
          onClick={() =>
            publishSelection({
              ...selection,
              ...offsetYearDay(selection, 1),
            })
          }
        >
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>
      <span className="h-7 w-px shrink-0 bg-neutral-200" />
      <label className="m-0 flex h-9 w-fit shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1 hover:bg-neutral-100">
        <FontAwesomeIcon icon={faClock} className="shrink-0 text-neutral-500" />
        <input
          type="time"
          value={formatClockMinutes(selection.minutes)}
          min={formatClockMinutes(minimumMinutes)}
          max={formatClockMinutes(maximumMinutes)}
          step={60}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker();
            } catch {
              return;
            }
          }}
          onChange={(event) => {
            const [hours, minutes] = event.currentTarget.value
              .split(":")
              .map(Number);
            if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
            publishSelection({
              ...selection,
              minutes: hours * 60 + minutes,
            });
          }}
          className="shadow-simulation-time-input w-[46px] cursor-pointer bg-transparent p-0 text-sm font-medium leading-none tabular-nums text-neutral-800 outline-none"
          aria-label="Uhrzeit auswählen"
          data-test-id="shadow-simulation-time-input"
        />
      </label>
      <input
        type="range"
        min={minimumMinutes}
        max={maximumMinutes}
        step={1}
        value={selection.minutes}
        onChange={(event) =>
          publishSelection({
            ...selection,
            minutes: Number(event.currentTarget.value),
          })
        }
        className="shadow-simulation-range min-w-[80px] flex-1 cursor-pointer"
        style={getRangeProgressStyle(
          selection.minutes,
          minimumMinutes,
          maximumMinutes
        )}
        aria-label="Uhrzeit"
        data-test-id="shadow-simulation-ribbon-time"
      />
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100"
        aria-label={
          state.isAnimating ? "Animation pausieren" : "Animation starten"
        }
        aria-pressed={state.isAnimating ?? false}
        onClick={() => setState({ ...state, isAnimating: !state.isAnimating })}
      >
        <FontAwesomeIcon icon={state.isAnimating ? faPause : faPlay} />
      </button>
    </div>
  );
};
