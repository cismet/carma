import { useEffect } from "react";
import { CesiumTerrainProvider } from "cesium";

import { useCesiumContext } from "@carma-mapping/cesium-engine";

// reuse terrain provider instances
const hgkTerrainProviders = {};

export const useHGKCesiumTerrain = (
  selectedSimulation: number,
  isHWS: boolean,
  HGK_KEYS,
  HGK_TERRAIN_PROVIDER_URLS
) => {
  const { terrainProviderRef, viewer } = useCesiumContext();

  useEffect(() => {
    const useHws = isHWS && selectedSimulation !== 2;
    const hqKey = HGK_KEYS[selectedSimulation][useHws ? "hws" : "noHws"];
    /*
    console.info(
      "hqKey changed",
      hqKey,
      selectedSimulation,
      useHws,
      HGK_TERRAIN_PROVIDER_URLS[hqKey]
    );
    */
    if (hqKey) {
      (async () => {
        if (!hgkTerrainProviders[hqKey]) {
          try {
            const url = HGK_TERRAIN_PROVIDER_URLS[hqKey];
            hgkTerrainProviders[hqKey] = await CesiumTerrainProvider.fromUrl(
              url
            );
          } catch (e) {
            console.error(e);
          }
        }

        const provider = hgkTerrainProviders[hqKey];

        terrainProviderRef.current = provider;
        if (viewer && provider) {
          setTimeout(() => {
            // overwrite default terrain provider
            /*
            console.debug(
              "set HGK terrain provider for",
              hqKey,
              isHWS,
              provider
            );
            */
            viewer.scene.terrainProvider = provider;
            viewer.scene.requestRender();
          }, 500);
        }
      })();
    }
  }, [
    isHWS,
    selectedSimulation,
    terrainProviderRef,
    viewer,
    HGK_KEYS,
    HGK_TERRAIN_PROVIDER_URLS,
  ]);
};
