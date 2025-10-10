import { useMapStyle as usePortalsMapStyle } from "@carma-appframeworks/portals";
import { MapStyleKeys, type MapStyleKey } from "@carma-appframeworks/portals";

export const useMapStyle = () => {
  const { currentStyle: currentStringStyle, setCurrentStyle: setStringStyle } =
    usePortalsMapStyle();

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
