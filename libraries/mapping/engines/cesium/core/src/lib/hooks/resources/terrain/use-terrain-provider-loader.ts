import { useEffect, type MutableRefObject } from "react";
import type { CesiumTerrainProvider } from "@carma/cesium";
import { loadCesiumTerrainProvider } from "../../../loaders/terrain";
import type { ProviderConfig } from "../imagery/use-imagery-provider-loader";

export const useTerrainProviderLoader = ({
  providerConfig,
  terrainProviderRef,
}: {
  providerConfig: ProviderConfig | undefined;
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
}) => {
  useEffect(() => {
    if (!providerConfig) return;

    const abortController = new AbortController();
    const { signal } = abortController;

    loadCesiumTerrainProvider(
      terrainProviderRef,
      providerConfig.terrainProvider.url,
      signal
    );

    return () => abortController.abort();
  }, [providerConfig, terrainProviderRef]);
};
