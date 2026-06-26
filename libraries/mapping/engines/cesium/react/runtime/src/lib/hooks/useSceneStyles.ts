import { useEffect, useRef } from "react";

import { setCesiumBackgroundCssVar } from "../utils/cssVars";
import { diffCesiumSceneStyles, setupSceneStyle } from "../utils/sceneStyles";
import {
  DEFAULT_SURFACE_PROVIDER_ID,
  DEFAULT_TERRAIN_PROVIDER_ID,
} from "../utils/cesiumProviders";
import { useCesiumContext } from "./useCesiumContext";
import type { CesiumSceneResourceInitSignatures, SceneStyle } from "../index.d";

const getStyleTerrainProviderIds = (style?: SceneStyle) => [
  style?.members?.terrainProviderId ?? DEFAULT_TERRAIN_PROVIDER_ID,
  style?.members?.surfaceProviderId ?? DEFAULT_SURFACE_PROVIDER_ID,
];

const getResourceInitSignatures = (
  ctx: ReturnType<typeof useCesiumContext>,
  previousStyle?: SceneStyle,
  nextStyle?: SceneStyle
): CesiumSceneResourceInitSignatures => {
  const terrainProviderIds = new Set([
    ...getStyleTerrainProviderIds(previousStyle),
    ...getStyleTerrainProviderIds(nextStyle),
  ]);

  return {
    terrainProviders: Object.fromEntries(
      [...terrainProviderIds].map((id) => [
        id,
        ctx.getTerrainProviderInitSignatureById(id),
      ])
    ),
    tilesets: Object.fromEntries(
      ctx.tilesetIds.map((id) => [id, ctx.getTilesetInitSignatureById(id)])
    ),
  };
};

export const useSceneStyles = (enabled = true) => {
  const ctx = useCesiumContext();
  const { currentSceneStyle, currentSceneStyleConfig } = ctx;
  const previousSceneStyleConfigRef = useRef<SceneStyle | undefined>(undefined);

  useEffect(() => {
    if (
      !enabled ||
      !ctx.isValidRuntime() ||
      !ctx.isRuntimeReady ||
      currentSceneStyle === undefined
    )
      return;
    if (currentSceneStyleConfig) {
      const previousSceneStyleConfig = previousSceneStyleConfigRef.current;
      const diff = diffCesiumSceneStyles(
        previousSceneStyleConfig,
        currentSceneStyleConfig,
        getResourceInitSignatures(
          ctx,
          previousSceneStyleConfig,
          currentSceneStyleConfig
        )
      );
      console.debug("currentSceneStyle change", currentSceneStyle, diff);
      setupSceneStyle(ctx, currentSceneStyleConfig, previousSceneStyleConfig);
      previousSceneStyleConfigRef.current = currentSceneStyleConfig;
      setCesiumBackgroundCssVar(
        currentSceneStyleConfig.live?.scene?.backgroundColor
      );
    } else {
      // Unknown id: warn and bail instead of throwing so it never crashes the scene.
      console.warn(
        `[STYLES|CESIUM] Unknown scene style id, skipping: ${currentSceneStyle}`
      );
    }
  }, [
    enabled,
    currentSceneStyle,
    currentSceneStyleConfig,
    ctx,
    ctx.isRuntimeReady,
  ]);
};

export default useSceneStyles;
