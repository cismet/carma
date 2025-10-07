import { useEffect, useRef } from "react";
import { viewerCesium3DTilesInspectorMixin } from "cesium";

import { useCesiumContext } from "./useCesiumContext";

import { useTilesetDebug } from "./useTilesetDebug";
import { useTweakpaneCtx } from "@carma-commons/debug";
import { type ButtonApi } from "tweakpane";

export const useTilesetsDebug = () => {
  const { withPrimaryTileset, withSecondaryTileset, withViewer } =
    useCesiumContext();

  const buttonRef = useRef<ButtonApi | null>(null);

  useTilesetDebug(withPrimaryTileset, "Primary");

  useTilesetDebug(withSecondaryTileset, "Secondary");

  const { paneCallback, enabled } = useTweakpaneCtx();

  useEffect(() => {
    if (!enabled) return;
    withViewer((viewer) => {
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
  }, [withViewer, paneCallback, enabled]);

  return null;
};
