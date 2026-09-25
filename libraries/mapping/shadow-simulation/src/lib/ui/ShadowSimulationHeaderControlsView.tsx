import {
  useMemo,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
} from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import {
  faCalendarDays,
  faChevronLeft,
  faChevronRight,
  faClock,
  faPause,
  faPlay,
  faSun,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DatePicker } from "antd";
import deDE from "antd/locale/de_DE";
import dayjs from "dayjs";

import {
  getDayOfYear,
  getDaysInYear,
  offsetYearDay,
} from "@carma-commons/utils";

import {
  SHADOW_ANIMATION_MODE,
  type ShadowAnimationMode,
  type ShadowDateState,
  type ShadowDateStateSetter,
  type ShadowSimulationConfig,
  type ShadowSimulationState,
  type ShadowSimulationStateSetter,
} from "../contracts/shadow-simulation";
import {
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  MEAN_SOLAR_ANGULAR_RADIUS_DEGREES,
  clampSelectionToDaylight,
  getDaylightWindow,
  getYearDaylightWindows,
  solarSelectionToInstant,
  type SolarSelection,
} from "../core/solar-position";
import { updateShadowDateState } from "../core/shadow-date-state";
import { useMapCenterSolarLocation } from "../runtime/hooks/use-map-center-solar-location";
import {
  formatClockMinutes,
  formatSolarSelectionDate,
  getSolarMonthTicks,
} from "./format-shadow-selection";
import { getRangeProgressStyle } from "./shadow-control-utils";

import "dayjs/locale/de";
import "./shadow-simulation.css";

const SOLAR_BANDS = [
  {
    minimumElevationDegrees: MEAN_SOLAR_ANGULAR_RADIUS_DEGREES,
    color: "#d97706",
    label: "Tag",
  },
  {
    minimumElevationDegrees: -6,
    color: "#a8a29e",
    label: "Bürgerliche Dämmerung",
  },
  {
    minimumElevationDegrees: -12,
    color: "#64748b",
    label: "Nautische Dämmerung",
  },
  {
    minimumElevationDegrees: -18,
    color: "#334155",
    label: "Astronomische Dämmerung",
  },
] as const;
const NIGHT_COLOR = "#0f172a";
const SOLAR_BAND_LEGEND = `${SOLAR_BANDS.map(({ label }) => label).join(
  " · "
)} · Nacht`;

