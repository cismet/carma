import { usePortalMapStyle } from "@carma-appframeworks/portals";
import { MapStyleKeys, type MapStyleKey } from "@carma-appframeworks/portals";

export const useMapStyle = () => {
  const { current: currentStringStyle, set: setStringStyle } =
    usePortalMapStyle();

  const currentStyle = Object.values(MapStyleKeys).includes(
    currentStringStyle as MapStyleKey
  )
    ? (currentStringStyle as MapStyleKey)
    : MapStyleKeys.TOPO;

  const setCurrentStyle = (style: MapStyleKey) => {
    setStringStyle(style);
  };

  return {
    currentStyle,
    setCurrentStyle,
  };
};
