import { useEffect, useMemo, useRef, useState } from "react";
import { Viewer, Cesium3DTileset } from "cesium";

function useTileset(
  url: string,
  viewerRef: React.MutableRefObject<Viewer | null>,
  show = true,
  constructorOptions?: Cesium3DTileset.ConstructorOptions
) {
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [tilesetReady, setTilesetReady] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const constructorOptionsMemoized = useMemo(
    () => constructorOptions,
    [constructorOptions]
  );

  useEffect(() => {
    const loadTileset = async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const tileset = await Cesium3DTileset.fromUrl(
          url,
          constructorOptionsMemoized
        );
        if (signal?.aborted) return;
        tilesetRef.current = tileset;
        setTilesetReady(true);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err.message || "Failed to load tileset");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    };

    abortControllerRef.current = new AbortController();
    loadTileset(abortControllerRef.current.signal);
  }, [url, constructorOptionsMemoized]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (viewerRef.current && tilesetRef.current && tilesetReady) {
      viewerRef.current.scene.primitives.add(tilesetRef.current);
    }
  }, [viewerRef, tilesetReady]);

  useEffect(() => {
    if (tilesetRef.current && tilesetReady) {
      tilesetRef.current.show = show;
    }
  }, [tilesetReady, show]);

  return { tilesetRef, error, loading, tilesetReady };
}

export default useTileset;
