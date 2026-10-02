import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
} from "@carma-mapping/engines/maplibre";

const STARTUP_FALLBACK_MS = 12000;
const isObliqueSource = (id: string) =>
  id.startsWith("carma-oblique-") || /oblique.*footprint/i.test(id);

/** Give basemap networking and its first painted frame priority over catalog ingest. */
export const useBasemapStarted = (
  map: MaplibreMap | null,
  enabled: boolean,
  requireScene = false
): boolean => {
  const [readyMap, setReadyMap] = useState<MaplibreMap | null>(null);
  useEffect(() => {
    if (!map || !enabled) {
      setReadyMap(null);
      return;
    }
    setReadyMap(null);
    let disposed = false;
    let started = false;
    let rendered = false;
    let fallbackElapsed = false;
    let firstFrame: number | undefined;
    let paintedFrame: number | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};
    const styleSources = () => {
      try {
        return map.getStyle()?.sources ?? {};
      } catch {
        return {};
      }
    };
    const usableStyle = () => {
      try {
        return map.isStyleLoaded() || Array.isArray(map.getStyle()?.layers);
      } catch {
        return false;
      }
    };
    const sceneStarted = () =>
      getSharedThreeSceneRuntimes(map).some(
        (runtime) => runtime.providesTerrain || runtime.receivesMapStyleTexture
      );
    const warmSourceStarted = () => {
      if (!usableStyle()) return false;
      return Object.entries(styleSources()).some(([id, source]) => {
        if (
          isObliqueSource(id) ||
          !["raster", "raster-dem", "vector", "image"].includes(source.type)
        )
          return false;
        try {
          const liveSource = map.getSource(id) as
            | { loaded?: () => boolean }
            | undefined;
          return (
            !!liveSource &&
            (map.isStyleLoaded() ||
              liveSource.loaded?.() === true ||
              map.isSourceLoaded(id))
          );
        } catch {
          return false;
        }
      });
    };
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      if (firstFrame !== undefined) cancelAnimationFrame(firstFrame);
      if (paintedFrame !== undefined) cancelAnimationFrame(paintedFrame);
      if (timeout !== undefined) clearTimeout(timeout);
      map.off("sourcedataloading", onSourceLoading);
      map.off("styledata", onStyleData);
      map.off("load", onStyleData);
      map.off("render", onRender);
      map.off("error", onBasemapError);
      unsubscribe();
    };
    const releaseAfterPaint = () => {
      if (
        !started ||
        !rendered ||
        disposed ||
        firstFrame !== undefined ||
        paintedFrame !== undefined
      )
        return;
      // A second RAF leaves a paint opportunity between the map render and
      // catalog parsing, including renders triggered outside an animation tick.
      firstFrame = requestAnimationFrame(() => {
        firstFrame = undefined;
        if (disposed) return;
        paintedFrame = requestAnimationFrame(() => {
          paintedFrame = undefined;
          if (disposed) return;
          cleanup();
          setReadyMap(map);
        });
      });
    };
    const markStarted = () => {
      if (disposed || started) return;
      started = true;
      map.triggerRepaint();
    };
    const onSourceLoading = (event: { sourceId?: string }) => {
      if (requireScene) return;
      const id = event.sourceId;
      if (!id || isObliqueSource(id)) return;
      const source = styleSources()[id];
      if (
        source &&
        ["raster", "raster-dem", "vector", "image"].includes(source.type)
      )
        markStarted();
    };
    const onSceneContent = () => {
      if (sceneStarted()) markStarted();
    };
    const onStyleData = () => {
      if (
        sceneStarted() ||
        (!requireScene && warmSourceStarted()) ||
        (fallbackElapsed && usableStyle())
      )
        markStarted();
    };
    const onBasemapError = (event: {
      error: { message: string };
      sourceId?: string;
    }) => {
      const id = event.sourceId;
      if (!id || isObliqueSource(id)) return;
      const source = styleSources()[id];
      if (
        source &&
        ["raster", "raster-dem", "vector", "image"].includes(source.type) &&
        usableStyle()
      )
        markStarted();
    };
    const onRender = () => {
      if (!started) return;
      rendered = true;
      releaseAfterPaint();
    };
    unsubscribe = subscribeSharedThreeSceneContent(map, onSceneContent);
    map.on("sourcedataloading", onSourceLoading);
    map.on("styledata", onStyleData);
    map.on("load", onStyleData);
    map.on("render", onRender);
    map.on("error", onBasemapError);
    timeout = setTimeout(() => {
      timeout = undefined;
      fallbackElapsed = true;
      if (usableStyle()) markStarted();
    }, STARTUP_FALLBACK_MS);
    onStyleData();
    return cleanup;
  }, [map, enabled, requireScene]);
  return enabled && map !== null && readyMap === map;
};
