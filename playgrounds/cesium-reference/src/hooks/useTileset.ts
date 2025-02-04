import { useEffect, useRef, useState } from "react";
import { Viewer, Cesium3DTileset } from "cesium";

const defaultConstructorOptions: Cesium3DTileset.ConstructorOptions = {
  show: true,
};

function useTileset(
  url: string,
  viewerRef: React.MutableRefObject<Viewer | null>,
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
    const loadTileset = async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const tileset = await Cesium3DTileset.fromUrl(url, {
          ...defaultConstructorOptions,
          ...constructorOptions,
        });
        if (signal?.aborted) return;
        tilesetRef.current = tileset;
        setTilesetReady(true);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err.message || "Failed to load tileset");
      } finally {
        setLoading(false);
      }
    };

    abortControllerRef.current = new AbortController();
    loadTileset(abortControllerRef.current.signal);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [url, constructorOptions]);

  useEffect(() => {
    if (viewerRef.current && tilesetRef.current && tilesetReady) {
      viewerRef.current.scene.primitives.add(tilesetRef.current);
    }
  }, [viewerRef, tilesetReady]);

  return { tilesetRef, error, loading, tilesetReady };
}

export default useTileset;
