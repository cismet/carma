import { useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faPause,
  faPlay,
  faRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import { Slider, Tooltip } from "antd";

import { useTimeSliderActions } from "./timeslider-actions";

/** active-control blue, as used by the other geoportal controls */
const ACCENT = "#1677ff";

const SPEEDS = [1, 2, 4] as const;

const Segment = ({ children }: { children: ReactNode }) => (
  <div className="inline-flex items-center rounded-lg bg-gray-100 p-1 gap-1">
    {children}
  </div>
);

const SegmentButton = ({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    title={title}
    aria-pressed={active}
    onClick={onClick}
    className={`text-sm rounded-md px-3 py-1 border-0 whitespace-nowrap cursor-pointer ${
      active
        ? "bg-white text-gray-900 shadow-sm"
        : "bg-transparent text-gray-600"
    }`}
  >
    {children}
  </button>
);

const IconButton = ({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof faPlay;
  active?: boolean;
  onClick: () => void;
}) => (
  <Tooltip title={label} placement="top">
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-gray-600 hover:bg-black/5"
      style={active ? { color: ACCENT } : undefined}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  </Tooltip>
);

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="min-w-0">
    <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
      {title}
    </h3>
    {children}
  </section>
);

/**
 * The ribbon under the layer bar: one row while collapsed, the settings pane
 * under it while open.
 *
 * Collapsed is what a preconfigured series needs, and it is the whole UI until
 * there is more than one series to pick from. The pane below holds what a
 * visitor can change about the series that is running, not what it is.
 */
export const TimeSliderPanel = () => {
  const {
    value,
    max,
    label,
    total,
    isPlaying,
    speed,
    opacity,
    loaded,
    isBlending,
    stepIndex,
    setValue,
    snapValue,
    stepBy,
    togglePlay,
    setSpeed,
    setOpacity,
  } = useTimeSliderActions();

  const [expanded, setExpanded] = useState(false);

  // Only the caged path preloads: it holds one viewport-locked image per time
  // step, and every one of them is thrown away on a pan. The fallback loads
  // tiles per step as it goes and has no total to count against.
  const loadedCount = loaded ?? 0;
  const isLoading = isBlending && total > 0 && loadedCount < total;
  const loadedPercent = total > 0 ? (loadedCount / total) * 100 : 0;

  const status = !isBlending
    ? `${total} Zeitschritte, ohne Zwischenschritte`
    : loaded === undefined
    ? `${total} Zeitschritte werden geladen …`
    : loaded < total
    ? `Zeitschritte geladen: ${loaded} von ${total}`
    : `${total} Zeitschritte, stufenlos`;

  return (
    <div
      className="relative w-[100vw] sm:w-[86vw] sm:max-w-[680px] md:max-w-[760px] shrink-0 bg-white rounded-[10px] px-4 py-2 shadow-lg"
      data-test-id="time-slider"
    >
      {/* No title here: the layer-bar row the ribbon hangs off already carries
          it, and repeating it costs the width the slider wants. */}
      <div className="flex items-center gap-1.5 text-sm text-gray-700">
        <div className="grid shrink-0 grid-cols-[28px_84px_28px] items-center">
          <IconButton
            label="Ein Zeitschritt zurück"
            icon={faChevronLeft}
            onClick={() => stepBy(-1)}
          />
          <span className="justify-self-center tabular-nums">{label}</span>
          <IconButton
            label="Ein Zeitschritt vor"
            icon={faChevronRight}
            onClick={() => stepBy(1)}
          />
        </div>

        <Slider
          className="grow"
          min={0}
          max={max}
          step={1}
          value={value}
          onChange={setValue}
          // blending is a live preview during the drag; letting go parks the
          // slider on the nearest whole time step, as the Leaflet app does
          onChangeComplete={snapValue}
          tooltip={{ open: false }}
          style={{ margin: 0 }}
        />

        <IconButton
          label={isPlaying ? "Animation anhalten" : "Animation abspielen"}
          icon={isPlaying ? faPause : faPlay}
          active={isPlaying}
          onClick={togglePlay}
        />
        <IconButton
          label={expanded ? "Einstellungen schließen" : "Einstellungen öffnen"}
          icon={expanded ? faChevronUp : faChevronDown}
          onClick={() => setExpanded((open) => !open)}
        />
      </div>

      {/* The load line the Leaflet app shows while the series is being fetched.
          The map is blank for as long as this runs, initially and after every
          pan, so it is the only thing on screen saying the service is working
          rather than broken.

          On the ribbon's bottom edge, spanning its full width and following its
          corner radius, so it reads as the ribbon loading rather than as a
          second slider. Positioned out of flow, so appearing and disappearing
          moves nothing above it. */}
      <div
        className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-[10px]"
        style={{
          backgroundColor: isLoading ? "rgb(0 0 0 / 0.08)" : "transparent",
        }}
        role="progressbar"
        aria-hidden={!isLoading}
        aria-label="Zeitschritte werden geladen"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={loadedCount}
      >
        <div
          className="h-full"
          style={{
            width: `${loadedPercent}%`,
            backgroundColor: isLoading ? ACCENT : "transparent",
            transition: "width 150ms linear",
          }}
        />
      </div>

      {expanded && (
        <div className="mt-2 border-0 border-t border-solid border-gray-200 pt-2">
          <div className="mb-2 flex items-center justify-between gap-4">
            <span className="whitespace-nowrap text-sm text-gray-500">
              {status}
            </span>
            <button
              type="button"
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap border-0 bg-transparent text-sm text-gray-600 hover:text-gray-900"
              onClick={() => {
                setValue(0);
                setSpeed(1);
                setOpacity(1);
              }}
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              Zurücksetzen
            </button>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
            <Section title="Wiedergabe">
              <Segment>
                {SPEEDS.map((factor) => (
                  <SegmentButton
                    key={factor}
                    active={speed === factor}
                    title={`${factor}-fache Geschwindigkeit`}
                    onClick={() => setSpeed(factor)}
                  >
                    {factor}×
                  </SegmentButton>
                ))}
              </Segment>
            </Section>

            <Section title="Darstellung">
              <label className="m-0 grid grid-cols-[80px_minmax(0,1fr)_42px] items-center gap-3 text-sm text-gray-700">
                <span>Deckkraft</span>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={opacity}
                  onChange={setOpacity}
                  tooltip={{ open: false }}
                  style={{ margin: 0 }}
                />
                <span className="text-right tabular-nums">
                  {Math.round(opacity * 100)}%
                </span>
              </label>
            </Section>
          </div>

          <p className="mb-0 mt-2 text-xs text-gray-500 tabular-nums">
            Zeitschritt {stepIndex + 1} von {total}
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * What the host's interaction view mounts. The row it is opened from is the
 * addon's own, so the `layer` prop the host passes says nothing this component
 * does not already read from the channel.
 */
export const TimeSliderInteractionPanel = () => <TimeSliderPanel />;
