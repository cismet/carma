import { Cesium3DTileset, CustomShader, Scene } from "@carma/cesium";
import { CityModelTypes, TilesetContentTypes } from "@carma/types";

import {
  getCustomShader,
  ensureCustomShader,
  createUnlitCustomShader,
} from "@carma-mapping/engines/cesium/shaders";
import { TilesetConfig } from "../../types";
import { MESH_PERFORMANCE_PRESET, LOD2_PERFORMANCE_PRESET } from "./presets";

export const loadTileset = async (
  { url, options, style, renderPreset, content }: TilesetConfig,
  scene: Scene
) => {
  let appliedShader: CustomShader | undefined;

  if (style?.customShader) {
    appliedShader = ensureCustomShader(style.customShader);
  } else if (renderPreset?.customShader) {
    if (typeof renderPreset.customShader === "string") {
      appliedShader = getCustomShader(renderPreset.customShader);
    } else {
      appliedShader = ensureCustomShader(renderPreset.customShader);
    }
  } else if (renderPreset?.unlit) {
    appliedShader = createUnlitCustomShader({
      gammaCorrection: [1.0, 1.0, 1.0],
      blackPoint: [0.0, 0.0, 0.0],
      whitePoint: [1.0, 1.0, 1.0],
      saturation: 1.0,
    });
  }

  const performancePreset =
    content?.cityModelType === CityModelTypes.LOD2 ||
    content?.contentType === TilesetContentTypes.OBJECT
      ? LOD2_PERFORMANCE_PRESET
      : MESH_PERFORMANCE_PRESET;

  const constructorOptions: Cesium3DTileset.ConstructorOptions = {
    ...performancePreset,
    ...options,
    ...style,
    scene,
  };

  const tileset = await Cesium3DTileset.fromUrl(url, constructorOptions);

  if (appliedShader) {
    tileset.customShader = appliedShader;
  }

  return tileset;
};
