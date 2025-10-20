import { useEffect, type MutableRefObject } from "react";
import type { ImageryLayer } from "@carma/cesium";
import { loadCesiumImageryLayer } from "../../../loaders/imagery";

export interface ProviderConfig {
  surfaceProvider?: {
    url: string;
  };
  terrainProvider: {
    url: string;
  };
  imageryProvider?: Parameters<typeof loadCesiumImageryLayer>[1];
}

export const useImageryProviderLoader = ({
  providerConfig,
  imageryLayerRef,
}: {
  providerConfig: ProviderConfig | undefined;
  imageryLayerRef: MutableRefObject<ImageryLayer | null>;
}) => {
  useEffect(() => {
    if (providerConfig?.imageryProvider) {
      const abortController = new AbortController();
      const { signal } = abortController;

      loadCesiumImageryLayer(
        imageryLayerRef,
        providerConfig.imageryProvider,
        signal
      );

      return () => {
        abortController.abort();
      };
    } else {
      console.info("[CESIUM|CONTEXT] No imagery provider configured");
    }
  }, [providerConfig, imageryLayerRef]);
};
