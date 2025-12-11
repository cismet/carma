import { useEffect } from "react";

import { guardScene } from "../utils/guardScene";
import { guardTileset } from "../utils/guardTileset";

import { useCesiumContext } from "./useCesiumContext";
import { useSecondaryStyleTilesetClickHandler } from "./useSecondaryStyleTilesetClickHandler";

/**
 * Hook to manage tileset visibility in the scene.
 * @param showPrimary - Whether to show the primary tileset (default: true)
 * @param showSecondary - Whether to show the secondary tileset (default: false)
 */
export const useTilesets = (
  showPrimary: boolean = true,
  showSecondary: boolean = false
) => {
  const ctx = useCesiumContext();

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
    // Show/hide tilesets based on style selection
    // Parent controls when Cesium is visible, not this hook
    ctx.withPrimaryTileset((tileset) =>
      guardTileset(tileset, "useTilesets-primary").show(showPrimary)
    );
    ctx.withSecondaryTileset((tileset) =>
      guardTileset(tileset, "useTilesets-secondary").show(showSecondary)
    );
  }, [ctx, showPrimary, showSecondary]);
};
