import { useMemo, useState } from "react";
import { Cesium3DTileset, CustomShader } from "cesium";

import { useTweakpaneCtx } from "@carma-commons/debug";

import { CUSTOM_SHADERS_DEFINITIONS, CustomShaderKeys as k } from "../shaders";
import { useCesiumViewer } from "./useCesiumViewer";

const customShaderKeys = {
  clay: k.CLAY,
  "unlit 2020": k.UNLIT_ENHANCED_2020,
  "unlit 2024": k.UNLIT_ENHANCED_2024,
  unlit: k.UNLIT,
  "unlit fog": k.UNLIT_FOG,
  monochrome: k.MONOCHROME,
  undefined: k.UNDEFINED,
};

const DEFAULT_MESH_SHADER_KEY = k.UNLIT_ENHANCED_2024;

export const useTilesetsTweakpane = (
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
              const def = CUSTOM_SHADERS_DEFINITIONS[customShaderKeys[v]];
              if (def === k.UNDEFINED) {
                tileset.customShader = undefined;
                viewer && viewer.scene.requestRender();
              } else {
                const shader = new CustomShader(CUSTOM_SHADERS_DEFINITIONS[v]);
                tileset.customShader = shader;
                viewer && viewer.scene.requestRender();
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
              viewer && viewer.scene.requestRender();
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
              viewer && viewer.scene.requestRender();
            }
          },
        },
        inputs: [
          { name: "customShaderKey", options: customShaderKeys },
          { name: "enableDebugWireframe" },
          { name: "show", type: "boolean" },
        ],
      }),
      [viewer, name, customShaderKey, enableDebugWireframe, tileset, viewer]
    )
  );
};
