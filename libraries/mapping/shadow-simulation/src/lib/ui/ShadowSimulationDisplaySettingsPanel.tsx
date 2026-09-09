import { useState } from "react";
import { createPortal } from "react-dom";

import {
  faBug,
  faCircleInfo,
  faChartLine,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  Button,
  Checkbox,
  ConfigProvider,
  Collapse,
  Divider,
  Select,
  Space,
  theme,
  Tooltip,
  Typography,
} from "antd";
import type { Map as MaplibreMap } from "maplibre-gl";

import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";

import {
  SHADOW_CONTROL_STYLE,
  type ShadowSimulationState,
  type ShadowTerrainSourceOption,
} from "../contracts/shadow-simulation";
import { selectShadowQualityPreset } from "../core/create-shadow-simulation-state";
import {
  resolveShadowQuality,
  resolveShadowRenderQuality,
  SHADOW_BUFFER_LAYOUT,
  SHADOW_QUALITY,
} from "../core/shadow-types";
import { ShadowSimulationRenderSettings } from "./ShadowSimulationRenderSettings";
import { ShadowSimulationSurfaceSettings } from "./ShadowSimulationSurfaceSettings";
import { useShadowMeshPresence } from "./use-shadow-mesh-presence";
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
  const meshLoaded = useShadowMeshPresence(map);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["quality"]);
  const quality = resolveShadowQuality(state.shadowQuality);
  const isUltraQuality = quality === SHADOW_QUALITY.ULTRA;
  const isTiled =
    resolveShadowRenderQuality(state, quality).shadowBufferLayout ===
    SHADOW_BUFFER_LAYOUT.TILED;
  if (typeof document === "undefined") return null;

  return createPortal(
    <ConfigProvider
      componentSize="small"
      theme={{
        components: {
          Collapse: { headerPadding: "4px 8px", contentPadding: "8px" },
        },
      }}
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
        width={440}
        heading={
          <div
            className="flex w-full items-center justify-between"
            style={{ gap: token.marginXS, padding: 0 }}
          >
            <Typography.Text strong style={{ fontSize: token.fontSize }}>
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
          padding: 0,
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
          <Space direction="vertical" size={6} style={{ width: "100%" }}>
            <Collapse
              size="middle"
              bordered={false}
              style={{ borderRadius: 0, background: token.colorBgContainer }}
              activeKey={expandedGroups.filter((key) =>
                meshLoaded ? key !== "terrain" : key !== "mesh"
              )}
              onChange={(keys) =>
                setExpandedGroups(typeof keys === "string" ? [keys] : keys)
              }
              items={[
                {
                  key: "quality",
                  label: "Schattenqualität",
                  children: (
                    <Space
                      direction="vertical"
                      size={6}
                      style={{ width: "100%" }}
                    >
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <Checkbox
                          checked={!(state.softSunShadows ?? true)}
                          onChange={(event) =>
                            setState({
                              ...state,
                              softSunShadows: !event.target.checked,
                            })
                          }
                          data-test-id="shadow-simulation-point-light"
                          aria-label="Punktlichtquelle statt Sonnenscheibe verwenden"
                        >
                          Punktlichtquelle
                        </Checkbox>
                        <div className="flex items-center gap-1">
                          <Checkbox
                            aria-label="Adaptive Schattenqualität"
                            checked={
                              !isUltraQuality &&
                              !isTiled &&
                              (state.shadowAdaptiveQuality ?? true)
                            }
                            disabled={isUltraQuality || isTiled}
                            onChange={(event) =>
                              setState({
                                ...state,
                                shadowAdaptiveQuality: event.target.checked,
                              })
                            }
                          >
                            Adaptiv
                          </Checkbox>
                          <Tooltip
                            trigger={["hover", "focus", "click"]}
                            title="Nur Einzelpuffer: passt bei Bewegung Update-Takt und Schattenpuffer an das FPS-Ziel an, nicht die Farbauflösung der Karte. Gekachelt werden bestehende Korridorschatten weiterverwendet und die Sonnenscheiben-Integration pausiert; keine adaptive Pufferreduktion beim Drag. Bei Ultra ist die automatische Reduktion aus."
                          >
                            <Button
                              type="text"
                              size="small"
                              aria-label="Info zur adaptiven Schattenqualität"
                              icon={<FontAwesomeIcon icon={faCircleInfo} />}
                            />
                          </Tooltip>
                        </div>
                      </div>
                      <div className="grid min-w-0 grid-cols-[minmax(0,130px)_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
                        <Typography.Text style={{ whiteSpace: "nowrap" }}>
                          Qualitätsziel{" "}
                          <Tooltip
                            trigger={["hover", "focus", "click"]}
                            title="Ziel beim Bewegen in 1440p, abhängig von Gerät und Szene; keine FPS-Garantie. Karte und Beschriftungen bleiben in nativen Displaypixeln. Ultra deaktiviert die automatische Reduktion; manuelle Schattenwerte bleiben möglich."
                          >
                            <Button
                              type="text"
                              size="small"
                              aria-label="Info zum Qualitätsziel"
                              icon={<FontAwesomeIcon icon={faCircleInfo} />}
                            />
                          </Tooltip>
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
                      </div>

                      <ShadowSimulationRenderSettings
                        state={state}
                        setState={setState}
                      />
                    </Space>
                  ),
                },
                {
                  key: "map-style",
                  label: "Kartenstil",
                  children: (
                    <div className="grid grid-cols-2 items-center gap-x-2 gap-y-1">
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
                        data-test-id="shadow-simulation-map-style-elevation-labels"
                      >
                        Höhenbeschriftungen
                      </Checkbox>
                    </div>
                  ),
                },
                {
                  key: "mesh",
                  label: meshLoaded ? "Mesh" : "Mesh (kein Mesh aktiv)",
                  collapsible: meshLoaded ? undefined : "disabled",
                  children: meshLoaded ? (
                    <ShadowSimulationSurfaceSettings
                      state={state}
                      setState={setState}
                      meshLoaded
                    />
                  ) : null,
                },
                {
                  key: "terrain",
                  label: meshLoaded
                    ? "Terrain (durch Mesh ersetzt)"
                    : "Terrain",
                  collapsible: meshLoaded ? "disabled" : undefined,
                  children: !meshLoaded ? (
                    <Space
                      direction="vertical"
                      size={6}
                      style={{ width: "100%" }}
                    >
                      {terrainSources && terrainSources.length > 1 && (
                        <div
                          className="grid min-w-0 grid-cols-[110px_minmax(0,1fr)] items-center"
                          style={{ gap: token.marginSM }}
                        >
                          <Typography.Text>
                            Höhenmodell{" "}
                            <Tooltip
                              trigger={["hover", "focus", "click"]}
                              title="Rasterquelle für Terrain-Schatten ohne flächendeckendes 3D-Mesh. Bei Mesh 2024 liefert das Mesh die Oberfläche. Die MapLibre-Basiskarte bleibt auf DGM."
                            >
                              <Button
                                type="text"
                                size="small"
                                aria-label="Info zum Höhenmodell"
                                icon={<FontAwesomeIcon icon={faCircleInfo} />}
                              />
                            </Tooltip>
                          </Typography.Text>
                          <Select
                            aria-label="Höhenmodell für die Verschattung"
                            value={
                              terrainSources.find(
                                ({ terrain }) =>
                                  terrain.id === state.terrainSourceId
                              )?.terrain.id ?? terrainSources[0].terrain.id
                            }
                            options={terrainSources.map(
                              ({ label, terrain }) => ({
                                label,
                                value: terrain.id,
                              })
                            )}
                            onChange={(terrainSourceId) =>
                              setState({ ...state, terrainSourceId })
                            }
                            style={{ width: "100%", minWidth: 0 }}
                            virtual={false}
                          />
                        </div>
                      )}

                      <ShadowSimulationSurfaceSettings
                        state={state}
                        setState={setState}
                        meshLoaded={false}
                      />
                    </Space>
                  ) : null,
                },
                {
                  key: "atmosphere",
                  label: "Atmosphäre",
                  children: (
                    <div
                      className="flex flex-wrap gap-x-4 gap-y-2"
                      style={{ marginTop: token.marginSM }}
                    >
                      <Checkbox
                        checked={state.useTransmittanceLut ?? true}
                        onChange={(event) =>
                          setState({
                            ...state,
                            useTransmittanceLut: event.target.checked,
                          })
                        }
                      >
                        Transmittanz-LUT
                      </Checkbox>
                      <Checkbox
                        checked={state.useSkyIrradianceLut ?? true}
                        onChange={(event) =>
                          setState({
                            ...state,
                            useSkyIrradianceLut: event.target.checked,
                          })
                        }
                      >
                        Sky-Irradianz-LUT
                      </Checkbox>
                    </div>
                  ),
                },
              ]}
            />
            <Divider style={{ margin: 0 }} />
            <Space style={{ padding: token.paddingXS }}>
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
              <Button
                icon={<FontAwesomeIcon icon={faChartLine} />}
                aria-pressed={state.controlStyle === SHADOW_CONTROL_STYLE.CURVE}
                onClick={() =>
                  setState({
                    ...state,
                    controlStyle:
                      state.controlStyle === SHADOW_CONTROL_STYLE.CURVE
                        ? SHADOW_CONTROL_STYLE.QUICK
                        : SHADOW_CONTROL_STYLE.CURVE,
                  })
                }
              >
                Kurvenansicht
              </Button>
            </Space>
          </Space>
        }
      />
    </ConfigProvider>,
    document.body
  );
};
