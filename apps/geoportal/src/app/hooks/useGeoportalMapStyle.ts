import { usePortalContext } from "@carma-appframeworks/portals";
import { MapStyleKeys, type MapStyleKey } from "@carma-appframeworks/portals";

export const useMapStyle = () => {
  const { mapStyleRef, setMapStyle } = usePortalContext();

  const currentStyle = Object.values(MapStyleKeys).includes(
    mapStyleRef.current as MapStyleKey
  )
    ? (mapStyleRef.current as MapStyleKey)
    : MapStyleKeys.TOPO;

  const setCurrentStyle = (style: MapStyleKey) => {
    setMapStyle(style);
  };

  return {
    currentStyle,
    setCurrentStyle,
  };
};
