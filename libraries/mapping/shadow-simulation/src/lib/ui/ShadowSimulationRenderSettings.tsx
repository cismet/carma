import type { ShadowSimulationState } from "../contracts/shadow-simulation";
import {
  resolveShadowQuality,
  resolveShadowRenderQuality,
  SHADOW_BUFFER_FORMAT,
  SHADOW_SUN_DISC_SAMPLES,
  SHADOW_MSAA_OPTIONS,
  SHADOW_MSAA_MAX,
  SHADOW_QUALITY,
} from "../core/shadow-types";
import { SHADOW_BUFFER_FORMAT_OPTIONS } from "./shadow-control-utils";

export const ShadowSimulationRenderSettings = ({
  state,
  setState,
}: {
  state: ShadowSimulationState;
  setState: (state: ShadowSimulationState) => void;
}) => {
  const quality = resolveShadowRenderQuality(
    state,
    resolveShadowQuality(state.shadowQuality)
  );
  const softSun = state.softSunShadows ?? true;

  return (
    <details className="min-w-0 text-sm text-neutral-700 lg:col-span-2">
      <summary className="cursor-pointer py-1 font-medium">
        Erweiterte Schattenqualität (experimentell)
      </summary>
      <div className="mt-2 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span>Farbpuffer</span>
          <select
            aria-label="Farbpuffer der Schattenakkumulation"
            className="min-w-0 rounded-md border border-neutral-300 bg-white px-2 py-1"
            value={quality.shadowBufferFormat}
            disabled={!softSun}
            onChange={(event) => {
              const option = SHADOW_BUFFER_FORMAT_OPTIONS.find(
                ({ value }) => value === event.currentTarget.value
              );
              if (option)
                setState({ ...state, shadowBufferFormat: option.value });
            }}
          >
            {SHADOW_BUFFER_FORMAT_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span>Sonnenscheiben-Samples</span>
          <select
            aria-label="Samples der Sonnenscheibe"
            className="min-w-0 rounded-md border border-neutral-300 bg-white px-2 py-1"
            value={state.shadowSunDiscSamples ?? ""}
            disabled={!softSun}
            onChange={(event) =>
              setState({
                ...state,
                shadowSunDiscSamples: SHADOW_SUN_DISC_SAMPLES.find(
                  (samples) => samples === Number(event.currentTarget.value)
                ),
              })
            }
          >
            <option value="">Automatisch nach Schattenqualität</option>
            {SHADOW_SUN_DISC_SAMPLES.map((samples) => (
              <option key={samples} value={samples}>
                {samples}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span>Geometrie-Kantenglättung (MSAA)</span>
          <select
            aria-label="Geometrie-Kantenglättung im Schattenfarbpuffer"
            className="min-w-0 rounded-md border border-neutral-300 bg-white px-2 py-1"
            value={state.shadowMsaaSamples ?? ""}
            disabled={
              !softSun ||
              quality.shadowBufferFormat === SHADOW_BUFFER_FORMAT.HDR_32
            }
            onChange={(event) =>
              setState({
                ...state,
                shadowMsaaSamples: SHADOW_MSAA_OPTIONS.find(
                  (samples) => String(samples) === event.currentTarget.value
                ),
              })
            }
          >
            <option value="">Automatisch nach Qualitätsziel</option>
            {SHADOW_MSAA_OPTIONS.map((samples) => (
              <option key={samples} value={samples}>
                {samples === SHADOW_MSAA_MAX ? "Gerätemaximum" : `${samples}×`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Schattenauflösung an der Bodenfläche ausrichten"
            className="h-4 w-4 shrink-0 accent-amber-600"
            checked={quality.shadowGroundTexelFit}
            onChange={(event) =>
              setState({
                ...state,
                shadowGroundTexelFit: event.currentTarget.checked,
              })
            }
          />
          <span>Gleichmäßige Schattenauflösung am Boden</span>
        </label>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Farbpuffer, Samples und MSAA gelten für die Sonnenscheibe im
        Ruhezustand. Mehr Samples reduzieren Abtastungsstufen, verlängern aber
        die Berechnung. Manuelle Werte überschreiben das Qualitätsziel bis zur
        nächsten Preset-Auswahl; MSAA wird auf das Format-/Gerätelimit begrenzt.
      </p>
      {state.shadowQuality === SHADOW_QUALITY.ULTRA && (
        <p role="status" className="mt-1 text-xs text-amber-800">
          Ultra: maximale Terrain- und Sonnenscheiben-Qualität, Gerätemaximum
          für MSAA und große Schattenpuffer innerhalb des Speicherbudgets. Kein
          FPS-Ziel und keine automatische Qualitätsreduktion.
        </p>
      )}
      {softSun && quality.shadowSunDiscSamples >= 1024 && (
        <p role="status" className="mt-1 text-xs text-amber-800">
          Referenzqualität: Die vollständige Sonnenscheiben-Integration kann in
          großen Szenen deutlich länger dauern. Kamera und Gelände behalten ihre
          Qualität; die Auswahl wird nicht automatisch aktiviert.
        </p>
      )}
      {softSun && quality.shadowBufferFormat === SHADOW_BUFFER_FORMAT.SDR_8 && (
        <p role="status" className="mt-1 text-xs text-amber-800">
          SDR mit 8 Bit begrenzt HDR-Helligkeiten bereits vor dem Tone Mapping
          und kann sichtbare Helligkeitsstufen erzeugen. Nur zum Vergleich.
        </p>
      )}
      {softSun &&
        quality.shadowBufferFormat === SHADOW_BUFFER_FORMAT.HDR_16 && (
          <p role="status" className="mt-1 text-xs text-amber-800">
            Reine 16-Bit-Akkumulation rundet das Ergebnis bei jedem Sample
            erneut. Bei vielen Samples können sich diese Rundungsfehler
            summieren. Der 16/32-Bit-Standard mittelt deshalb mit 32 Bit.
          </p>
        )}
    </details>
  );
};
