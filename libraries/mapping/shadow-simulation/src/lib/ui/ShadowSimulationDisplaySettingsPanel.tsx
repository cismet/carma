import { createPortal } from "react-dom";

import { faBug, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Button,
  Checkbox,
  ConfigProvider,
  Divider,
  Select,
  Space,
  theme,
  Typography,
} from "antd";
import type { Map as MaplibreMap } from "maplibre-gl";

import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";

import type {
  ShadowSimulationState,
  ShadowTerrainSourceOption,
} from "../contracts/shadow-simulation";
import { selectShadowQualityPreset } from "../core/create-shadow-simulation-state";
import { resolveShadowQuality, SHADOW_QUALITY } from "../core/shadow-types";
import { ShadowSimulationRenderSettings } from "./ShadowSimulationRenderSettings";
import { ShadowSimulationSurfaceSettings } from "./ShadowSimulationSurfaceSettings";
import { SHADOW_QUALITY_LEVELS } from "./shadow-control-utils";

export const ShadowSimulationDisplaySettingsPanel = ({
  state,
  setState,
  terrainSources,
  map,
}: {
  state: ShadowSimulationState;
  setState: (state: ShadowSimulationState) => void;
  terrainSources?: readonly ShadowTerrainSourceOption[];
  map?: MaplibreMap | null;
}) => {
  const { token } = theme.useToken();
  const quality = resolveShadowQuality(state.shadowQuality);
  const isUltraQuality = quality === SHADOW_QUALITY.ULTRA;
  if (typeof document === "undefined") return null;

  return createPortal(
    <ConfigProvider
      getPopupContainer={(trigger) =>
        (trigger?.closest('[role="dialog"]') as HTMLElement | null) ??
        document.body
      }
    >
      <CarmaResponsiveInfoBox
        role="dialog"
        aria-label="Schattendarstellung"
        dataTestId="shadow-simulation-display-panel"
        useControlLayout={false}
        draggable
        dragGripPlacement="auto"
        dragHandleTitle="Schattendarstellung verschieben"
        width={480}
        heading={
          <div
            className="flex w-full items-center justify-between"
            style={{ gap: token.marginSM, padding: token.paddingSM }}
          >
            <Typography.Text strong style={{ fontSize: token.fontSizeLG }}>
              Schattendarstellung
            </Typography.Text>
            <Button
              type="text"
              size="small"
              icon={<FontAwesomeIcon icon={faXmark} />}
              aria-label="Schattendarstellung schließen"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setState({ ...state, showDisplaySettings: false })}
            />
          </div>
        }
        headingColor={token.colorBgContainer}
        headingStyle={{
          color: token.colorText,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: `${token.borderRadiusLG}px ${token.borderRadiusLG}px 0 0`,
          boxShadow: "none",
        }}
        bodyStyle={{
          maxHeight: "calc(100dvh - 180px)",
          overflowY: "auto",
          padding: token.padding,
          backgroundColor: token.colorBgContainer,
          borderRadius: `0 0 ${token.borderRadiusLG}px ${token.borderRadiusLG}px`,
        }}
        style={{
          position: "fixed",
          top: 100,
          right: 24,
          zIndex: 5000,
          maxWidth: "calc(100vw - 24px)",
          minWidth: 0,
          pointerEvents: "auto",
          fontFamily: token.fontFamily,
          fontSize: token.fontSize,
          color: token.colorText,
          borderRadius: token.borderRadiusLG,
          boxShadow: token.boxShadowSecondary,
        }}
        content={
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Checkbox
              checked={!(state.softSunShadows ?? true)}
              onChange={(event) =>
                setState({ ...state, softSunShadows: !event.target.checked })
              }
              data-test-id="shadow-simulation-point-light"
              aria-label="Punktlichtquelle statt Sonnenscheibe verwenden"
            >
              Punktlichtquelle
            </Checkbox>
            {terrainSources && terrainSources.length > 1 && (
              <div
                className="grid min-w-0 grid-cols-[110px_minmax(0,1fr)] items-center"
                style={{ gap: token.marginSM }}
              >
                <Typography.Text>Höhenmodell</Typography.Text>
                <Select
                  aria-label="Höhenmodell für die Verschattung"
                  title="Höhenmodell für die Verschattung. Die Basiskarte bleibt auf dem Geländemodell (DGM)."
                  value={
                    terrainSources.find(
                      ({ terrain }) => terrain.id === state.terrainSourceId
                    )?.terrain.id ?? terrainSources[0].terrain.id
                  }
                  options={terrainSources.map(({ label, terrain }) => ({
                    label,
                    value: terrain.id,
                  }))}
                  onChange={(terrainSourceId) =>
                    setState({ ...state, terrainSourceId })
                  }
                  style={{ width: "100%", minWidth: 0 }}
                  virtual={false}
                />
              </div>
            )}
            <Space direction="vertical" size="small">
              <Checkbox
                checked={state.showMapStyleContent ?? true}
                onChange={(event) =>
                  setState({
                    ...state,
                    showMapStyleContent: event.target.checked,
                  })
                }
                data-test-id="shadow-simulation-map-style-content"
                aria-label="Basiskarte auf dem Terrain anzeigen"
              >
                Basiskarte
              </Checkbox>
              <Checkbox
                checked={
                  (state.showMapStyleContent ?? true) &&
                  (state.showMapStyleLabels ?? true)
                }
                disabled={!(state.showMapStyleContent ?? true)}
                onChange={(event) =>
                  setState({
                    ...state,
                    showMapStyleLabels: event.target.checked,
                  })
                }
                style={{ marginInlineStart: token.marginLG }}
                data-test-id="shadow-simulation-map-style-labels"
                aria-label="Freigestellte Kartenbeschriftungen über dem Modell anzeigen"
              >
                Beschriftungen
              </Checkbox>
              <Checkbox
                checked={
                  (state.showMapStyleContent ?? true) &&
                  (state.showMapStyleElevationLines ?? false)
                }
                disabled={!(state.showMapStyleContent ?? true)}
                onChange={(event) =>
                  setState({
                    ...state,
                    showMapStyleElevationLines: event.target.checked,
                  })
                }
                style={{ marginInlineStart: token.marginLG }}
                data-test-id="shadow-simulation-map-style-elevation-lines"
              >
                Höhenlinien
              </Checkbox>
              <Checkbox
                checked={
                  (state.showMapStyleContent ?? true) &&
                  (state.showMapStyleElevationLabels ?? false)
                }
                disabled={!(state.showMapStyleContent ?? true)}
                onChange={(event) =>
                  setState({
                    ...state,
                    showMapStyleElevationLabels: event.target.checked,
                  })
                }
                style={{ marginInlineStart: token.marginLG }}
                data-test-id="shadow-simulation-map-style-elevation-labels"
              >
                Höhenbeschriftungen
              </Checkbox>
            </Space>
            <div>
              <Typography.Text
                style={{ display: "block", marginBottom: token.marginXS }}
              >
                Qualitätsziel
              </Typography.Text>
              <Select
                aria-label="Qualitätsziel"
                style={{ width: "100%" }}
                virtual={false}
                data-test-id="shadow-simulation-quality"
                value={quality}
                options={[...SHADOW_QUALITY_LEVELS]}
                onSelect={(value) =>
                  setState(selectShadowQualityPreset(state, value))
                }
              />
              <Typography.Paragraph
                type="secondary"
                style={{
                  marginTop: token.marginXS,
                  marginBottom: 0,
                  fontSize: token.fontSizeSM,
                }}
              >
                Ziel beim Bewegen in 1440p (physische Pixel), abhängig von Gerät
                und Szene. Karte und Beschriftungen bleiben in voller Auflösung.
              </Typography.Paragraph>
              <Checkbox
                aria-label="Adaptive Schattenqualität"
                checked={
                  !isUltraQuality && (state.shadowAdaptiveQuality ?? true)
                }
                disabled={isUltraQuality}
                onChange={(event) =>
                  setState({
                    ...state,
                    shadowAdaptiveQuality: event.target.checked,
                  })
                }
                style={{ marginTop: token.marginSM }}
              >
                Adaptive Schattenqualität
              </Checkbox>
              <Typography.Paragraph
                type="secondary"
                style={{
                  marginTop: token.marginXS,
                  marginBottom: 0,
                  fontSize: token.fontSizeSM,
                }}
              >
                Bei Bewegung werden Update-Takt und Schattenpuffer an das
                FPS-Ziel angepasst. Basiskarte und Beschriftungen bleiben in
                nativen Displaypixeln; die Farbauflösung wird nicht reduziert.
                Ultra verwendet unverändert die gewählte Schattenqualität.
              </Typography.Paragraph>
            </div>
            <ShadowSimulationSurfaceSettings
              state={state}
              setState={setState}
              map={map}
            />
            <ShadowSimulationRenderSettings state={state} setState={setState} />
            <Divider style={{ margin: 0 }} />
            <Button
              type="default"
              icon={<FontAwesomeIcon icon={faBug} />}
              aria-pressed={state.showProjectionDebugView ?? false}
              onClick={() =>
                setState({
                  ...state,
                  showProjectionDebugView: !state.showProjectionDebugView,
                })
              }
              data-test-id="shadow-simulation-projection-debug"
            >
              Debug
            </Button>
          </Space>
        }
      />
    </ConfigProvider>,
    document.body
  );
};
