import { CUSTOM_SHADERS_DEFINITIONS } from "../shaders";
import { useMemo, useState } from "react";
import { Cesium3DTileset, CustomShader } from "cesium";
import { cesiumSafeRequestRender } from "../utils/cesiumHelpers";

import { useTweakpaneCtx } from "@carma-commons/debug";
import { useCesiumViewer } from "./useCesiumViewer";

const DEFAULT_MESH_SHADER_KEY = "UNLIT_ENHANCED_2024";

const shaderOptions = Object.keys(CUSTOM_SHADERS_DEFINITIONS).reduce(
  (acc: Record<string, string>, key: string) => {
    acc[key] = key;
    return acc;
  },
  {}
);

export const useTilesetDebug = (
  tileset: Cesium3DTileset | null,
  name = "unlabeled"
) => {
  const [customShaderKey, setCustomShaderKey] = useState(
    DEFAULT_MESH_SHADER_KEY
  );
  const viewer = useCesiumViewer();

  const [enableDebugWireframe, setEnableDebugWireframe] = useState(false);

  return useTweakpaneCtx(
    useMemo(
      () => ({
        folder: { title: `Tileset ${name}` },
        params: {
          get customShaderKey() {
            return customShaderKey;
          },
          set customShaderKey(v) {
            setCustomShaderKey(v);
            if (tileset) {
              const shaderDef = CUSTOM_SHADERS_DEFINITIONS[v];
              if (v === "UNDEFINED") {
                tileset.customShader = undefined;
                viewer && cesiumSafeRequestRender(viewer);
              } else {
                const shader = new CustomShader(shaderDef);
                tileset.customShader = shader;
                viewer && cesiumSafeRequestRender(viewer);
              }
            }
          },
          get enableDebugWireframe() {
            return enableDebugWireframe;
          },
          set enableDebugWireframe(v: boolean) {
            if (v !== enableDebugWireframe && tileset) {
              setEnableDebugWireframe(v);
              tileset.debugWireframe = v;
              viewer && cesiumSafeRequestRender(viewer);
            }
          },
          get show() {
            if (tileset) {
              return tileset.show;
            } else {
              return false;
            }
          },
          set show(v: boolean) {
            if (tileset && v !== tileset.show) {
              tileset.show = v;
              viewer && cesiumSafeRequestRender(viewer);
            }
          },
        },
        inputs: [
          {
            name: "customShaderKey",
            options: shaderOptions,
          },
          { name: "enableDebugWireframe" },
          { name: "show", type: "boolean" },
        ],
      }),
      [viewer, name, customShaderKey, enableDebugWireframe, tileset]
    )
  );
};
