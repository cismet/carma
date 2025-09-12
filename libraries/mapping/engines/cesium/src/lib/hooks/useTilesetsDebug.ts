import { useEffect, useRef } from "react";
import { viewerCesium3DTilesInspectorMixin } from "cesium";

import { useCesiumContext } from "./useCesiumContext";
import { useCesiumViewer } from "./useCesiumViewer";

import { useTilesetDebug } from "./useTilesetDebug";
import { useTweakpaneCtx } from "@carma-commons/debug";
import { type ButtonApi } from "tweakpane";

export const useTilesetsDebug = () => {
  const ctx = useCesiumContext();

  const buttonRef = useRef<ButtonApi | null>(null);

  useTilesetDebug(ctx.withPrimaryTileset, "Primary");

  useTilesetDebug(ctx.withSecondaryTileset, "Secondary");

  const { paneCallback } = useTweakpaneCtx();

  useEffect(() => {
    ctx.withViewer((viewer) => {
      if (paneCallback && !buttonRef.current) {
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
    });
    // Dependencies include all variables that might affect the condition
  }, [ctx, paneCallback]);

  return null; // This hook does not return any UI components
};
