import { useEffect, useRef, useState } from "react";
import { Viewer, Cesium3DTileset } from "cesium";

const defaultConstructorOptions: Cesium3DTileset.ConstructorOptions = {
  show: true,
};

function useTileset(
  url: string,
  viewer: Viewer | null,
  constructorOptions?: Cesium3DTileset.ConstructorOptions
) {
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [tilesetReady, setTilesetReady] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // keep this for identifying users that don't memoize constructorOptions
    console.debug("useTileset", url, constructorOptions);

    // Clean up previous tileset if it exists
    if (tilesetRef.current && !tilesetRef.current.isDestroyed()) {
      console.debug("[useTileset] Destroying previous tileset");
      tilesetRef.current.destroy();
      tilesetRef.current = null;
    }

    const loadTileset = async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        setError(null);
        setTilesetReady(false);

        const tileset = await Cesium3DTileset.fromUrl(url, {
          ...defaultConstructorOptions,
          ...constructorOptions,
        });

        if (signal?.aborted) {
          // Clean up the tileset if the request was aborted
          console.debug("[useTileset] Request aborted, destroying tileset");
          if (!tileset.isDestroyed()) {
            tileset.destroy();
          }
          return;
        }

        tilesetRef.current = tileset;
        setTilesetReady(true);
      } catch (err) {
        if (signal?.aborted) return;
        console.error("[useTileset] Failed to load tileset:", err);
        setError(err.message || "Failed to load tileset");
      } finally {
        setLoading(false);
      }
    };

    abortControllerRef.current = new AbortController();
    loadTileset(abortControllerRef.current.signal);

    return () => {
      console.debug("[useTileset] Aborting requests");
      abortControllerRef.current?.abort();
    };
  }, [url, constructorOptions]);

  useEffect(() => {
    if (viewer && tilesetRef.current && tilesetReady) {
      // Add additional null checks for HMR robustness
      try {
        if (viewer.scene && !viewer.isDestroyed() && viewer.scene.primitives) {
          viewer.scene.primitives.add(tilesetRef.current);
          console.debug("[useTileset] Added tileset to scene");
        } else {
          console.warn(
            "[useTileset] Scene or primitives not available, skipping tileset add"
          );
        }
      } catch (error) {
        console.error("[useTileset] Error adding tileset to scene:", error);
      }
    }

    // Cleanup function to remove tileset from scene and destroy it
    return () => {
      if (viewer && tilesetRef.current && !viewer.isDestroyed()) {
        try {
          if (viewer.scene && viewer.scene.primitives) {
            viewer.scene.primitives.remove(tilesetRef.current);
            console.debug("[useTileset] Removed tileset from scene");
          }

          // Destroy the tileset to free GPU memory
          if (!tilesetRef.current.isDestroyed()) {
            tilesetRef.current.destroy();
            console.debug("[useTileset] Destroyed tileset");
          }
        } catch (error) {
          console.error("[useTileset] Error during tileset cleanup:", error);
        } finally {
          tilesetRef.current = null;
        }
      }
    };
  }, [viewer, tilesetReady]);

  return { tilesetRef, error, loading, tilesetReady };
}

export default useTileset;
