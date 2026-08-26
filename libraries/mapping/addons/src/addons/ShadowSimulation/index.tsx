import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  faArrowRotateLeft,
  faCalendarDays,
  faBug,
  faChevronLeft,
  faChevronRight,
  faClock,
  faPause,
  faPlay,
  faSliders,
  faSun,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DatePicker, Tooltip } from "antd";
import deDE from "antd/locale/de_DE";
import dayjs from "dayjs";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import { SolarDayTimeControl } from "./SolarDayTimeControl";
import {
  buildShadowSimulationScene,
  DEFAULT_SHADOW_QUALITY,
} from "./shadow-scene";
import type {
  ShadowQualityMultiplier,
  ShadowSimulationScene,
  ShadowTerrainOptions,
} from "./shadow-scene";
import { ShadowProjectionDebugView } from "./ShadowProjectionDebugView";
import {
  clampSelectionToDaylight,
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  getDaylightWindow,
  getDaysInYear,
  getSolarPosition,
  getSolarSelectionForInstant,
  type SolarLocation,
  type SolarSelection,
} from "./solar-position";

import "dayjs/locale/de";
import "./shadow-simulation.css";

const ACTIVE_CONTROL_COLOR = "#1677ff";
const DEFAULT_TERRAIN_COLOR = "#d8d1c4";
const DEFAULT_BUILDING_COLOR = "#d8d1c4";
const SHADOW_ANIMATION_INTERVAL_MS = 1000 / 30;

const getRangeProgressStyle = (
  value: number,
  minimum: number,
  maximum: number
) =>
  ({
    "--shadow-range-progress": `${
      maximum > minimum
        ? Math.max(
            0,
            Math.min(100, ((value - minimum) / (maximum - minimum)) * 100)
          )
        : 0
    }%`,
  } as CSSProperties);

const SHADOW_CONTROL_STYLE = {
  QUICK: "quick",
  CURVE: "curve",
} as const;

export type ShadowControlStyle =
  (typeof SHADOW_CONTROL_STYLE)[keyof typeof SHADOW_CONTROL_STYLE];

const SHADOW_ANIMATION_MODE = {
  DAY: "day",
  YEAR: "year",
} as const;

export type ShadowAnimationMode =
  (typeof SHADOW_ANIMATION_MODE)[keyof typeof SHADOW_ANIMATION_MODE];

export type ShadowAnimationSpeed = 1 | 4 | 12;

