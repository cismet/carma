import { Cesium3DTileset, CustomShader, ShadowMode, Scene } from "cesium";

import {
  getCustomShader,
  ensureCustomShader,
  createUnlitCustomShader,
} from "@carma-mapping/engines-cesium-shaders";
import { TilesetConfig } from "../types";

/**
 * Performance defaults for 3D mesh tilesets
 *
 * Performance optimizations:
 * - backFaceCulling: true (Cesium default) - cull back faces for better performance
 * - enableCollision: false - NO tileset collision (use terrain collision instead!)
 * - enablePick: false - no CPU picking in WebGL 1 (saves memory)
 * - shadows: DISABLED - no shadow calculations
 *
 * COLLISION STRATEGY:
 * - Tilesets: enableCollision = false (expensive, rough collision)
 * - Terrain: Use terrain collision instead (faster, smoother, more accurate)
 * - For 2020+ styles with tilesets, enable terrain collision for camera
 *
 * NOTE: heightReference and classificationType are NOT set here because:
 * - They should NOT vary per style (global scene-level settings)
 * - Default values (NONE/undefined) are least taxing for performance
 * - heightReference: NONE = no terrain clamping (fastest)
 * - classificationType: undefined = no classification (fastest)
 */
const DEFAULT_MESH_OPTIONS: Cesium3DTileset.ConstructorOptions = {
  preloadWhenHidden: false,
  shadows: ShadowMode.DISABLED,

  // Performance: Disable expensive operations
  enableCollision: false, // Use terrain collision instead (faster + smoother)
  enablePick: false, // No CPU picking (WebGL 1)
  backFaceCulling: true, // Cull back faces (Cesium default)

  maximumScreenSpaceError: 6, // target 100% quality
  // TODO expose this via UI 2 is like 3x the data of 6
  // HQ 4 or higher
  // LQ 16 or worse

  //dynamicScreenSpaceError: true, // only needed for low angle views

  // not sure if this is even doing anything
  foveatedScreenSpaceError: true,
  foveatedConeSize: 0.25,
  foveatedMinimumScreenSpaceErrorRelaxation: 32,

  skipLevelOfDetail: true,
  skipScreenSpaceErrorFactor: 128,
  baseScreenSpaceError: 4096, // minimum quality to load before skipping
  //loadSiblings: true, // with SkipLevelOfDetail not useful for intial load speed
  //immediatelyLoadDesiredLevelOfDetail: true,
};

/**
 * Performance defaults for LOD2 building tilesets
 *
 * Performance optimizations (same as MESH):
 * - backFaceCulling: true (Cesium default) - cull back faces
 * - enableCollision: false - NO tileset collision (use terrain instead)
 * - enablePick: false - no CPU picking (saves memory)
 *
 * COLLISION: Always use terrain collision, not tileset collision
 *
 * NOTE: heightReference and classificationType defaults are used (NONE/undefined)
 * for best performance. These should NOT be style-specific settings.
 */

export const loadTileset = async (
  { url, options, style, renderPreset }: TilesetConfig,
  scene: Scene
) => {
  let appliedShader: CustomShader | undefined;

  // Priority: styleShader > renderPreset customShader > renderPreset unlit fallback
  if (style?.customShader) {
    appliedShader = ensureCustomShader(style.customShader);
  } else if (renderPreset?.customShader) {
    // Handle string preset references (e.g., "UNLIT_ENHANCED_2020")
    if (typeof renderPreset.customShader === "string") {
      appliedShader = getCustomShader(renderPreset.customShader as string);
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

  const constructorOptions: Cesium3DTileset.ConstructorOptions = {
    ...DEFAULT_MESH_OPTIONS,
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
