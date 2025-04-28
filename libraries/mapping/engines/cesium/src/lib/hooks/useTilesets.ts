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

import { useBaseTilesetsTweakpane } from "./useBaseTilesetsTweakpane";

export const useTilesets = () => {
  const showPrimary = useSelector(selectShowPrimaryTileset);
  const { tilesetsRefs, viewerRef } = useCesiumContext();
  let tilesetPrimary = tilesetsRefs.primaryRef.current;
  let tilesetSecondary = tilesetsRefs.secondaryRef.current;
  const showSecondary = useSelector(selectShowSecondaryTileset);

  const isMode2d = useSelector(selectViewerIsMode2d);
  useBaseTilesetsTweakpane();

  useEffect(() => {
    if (
      viewerRef.current &&
      !viewerRef.current.isDestroyed() &&
      tilesetPrimary
    ) {
      const viewer = viewerRef.current;
      viewer.scene.primitives.add(tilesetPrimary);
      console.debug(
        "[CESIUM|DEBUG] Adding primary tileset to viewer",
        viewer.scene.primitives.length
      );
    }
  }, [tilesetPrimary, viewerRef]);

  useEffect(() => {
    if (
      viewerRef.current &&
      !viewerRef.current.isDestroyed() &&
      tilesetSecondary
    ) {
      const viewer = viewerRef.current;
      viewer.scene.primitives.add(tilesetSecondary);
      console.debug(
        "[CESIUM|DEBUG] Adding secondary tileset to viewer",
        viewer.scene.primitives.length
      );
    }
  }, [tilesetSecondary, viewerRef]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showSecondary", showSecondary);
    if (tilesetSecondary) {
      tilesetSecondary.show = showSecondary;
      console.debug(
        "[CESIUM|DEBUG] show secondary tileset, setting preloadWhenHidden to true"
      );
      // after initial load, set this to true to enable fast switching to small LOD2 tilesets
      // tilesetSecondary.preloadWhenHidden = true;
    }
  }, [showSecondary, tilesetSecondary]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showPrimary", showPrimary);
    if (tilesetPrimary) {
      tilesetPrimary.show = showPrimary;
    }
  }, [showPrimary, tilesetPrimary]);

  useSecondaryStyleTilesetClickHandler();

  useEffect(() => {
    const hideTilesets = () => {
      // render offscreen with ultra low res to reduce memory usage
      console.debug("HOOK: hide tilesets in 2d");
      if (tilesetPrimary) {
        tilesetPrimary.show = false;
      }
      if (tilesetSecondary) {
        tilesetSecondary.show = false;
      }
    };
    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      if (isMode2d) {
        setTimeout(() => {
          hideTilesets();
        }, TRANSITION_DELAY);
      } else {
        if (tilesetPrimary) {
          tilesetPrimary.show = showPrimary;
        }
        if (tilesetSecondary) {
          tilesetSecondary.show = showSecondary;
        }
      }
    } else {
      console.debug("HOOK: no viewer");
      hideTilesets();
    }
  }, [
    isMode2d,
    viewerRef,
    showPrimary,
    showSecondary,
    tilesetPrimary,
    tilesetSecondary,
  ]);
};
