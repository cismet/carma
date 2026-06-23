import { useEffect } from "react";

import { guardScene } from "../utils/guardScene";
import { guardTileset } from "../utils/guardTileset";
import { useCesiumContext } from "./useCesiumContext";
import { useSecondaryStyleTilesetClickHandler } from "./useSecondaryStyleTilesetClickHandler";
export const useTilesets = () => {
  const ctx = useCesiumContext();
  const { showPrimaryTileset: showPrimary, showSecondaryTileset: showSecondary } = ctx;

  useEffect(() => {
    let added = false;
    const repeatUntilAdded = () => {
      if (added) return;
      const has = ctx.withPrimaryTileset((tileset, runtime) => {
        const contains = guardScene(
          runtime.scene,
          "useTilesets-primary"
        ).primitives.contains(tileset);
        if (!contains) {
          guardScene(runtime.scene, "useTilesets-primary").primitives.add(
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
      const has = ctx.withSecondaryTileset((tileset, runtime) => {
        const contains = guardScene(
          runtime.scene,
          "useTilesets-secondary"
        ).primitives.contains(tileset);
        if (!contains) {
          guardScene(runtime.scene, "useTilesets-secondary").primitives.add(
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
