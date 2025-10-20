import { CesiumTerrainProvider, Scene } from "@carma/cesium";
import { tryWithValidScene } from "@carma/cesium";
import type { MutableRefObject } from "react";

export const loadCesiumTerrainProvider = async (
  ref: MutableRefObject<CesiumTerrainProvider | null>,
  url: string,
  signal: AbortSignal
) => {
  try {
    const provider = await CesiumTerrainProvider.fromUrl(url);
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
