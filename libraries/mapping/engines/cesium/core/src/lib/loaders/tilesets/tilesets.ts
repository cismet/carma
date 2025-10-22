import { Cesium3DTileset, CustomShader, Scene } from "@carma/cesium";
import type { Cesium3DTilesetConstructorOptionsPrimitive } from "@carma/cesium";
import { CityModelTypes, TilesetContentTypes } from "@carma/types";

import {
  getCustomShader,
  ensureCustomShader,
  createUnlitCustomShader,
} from "@carma-mapping/engines/cesium/shaders";
import { TilesetConfig } from "@carma/cesium/types";
import { MESH_PERFORMANCE_PRESET, LOD2_PERFORMANCE_PRESET } from "./presets";

export const loadTileset = async (
  { url, options, style, renderPreset, content }: TilesetConfig,
  scene: Scene // Used for context, not passed to fromUrl
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

  const constructorOptions: Cesium3DTilesetConstructorOptionsPrimitive = {
    ...performancePreset,
    ...options,
    ...style,
  };

  // Note: scene is not passed to fromUrl, but is used by Cesium internally
  // when the tileset is added to the scene

  const tileset = await Cesium3DTileset.fromUrl(url, constructorOptions);
  tileset.show = true;

  if (appliedShader) {
    tileset.customShader = appliedShader;
  }

  return tileset;
};
