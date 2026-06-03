import { useEffect } from "react";
import { useSelector } from "react-redux";

import type { Cesium3DTileset, Scene } from "@carma-cesium";

import {
  selectShowPrimaryTileset,
  selectShowSecondaryTileset,
} from "../slices/cesium";
import { guardScene } from "../utils/guardScene";
import { guardTileset } from "../utils/guardTileset";
import { useCesiumContext } from "./useCesiumContext";
import { useSecondaryStyleTilesetClickHandler } from "./useSecondaryStyleTilesetClickHandler";

const waitForVisibleTilesetViewTiles = (
  scene: Scene,
  tileset: Cesium3DTileset,
  setReady: (ready: boolean) => void,
  label: string
): (() => void) => {
  setReady(false);

  let disposed = false;
  let removeAllTilesLoadedListener: (() => void) | undefined;
  let removePostRenderListener: (() => void) | undefined;

  const cleanup = () => {
    removeAllTilesLoadedListener?.();
    removePostRenderListener?.();
    removeAllTilesLoadedListener = undefined;
    removePostRenderListener = undefined;
  };

  const markReady = () => {
    if (disposed) return;
    setReady(true);
    cleanup();
  };
  const checkRenderedView = () => {
    if (disposed || tileset.isDestroyed()) return;
    if (tileset.tilesLoaded) {
      markReady();
    }
  };

  tileset.allTilesLoaded.addEventListener(markReady);
  removeAllTilesLoadedListener = () =>
    tileset.allTilesLoaded.removeEventListener(markReady);
  scene.postRender.addEventListener(checkRenderedView);
  removePostRenderListener = () =>
    scene.postRender.removeEventListener(checkRenderedView);
  scene.requestRender();

  return () => {
    disposed = true;
    cleanup();
    console.debug(`[CESIUM|DEBUG] Cancelled ${label} tileset ready wait`);
  };
};

export const useTilesets = () => {
  const showPrimary = useSelector(selectShowPrimaryTileset);
  const showSecondary = useSelector(selectShowSecondaryTileset);
  const {
    withPrimaryTileset,
    withSecondaryTileset,
    requestRender,
    setPrimaryTilesetReady,
    setSecondaryTilesetReady,
    initialViewApplied,
    primaryTilesetConfigured,
    secondaryTilesetConfigured,
  } = useCesiumContext();

  useEffect(() => {
    let cancelled = false;
    let removeReadyListener: (() => void) | null = null;
    const waitForCurrentView = showPrimary && initialViewApplied;

    if (!primaryTilesetConfigured) {
      setPrimaryTilesetReady(true);
      return;
    }
    setPrimaryTilesetReady(!showPrimary);

    const repeatUntilAdded = () => {
      if (cancelled) return;
      const has = withPrimaryTileset((tileset, viewer) => {
        if (cancelled) return;
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

        removeReadyListener?.();
        removeReadyListener = waitForCurrentView
          ? waitForVisibleTilesetViewTiles(
              viewer.scene,
              tileset,
              setPrimaryTilesetReady,
              "primary"
            )
          : null;
        if (!waitForCurrentView) {
          setPrimaryTilesetReady(!showPrimary);
        }
      });
      if (!has) {
        // not yet available -> retry next frame
        requestAnimationFrame(repeatUntilAdded);
      }
    };
    repeatUntilAdded();
    requestRender();

    return () => {
      cancelled = true;
      removeReadyListener?.();
    };
  }, [
    initialViewApplied,
    primaryTilesetConfigured,
    requestRender,
    setPrimaryTilesetReady,
    showPrimary,
    withPrimaryTileset,
  ]);

  useEffect(() => {
    let cancelled = false;
    let removeReadyListener: (() => void) | null = null;
    const waitForCurrentView = showSecondary && initialViewApplied;

    if (!secondaryTilesetConfigured) {
      setSecondaryTilesetReady(true);
      return;
    }
    setSecondaryTilesetReady(!showSecondary);

    const repeatUntilAdded = () => {
      if (cancelled) return;
      const has = withSecondaryTileset((tileset, viewer) => {
        if (cancelled) return;
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

        removeReadyListener?.();
        removeReadyListener = waitForCurrentView
          ? waitForVisibleTilesetViewTiles(
              viewer.scene,
              tileset,
              setSecondaryTilesetReady,
              "secondary"
            )
          : null;
        if (!waitForCurrentView) {
          setSecondaryTilesetReady(!showSecondary);
        }
      });
      if (!has) {
        requestAnimationFrame(repeatUntilAdded);
      }
    };
    repeatUntilAdded();
    requestRender();

    return () => {
      cancelled = true;
      removeReadyListener?.();
    };
  }, [
    initialViewApplied,
    requestRender,
    secondaryTilesetConfigured,
    setSecondaryTilesetReady,
    showSecondary,
    withSecondaryTileset,
  ]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showSecondary", showSecondary);
    withSecondaryTileset((tileset) => {
      guardTileset(tileset, "useTilesets-secondary").show(showSecondary);
      requestRender();
    });
  }, [requestRender, showSecondary, withSecondaryTileset]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showPrimary", showPrimary);
    withPrimaryTileset((tileset) => {
      guardTileset(tileset, "useTilesets-primary").show(showPrimary);
      requestRender();
    });
  }, [requestRender, showPrimary, withPrimaryTileset]);

  useSecondaryStyleTilesetClickHandler();

  useEffect(() => {
    // Show/hide tilesets based on style selection
    // Parent controls when Cesium is visible, not this hook
    withPrimaryTileset((tileset) =>
      guardTileset(tileset, "useTilesets-primary").show(showPrimary)
    );
    withSecondaryTileset((tileset) =>
      guardTileset(tileset, "useTilesets-secondary").show(showSecondary)
    );
  }, [showPrimary, showSecondary, withPrimaryTileset, withSecondaryTileset]);
};
