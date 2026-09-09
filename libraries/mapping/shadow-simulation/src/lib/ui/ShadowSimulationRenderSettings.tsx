import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Checkbox, Select, theme, Tooltip } from "antd";

import type { ShadowSimulationState } from "../contracts/shadow-simulation";
import {
  resolveShadowQuality,
  resolveShadowRenderQuality,
  SHADOW_BUFFER_FORMAT,
  SHADOW_BUFFER_LAYOUT,
  SHADOW_SUN_DISC_SAMPLES,
  SHADOW_MSAA_OPTIONS,
  SHADOW_MSAA_MAX,
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
      <div className="grid min-w-0 grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
        <span>
          Schattenpuffer{" "}
          <Tooltip
            trigger={["hover", "focus", "click"]}
            title="Gekachelt: Schattenauflösung am Boden je Korridor, begrenzter Cache und wiederverwendbare Sonnenscheiben-Schatten. Einzelpuffer: gemeinsamer Schattenbereich. Gekachelt ist Geometrie-MSAA aus; bei flacher Sonne können Terrain-Artefakte auftreten."
          >
            <Button
              type="text"
              size="small"
              aria-label="Info zum Schattenpuffer"
              icon={<FontAwesomeIcon icon={faCircleInfo} />}
            />
          </Tooltip>
        </span>
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
      </div>
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
          Erweiterte Schattenqualität{" "}
          <Tooltip
            trigger={["hover", "focus", "click"]}
            title={
              <div>
                <p>
                  Gilt für die Sonnenscheibe im Ruhezustand. Manuelle Werte
                  überschreiben das Preset bis zur nächsten Preset-Auswahl. MSAA
                  gilt nur im Einzelpuffer und wird auf Format und Gerät
                  begrenzt.
                </p>
                <p>
                  Mehr Samples reduzieren Abtastungsstufen, verlängern aber die
                  Integration; 1024 und mehr sind Referenzqualität.
                </p>
                <p>
                  Gekachelt wird skalare Sichtbarkeit statt RGB-Farbe
                  gespeichert. 8 Bit können Stufen erzeugen; reine
                  16-Bit-Mittelung rundet bei jedem Sample erneut. 16/32 Bit
                  verwendet 32 Bit für die Mittelung.
                </p>
              </div>
            }
          >
            <Button
              type="text"
              size="small"
              aria-label="Info zur erweiterten Schattenqualität"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              icon={<FontAwesomeIcon icon={faCircleInfo} />}
            />
          </Tooltip>
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
              value={
                tiled ||
                quality.shadowBufferFormat === SHADOW_BUFFER_FORMAT.HDR_32
                  ? 0
                  : state.shadowMsaaSamples ?? ""
              }
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
            checked={tiled || quality.shadowGroundTexelFit}
            disabled={quality.shadowBufferLayout === SHADOW_BUFFER_LAYOUT.TILED}
            onChange={(event) =>
              setState({ ...state, shadowGroundTexelFit: event.target.checked })
            }
          >
            Gleichmäßige Schattenauflösung am Boden
          </Checkbox>
        </div>
      </details>
    </div>
  );
};
