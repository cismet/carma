import { useEffect, useRef } from "react";
import { viewerCesium3DTilesInspectorMixin } from "cesium";

import { useCesiumContext } from "./useCesiumContext";
import { useCesiumViewer } from "./useCesiumViewer";

import { useTilesetsTweakpane } from "./useTilesetTweakpane";
import { useTweakpaneCtx } from "@carma-commons/debug";
import { type ButtonApi } from "tweakpane";

export const useBaseTilesetsTweakpane = () => {
  const { tilesetsRefs } = useCesiumContext();
  const viewer = useCesiumViewer();
  const tilesetPrimary = tilesetsRefs.primaryRef.current;
  const tilesetSecondary = tilesetsRefs.secondaryRef.current;

  const buttonRef = useRef<ButtonApi | null>(null);

  useTilesetsTweakpane(tilesetPrimary, "Primary");
  useTilesetsTweakpane(tilesetSecondary, "Secondary");

  const { paneCallback } = useTweakpaneCtx();

  useEffect(() => {
    if (paneCallback && viewer && !buttonRef.current) {
      paneCallback((pane) => {
        buttonRef.current = pane.addButton({
          title: "Add Tile Inspector Mixin",
        });
        buttonRef.current.on("click", () => {
          viewer.extend(viewerCesium3DTilesInspectorMixin);
          buttonRef.current?.dispose();
        });
      });
    }
    // Dependencies include all variables that might affect the condition
  }, [paneCallback, viewer]);

  return null; // This hook does not return any UI components
};
