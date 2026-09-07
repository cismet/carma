import { useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronUp,
  faMinus,
  faPlus,
  faRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import { Slider, Tooltip } from "antd";

import {
  FLOOD_LEVEL_STEP,
  FLOOD_LOOK_BOUNDS,
  formatLevel,
  useFloodActions,
  type FloodLook,
} from "./flood-actions";

const IconButton = ({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof faPlus;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <Tooltip title={label} placement="top">
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-gray-600 hover:bg-black/5 disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-transparent"
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
    <div className="flex flex-col gap-1.5">{children}</div>
  </section>
);

/** "12,5" with the German comma and no more digits than asked for */
const formatNumber = (value: number, digits: number): string =>
  value.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const CARDINALS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"] as const;

/** "90° O": the degrees and the nearest of the eight compass points */
const formatDirection = (degrees: number): string => {
  const index = Math.round(((degrees % 360) + 360) / 45) % 8;
  return `${Math.round(degrees)}° ${CARDINALS[index]}`;
};

/**
 * One knob of the look: its name, a slider over the knob's bounds, the value
 * with its unit. The knob's bounds are the store's too, so nothing the slider
 * can set is ever clamped away.
 */
const LookSlider = ({
  label,
  knob,
  step,
  value,
  format,
  onChange,
}: {
  label: string;
  knob: keyof FloodLook;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) => {
  const [min, max] = FLOOD_LOOK_BOUNDS[knob];
  return (
    <label className="m-0 grid grid-cols-[92px_minmax(0,1fr)_64px] items-center gap-3 text-sm text-gray-700">
      <span>{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        tooltip={{ open: false }}
        style={{ margin: 0 }}
      />
      <span className="text-right tabular-nums">{format(value)}</span>
    </label>
  );
};

/**
 * The ribbon under the layer bar: the water level while collapsed, the look
 * under it while open.
 *
 * The level is the whole UI for a visitor: steppers, the readout and one
 * slider. The pane below is where the surface is tuned, waves, current,
 * shoreline and colour, and it ships collapsed. A line under the header says
 * what the flood is, since a map that shows blue in the valley invites the
 * reading that someone computed where the river would go.
 */
export const FloodPanel = () => {
  const {
    level,
    range,
    opacity,
    look,
    isLoading,
    setLevel,
    stepLevel,
    setOpacity,
    setLook,
    resetLook,
  } = useFloodActions();

  const [expanded, setExpanded] = useState(false);

  const ready = level !== null && range !== null;
  const [min, max] = range ?? [0, 1];

  const note = ready
    ? "Vereinfachte Darstellung: ebener Wasserstand über dem Geländemodell " +
      "DGM1 (Geobasis NRW, Höhen über Normalhöhennull), ohne Abfluss- oder " +
      "Strömungsberechnung."
    : isLoading
    ? "Gelände wird geladen …"
    : "Kein Gelände im Kartenausschnitt.";

  const groundLine = range
    ? `Gelände im Ausschnitt: ${formatLevel(range[0])} bis ${formatLevel(
        range[1]
      )} ü. NHN`
    : "Gelände noch nicht gelesen";

  return (
    <div
      className="relative w-[100vw] sm:w-[86vw] sm:max-w-[680px] md:max-w-[760px] shrink-0 bg-white rounded-[10px] px-4 py-2 shadow-lg"
      data-test-id="flood-simulation"
    >
      {/* No title here: the layer-bar row the ribbon hangs off already carries
          it, and repeating it costs the width the slider wants. */}
      <div className="flex items-center gap-1.5 text-sm text-gray-700">
        <div className="grid shrink-0 grid-cols-[28px_84px_28px] items-center">
          <IconButton
            label={`${formatLevel(FLOOD_LEVEL_STEP)} tiefer`}
            icon={faMinus}
            disabled={!ready}
            onClick={() => stepLevel(-FLOOD_LEVEL_STEP)}
          />
          <span className="justify-self-center tabular-nums">
            {level === null ? "…" : formatLevel(level)}
          </span>
          <IconButton
            label={`${formatLevel(FLOOD_LEVEL_STEP)} höher`}
            icon={faPlus}
            disabled={!ready}
            onClick={() => stepLevel(FLOOD_LEVEL_STEP)}
          />
        </div>

        <Slider
          className="grow"
          min={min}
          max={max}
          step={FLOOD_LEVEL_STEP}
          value={level ?? min}
          disabled={!ready}
          onChange={setLevel}
          tooltip={{ formatter: (value) => formatLevel(value ?? 0) }}
          style={{ margin: 0 }}
        />

        <IconButton
          label={expanded ? "Darstellung schließen" : "Darstellung anpassen"}
          icon={expanded ? faChevronUp : faChevronDown}
          onClick={() => setExpanded((open) => !open)}
        />
      </div>

      <p className="mb-0 mt-1 text-[11px] leading-snug text-gray-500">{note}</p>

      {expanded && (
        <div className="mt-2 border-0 border-t border-solid border-gray-200 pt-2">
          <div className="mb-2 flex items-center justify-between gap-4">
            <span className="whitespace-nowrap text-sm text-gray-500 tabular-nums">
              {groundLine}
            </span>
            <button
              type="button"
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap border-0 bg-transparent text-sm text-gray-600 hover:text-gray-900"
              onClick={() => {
                resetLook();
                setOpacity(1);
              }}
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              Zurücksetzen
            </button>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
            <Section title="Wellen">
              <LookSlider
                label="Höhe"
                knob="waveHeight"
                step={0.05}
                value={look.waveHeight}
                format={(value) => `${Math.round(value * 100)} %`}
                onChange={(waveHeight) => setLook({ waveHeight })}
              />
              <LookSlider
                label="Länge"
                knob="waveLength"
                step={0.5}
                value={look.waveLength}
                format={(value) => `${formatNumber(value, 1)} m`}
                onChange={(waveLength) => setLook({ waveLength })}
              />
              <LookSlider
                label="Tempo"
                knob="waveSpeed"
                step={0.1}
                value={look.waveSpeed}
                format={(value) => `${formatNumber(value, 1)}×`}
                onChange={(waveSpeed) => setLook({ waveSpeed })}
              />
            </Section>

            <Section title="Strömung">
              <LookSlider
                label="Richtung"
                knob="flowDirection"
                step={5}
                value={look.flowDirection}
                format={formatDirection}
                onChange={(flowDirection) => setLook({ flowDirection })}
              />
              <LookSlider
                label="Tempo"
                knob="flowSpeed"
                step={0.1}
                value={look.flowSpeed}
                format={(value) => `${formatNumber(value, 1)} m/s`}
                onChange={(flowSpeed) => setLook({ flowSpeed })}
              />
            </Section>

            <Section title="Darstellung">
              <label className="m-0 grid grid-cols-[92px_minmax(0,1fr)_64px] items-center gap-3 text-sm text-gray-700">
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
                  {Math.round(opacity * 100)} %
                </span>
              </label>
              <LookSlider
                label="Tiefenfärbung"
                knob="depthScale"
                step={0.5}
                value={look.depthScale}
                format={(value) => `${formatNumber(value, 1)} m`}
                onChange={(depthScale) => setLook({ depthScale })}
              />
              <LookSlider
                label="Ufersaum"
                knob="shoreWidth"
                step={0.1}
                value={look.shoreWidth}
                format={(value) => `${formatNumber(value, 1)} m`}
                onChange={(shoreWidth) => setLook({ shoreWidth })}
              />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
};

/** what the host mounts for the row's interaction button */
export const FloodInteractionPanel = () => <FloodPanel />;