export const ShadowSimulationHeaderControlsView = ({
  config,
  libreMap,
  state,
  setState,
  dateState,
  setDateState,
  onTimeInteractionChange,
  showYearSlider = false,
  compact = false,
}: {
  config?: ShadowSimulationConfig;
  libreMap: MaplibreMap | null;
  state: ShadowSimulationState | undefined;
  setState: ShadowSimulationStateSetter;
  dateState: ShadowDateState | undefined;
  setDateState: ShadowDateStateSetter;
  onTimeInteractionChange?: (active: boolean) => void;
  showYearSlider?: boolean;
  compact?: boolean;
}) => {
  const {
    latitude = DEFAULT_SHADOW_SIMULATION_LOCATION.latitude,
    longitude = DEFAULT_SHADOW_SIMULATION_LOCATION.longitude,
  } = config ?? {};
  const location = useMapCenterSolarLocation(libreMap, latitude, longitude);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const selection = dateState;
  const year = selection?.year;
  const timeZone = selection?.timeZone;
  const minutes = selection?.minutes;
  const timeZoneFormatter = useMemo(
    () => new Intl.DateTimeFormat("de-DE", { timeZone, timeZoneName: "short" }),
    [timeZone]
  );
  const { latitude: solarLatitude, longitude: solarLongitude } = location;
  const yearBands = useMemo(
    () =>
      showYearSlider && !compact && year && timeZone
        ? SOLAR_BANDS.map((band) => ({
            ...band,
            windows: getYearDaylightWindows(
              { year, timeZone },
              { latitude: solarLatitude, longitude: solarLongitude },
              { minimumElevationDegrees: band.minimumElevationDegrees }
            ),
          }))
        : [],
    [showYearSlider, compact, year, timeZone, solarLatitude, solarLongitude]
  );
  const yearBackground = useMemo(() => {
    const stops: string[] = [];
    let previous = "";
    const dayCount = yearBands[0]?.windows.length ?? 0;
    for (let index = 0; index < dayCount; index += 1) {
      const color =
        yearBands.find(({ windows }) => {
          const window = windows[index];
          return (
            window.polarDay ||
            (!window.polarNight &&
              minutes !== undefined &&
              minutes >= window.sunriseMinutes &&
              minutes <= window.sunsetMinutes)
          );
        })?.color ?? NIGHT_COLOR;
      if (color === previous) continue;
      const position = index === 0 ? 0 : ((index - 0.5) / (dayCount - 1)) * 100;
      if (previous) stops.push(`${previous} ${position}%`);
      stops.push(`${color} ${position}%`);
      previous = color;
    }
    return stops.length
      ? `linear-gradient(to right, ${stops.join(", ")}, ${previous} 100%)`
      : undefined;
  }, [yearBands, minutes]);
  const daylight = useMemo(
    () =>
      selection
        ? yearBands[0]?.windows[selection.dayOfYear - 1] ??
          getDaylightWindow(selection, location)
        : null,
    [location, selection, yearBands]
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
  const timeZoneLabel =
    showYearSlider && !compact
      ? timeZoneFormatter
          .formatToParts(solarSelectionToInstant(selection))
          .find(({ type }) => type === "timeZoneName")?.value
      : undefined;
  const minimumMinutes =
    state.animationDaylightOnly === false
      ? 0
      : Math.ceil(daylight.sunriseMinutes);
  const maximumMinutes =
    state.animationDaylightOnly === false
      ? 1439
      : Math.floor(daylight.sunsetMinutes);
  const sunrise = formatClockMinutes(Math.ceil(daylight.sunriseMinutes));
  const sunset = formatClockMinutes(Math.floor(daylight.sunsetMinutes));
  const solarNoon = formatClockMinutes(daylight.solarNoonMinutes);
  const daylightMinutes = daylight.polarDay
    ? 1440
    : daylight.polarNight
    ? 0
    : Math.round(Math.max(0, daylight.sunsetMinutes - daylight.sunriseMinutes));
  const dayLength = `${Math.floor(daylightMinutes / 60)} h ${String(
    daylightMinutes % 60
  ).padStart(2, "0")} min`;
  const timeBackground = [
    ...yearBands.flatMap(({ windows, color }) => {
      const window = windows[selection.dayOfYear - 1];
      if (window.polarNight) return [];
      const start = window.polarDay ? 0 : (window.sunriseMinutes / 1440) * 100;
      const end = window.polarDay ? 100 : (window.sunsetMinutes / 1440) * 100;
      return `linear-gradient(to right, transparent 0 ${start}%, ${color} ${start}% ${end}%, transparent ${end}% 100%)`;
    }),
    NIGHT_COLOR,
  ].join(", ");

  const publishSelection = (candidate: SolarSelection) => {
    setDateState(
      showYearSlider
        ? candidate
        : updateShadowDateState(selection, candidate, location)
    );
  };
  const interaction: InputHTMLAttributes<HTMLInputElement> = {
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      onTimeInteractionChange?.(true);
    },
    onPointerUp: () => onTimeInteractionChange?.(false),
    onPointerCancel: () => onTimeInteractionChange?.(false),
    onLostPointerCapture: () => onTimeInteractionChange?.(false),
    onKeyDown: (event) => {
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "PageUp",
          "PageDown",
        ].includes(event.key)
      )
        onTimeInteractionChange?.(true);
    },
    onKeyUp: () => onTimeInteractionChange?.(false),
    onBlur: () => onTimeInteractionChange?.(false),
  };
  const playButton = (mode: ShadowAnimationMode) => {
    const active = Boolean(
      state.isAnimating &&
        (state.animationMode ?? SHADOW_ANIMATION_MODE.DAY) === mode
    );
    const year = mode === SHADOW_ANIMATION_MODE.YEAR;
    const label = showYearSlider
      ? year
        ? "Jahreslauf"
        : "Tageslauf"
      : "Animation";
    return (
      <button
        type="button"
        className={`${
          year && showYearSlider
            ? "shadow-simulation-header-year-play"
            : "shadow-simulation-header-play"
        } flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100`}
        aria-label={`${label} ${active ? "pausieren" : "starten"}`}
        aria-pressed={active}
        onClick={() =>
          setState({
            ...state,
            enabled: showYearSlider ? true : state.enabled,
            animationMode: mode,
            isAnimating: !active,
          })
        }
      >
        <FontAwesomeIcon icon={active ? faPause : faPlay} />
      </button>
    );
  };

  return (
    <div
      className={`shadow-simulation-header-controls text-sm text-neutral-700${
        showYearSlider ? " shadow-simulation-dual-time" : ""
      }${compact ? " shadow-simulation-dual-time--compact" : ""}`}
      data-test-id="shadow-simulation-header-controls"
    >
      <div className="shadow-simulation-header-layout">
        <div className="shadow-simulation-header-date grid grid-cols-[28px_minmax(0,118px)_28px] items-center">
          <button
            type="button"
            className="flex h-9 w-7 items-center justify-center rounded-full hover:bg-neutral-100"
            aria-label="Vorheriger Tag"
            hidden={showYearSlider}
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
              title={formatSolarSelectionDate(selection)}
              aria-expanded={datePickerOpen}
              onClick={() => setDatePickerOpen(true)}
            >
              <FontAwesomeIcon
                icon={faCalendarDays}
                className="shrink-0 text-neutral-500"
              />
              <span className="truncate">
                {formatSolarSelectionDate(
                  selection,
                  showYearSlider && !compact
                )}
              </span>
            </button>
            {showYearSlider && !compact && (
              <span
                className="shadow-simulation-day-length"
                title="Zeit zwischen Sonnenaufgang und Sonnenuntergang"
              >
                Tageslänge {dayLength}
              </span>
            )}
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
                  dayOfYear: getDayOfYear(
                    date.year(),
                    date.month(),
                    date.date()
                  ),
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
            hidden={showYearSlider}
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
        {showYearSlider && playButton(SHADOW_ANIMATION_MODE.YEAR)}
        {showYearSlider && !compact && (
          <div
            className="shadow-simulation-header-year-range shadow-simulation-slider"
            title={SOLAR_BAND_LEGEND}
            style={
              { "--shadow-range-background": yearBackground } as CSSProperties
            }
          >
            <input
              {...interaction}
              type="range"
              min={1}
              max={getDaysInYear(selection.year)}
              step={1}
              value={selection.dayOfYear}
              onChange={(event) =>
                publishSelection({
                  ...selection,
                  dayOfYear: Number(event.currentTarget.value),
                })
              }
              className="shadow-simulation-range cursor-pointer"
              aria-label="Tag des Jahres"
              aria-valuetext={formatSolarSelectionDate(selection)}
              data-test-id="shadow-simulation-ribbon-year"
            />
            <div className="shadow-simulation-slider-ticks" aria-hidden="true">
              {getSolarMonthTicks(selection.year).map(
                ({ dayOfYear, label }, month) => (
                  <span
                    key={dayOfYear}
                    style={{
                      left: `${
                        ((dayOfYear - 1) /
                          (getDaysInYear(selection.year) - 1)) *
                        100
                      }%`,
                    }}
                    title={label}
                  >
                    {month % 3 === 0 ? label.slice(0, 3) : null}
                  </span>
                )
              )}
            </div>
          </div>
        )}
        <span
          className="shadow-simulation-header-divider h-7 w-px bg-neutral-200"
          aria-hidden="true"
          hidden={showYearSlider}
        />
        <label className="shadow-simulation-header-time m-0 flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-md px-1 hover:bg-neutral-100">
          <FontAwesomeIcon
            icon={faClock}
            className="shrink-0 text-neutral-500"
          />
          <input
            type="time"
            value={formatClockMinutes(
              showYearSlider ? Math.floor(selection.minutes) : selection.minutes
            )}
            min={formatClockMinutes(showYearSlider ? 0 : minimumMinutes)}
            max={formatClockMinutes(showYearSlider ? 1439 : maximumMinutes)}
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
          {timeZoneLabel && (
            <span
              className="shadow-simulation-time-zone"
              title={selection.timeZone}
            >
              {timeZoneLabel}
            </span>
          )}
        </label>
        {(!showYearSlider || !compact) && (
          <div
            className="shadow-simulation-header-range shadow-simulation-slider"
            title={showYearSlider ? SOLAR_BAND_LEGEND : undefined}
            style={
              showYearSlider
                ? ({
                    "--shadow-range-background": timeBackground,
                  } as CSSProperties)
                : undefined
            }
          >
            <input
              {...interaction}
              type="range"
              min={showYearSlider ? 0 : minimumMinutes}
              max={showYearSlider ? 1440 : maximumMinutes}
              step={1}
              value={selection.minutes}
              disabled={showYearSlider && daylight.polarNight}
              onChange={(event) => {
                const candidate = {
                  ...selection,
                  minutes: Number(event.currentTarget.value),
                };
                const next = showYearSlider
                  ? clampSelectionToDaylight(candidate, location)
                  : candidate;
                if (next) publishSelection(next);
              }}
              className="shadow-simulation-range cursor-pointer"
              style={
                showYearSlider
                  ? undefined
                  : getRangeProgressStyle(
                      selection.minutes,
                      minimumMinutes,
                      maximumMinutes
                    )
              }
              aria-label="Uhrzeit"
              aria-valuetext={
                showYearSlider
                  ? `${formatClockMinutes(
                      Math.floor(selection.minutes)
                    )}; Sonnenaufgang ${sunrise}, Sonnenhöchststand ${solarNoon}, Sonnenuntergang ${sunset}`
                  : undefined
              }
              data-test-id="shadow-simulation-ribbon-time"
            />
            {showYearSlider && (
              <>
                <div
                  className="shadow-simulation-sun-markers"
                  aria-hidden="true"
                >
                  {[
                    {
                      minutes: daylight.sunriseMinutes,
                      label: "Sonnenaufgang",
                      time: sunrise,
                      direction: 1,
                    },
                    {
                      minutes: daylight.solarNoonMinutes,
                      label: "Sonnenhöchststand",
                      time: solarNoon,
                      direction: 0,
                    },
                    {
                      minutes: daylight.sunsetMinutes,
                      label: "Sonnenuntergang",
                      time: sunset,
                      direction: -1,
                    },
                  ]
                    .filter(
                      ({ direction }) =>
                        direction === 0 ||
                        (!daylight.polarDay && !daylight.polarNight)
                    )
                    .map((event) => (
                      <span
                        key={event.label}
                        style={{ left: `${(event.minutes / 1440) * 100}%` }}
                        title={`${event.label} ${event.time}`}
                      >
                        {event.direction === 0 ? (
                          <FontAwesomeIcon icon={faSun} />
                        ) : (
                          <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M1 12h14M4 12a4 4 0 0 1 8 0M1 8l1.5 1M15 8l-1.5 1M3 4l1 1M13 4l-1 1M8 1v5" />
                            <path
                              d={
                                event.direction === 1
                                  ? "m6 3 2-2 2 2"
                                  : "m6 4 2 2 2-2"
                              }
                            />
                          </svg>
                        )}
                        <span className="shadow-simulation-sun-time">
                          {event.time}
                        </span>
                      </span>
                    ))}
                </div>
                <div
                  className="shadow-simulation-slider-ticks"
                  aria-hidden="true"
                >
                  {Array.from({ length: 25 }, (_, hour) => (
                    <span key={hour} style={{ left: `${(hour / 24) * 100}%` }}>
                      {hour % 6 === 0 ? String(hour).padStart(2, "0") : null}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {playButton(
          showYearSlider
            ? SHADOW_ANIMATION_MODE.DAY
            : state.animationMode ?? SHADOW_ANIMATION_MODE.DAY
        )}
      </div>
    </div>
  );
};
