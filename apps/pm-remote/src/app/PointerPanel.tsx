import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { SOURCE_LABEL } from "./orientation";
import type { usePointer } from "./usePointer";

type Pointer = ReturnType<typeof usePointer>;

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
 * The pointer, full screen: a large area to hold while pointing, the lock
 * that, armed, keeps the next spot after letting go, the tap that brings the spot back to
 * the middle, and the spot's settings.
 */
export const PointerPanel = ({ pointer }: { pointer: Pointer }) => {
  const {
    status,
    source,
    error,
    notice,
    settings,
    readout,
    close,
    press,
    release,
    toggleLock,
    touchMove,
    center,
    updateSettings,
  } = pointer;
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const isMotion = status === "motion";

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
  const isShowing = readout.isHolding || readout.isLatched;
  const steeringText =
    status === "touch"
      ? "Fingersteuerung"
      : "Drehen und Kippen bewegt den Punkt";

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
              : readout.isLatched
              ? "border-amber-400 bg-neutral-900"
              : "border-neutral-700 bg-neutral-900"
          }`}
        >
          <div
            className="relative w-3/4 max-w-sm overflow-hidden rounded-md border border-neutral-600 bg-neutral-800"
            style={{ aspectRatio: String(MINI_MAP_ASPECT) }}
          >
            <span
              className={`absolute block h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                isShowing ? "bg-amber-300" : "bg-neutral-500"
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
              : readout.isLatched
              ? "Punkt steht"
              : "Halten zum Zeigen"}
          </span>
          <span className="text-center text-xs text-neutral-400">
            {steeringText}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={toggleLock}
            disabled={status === "starting"}
            aria-pressed={readout.isLocked}
            className={`min-h-[56px] rounded-xl border text-sm font-semibold disabled:opacity-40 ${
              readout.isLocked
                ? "border-amber-400 bg-amber-400 text-neutral-950 active:bg-amber-300"
                : "border-neutral-700 bg-neutral-900 active:bg-neutral-800"
            }`}
          >
            {readout.isLocked ? "Festhalten: an" : "Festhalten"}
          </button>
          <button
            type="button"
            onClick={center}
            disabled={status === "starting"}
            className="min-h-[56px] rounded-xl border border-neutral-700 bg-neutral-900 text-sm font-semibold active:bg-neutral-800 disabled:opacity-40"
          >
            Mitte setzen
          </button>
        </div>
        {isMotion && (
          <p className="m-0 text-xs leading-relaxed text-neutral-400">
            Halten und das Handgelenk drehen: nach rechts und links bewegt den
            Punkt seitwärts, nach oben und unten kippen bewegt ihn hoch und
            runter. Loslassen und neu greifen setzt fort, wo der Punkt stand.
            Mit „Festhalten: an“ bleibt der Punkt nach dem Loslassen stehen,
            erneut Tippen schaltet aus und nimmt ihn weg. „Mitte setzen“ holt ihn in die Bildmitte.
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
          {isMotion && (
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
        </section>
      </div>
    </div>
  );
};
