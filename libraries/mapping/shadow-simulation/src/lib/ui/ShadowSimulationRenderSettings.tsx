import { Checkbox, Select, theme, Typography } from "antd";

import type { ShadowSimulationState } from "../contracts/shadow-simulation";
import {
  resolveShadowQuality,
  resolveShadowRenderQuality,
  SHADOW_BUFFER_FORMAT,
  SHADOW_BUFFER_LAYOUT,
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
  const { token } = theme.useToken();
  const quality = resolveShadowRenderQuality(
    state,
    resolveShadowQuality(state.shadowQuality)
  );
  const softSun = state.softSunShadows ?? true;
  const tiled = quality.shadowBufferLayout === SHADOW_BUFFER_LAYOUT.TILED;

  return (
    <div className="min-w-0">
      <label className="grid min-w-0 grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
        <span>Schattenpuffer</span>
        <Select
          aria-label="Schattenpuffer"
          style={{ width: "100%", minWidth: 0 }}
          virtual={false}
          value={quality.shadowBufferLayout}
          options={[
            { value: SHADOW_BUFFER_LAYOUT.MONO, label: "Einzelpuffer" },
            {
              value: SHADOW_BUFFER_LAYOUT.TILED,
              label: "Gekachelt (experimentell)",
            },
          ]}
          onChange={(shadowBufferLayout) =>
            setState({ ...state, shadowBufferLayout })
          }
        />
      </label>
      {quality.shadowBufferLayout === SHADOW_BUFFER_LAYOUT.TILED && (
        <Typography.Paragraph
          role="status"
          style={{
            marginTop: token.marginXS,
            marginBottom: 0,
            fontSize: token.fontSizeSM,
            color: token.colorWarningText,
          }}
        >
          Gekachelte Schatten richten die Bodenauflösung automatisch an der
          Ansicht aus und nutzen einen begrenzten Cache. Bei hoher Qualität kann
          die Berechnung länger dauern als mit dem Einzelpuffer. Bei flacher
          Sonne sind feine Terrain-Artefakte noch möglich. Die Sonnenscheibe
          wird je Korridor integriert; Geometrie-MSAA ist hier derzeit aus.
          Karte und Beschriftungen bleiben in nativer Bildschirmauflösung.
        </Typography.Paragraph>
      )}
      <div
        className="flex flex-wrap gap-x-4 gap-y-2"
        style={{ marginTop: token.marginSM }}
      >
        <Checkbox
          checked={state.useTransmittanceLut ?? true}
          onChange={(event) =>
            setState({ ...state, useTransmittanceLut: event.target.checked })
          }
        >
          Transmittanz-LUT
        </Checkbox>
        <Checkbox
          checked={state.useSkyIrradianceLut ?? true}
          onChange={(event) =>
            setState({ ...state, useSkyIrradianceLut: event.target.checked })
          }
        >
          Sky-Irradianz-LUT
        </Checkbox>
      </div>
      <details className="min-w-0" style={{ marginTop: token.margin }}>
        <summary
          className="cursor-pointer"
          style={{
            paddingBlock: token.paddingXS,
            fontWeight: token.fontWeightStrong,
          }}
        >
          Erweiterte Schattenqualität (experimentell)
        </summary>
        <div className="mt-2 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span>Farbpuffer</span>
            <Select
              aria-label="Farbpuffer der Schattenakkumulation"
              style={{ width: "100%", minWidth: 0 }}
              virtual={false}
              value={quality.shadowBufferFormat}
              disabled={!softSun}
              options={[...SHADOW_BUFFER_FORMAT_OPTIONS]}
              onChange={(shadowBufferFormat) =>
                setState({ ...state, shadowBufferFormat })
              }
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span>Sonnenscheiben-Samples</span>
            <Select
              aria-label="Samples der Sonnenscheibe"
              style={{ width: "100%", minWidth: 0 }}
              virtual={false}
              value={state.shadowSunDiscSamples ?? ""}
              disabled={!softSun}
              options={[
                { value: "", label: "Automatisch nach Schattenqualität" },
                ...SHADOW_SUN_DISC_SAMPLES.map((samples) => ({
                  value: samples,
                  label: String(samples),
                })),
              ]}
              onChange={(value) =>
                setState({
                  ...state,
                  shadowSunDiscSamples: SHADOW_SUN_DISC_SAMPLES.find(
                    (samples) => samples === value
                  ),
                })
              }
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span>Geometrie-Kantenglättung (MSAA)</span>
            <Select
              aria-label="Geometrie-Kantenglättung im Schattenfarbpuffer"
              style={{ width: "100%", minWidth: 0 }}
              virtual={false}
              value={tiled ? 0 : state.shadowMsaaSamples ?? ""}
              disabled={
                !softSun ||
                tiled ||
                quality.shadowBufferFormat === SHADOW_BUFFER_FORMAT.HDR_32
              }
              options={[
                { value: "", label: "Automatisch nach Qualitätsziel" },
                ...SHADOW_MSAA_OPTIONS.map((samples) => ({
                  value: samples,
                  label:
                    samples === SHADOW_MSAA_MAX
                      ? "Gerätemaximum"
                      : samples + "×",
                })),
              ]}
              onChange={(value) =>
                setState({
                  ...state,
                  shadowMsaaSamples: SHADOW_MSAA_OPTIONS.find(
                    (samples) => samples === value
                  ),
                })
              }
            />
          </label>
          <Checkbox
            aria-label="Schattenauflösung an der Bodenfläche ausrichten"
            checked={quality.shadowGroundTexelFit}
            disabled={quality.shadowBufferLayout === SHADOW_BUFFER_LAYOUT.TILED}
            onChange={(event) =>
              setState({ ...state, shadowGroundTexelFit: event.target.checked })
            }
          >
            Gleichmäßige Schattenauflösung am Boden
          </Checkbox>
        </div>
        <Typography.Paragraph
          type="secondary"
          style={{
            marginTop: token.marginSM,
            marginBottom: 0,
            fontSize: token.fontSizeSM,
          }}
        >
          Farbpuffer, Samples und MSAA gelten für die Sonnenscheibe im
          Ruhezustand. Mehr Samples reduzieren Abtastungsstufen, verlängern aber
          die Berechnung. Manuelle Werte überschreiben das Qualitätsziel bis zur
          nächsten Preset-Auswahl; MSAA wird auf das Format-/Gerätelimit
          begrenzt.
        </Typography.Paragraph>
        {state.shadowQuality === SHADOW_QUALITY.ULTRA && (
          <Typography.Paragraph
            role="status"
            style={{
              marginTop: token.marginXS,
              marginBottom: 0,
              fontSize: token.fontSizeSM,
              color: token.colorWarningText,
            }}
          >
            Ultra: maximale Terrain- und Sonnenscheiben-Qualität, Gerätemaximum
            für MSAA im Einzelpuffer und große Schattenpuffer innerhalb des
            Speicherbudgets. Kein FPS-Ziel und keine automatische
            Qualitätsreduktion.
          </Typography.Paragraph>
        )}
        {softSun && quality.shadowSunDiscSamples >= 1024 && (
          <Typography.Paragraph
            role="status"
            style={{
              marginTop: token.marginXS,
              marginBottom: 0,
              fontSize: token.fontSizeSM,
              color: token.colorWarningText,
            }}
          >
            Referenzqualität: Die vollständige Sonnenscheiben-Integration kann
            in großen Szenen deutlich länger dauern. Kamera und Gelände behalten
            ihre Qualität; die Auswahl wird nicht automatisch aktiviert.
          </Typography.Paragraph>
        )}
        {softSun &&
          quality.shadowBufferFormat === SHADOW_BUFFER_FORMAT.SDR_8 && (
            <Typography.Paragraph
              role="status"
              style={{
                marginTop: token.marginXS,
                marginBottom: 0,
                fontSize: token.fontSizeSM,
                color: token.colorWarningText,
              }}
            >
              SDR mit 8 Bit begrenzt HDR-Helligkeiten bereits vor dem Tone
              Mapping und kann sichtbare Helligkeitsstufen erzeugen. Nur zum
              Vergleich.
            </Typography.Paragraph>
          )}
        {softSun &&
          quality.shadowBufferFormat === SHADOW_BUFFER_FORMAT.HDR_16 && (
            <Typography.Paragraph
              role="status"
              style={{
                marginTop: token.marginXS,
                marginBottom: 0,
                fontSize: token.fontSizeSM,
                color: token.colorWarningText,
              }}
            >
              Reine 16-Bit-Akkumulation rundet das Ergebnis bei jedem Sample
              erneut. Bei vielen Samples können sich diese Rundungsfehler
              summieren. Der 16/32-Bit-Standard mittelt deshalb mit 32 Bit.
            </Typography.Paragraph>
          )}
      </details>
    </div>
  );
};
