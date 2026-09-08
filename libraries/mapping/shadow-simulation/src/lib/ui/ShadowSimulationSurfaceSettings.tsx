import { useCallback, useSyncExternalStore } from "react";

import {
  Checkbox,
  ColorPicker,
  InputNumber,
  Segmented,
  Slider,
  Space,
  Tooltip,
  Typography,
} from "antd";
import type { Map as MaplibreMap } from "maplibre-gl";

import { clamp } from "@carma-commons/math";
import {
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
} from "@carma-mapping/engines/maplibre";

import type { ShadowSimulationState } from "../contracts/shadow-simulation";
import {
  DEFAULT_MESH_ERROR_TARGET_PIXELS,
  DEFAULT_SHADOW_BUILDING_COLOR,
  DEFAULT_SHADOW_BUILDING_COLOR_MIX,
  DEFAULT_SHADOW_BUILDING_TEXTURE_SATURATION,
  DEFAULT_SHADOW_SURFACE_COLOR,
  type MeshErrorTargetPixels,
} from "../core/shadow-types";
import { MESH_ERROR_TARGETS } from "./shadow-control-utils";

export const ShadowSimulationSurfaceSettings = ({
  state,
  setState,
  map,
}: {
  state: ShadowSimulationState;
  setState: (state: ShadowSimulationState) => void;
  map?: MaplibreMap | null;
}) => {
  const subscribe = useCallback(
    (listener: () => void) =>
      map ? subscribeSharedThreeSceneContent(map, listener) : () => {},
    [map]
  );
  const getMeshPresence = useCallback(
    () =>
      Boolean(
        map &&
          getSharedThreeSceneRuntimes(map).some(
            (runtime) =>
              runtime.providesTerrain === true &&
              typeof runtime.setErrorTarget === "function"
          )
      ),
    [map]
  );
  const meshLoaded = useSyncExternalStore(
    subscribe,
    getMeshPresence,
    getMeshPresence
  );
  const settings = {
    meshErrorTarget: state.meshErrorTarget ?? DEFAULT_MESH_ERROR_TARGET_PIXELS,
    terrainColor: state.terrainColor ?? DEFAULT_SHADOW_SURFACE_COLOR,
    buildingsFullOpacity: state.buildingsFullOpacity ?? true,
    buildingColorMix: clamp(
      state.buildingColorMix ?? DEFAULT_SHADOW_BUILDING_COLOR_MIX,
      0,
      1
    ),
    meshTextureSaturation: clamp(
      state.meshTextureSaturation ?? DEFAULT_SHADOW_BUILDING_TEXTURE_SATURATION,
      0,
      1
    ),
    buildingColor: state.buildingColor ?? DEFAULT_SHADOW_BUILDING_COLOR,
  };
  const onChange = (patch: Partial<ShadowSimulationState>) =>
    setState({ ...state, ...patch });
  return (
    <Space direction="vertical" size="small" style={{ width: "100%" }}>
      {meshLoaded && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Typography.Text strong type="secondary">
            Mesh-LOD
          </Typography.Text>
          <Segmented
            data-test-id="shadow-simulation-mesh-quality"
            value={settings.meshErrorTarget}
            options={[...MESH_ERROR_TARGETS]}
            onChange={(value) =>
              onChange({ meshErrorTarget: value as MeshErrorTargetPixels })
            }
          />
          <Tooltip title="Residenter Mesh-Cache in GiB. Leer: Geräte-Standard. Große Budgets können RAM und GPU-Speicher überlasten; der Browser meldet nicht jeden Engpass rechtzeitig.">
            <InputNumber
              aria-label="Mesh-Cache in GiB"
              placeholder="Auto"
              suffix="GiB"
              min={0.125}
              max={24}
              step={1}
              value={
                state.meshCacheBudgetBytes === undefined
                  ? null
                  : state.meshCacheBudgetBytes / 1024 ** 3
              }
              onChange={(value) =>
                onChange({
                  meshCacheBudgetBytes:
                    typeof value === "number" && Number.isFinite(value)
                      ? value * 1024 ** 3
                      : undefined,
                })
              }
            />
          </Tooltip>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Typography.Text strong type="secondary">
            Terrain
          </Typography.Text>
          <Tooltip title="Terrainfarbe wirkt vor allem auf untexturiertes Terrain beziehungsweise dessen Albedo.">
            <ColorPicker
              value={settings.terrainColor}
              showText={(color) => color.toHexString().toUpperCase()}
              onChangeComplete={(color) =>
                onChange({ terrainColor: color.toHexString() })
              }
            />
          </Tooltip>
        </div>
        {meshLoaded && (
          <>
            <Checkbox
              checked={settings.buildingsFullOpacity}
              onChange={(event) =>
                onChange({ buildingsFullOpacity: event.target.checked })
              }
            >
              Gebäude volle Deckkraft
            </Checkbox>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Typography.Text strong type="secondary">
                Gebäude-Mesh
              </Typography.Text>
              <Typography.Text type="secondary">Textur</Typography.Text>
              {/* AntD 5.19 forwards rc-slider handle ARIA props but omits their types. */}
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={settings.buildingColorMix}
                onChange={(value) => onChange({ buildingColorMix: value })}
                tooltip={{ formatter: null }}
                className="!m-0 w-24"
                {...{
                  ariaLabelForHandle: "Mischung aus Meshtextur und Farbe",
                }}
              />
              <Typography.Text type="secondary">Farbe</Typography.Text>
              <Typography.Text
                type="secondary"
                className="w-8 text-right tabular-nums"
              >
                {Math.round(settings.buildingColorMix * 100)}%
              </Typography.Text>
            </div>
            <Tooltip title="Schwarz-/Weißpunkt und Gamma wie im Cesium-Stil für Mesh 2024. Farbkorrektur vor der Beleuchtung; keine Entfernung eingebrannter Schatten.">
              <Checkbox
                checked={state.meshTextureColorCorrection ?? true}
                onChange={(event) =>
                  onChange({ meshTextureColorCorrection: event.target.checked })
                }
                data-test-id="shadow-mesh-color-correction"
              >
                Farbkorrektur (Mesh 2024)
              </Checkbox>
            </Tooltip>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Typography.Text type="secondary">Sättigung</Typography.Text>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={settings.meshTextureSaturation}
                onChange={(value) => onChange({ meshTextureSaturation: value })}
                tooltip={{ formatter: null }}
                className="!m-0 w-24"
                {...{ ariaLabelForHandle: "Sättigung der Meshtextur" }}
              />
              <Typography.Text
                type="secondary"
                className="w-8 text-right tabular-nums"
              >
                {Math.round(settings.meshTextureSaturation * 100)}%
              </Typography.Text>
              <ColorPicker
                value={settings.buildingColor}
                showText={(color) => color.toHexString().toUpperCase()}
                onChangeComplete={(color) =>
                  onChange({ buildingColor: color.toHexString() })
                }
              />
            </div>
          </>
        )}
      </div>
    </Space>
  );
};
