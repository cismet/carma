import { useEffect } from "react";
import { useSelector } from "react-redux";

import {
  selectShowPrimaryTileset,
  selectShowSecondaryTileset,
  selectViewerIsMode2d,
} from "../slices/cesium";

import { useCesiumContext } from "./useCesiumContext";
import { useSecondaryStyleTilesetClickHandler } from "./useSecondaryStyleTilesetClickHandler";

import { TRANSITION_DELAY } from "../CustomViewer";

import { useTilesetsDebug } from "./useTilesetsDebug";

export const useTilesets = () => {
  const showPrimary = useSelector(selectShowPrimaryTileset);
  const ctx = useCesiumContext();
  const showSecondary = useSelector(selectShowSecondaryTileset);

  const isMode2d = useSelector(selectViewerIsMode2d);
  useTilesetsDebug();

  useEffect(() => {
    ctx.withPrimaryTileset((tileset, viewer) => {
      if (tileset) {
        viewer.scene.primitives.add(tileset);
        console.debug(
          "[CESIUM|DEBUG] Adding primary tileset to viewer",
          viewer.scene.primitives.length
        );
      }
    });
  }, [ctx]);

  useEffect(() => {
    ctx.withSecondaryTileset((tileset, viewer) => {
      if (tileset) {
        viewer.scene.primitives.add(tileset);
        console.debug(
          "[CESIUM|DEBUG] Adding secondary tileset to viewer",
          viewer.scene.primitives.length
        );
      }
    });
  }, [ctx]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showSecondary", showSecondary);
    ctx.withSecondaryTileset((tileset) => {
      if (tileset) {
        tileset.show = showSecondary;
        console.debug(
          "[CESIUM|DEBUG] show secondary tileset, setting preloadWhenHidden to true"
        );
        // after initial load, set this to true to enable fast switching to small LOD2 tilesets
        // tilesetSecondary.preloadWhenHidden = true;
      }
    });
  }, [ctx, showSecondary]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showPrimary", showPrimary);
    ctx.withPrimaryTileset((tileset) => (tileset.show = showPrimary));
  }, [ctx, showPrimary]);

  useSecondaryStyleTilesetClickHandler();

  useEffect(() => {
    const hideTilesets = () => {
      // render offscreen with ultra low res to reduce memory usage
      console.debug("HOOK: hide tilesets in 2d");
      ctx.withPrimaryTileset((tileset) => (tileset.show = false));
      ctx.withSecondaryTileset((tileset) => (tileset.show = false));
    };

    if (isMode2d) {
      setTimeout(() => {
        hideTilesets();
      }, TRANSITION_DELAY);
      return;
    } else {
      ctx.withPrimaryTileset((tileset) => (tileset.show = showPrimary));
      ctx.withSecondaryTileset((tileset) => (tileset.show = showSecondary));
      return;
    }
    console.debug("HOOK: no viewer");
  }, [ctx, isMode2d, showPrimary, showSecondary]);
};
