import { useContext, useEffect, useState } from "react";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useLibreContext } from "@carma-mapping/contexts";
import { getHashParams } from "@carma-commons/utils";

export const useCurrentMapZoom = (): number | undefined => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { map: libreMap } = useLibreContext();
  const leafletMap = routedMapRef?.leafletMap?.leafletElement;

  const readZoom = () => {
    if (libreMap) {
      return Math.floor(libreMap.getZoom() + 1);
    }
    if (leafletMap) {
      return Math.floor(leafletMap.getZoom());
    }
    const hashZoom = getHashParams().zoom;
    return hashZoom === undefined ? undefined : Math.floor(Number(hashZoom));
  };

  const [zoom, setZoom] = useState<number | undefined>(readZoom);

  useEffect(() => {
    const update = () => setZoom(readZoom());
    update();

    if (libreMap) {
      libreMap.on("zoom", update);
      return () => {
        libreMap.off("zoom", update);
      };
    }
    if (leafletMap) {
      leafletMap.on("zoomend", update);
      return () => {
        leafletMap.off("zoomend", update);
      };
    }
    return undefined;
  }, [libreMap, leafletMap]);

  return zoom;
};
