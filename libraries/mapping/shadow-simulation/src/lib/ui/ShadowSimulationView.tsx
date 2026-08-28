import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import {
  faArrowRotateLeft,
  faCalendarDays,
  faBug,
  faChevronLeft,
  faClock,
  faChevronRight,
  faPause,
  faPlay,
  faSliders,
  faSun,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DatePicker, Tooltip } from "antd";
import deDE from "antd/locale/de_DE";
import dayjs from "dayjs";

import { clamp } from "@carma-commons/math";
import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";
import {
  clampSelectionToDaylight,
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  getDaylightWindow,
  getDaysInYear,
  getSolarPosition,
  getSolarSelectionForInstant,
  type SolarLocation,
  type SolarSelection,
} from "../core/solar-position";
import {
  DEFAULT_SHADOW_QUALITY,
  DEFAULT_SHADOW_SURFACE_COLOR,
  type ShadowQualityMultiplier,
} from "../core/shadow-types";
import {
  buildShadowSimulationScene,
  type ShadowSimulationScene,
  type ShadowTerrainOptions,
} from "../runtime/shadow-scene";
import { ShadowProjectionDebugView } from "./ShadowProjectionDebugView";
import { SolarDayTimeControl } from "./SolarDayTimeControl";

import "dayjs/locale/de";

const ACTIVE_CONTROL_COLOR = "#1677ff";
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
    return `#${clamp(Math.round(value), 0, 0xffffff)
      .toString(16)
      .padStart(6, "0")}`;
  }
  return DEFAULT_SHADOW_SURFACE_COLOR;
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
  showShadowBuffers?: boolean;
  softSunShadows?: boolean;
  useTransmittanceLut?: boolean;
  useSkyIrradianceLut?: boolean;
  controlStyle?: ShadowControlStyle;
  animationMode?: ShadowAnimationMode;
  animationSpeed?: ShadowAnimationSpeed;
  isAnimating?: boolean;
  shadowIntensity?: number;
};

export type ShadowSimulationStateAction =
  | ShadowSimulationState
  | ((previous: ShadowSimulationState | undefined) => ShadowSimulationState);

export type ShadowSimulationStateSetter = (
  action: ShadowSimulationStateAction
) => void;

