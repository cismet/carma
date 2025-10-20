import { useEffect, type MutableRefObject } from "react";
import type { CesiumTerrainProvider } from "@carma/cesium";
import { loadCesiumTerrainProvider } from "../../../loaders/terrain";
import type { ProviderConfig } from "../imagery/use-imagery-provider-loader";

export const useSurfaceProviderLoader = ({
  providerConfig,
  surfaceProviderRef,
}: {
  providerConfig: ProviderConfig | undefined;
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
}) => {
  useEffect(() => {
    if (providerConfig?.surfaceProvider) {
      const abortController = new AbortController();
      const { signal } = abortController;

      loadCesiumTerrainProvider(
        surfaceProviderRef,
        providerConfig.surfaceProvider.url,
        signal
      );

      return () => abortController.abort();
    }
  }, [providerConfig, surfaceProviderRef]);
};
