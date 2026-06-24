import { useMemo, useRef } from "react";
import { useSelector } from "react-redux";

import type { LibreLayer } from "@carma-mapping/core";

import { geoportalBackgroundToLibreLayers } from "../../components/GeoportalMap/geoportalBackgroundToLibreLayers";
import { geoportalLayersToLibreLayers } from "../../components/GeoportalMap/geoportalLayersToLibreLayers";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";

export const useLibreLayers = (): LibreLayer[] => {
  const geoportalLayers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);

  const computedLibreLayers = useMemo(
    () => [
      ...geoportalBackgroundToLibreLayers(backgroundLayer),
      ...geoportalLayersToLibreLayers(geoportalLayers),
    ],
    [backgroundLayer, geoportalLayers]
  );

  const libreLayersRef = useRef(computedLibreLayers);
  return useMemo(() => {
    if (
      JSON.stringify(libreLayersRef.current) ===
      JSON.stringify(computedLibreLayers)
    ) {
      return libreLayersRef.current;
    }
    libreLayersRef.current = computedLibreLayers;
    return computedLibreLayers;
  }, [computedLibreLayers]);
};

export default useLibreLayers;