const getMapCenterSolarLocation = (
  libreMap: MaplibreMap | null,
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
  libreMap: MaplibreMap | null,
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

const QUICK_BUTTON_CLASS_NAME =
  "flex h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-md border border-neutral-300 bg-white px-1 text-center text-sm text-neutral-800 transition-colors hover:border-amber-500 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40";
const SEGMENT_BUTTON_CLASS_NAME =
  "h-8 whitespace-nowrap border-r border-neutral-300 px-3 text-sm text-neutral-700 transition-colors last:border-r-0 hover:text-amber-700";

const SHADOW_QUALITY_LEVELS: ReadonlyArray<{
  label: string;
  value: ShadowQualityMultiplier;
}> = [
  { label: "Mittel", value: 4 },
  { label: "Hoch", value: 16 },
  { label: "Max", value: 64 },
];

const resolveShadowQuality = (
  quality: number | undefined
): ShadowQualityMultiplier =>
  quality === 4 || quality === 16 || quality === 64
    ? quality
    : DEFAULT_SHADOW_QUALITY;

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

export const ShadowSimulationHeaderControls = ({
  config,
  libreMap,
  state,
  setState,
}: {
  config?: ShadowSimulationConfig;
  libreMap: MaplibreMap | null;
  state: ShadowSimulationState | undefined;
  setState: ShadowSimulationStateSetter;
}) => {
  const {
    latitude = DEFAULT_SHADOW_SIMULATION_LOCATION.latitude,
    longitude = DEFAULT_SHADOW_SIMULATION_LOCATION.longitude,
    timeZone = DEFAULT_SHADOW_SIMULATION_LOCATION.timeZone,
  } = config ?? {};
  const location = useMapCenterSolarLocation(
    libreMap,
    latitude,
    longitude,
    timeZone
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const selection = state?.selection;
  const daylight = useMemo(
    () =>
      selection
        ? getDaylightWindow(selection.year, selection.dayOfYear, location)
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
    const next = clampSelectionToDaylight(candidate, location);
    if (next) setState({ ...state, selection: next });
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
            publishSelection(getSelectionForDayOffset(selection, -1))
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
              {formatSelectionDate(selection, false)}
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
            publishSelection(getSelectionForDayOffset(selection, 1))
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
          value={formatMinutes(selection.minutes)}
          min={formatMinutes(minimumMinutes)}
          max={formatMinutes(maximumMinutes)}
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
  const intensity = state.shadowIntensity ?? 1;

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
          className="grid grid-cols-2 gap-2"
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
            <span>Sonnenscheibe</span>
            <input
              type="checkbox"
              checked={state.softSunShadows ?? true}
              onChange={(event) =>
                setState({
                  ...state,
                  softSunShadows: event.currentTarget.checked,
                })
              }
              className="h-4 w-4 cursor-pointer justify-self-start accent-amber-600"
              data-test-id="shadow-simulation-soft-sun"
              aria-label="Sonnenscheibe statt Punktquelle"
            />
          </label>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
            <span>Qualität</span>
            <div
              className="inline-flex w-fit max-w-full overflow-hidden whitespace-nowrap rounded-md border border-neutral-300"
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
                  onClick={() => setState({ ...state, shadowQuality: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const ShadowSimulationSecondaryPanel = ({
  location,
  state,
  setState,
}: {
  location: SolarLocation;
  state: ShadowSimulationState;
  setState: (state: ShadowSimulationState) => void;
}) => {
  const controlStyle = state.controlStyle ?? SHADOW_CONTROL_STYLE.QUICK;
  const position = useMemo(
    () => getSolarPosition(state.selection, location),
    [location, state.selection]
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
                shadowIntensity: 1,
                showSunDebugVector: false,
                showShadowBuffers: false,
                showProjectionDebugView: false,
                useTransmittanceLut: true,
                useSkyIrradianceLut: true,
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
        />
      )}
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
  libreMap: MaplibreMap | null;
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
  location: SolarLocation;
  state: ShadowSimulationState;
}) => {
  const shadowScene = useRef<ShadowSimulationScene | null>(null);
  const [sceneRevision, setSceneRevision] = useState(0);
  const solarPosition = useMemo(
    () => getSolarPosition(state.selection, location),
    [location, state.selection]
  );

  useEffect(() => {
    if (!libreMap || !state.enabled) return;
    // URL state can enable the simulation before the style is ready.
    let scene: ShadowSimulationScene | null = null;
    const styleReady = () =>
      (libreMap as unknown as { style?: { light?: unknown } | null }).style
        ?.light != null;
    const tryBuild = () => {
      if (scene || !styleReady()) return;
      libreMap.off("styledata", tryBuild);
      scene = buildShadowSimulationScene(libreMap, {
        shadowAreaMeters,
        terrain,
      });
      shadowScene.current = scene;
      setSceneRevision((revision) => revision + 1);
    };
    tryBuild();
    if (!scene) {
      libreMap.on("styledata", tryBuild);
    }
    return () => {
      libreMap.off("styledata", tryBuild);
      shadowScene.current = null;
      scene?.dispose();
      scene = null;
    };
  }, [libreMap, shadowAreaMeters, state.enabled, terrain]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSolarPosition(solarPosition);
  }, [solarPosition, state.enabled, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateShadowQuality(
      resolveShadowQuality(state.shadowQuality)
    );
  }, [state.enabled, state.shadowQuality, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSoftSunShadows(state.softSunShadows ?? true);
  }, [state.enabled, state.softSunShadows, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateTimeAnimating(state.isAnimating ?? false);
  }, [state.enabled, state.isAnimating, sceneRevision]);

  useEffect(() => {
    if (!state.enabled || !state.showProjectionDebugView) return;
    shadowScene.current?.refreshProjectionDebug();
  }, [state.enabled, state.showProjectionDebugView, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateShadowIntensity(state.shadowIntensity ?? 1);
  }, [state.enabled, state.shadowIntensity, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateSunDebugVectorVisibility(
      state.showSunDebugVector ?? false
    );
  }, [state.enabled, state.showSunDebugVector, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateShadowBufferDebugVisibility(
      state.showShadowBuffers ?? false
    );
  }, [state.enabled, state.showShadowBuffers, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateAtmosphericLutUsage({
      useTransmittanceLut: state.useTransmittanceLut ?? true,
      useIrradianceLut: state.useSkyIrradianceLut ?? true,
    });
  }, [
    state.enabled,
    state.useSkyIrradianceLut,
    state.useTransmittanceLut,
    sceneRevision,
  ]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateTerrainColor(
      state.terrainColor ?? DEFAULT_SHADOW_SURFACE_COLOR
    );
  }, [state.enabled, state.terrainColor, sceneRevision]);

  useEffect(() => {
    if (!state.enabled) return;
    shadowScene.current?.updateBuildingAppearance({
      fullOpacity: state.buildingsFullOpacity ?? true,
      uniformColor:
        state.useUniformBuildingColor ?? true
          ? state.buildingColor ?? DEFAULT_SHADOW_SURFACE_COLOR
          : null,
    });
  }, [
    state.buildingColor,
    state.buildingsFullOpacity,
    state.enabled,
    state.useUniformBuildingColor,
    sceneRevision,
  ]);

  return null;
};

export const ShadowSimulationView = ({
  config,
  libreMap,
  targeted,
  sharedState,
  setSharedState,
}: {
  config?: ShadowSimulationConfig;
  libreMap: MaplibreMap | null;
  targeted: boolean;
  sharedState: ShadowSimulationState | undefined;
  setSharedState: ShadowSimulationStateSetter;
}) => {
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
      buildingColor: DEFAULT_SHADOW_SURFACE_COLOR,
      shadowQuality: DEFAULT_SHADOW_QUALITY,
      showSunDebugVector: false,
      showShadowBuffers: false,
      showProjectionDebugView: false,
      softSunShadows: true,
      useTransmittanceLut: true,
      useSkyIrradianceLut: true,
      controlStyle: SHADOW_CONTROL_STYLE.QUICK,
      animationMode: SHADOW_ANIMATION_MODE.DAY,
      animationSpeed: 4,
      isAnimating: false,
      shadowIntensity: 1,
      selection: clampSelectionToDaylight(candidate, location) ?? {
        ...candidate,
        minutes: 12 * 60,
      },
    };
  }, [initialDayOfYear, initialMinutes, location, terrain, timeZone, year]);
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

  if (targeted) {
    return (
      <ShadowSimulationSecondaryPanel
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
          settings={{
            shadowQuality: resolveShadowQuality(state.shadowQuality),
            terrainColor: state.terrainColor ?? DEFAULT_SHADOW_SURFACE_COLOR,
            buildingsFullOpacity: state.buildingsFullOpacity ?? true,
            useUniformBuildingColor: state.useUniformBuildingColor ?? true,
            buildingColor: state.buildingColor ?? DEFAULT_SHADOW_SURFACE_COLOR,
            showSunDebugVector: state.showSunDebugVector ?? false,
            showShadowBuffers: state.showShadowBuffers ?? false,
            useTransmittanceLut: state.useTransmittanceLut ?? true,
            useSkyIrradianceLut: state.useSkyIrradianceLut ?? true,
          }}
          onSettingsChange={(patch) => setSharedState({ ...state, ...patch })}
        />
      )}
    </>
  );
};