const resolveTerrainColor = (value: unknown) => {
  if (typeof value === "string" && /^#[\da-f]{6}$/i.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `#${Math.max(0, Math.min(0xffffff, Math.round(value)))
      .toString(16)
      .padStart(6, "0")}`;
  }
  return DEFAULT_TERRAIN_COLOR;
};

export type ShadowSimulationConfig = {
  year?: number;
  initialDayOfYear?: number;
  initialMinutes?: number;
  latitude?: number;
  longitude?: number;
  timeZone?: string;
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
  controlPosition?: Positions;
  controlOrder?: number;
};

export type ShadowSimulationState = {
  enabled: boolean;
  selection: SolarSelection;
  terrainColor: string;
  buildingsFullOpacity: boolean;
  useUniformBuildingColor: boolean;
  buildingColor: string;
  shadowQuality: ShadowQualityMultiplier;
  showSunDebugVector: boolean;
  showProjectionDebugView?: boolean;
  controlStyle?: ShadowControlStyle;
  animationMode?: ShadowAnimationMode;
  animationSpeed?: ShadowAnimationSpeed;
  isAnimating?: boolean;
  shadowIntensity?: number;
  showShadowDuration?: boolean;
};

const getMapCenterSolarLocation = (
  libreMap: AddonComponentProps<"shadowSimulation">["libreMap"],
  fallbackLatitude: number,
  fallbackLongitude: number,
  timeZone: string
): SolarLocation => {
  const center = libreMap?.getCenter();
  return {
    latitude: center?.lat ?? fallbackLatitude,
    longitude: center?.lng ?? fallbackLongitude,
    timeZone,
  };
};

const useMapCenterSolarLocation = (
  libreMap: AddonComponentProps<"shadowSimulation">["libreMap"],
  fallbackLatitude: number,
  fallbackLongitude: number,
  timeZone: string
): SolarLocation => {
  const [location, setLocation] = useState<SolarLocation>(() =>
    getMapCenterSolarLocation(
      libreMap,
      fallbackLatitude,
      fallbackLongitude,
      timeZone
    )
  );

  useEffect(() => {
    const updateLocation = () => {
      const next = getMapCenterSolarLocation(
        libreMap,
        fallbackLatitude,
        fallbackLongitude,
        timeZone
      );
      setLocation((current) =>
        current.latitude === next.latitude &&
        current.longitude === next.longitude &&
        current.timeZone === next.timeZone
          ? current
          : next
      );
    };
    updateLocation();
    if (!libreMap) return;
    libreMap.on("moveend", updateLocation);
    return () => {
      libreMap.off("moveend", updateLocation);
    };
  }, [fallbackLatitude, fallbackLongitude, libreMap, timeZone]);

  return location;
};

export const ShadowSimulationSettings = ({
  location,
  state,
  setState,
  showTerrainColor,
}: {
  location: SolarLocation;
  state: ShadowSimulationState;
  setState: (state: ShadowSimulationState) => void;
  showTerrainColor: boolean;
}) => {
  const terrainColor = state.terrainColor ?? DEFAULT_TERRAIN_COLOR;
  const buildingsFullOpacity = state.buildingsFullOpacity ?? true;
  const useUniformBuildingColor = state.useUniformBuildingColor ?? true;
  const buildingColor = state.buildingColor ?? DEFAULT_BUILDING_COLOR;
  const shadowQuality = state.shadowQuality ?? DEFAULT_SHADOW_QUALITY;
  const showSunDebugVector = state.showSunDebugVector ?? false;
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
        onChange={(selection) =>
          setState({ ...state, selection, terrainColor })
        }
      />
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-slate-700">
        <label className="flex items-center gap-2">
          <span>Schattenqualität</span>
          <select
            value={shadowQuality}
            onChange={(event) =>
              setState({
                ...state,
                shadowQuality: Number(
                  event.currentTarget.value
                ) as ShadowQualityMultiplier,
              })
            }
            className="rounded border border-slate-300 bg-white px-2 py-1"
            aria-label="Schattenqualität"
            data-test-id="shadow-simulation-quality"
          >
            <option value={1}>1× · 2048²</option>
            <option value={4}>4× · 4096²</option>
            <option value={16}>16× · 8192²</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showSunDebugVector}
            onChange={(event) =>
              setState({
                ...state,
                showSunDebugVector: event.currentTarget.checked,
              })
            }
            data-test-id="shadow-simulation-sun-debug-vector"
          />
          <span>Sonnenvektor</span>
        </label>
      </div>
      {showTerrainColor && (
        <label className="mt-1 flex items-center gap-2 px-1 text-sm text-slate-700">
          <span>Terrainfarbe</span>
          <input
            type="color"
            value={terrainColor}
            onChange={(event) =>
              setState({
                ...state,
                terrainColor: event.currentTarget.value,
              })
            }
            className="h-7 w-10 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5"
            aria-label="Terrainfarbe"
            data-test-id="shadow-simulation-terrain-color"
          />
          <span className="tabular-nums text-slate-500">
            {terrainColor.toUpperCase()}
          </span>
        </label>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-slate-700">
        <span>Gebäude</span>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={buildingsFullOpacity}
            onChange={(event) =>
              setState({
                ...state,
                buildingsFullOpacity: event.currentTarget.checked,
              })
            }
            data-test-id="shadow-simulation-buildings-full-opacity"
          />
          <span>volle Deckkraft</span>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={useUniformBuildingColor}
            onChange={(event) =>
              setState({
                ...state,
                useUniformBuildingColor: event.currentTarget.checked,
              })
            }
            data-test-id="shadow-simulation-buildings-uniform-color"
          />
          <span>einheitliche Farbe</span>
        </label>
        {useUniformBuildingColor && (
          <label className="flex items-center gap-2">
            <input
              type="color"
              value={buildingColor}
              onChange={(event) =>
                setState({
                  ...state,
                  buildingColor: event.currentTarget.value,
                })
              }
              className="h-7 w-10 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5"
              aria-label="Einheitliche Gebäudefarbe"
              data-test-id="shadow-simulation-building-color"
            />
            <span className="tabular-nums text-slate-500">
              {buildingColor.toUpperCase()}
            </span>
          </label>
        )}
      </div>
    </div>
  );
};

const QUICK_BUTTON_CLASS_NAME =
  "flex h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-md border border-neutral-300 bg-white px-2 text-center text-sm text-neutral-800 transition-colors hover:border-amber-500 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40";
const SEGMENT_BUTTON_CLASS_NAME =
  "h-9 whitespace-nowrap border-r border-neutral-300 px-4 text-sm text-neutral-700 transition-colors last:border-r-0 hover:text-amber-700";

const pad2 = (value: number) => String(value).padStart(2, "0");

const formatMinutes = (minutes: number) => {
  const rounded = Math.round(minutes);
  return `${pad2(Math.floor(rounded / 60))}:${pad2(rounded % 60)}`;
};

const formatSelectionDate = (selection: SolarSelection, includeYear = true) =>
  new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(selection.year, 0, selection.dayOfYear)));

const getDayOfYear = (year: number, month: number, day: number) =>
  Math.floor((Date.UTC(year, month, day) - Date.UTC(year, 0, 1)) / 86_400_000) +
  1;

const getSelectionForDayOffset = (
  selection: SolarSelection,
  dayOffset: number
): SolarSelection => {
  const date = new Date(
    Date.UTC(selection.year, 0, selection.dayOfYear + dayOffset)
  );
  return {
    year: date.getUTCFullYear(),
    dayOfYear: getDayOfYear(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    ),
    minutes: selection.minutes,
  };
};

const ShadowSimulationRibbon = ({
  location,
  state,
  setState,
}: {
  location: SolarLocation;
  state: ShadowSimulationState;
  setState: (state: ShadowSimulationState) => void;
}) => {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const daylight = useMemo(
    () =>
      getDaylightWindow(
        state.selection.year,
        state.selection.dayOfYear,
        location
      ),
    [location, state.selection.dayOfYear, state.selection.year]
  );
  const position = useMemo(
    () => getSolarPosition(state.selection, location),
    [location, state.selection]
  );
  const intensity = state.shadowIntensity ?? 0.45;
  const minimumMinutes = Math.ceil(daylight.sunriseMinutes);
  const maximumMinutes = Math.floor(daylight.sunsetMinutes);
  const selectedDate = useMemo(
    () =>
      dayjs(
        new Date(Date.UTC(state.selection.year, 0, state.selection.dayOfYear))
      ).locale("de"),
    [state.selection.dayOfYear, state.selection.year]
  );

  const publishSelection = (candidate: SolarSelection) => {
    const selection = clampSelectionToDaylight(candidate, location);
    if (selection) setState({ ...state, selection });
  };

  return (
    <div
      className="flex h-14 w-[min(1040px,calc(100vw-2rem))] items-center gap-3 rounded-full bg-white px-4 text-sm text-neutral-700 button-shadow"
      data-test-id="shadow-simulation-ribbon"
    >
      <div className="grid w-[290px] shrink-0 grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-2">
        <button
          type="button"
          className="flex h-9 w-8 items-center justify-center rounded-full hover:bg-neutral-100"
          aria-label="Vorheriger Tag"
          onClick={() =>
            publishSelection(getSelectionForDayOffset(state.selection, -1))
          }
        >
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <div className="relative min-w-0 justify-self-start">
          <button
            type="button"
            className="flex h-9 max-w-full items-center gap-2 whitespace-nowrap rounded-md px-1.5 tabular-nums hover:bg-neutral-100"
            aria-label="Datum auswählen"
            aria-expanded={datePickerOpen}
            onClick={() => setDatePickerOpen(true)}
          >
            <FontAwesomeIcon
              icon={faCalendarDays}
              className="shrink-0 text-neutral-500"
            />
            <span className="truncate">
              {formatSelectionDate(state.selection)}
            </span>
          </button>
          <DatePicker
            open={datePickerOpen}
            value={selectedDate}
            locale={deDE.DatePicker}
            format="D. MMMM YYYY"
            allowClear={false}
            inputReadOnly
            onOpenChange={setDatePickerOpen}
            onChange={(date) => {
              if (!date) return;
              publishSelection({
                ...state.selection,
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
          className="flex h-9 w-8 items-center justify-center rounded-full hover:bg-neutral-100"
          aria-label="Nächster Tag"
          onClick={() =>
            publishSelection(getSelectionForDayOffset(state.selection, 1))
          }
        >
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>
      <span className="h-7 w-px shrink-0 bg-neutral-200" />
      <div className="flex w-[74px] shrink-0 items-center gap-2 whitespace-nowrap font-medium tabular-nums text-neutral-800">
        <FontAwesomeIcon icon={faClock} className="text-neutral-500" />
        <span>{formatMinutes(state.selection.minutes)}</span>
      </div>
      <input
        type="range"
        min={minimumMinutes}
        max={maximumMinutes}
        step={1}
        value={state.selection.minutes}
        onChange={(event) =>
          publishSelection({
            ...state.selection,
            minutes: Number(event.currentTarget.value),
          })
        }
        className="shadow-simulation-range w-[clamp(180px,24vw,340px)] shrink-0 cursor-pointer"
        style={getRangeProgressStyle(
          state.selection.minutes,
          minimumMinutes,
          maximumMinutes
        )}
        aria-label="Uhrzeit"
        data-test-id="shadow-simulation-ribbon-time"
      />
      <button
        type="button"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100"
        aria-label={
          state.isAnimating ? "Animation pausieren" : "Animation starten"
        }
        aria-pressed={state.isAnimating ?? false}
        onClick={() => setState({ ...state, isAnimating: !state.isAnimating })}
      >
        <FontAwesomeIcon icon={state.isAnimating ? faPause : faPlay} />
      </button>
      <span className="h-7 w-px shrink-0 bg-neutral-200" />
      <span
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200"
        aria-hidden="true"
      >
        <span
          className="absolute h-2.5 w-2.5 rounded-full bg-amber-500"
          style={{
            left: `${Math.max(
              4,
              Math.min(
                24,
                14 + Math.cos((position.azimuthDegrees * Math.PI) / 180) * 10
              )
            )}px`,
            top: `${Math.max(
              4,
              Math.min(24, 24 - position.elevationDegrees / 4)
            )}px`,
          }}
        />
      </span>
      <span className="whitespace-nowrap tabular-nums">
        Höhe {position.elevationDegrees.toFixed(0)}°
      </span>
      <span className="hidden whitespace-nowrap tabular-nums text-neutral-500 lg:inline">
        Azimut {position.azimuthDegrees.toFixed(0)}°
      </span>
      <span className="hidden whitespace-nowrap tabular-nums text-neutral-500 lg:inline">
        Schatten {(0.4 + intensity * 0.9).toFixed(1).replace(".", ",")}×
      </span>
    </div>
  );
};

const ShadowQuickSettings = ({
  location,
  state,
  setState,
}: {
  location: SolarLocation;
  state: ShadowSimulationState;
  setState: (state: ShadowSimulationState) => void;
}) => {
  const animationMode = state.animationMode ?? SHADOW_ANIMATION_MODE.DAY;
  const animationSpeed = state.animationSpeed ?? 4;
  const intensity = state.shadowIntensity ?? 0.45;

  const publishSelection = (candidate: SolarSelection) => {
    const selection = clampSelectionToDaylight(candidate, location);
    if (selection) setState({ ...state, selection });
  };
  const setCalendarDate = (month: number, day: number) =>
    publishSelection({
      ...state.selection,
      dayOfYear: getDayOfYear(state.selection.year, month, day),
    });
  const setToday = () => {
    const today = getSolarSelectionForInstant(new Date(), location.timeZone);
    publishSelection({ ...today, minutes: state.selection.minutes });
  };

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
      <section className="min-w-0">
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Datum
        </h3>
        <div
          className="grid grid-cols-4 gap-2"
          data-test-id="shadow-date-shortcuts"
        >
          <button
            type="button"
            className={QUICK_BUTTON_CLASS_NAME}
            onClick={setToday}
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
                publishSelection({ ...state.selection, minutes: hour * 60 })
              }
            >
              {pad2(hour)}:00
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Animation
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-neutral-300">
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
          <div className="flex overflow-hidden rounded-md border border-neutral-300">
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
          <label className="grid grid-cols-[140px_1fr_42px] items-center gap-3">
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
            <span className="text-right tabular-nums">
              {Math.round(intensity * 100)}%
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.showSunDebugVector ?? false}
              onChange={(event) =>
                setState({
                  ...state,
                  showSunDebugVector: event.currentTarget.checked,
                })
              }
              className="h-4 w-4 accent-amber-600"
            />
            <span>Sonnenstand einblenden</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.showShadowDuration ?? false}
              onChange={(event) =>
                setState({
                  ...state,
                  showShadowDuration: event.currentTarget.checked,
                })
              }
              className="h-4 w-4 accent-amber-600"
            />
            <span>Verschattungsdauer (Stunden/Tag)</span>
          </label>
        </div>
      </section>
    </div>
  );
};

export const ShadowSimulationControlSurface = ({
  config,
  libreMap,
}: Pick<AddonComponentProps<"shadowSimulation">, "config" | "libreMap">) => {
  const {
    latitude = DEFAULT_SHADOW_SIMULATION_LOCATION.latitude,
    longitude = DEFAULT_SHADOW_SIMULATION_LOCATION.longitude,
    timeZone = DEFAULT_SHADOW_SIMULATION_LOCATION.timeZone,
    terrain,
  } = config ?? {};
  const location = useMapCenterSolarLocation(
    libreMap,
    latitude,
    longitude,
    timeZone
  );
  const [state, setState] = useAddonState("shadowSimulation");
  if (!state) return null;
  const controlStyle = state.controlStyle ?? SHADOW_CONTROL_STYLE.QUICK;

  return (
    <div
      className="flex w-full flex-col items-center gap-3"
      data-test-id="shadow-simulation-control-surface"
    >
      <ShadowSimulationRibbon
        location={location}
        state={state}
        setState={setState}
      />
      <div className="w-[min(930px,calc(100vw-2rem))] rounded-[14px] bg-white px-7 py-4 button-shadow">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="m-0 text-xl font-semibold text-neutral-900">
            Schattensimulation
          </h2>
          <div className="flex items-center gap-5 text-sm text-neutral-600">
            <button
              type="button"
              className="flex items-center gap-2 whitespace-nowrap hover:text-amber-700"
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
              className={`flex items-center gap-2 whitespace-nowrap hover:text-amber-700 ${
                state.showProjectionDebugView ? "text-amber-700" : ""
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
                const now = getSolarSelectionForInstant(
                  new Date(),
                  location.timeZone
                );
                const selection = clampSelectionToDaylight(now, location);
                if (!selection) return;
                setState({
                  ...state,
                  selection,
                  animationMode: SHADOW_ANIMATION_MODE.DAY,
                  animationSpeed: 4,
                  isAnimating: false,
                  shadowIntensity: 0.45,
                  showSunDebugVector: false,
                  showProjectionDebugView: false,
                  showShadowDuration: false,
                });
              }}
            >
              <FontAwesomeIcon icon={faArrowRotateLeft} />
              Zurücksetzen
            </button>
          </div>
        </div>
        {controlStyle === SHADOW_CONTROL_STYLE.QUICK ? (
          <ShadowQuickSettings
            location={location}
            state={state}
            setState={setState}
          />
        ) : (
          <ShadowSimulationSettings
            location={location}
            state={state}
            setState={setState}
            showTerrainColor={!!terrain}
          />
        )}
      </div>
    </div>
  );
};

