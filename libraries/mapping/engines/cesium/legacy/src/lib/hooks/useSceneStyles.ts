import { useEffect } from "react";

import { setupPrimaryStyle, setupSecondaryStyle } from "../utils/sceneStyles";
import { setCesiumBackgroundCssVar } from "../utils/cssVars";

import { useCesiumContext } from "./useCesiumContext";
import type { SceneStyles } from "../index.d";

/**
 * Hook to apply scene styles (background color, globe color) based on current style.
 * @param currentSceneStyle - "primary" or "secondary"
 * @param sceneStyles - Style configurations for primary and secondary
 * @param enabled - Whether to apply styles (default: true)
 */
export const useSceneStyles = (
  currentSceneStyle: keyof SceneStyles | undefined,
  sceneStyles?: SceneStyles,
  enabled: boolean = true
) => {
  const ctx = useCesiumContext();

  const primaryStyle = sceneStyles?.primary;
  const secondaryStyle = sceneStyles?.secondary;

  useEffect(() => {
    // Wait for viewer to be fully ready (including imageryLayers collection)
    if (
      !enabled ||
      !ctx.isValidViewer() ||
      !ctx.isViewerReady ||
      currentSceneStyle === undefined
    )
      return;
    console.debug("currentSceneStyle change", currentSceneStyle);
    if (currentSceneStyle === "primary" && primaryStyle) {
      setupPrimaryStyle(ctx, primaryStyle);
      setCesiumBackgroundCssVar(primaryStyle.backgroundColor);
    } else if (currentSceneStyle === "secondary" && secondaryStyle) {
      setupSecondaryStyle(ctx, secondaryStyle);
      setCesiumBackgroundCssVar(secondaryStyle.backgroundColor);
    } else {
      console.warn(`Unknown or unconfigured style: ${currentSceneStyle}`);
    }
  }, [
    enabled,
    currentSceneStyle,
    primaryStyle,
    secondaryStyle,
    ctx,
    ctx.isViewerReady,
  ]);
};

export default useSceneStyles;
