import { useEffect } from "react";

import { useCesiumContext } from "./useCesiumContext";
import { TRANSITION_DELAY } from "../viewerDefaults";
import { TILESET_IDS } from "../constants";
import { useSecondaryStyleTilesetClickHandler } from "./useSecondaryStyleTilesetClickHandler";
import { useTilesetsDebug } from "./useTilesetsDebug";
import { isValidScene } from "../utils/instanceGates";

export const useTilesets = () => {
  const {
    withPrimaryTileset,
    withSecondaryTileset,
    sceneRef,
    isSuspendedRef,
    requestRender,
    tilesetVisibilityRef,
  } = useCesiumContext();

  const showPrimary =
    tilesetVisibilityRef.current.get(TILESET_IDS.PRIMARY) ?? false;
  const showSecondary =
    tilesetVisibilityRef.current.get(TILESET_IDS.SECONDARY) ?? true;

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
  }, [withPrimaryTileset, showPrimary, sceneRef, requestRender]);

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
  }, [withSecondaryTileset, showSecondary, sceneRef, requestRender]);

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

    if (isSuspendedRef.current) {
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
    isSuspendedRef,
    showPrimary,
    showSecondary,
    withPrimaryTileset,
    withSecondaryTileset,
    requestRender,
  ]);
};
