import { useEffect } from "react";
import { useSelector } from "react-redux";

import {
  selectShowPrimaryTileset,
  selectShowSecondaryTileset,
  selectViewerIsMode2d,
} from "../slices/cesium";

import { TRANSITION_DELAY } from "../viewerDefaults";

import { useCesiumContext } from "./useCesiumContext";
import { useSecondaryStyleTilesetClickHandler } from "./useSecondaryStyleTilesetClickHandler";

import { useTilesetsDebug } from "./useTilesetsDebug";
import { isValidScene } from "../utils/instanceGates";
import { sceneRequestRender } from "../utils/sceneRequestRender";

export const useTilesets = () => {
  const showPrimary = useSelector(selectShowPrimaryTileset);
  const { withPrimaryTileset, withSecondaryTileset, sceneRef, requestRender } =
    useCesiumContext();
  const showSecondary = useSelector(selectShowSecondaryTileset);

  const isMode2d = useSelector(selectViewerIsMode2d);
  useTilesetsDebug();

  useEffect(() => {
    let added = false;
    const repeatUntilAdded = () => {
      if (added) return;
      withPrimaryTileset((tileset) => {
        const scene = sceneRef.current;
        if (!isValidScene(scene)) return;
        const contains = scene.primitives.contains(tileset);
        if (!contains) {
          scene.primitives.add(tileset);
        }
        tileset.show = showPrimary;
        added = true;
      });
      if (!added) {
        // not yet available -> retry next frame
        requestAnimationFrame(repeatUntilAdded);
      }
    };
    repeatUntilAdded();
    requestRender();
  }, [withPrimaryTileset, showPrimary, requestRender, sceneRef]);

  useEffect(() => {
    let added = false;
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    const repeatUntilAdded = () => {
      if (added) return;
      withSecondaryTileset((tileset) => {
        const contains = scene.primitives.contains(tileset);
        if (!contains) {
          scene.primitives.add(tileset);
        }
        tileset.show = showSecondary;
        added = true;
      });
      if (!added) {
        requestAnimationFrame(repeatUntilAdded);
      }
    };
    repeatUntilAdded();
    requestRender();
  }, [withSecondaryTileset, showSecondary, requestRender, sceneRef]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showSecondary", showSecondary);
    withSecondaryTileset((tileset) => {
      tileset.show = showSecondary;
      requestRender();
    });
  }, [withSecondaryTileset, showSecondary, requestRender]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showPrimary", showPrimary);
    withPrimaryTileset((tileset) => {
      tileset.show = showPrimary;
      requestRender();
    });
  }, [withPrimaryTileset, showPrimary, requestRender]);

  useSecondaryStyleTilesetClickHandler();

  useEffect(() => {
    const hideTilesets = () => {
      // render offscreen with ultra low res to reduce memory usage
      console.debug("HOOK: hide tilesets in 2d");
      withPrimaryTileset((tileset) => {
        tileset.show = false;
      });
      withSecondaryTileset((tileset) => {
        tileset.show = false;
      });
    };

    if (isMode2d) {
      setTimeout(() => {
        hideTilesets();
      }, TRANSITION_DELAY);
      return;
    } else {
      withPrimaryTileset((tileset) => {
        tileset.show = showPrimary;
      });
      withSecondaryTileset((tileset) => {
        tileset.show = showSecondary;
      });
      return;
    }
  }, [
    isMode2d,
    showPrimary,
    showSecondary,
    withPrimaryTileset,
    withSecondaryTileset,
  ]);
};
