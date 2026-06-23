import { useEffect } from "react";

import { useCesiumContext } from "./useCesiumContext";
import { useSecondaryStyleTilesetClickHandler } from "./useSecondaryStyleTilesetClickHandler";

// withPrimaryTileset/withSecondaryTileset already validate runtime + tileset
// synchronously, so the callback args (scene, tileset) are live — no inner
// guardScene/guardTileset re-check needed.
export const useTilesets = () => {
  const ctx = useCesiumContext();
  const {
    showPrimaryTileset: showPrimary,
    showSecondaryTileset: showSecondary,
  } = ctx;

  // Add primary tileset to the scene once it becomes available.
  useEffect(() => {
    let added = false;
    const repeatUntilAdded = () => {
      if (added) return;
      const has = ctx.withPrimaryTileset((tileset, runtime) => {
        if (!runtime.scene.primitives.contains(tileset)) {
          runtime.scene.primitives.add(tileset);
        }
        tileset.show = showPrimary;
        added = true;
        return true;
      });
      if (!has) {
        // not yet available -> retry next frame
        requestAnimationFrame(repeatUntilAdded);
      }
    };
    repeatUntilAdded();
    ctx.requestRender();
  }, [ctx, showPrimary]);

  // Add secondary tileset to the scene once it becomes available.
  useEffect(() => {
    let added = false;
    const repeatUntilAdded = () => {
      if (added) return;
      const has = ctx.withSecondaryTileset((tileset, runtime) => {
        if (!runtime.scene.primitives.contains(tileset)) {
          runtime.scene.primitives.add(tileset);
        }
        tileset.show = showSecondary;
        added = true;
        return true;
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
      tileset.show = showSecondary;
      ctx.requestRender();
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
    // Show/hide tilesets based on style selection.
    ctx.withPrimaryTileset((tileset) => {
      tileset.show = showPrimary;
    });
    ctx.withSecondaryTileset((tileset) => {
      tileset.show = showSecondary;
    });
  }, [ctx, showPrimary, showSecondary]);
};