const ShadowSimulationRuntime = ({
  libreMap,
  shadowAreaMeters,
  terrain,
  location,
  state,
}: {
  libreMap: AddonComponentProps<"shadowSimulation">["libreMap"];
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
  location: SolarLocation;
  state: ShadowSimulationState;
}) => {
  const shadowScene = useRef<ShadowSimulationScene | null>(null);
  const solarPosition = useMemo(
    () => getSolarPosition(state.selection, location),
    [location, state.selection]
  );

  useEffect(() => {
    if (!libreMap || !state.enabled) return;
    const scene = buildShadowSimulationScene(libreMap, {
      shadowAreaMeters,
      terrain,
    });
    shadowScene.current = scene;
    return () => {
      shadowScene.current = null;
      scene.dispose();
    };
  }, [libreMap, shadowAreaMeters, state.enabled, terrain]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSolarPosition(solarPosition);
  }, [solarPosition, state.enabled]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateShadowQuality(
      state.shadowQuality ?? DEFAULT_SHADOW_QUALITY
    );
  }, [state.enabled, state.shadowQuality]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateShadowIntensity(state.shadowIntensity ?? 0.45);
  }, [state.enabled, state.shadowIntensity]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSunDebugVectorVisibility(
      state.showSunDebugVector ?? false
    );
  }, [state.enabled, state.showSunDebugVector]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateTerrainColor(
      state.terrainColor ?? DEFAULT_TERRAIN_COLOR
    );
  }, [state.enabled, state.terrainColor]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateBuildingAppearance({
      fullOpacity: state.buildingsFullOpacity ?? true,
      uniformColor:
        state.useUniformBuildingColor ?? true
          ? state.buildingColor ?? DEFAULT_BUILDING_COLOR
          : null,
    });
  }, [
    state.buildingColor,
    state.buildingsFullOpacity,
    state.enabled,
    state.useUniformBuildingColor,
  ]);

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
    latitude = DEFAULT_SHADOW_SIMULATION_LOCATION.latitude,
    longitude = DEFAULT_SHADOW_SIMULATION_LOCATION.longitude,
    timeZone = DEFAULT_SHADOW_SIMULATION_LOCATION.timeZone,
    shadowAreaMeters,
    terrain,
    controlPosition = "topleft",
    controlOrder = 70,
  } = config ?? {};
  const location = useMapCenterSolarLocation(
    libreMap,
    latitude,
    longitude,
    timeZone
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
      terrainColor: resolveTerrainColor(terrain?.material?.color),
      buildingsFullOpacity: true,
      useUniformBuildingColor: true,
      buildingColor: DEFAULT_BUILDING_COLOR,
      shadowQuality: DEFAULT_SHADOW_QUALITY,
      showSunDebugVector: false,
      showProjectionDebugView: false,
      controlStyle: SHADOW_CONTROL_STYLE.QUICK,
      animationMode: SHADOW_ANIMATION_MODE.DAY,
      animationSpeed: 4,
      isAnimating: false,
      shadowIntensity: 0.45,
      showShadowDuration: false,
      selection: clampSelectionToDaylight(candidate, location) ?? {
        ...candidate,
        minutes: 12 * 60,
      },
    };
  }, [initialDayOfYear, initialMinutes, location, terrain, timeZone, year]);
  const [sharedState, setSharedState] = useAddonState("shadowSimulation");
  const state = sharedState ?? initialState;
  useEffect(() => {
    if (!sharedState) setSharedState(initialState);
  }, [initialState, setSharedState, sharedState]);

  const yearAnimationDayProgress = useRef(0);
  useEffect(() => {
    if (!state.enabled || !state.isAnimating) return;
    yearAnimationDayProgress.current = 0;
    const interval = window.setInterval(() => {
      setSharedState((previous) => {
        if (!previous?.enabled || !previous.isAnimating)
          return previous ?? initialState;
        const speed = previous.animationSpeed ?? 4;
        const mode = previous.animationMode ?? SHADOW_ANIMATION_MODE.DAY;
        if (mode === SHADOW_ANIMATION_MODE.YEAR) {
          yearAnimationDayProgress.current += speed / 2;
          const dayIncrement = Math.floor(yearAnimationDayProgress.current);
          if (dayIncrement === 0) return previous;
          yearAnimationDayProgress.current -= dayIncrement;
          let nextDay = previous.selection.dayOfYear + dayIncrement;
          let nextYear = previous.selection.year;
          const daysInYear = getDaysInYear(nextYear);
          if (nextDay > daysInYear) {
            nextDay = ((nextDay - 1) % daysInYear) + 1;
            nextYear += 1;
          }
          const selection = clampSelectionToDaylight(
            {
              year: nextYear,
              dayOfYear: nextDay,
              minutes: previous.selection.minutes,
            },
            location
          );
          return selection ? { ...previous, selection } : previous;
        }

        const daylight = getDaylightWindow(
          previous.selection.year,
          previous.selection.dayOfYear,
          location
        );
        const minimumMinutes = Math.ceil(daylight.sunriseMinutes);
        const maximumMinutes = Math.floor(daylight.sunsetMinutes);
        const nextMinutes = previous.selection.minutes + speed;
        return {
          ...previous,
          selection: {
            ...previous.selection,
            minutes:
              nextMinutes > maximumMinutes ? minimumMinutes : nextMinutes,
          },
        };
      });
    }, SHADOW_ANIMATION_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [
    initialState,
    location,
    setSharedState,
    state.enabled,
    state.animationMode,
    state.isAnimating,
  ]);

  if (target) {
    return (
      <ShadowSimulationSettings
        location={location}
        state={state}
        setState={setSharedState}
        showTerrainColor={!!terrain}
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
                  useUniformBuildingColor: state.enabled
                    ? state.useUniformBuildingColor
                    : true,
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
      />
      {state.showProjectionDebugView && libreMap && (
        <ShadowProjectionDebugView
          map={libreMap}
          solarPosition={getSolarPosition(state.selection, location)}
        />
      )}
    </>
  );
};
