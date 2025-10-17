import { CesiumTerrainProvider, Scene } from "cesium";

import { tryWithValidScene } from "@carma-mapping/engines/cesium/api";

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
