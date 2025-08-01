import { useEffect, useRef } from "react";
import { viewerCesium3DTilesInspectorMixin } from "cesium";
import { type ButtonApi } from "tweakpane";

import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { useTilesetsTweakpane } from "./useTilesetsTweakpane";
import { useTweakpaneCtx } from "./useTweakpaneContext";

export const useBaseTilesetsTweakpane = () => {
  const { tilesetsRefs, viewerRef } = useCesiumContext();
  const viewer = viewerRef.current;
  const tilesetPrimary = tilesetsRefs.primaryRef.current;
  const tilesetSecondary = tilesetsRefs.secondaryRef.current;

  const buttonRef = useRef<ButtonApi | null>(null);

  useTilesetsTweakpane(tilesetPrimary, viewer, "Primary");
  useTilesetsTweakpane(tilesetSecondary, viewer, "Secondary");

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
  }, [paneCallback, viewer]);

  return null;
};
