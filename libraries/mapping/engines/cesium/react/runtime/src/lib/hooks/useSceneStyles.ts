import { startTransition, useEffect } from "react";

import { setCesiumBackgroundCssVar } from "../utils/cssVars";
import { setupPrimaryStyle, setupSecondaryStyle } from "../utils/sceneStyles";
import { useCesiumContext } from "./useCesiumContext";
export const useSceneStyles = (enabled = true) => {
  const ctx = useCesiumContext();
  const {
    currentSceneStyle,
    sceneStylePrimary: primaryStyle,
    sceneStyleSecondary: secondaryStyle,
    setShowPrimaryTileset,
    setShowSecondaryTileset,
  } = ctx;

  useEffect(() => {
    // Wait for runtime to be fully ready (including imageryLayers collection)
    if (
      !enabled ||
      !ctx.isValidRuntime() ||
      !ctx.isRuntimeReady ||
      currentSceneStyle === undefined
    )
      return;
    console.debug("currentSceneStyle change", currentSceneStyle);
    if (currentSceneStyle === "primary" && primaryStyle) {
      setupPrimaryStyle(ctx, primaryStyle);
      // Non-urgent React state updates - separate from WebGL work
      startTransition(() => {
        setShowPrimaryTileset(true);
        setShowSecondaryTileset(false);
      });
      setCesiumBackgroundCssVar(primaryStyle.backgroundColor);
    } else if (currentSceneStyle === "secondary" && secondaryStyle) {
      setupSecondaryStyle(ctx, secondaryStyle);
      // Non-urgent React state updates - separate from WebGL work
      startTransition(() => {
        setShowPrimaryTileset(false);
        setShowSecondaryTileset(true);
      });
      setCesiumBackgroundCssVar(secondaryStyle.backgroundColor);
    } else {
      throw new Error(`Unknown style: ${currentSceneStyle}`);
    }
  }, [
    enabled,
    currentSceneStyle,
    primaryStyle,
    secondaryStyle,
    ctx,
    ctx.isRuntimeReady,
    setShowPrimaryTileset,
    setShowSecondaryTileset,
  ]);
};

export default useSceneStyles;
