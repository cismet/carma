import {
  CesiumTerrainProvider,
  Scene,
  tryWithValidScene,
  rectangleFromConfig,
} from "@carma/cesium";
import type { MutableRefObject } from "react";

export const loadCesiumTerrainProvider = async (
  ref: MutableRefObject<CesiumTerrainProvider | null>,
  url: string,
  signal: AbortSignal,
  rectangle?: any
) => {
  try {
    const provider = await CesiumTerrainProvider.fromUrl(url);

    // Apply rectangle bounds if provided
    if (rectangle) {
      const bounds = rectangleFromConfig(rectangle);
      if (bounds) {
        // Note: CesiumTerrainProvider doesn't directly support rectangle bounds
        // The rectangle bounds are typically handled at the scene level
        // or through the globe's cartographicLimitRectangle
        console.debug(
          "[CESIUM|TERRAIN] Rectangle bounds provided but not directly supported by CesiumTerrainProvider:",
          bounds
        );
      }
    }

    if (!signal.aborted) {
      ref.current = provider;
    }
  } catch (error) {
    if (!signal.aborted) {
      console.error("Failed to load terrain provider", url, error);
    }
  }
};

export const waitAndSetTerrainProvider = (
  scene: Scene,
  terrainProvider: CesiumTerrainProvider,
  { label, onReady }: { label?: string; onReady?: () => void }
) => {
  let isTerrainProviderSet = false;
  const startTime = performance.now();

  const checkTerrainProvider = () => {
    if (isTerrainProviderSet) return;
    console.debug(
      "[STYLES|TERRAIN|CESIUM] terrainProvider ready after",
      performance.now() - startTime,
      "ms",
      label
    );
    tryWithValidScene(scene, () => {
      scene.terrainProvider = terrainProvider;
      isTerrainProviderSet = true;
      onReady?.();
    });
    if (!isTerrainProviderSet) {
      requestAnimationFrame(checkTerrainProvider);
    }
  };

  tryWithValidScene(scene, () => {
    scene.terrainProvider = terrainProvider;
    isTerrainProviderSet = true;
    onReady?.();
    console.debug("[STYLES|TERRAIN|CESIUM] terrainProvider already set");
  });
  if (!isTerrainProviderSet) {
    checkTerrainProvider();
  }
};
