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
    let added = false;
    const tryAdd = () => {
      if (added) return;
      const has = ctx.withPrimaryTileset((tileset, viewer) => {
        // avoid duplicates
        let alreadyAdded = false;
        for (let i = 0; i < viewer.scene.primitives.length; i++) {
          if (viewer.scene.primitives.get(i) === tileset) {
            alreadyAdded = true;
            break;
          }
        }
        if (!alreadyAdded) {
          viewer.scene.primitives.add(tileset);
          console.debug(
            "[CESIUM|DEBUG] Adding primary tileset to viewer",
            viewer.scene.primitives.length
          );
          ctx.requestRender();
        }
        // ensure correct initial visibility according to current style
        tileset.show = showPrimary;
        ctx.requestRender();
        added = true;
      });
      if (!has) {
        // not yet available -> retry next frame
        requestAnimationFrame(tryAdd);
      }
    };
    tryAdd();
  }, [ctx, showPrimary]);

  useEffect(() => {
    let added = false;
    const tryAdd = () => {
      if (added) return;
      const has = ctx.withSecondaryTileset((tileset, viewer) => {
        // avoid duplicates
        let alreadyAdded = false;
        for (let i = 0; i < viewer.scene.primitives.length; i++) {
          if (viewer.scene.primitives.get(i) === tileset) {
            alreadyAdded = true;
            break;
          }
        }
        if (!alreadyAdded) {
          viewer.scene.primitives.add(tileset);
          console.debug(
            "[CESIUM|DEBUG] Adding secondary tileset to viewer",
            viewer.scene.primitives.length
          );
          ctx.requestRender();
        }
        // ensure correct initial visibility according to current style
        tileset.show = showSecondary;
        ctx.requestRender();
        added = true;
      });
      if (!has) {
        requestAnimationFrame(tryAdd);
      }
    };
    tryAdd();
  }, [ctx, showSecondary]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showSecondary", showSecondary);
    ctx.withSecondaryTileset((tileset) => {
      if (tileset) {
        tileset.show = showSecondary;
        console.debug(
          "[CESIUM|DEBUG] show secondary tileset, setting preloadWhenHidden to true"
        );
        ctx.requestRender();
      }
    });
  }, [ctx, showSecondary]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showPrimary", showPrimary);
    ctx.withPrimaryTileset((tileset) => {
      tileset.show = showPrimary;
      ctx.requestRender();
    });
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
