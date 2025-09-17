import { useEffect } from "react";
import { useSelector } from "react-redux";

import {
  selectShowPrimaryTileset,
  selectShowSecondaryTileset,
  selectViewerIsMode2d,
} from "../slices/cesium";

import { TRANSITION_DELAY } from "../viewerDefaults";
import { guardScene } from "../utils/guardScene";
import { guardTileset } from "../utils/guardTileset";

import { useCesiumContext } from "./useCesiumContext";
import { useSecondaryStyleTilesetClickHandler } from "./useSecondaryStyleTilesetClickHandler";

import { useTilesetsDebug } from "./useTilesetsDebug";

export const useTilesets = () => {
  const showPrimary = useSelector(selectShowPrimaryTileset);
  const ctx = useCesiumContext();
  const showSecondary = useSelector(selectShowSecondaryTileset);

  const isMode2d = useSelector(selectViewerIsMode2d);
  useTilesetsDebug();

  useEffect(() => {
    let added = false;
    const repeatUntilAdded = () => {
      if (added) return;
      const has = ctx.withPrimaryTileset((tileset, viewer) => {
        const contains = guardScene(
          viewer.scene,
          "useTilesets-primary"
        ).primitives.contains(tileset);
        if (!contains) {
          guardScene(viewer.scene, "useTilesets-primary").primitives.add(
            tileset
          );
        }
        guardTileset(tileset, "useTilesets-primary").show(showPrimary);
        added = true;
      });
      if (!has) {
        // not yet available -> retry next frame
        requestAnimationFrame(repeatUntilAdded);
      }
    };
    repeatUntilAdded();
    ctx.requestRender();
  }, [ctx, showPrimary]);

  useEffect(() => {
    let added = false;
    const repeatUntilAdded = () => {
      if (added) return;
      const has = ctx.withSecondaryTileset((tileset, viewer) => {
        const contains = guardScene(
          viewer.scene,
          "useTilesets-secondary"
        ).primitives.contains(tileset);
        if (!contains) {
          guardScene(viewer.scene, "useTilesets-secondary").primitives.add(
            tileset
          );
        }
        guardTileset(tileset, "useTilesets-secondary").show(showSecondary);
        added = true;
      });
      if (!has) {
        requestAnimationFrame(repeatUntilAdded);
      }
    };
    repeatUntilAdded();
    ctx.requestRender();
  }, [ctx, showSecondary]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showSecondary", showSecondary);
    ctx.withSecondaryTileset((tileset) => {
      guardTileset(tileset, "useTilesets-secondary").show(showSecondary);
      ctx.requestRender();
    });
  }, [ctx, showSecondary]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showPrimary", showPrimary);
    ctx.withPrimaryTileset((tileset) => {
      guardTileset(tileset, "useTilesets-primary").show(showPrimary);
      ctx.requestRender();
    });
  }, [ctx, showPrimary]);

  useSecondaryStyleTilesetClickHandler();

  useEffect(() => {
    const hideTilesets = () => {
      // render offscreen with ultra low res to reduce memory usage
      console.debug("HOOK: hide tilesets in 2d");
      ctx.withPrimaryTileset((tileset) =>
        guardTileset(tileset, "useTilesets-primary").show(false)
      );
      ctx.withSecondaryTileset((tileset) =>
        guardTileset(tileset, "useTilesets-secondary").show(false)
      );
    };

    if (isMode2d) {
      setTimeout(() => {
        hideTilesets();
      }, TRANSITION_DELAY);
      return;
    } else {
      ctx.withPrimaryTileset((tileset) =>
        guardTileset(tileset, "useTilesets-primary").show(showPrimary)
      );
      ctx.withSecondaryTileset((tileset) =>
        guardTileset(tileset, "useTilesets-secondary").show(showSecondary)
      );
      return;
    }
    console.debug("HOOK: no viewer");
  }, [ctx, isMode2d, showPrimary, showSecondary]);
};
