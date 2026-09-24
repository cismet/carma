import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { SOURCE_LABEL } from "./orientation";
import { PRESENTER_SIDES, type PresenterSide } from "./pointer-math";
import type { PointerMode, usePointer } from "./usePointer";

type Pointer = ReturnType<typeof usePointer>;

const SIDE_LABEL: Record<PresenterSide, string> = {
  bottom: "unten",
  left: "links",
  top: "oben",
  right: "rechts",
};

const MODE_LABEL: Record<PointerMode, string> = {
  wrist: "Handgelenk",
  laser: "Laser auf Tisch",
};

const POINTER_MODES: readonly PointerMode[] = ["wrist", "laser"];

/** the printed Wuppertal model is close to 16:9; only the mini map uses it */
const MINI_MAP_ASPECT = 16 / 9;

const Slider = ({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={id} className="text-sm text-neutral-300">
        {label}
      </label>
      <span className="text-sm tabular-nums text-neutral-400">{display}</span>
    </div>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-10 w-full accent-amber-400"
    />
  </div>
);

/**
 * The pointer, full screen: a large area to hold while pointing, the two
 * calibration taps, and the spot's settings.
 */
export const PointerPanel = ({ pointer }: { pointer: Pointer }) => {
  const {
    status,
    source,
    error,
    notice,
    settings,
    calibrated,
    readout,
    close,
    press,
    release,
    touchMove,
    center,
    edge,
    updateSettings,
  } = pointer;
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const isMotion = status === "motion";
  const isWrist = settings.mode === "wrist";
  const isLaser = isMotion && !isWrist;

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    lastTouchRef.current = { x: event.clientX, y: event.clientY };
    press();
  };
  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const last = lastTouchRef.current;
    if (!last || isMotion) {
      return;
    }
    const width = event.currentTarget.clientWidth || 1;
    touchMove(
      (event.clientX - last.x) / width,
      (event.clientY - last.y) / width
    );
    lastTouchRef.current = { x: event.clientX, y: event.clientY };
  };
  const onUp = () => {
    lastTouchRef.current = null;
    release();
  };
  const isHoldKey = (event: ReactKeyboardEvent) =>
    event.key === " " || event.key === "Enter";

  const [dx, dy] = readout.position;
  const calibrationText =
    status === "touch"
      ? "Fingersteuerung"
      : isWrist
      ? "Drehen und Kippen bewegt den Punkt"
      : calibrated === "edge"
      ? "Mitte und Rand gesetzt"
      : calibrated === "center"
      ? "Mitte gesetzt"
      : "Nicht eingemessen: der erste Druck setzt die Mitte";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Zeiger"
      className="fixed inset-0 z-40 flex flex-col bg-neutral-950 pt-safe-top-xs"
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-lg font-semibold">Zeiger</h2>
          <p className="m-0 truncate text-xs text-neutral-500">
            {status === "starting"
              ? "Startet …"
              : `${source ? SOURCE_LABEL[source] : "Finger"} · ${
                  readout.readingsPerSecond
                }/s · gesendet ${readout.writesPerSecond}/s${
                  readout.rttMs !== null ? ` · ${readout.rttMs} ms` : ""
                }`}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          className="min-h-[44px] rounded-lg bg-neutral-800 px-4 text-sm active:bg-neutral-700"
        >
          Beenden
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 pb-safe-bottom-xs">
        {error && (
          <p className="m-0 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        {notice && (
          <p className="m-0 rounded-lg bg-amber-950 px-3 py-2 text-sm text-amber-100">
            {notice}
          </p>
        )}

        {/* hold to point; without attitude the finger's travel steers */}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={readout.isHolding}
          onKeyDown={(event) => {
            if (isHoldKey(event)) {
              event.preventDefault();
              if (!event.repeat) {
                press();
              }
            }
          }}
          onKeyUp={(event) => {
            if (isHoldKey(event)) {
              release();
            }
          }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
          onContextMenu={(event) => event.preventDefault()}
          className={`flex min-h-[38vh] flex-1 touch-none select-none flex-col items-center justify-center gap-4 rounded-3xl border-2 p-4 [-webkit-touch-callout:none] ${
            readout.isHolding
              ? "border-amber-400 bg-amber-950"
              : "border-neutral-700 bg-neutral-900"
          }`}
        >
          <div
            className="relative w-3/4 max-w-sm overflow-hidden rounded-md border border-neutral-600 bg-neutral-800"
            style={{ aspectRatio: String(MINI_MAP_ASPECT) }}
          >
            <span
              className={`absolute block h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                readout.isHolding ? "bg-amber-300" : "bg-neutral-500"
              }`}
              style={{
                left: `${(0.5 + dx) * 100}%`,
                top: `${(0.5 + dy * MINI_MAP_ASPECT) * 100}%`,
              }}
            />
          </div>
          <span className="text-center text-lg font-semibold">
            {status === "starting"
              ? "Sensoren starten …"
              : readout.isHolding
              ? "Zeigt"
              : "Halten zum Zeigen"}
          </span>
          <span className="text-center text-xs text-neutral-400">
            {calibrationText}
          </span>
        </div>

        {isMotion && (
          <div className="grid grid-cols-2 gap-2">
            {POINTER_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={settings.mode === mode}
                onClick={() => updateSettings({ mode })}
                className={`min-h-[44px] rounded-lg text-sm ${
                  settings.mode === mode
                    ? "border border-amber-400 bg-amber-950 font-semibold text-neutral-100"
                    : "border border-neutral-700 bg-neutral-950 text-neutral-300 active:bg-neutral-800"
                }`}
              >
                {MODE_LABEL[mode]}
              </button>
            ))}
          </div>
        )}

        <div className={`grid gap-3 ${isLaser ? "grid-cols-2" : "grid-cols-1"}`}>
          <button
            type="button"
            onClick={center}
            disabled={status === "starting"}
            className="min-h-[56px] rounded-xl border border-neutral-700 bg-neutral-900 text-sm font-semibold active:bg-neutral-800 disabled:opacity-40"
          >
            Mitte setzen
          </button>
          {isLaser && (
            <button
              type="button"
              onClick={edge}
              disabled={calibrated === "none"}
              className="min-h-[56px] rounded-xl border border-neutral-700 bg-neutral-900 text-sm font-semibold active:bg-neutral-800 disabled:opacity-40"
            >
              Rechten Rand setzen
            </button>
          )}
        </div>
        {isMotion && isWrist && (
          <p className="m-0 text-xs leading-relaxed text-neutral-400">
            Halten und das Handgelenk drehen: nach rechts und links bewegt den
            Punkt seitwärts, nach oben und unten kippen bewegt ihn hoch und
            runter. Loslassen und neu greifen setzt fort, wo der Punkt stand.
            „Mitte setzen“ holt ihn in die Bildmitte.
          </p>
        )}
        {isLaser && (
          <p className="m-0 text-xs leading-relaxed text-neutral-400">
            Mit der Oberkante des Telefons auf die Mitte des Modells zielen und
            „Mitte setzen“ tippen. Für genaues Zeigen danach auf die Mitte des
            rechten Bildrands zielen und „Rechten Rand setzen“ tippen. Wandert
            der Punkt mit der Zeit weg, einfach wieder die Mitte setzen.
          </p>
        )}

        <section className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <Slider
            id="pm-pointer-radius"
            label="Größe"
            value={settings.radius}
            min={0.02}
            max={0.2}
            step={0.005}
            display={`${Math.round(settings.radius * 100)} %`}
            onChange={(radius) => updateSettings({ radius })}
          />
          <Slider
            id="pm-pointer-dim"
            label="Abdunkeln"
            value={settings.dim}
            min={0.2}
            max={0.95}
            step={0.05}
            display={`${Math.round(settings.dim * 100)} %`}
            onChange={(dim) => updateSettings({ dim })}
          />
          {isMotion && isWrist && (
            <Slider
              id="pm-pointer-wrist-gain"
              label="Drehweg für die ganze Bildbreite"
              value={1 / settings.wristGain}
              min={10}
              max={80}
              step={1}
              display={`${Math.round(1 / settings.wristGain)}°`}
              onChange={(degrees) => updateSettings({ wristGain: 1 / degrees })}
            />
          )}
          {isLaser && (
            <>
              <Slider
                id="pm-pointer-scale"
                label="Empfindlichkeit"
                value={settings.scale}
                min={0.1}
                max={1.5}
                step={0.01}
                display={settings.scale.toFixed(2)}
                onChange={(scale) => updateSettings({ scale })}
              />
              <div className="flex flex-col gap-2">
                <span className="text-sm text-neutral-300">
                  Ich stehe am Bildrand
                  {settings.turn !== null ? " (vom Rand eingemessen)" : ""}
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {PRESENTER_SIDES.map((side) => {
                    const isChosen =
                      settings.turn === null && settings.side === side;
                    return (
                      <button
                        key={side}
                        type="button"
                        aria-pressed={isChosen}
                        onClick={() => updateSettings({ side })}
                        className={`min-h-[44px] rounded-lg text-sm ${
                          isChosen
                            ? "border border-amber-400 bg-amber-950 text-neutral-100"
                            : "border border-neutral-700 bg-neutral-950 text-neutral-300 active:bg-neutral-800"
                        }`}
                      >
                        {SIDE_LABEL[side]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
