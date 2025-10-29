import { usePortalContext } from "@carma-appframeworks/portals";
import { MapStyleKeys, type MapStyleKey } from "@carma-appframeworks/portals";

export const useMapStyle = () => {
  const { getMapStyle, setMapStyle } = usePortalContext();

  const currentStyle = Object.values(MapStyleKeys).includes(
    getMapStyle() as MapStyleKey
  )
    ? (getMapStyle() as MapStyleKey)
    : MapStyleKeys.TOPO;

  const setCurrentStyle = (style: MapStyleKey) => {
    setMapStyle(style);
  };

  return {
    currentStyle,
    setCurrentStyle,
  };
};
