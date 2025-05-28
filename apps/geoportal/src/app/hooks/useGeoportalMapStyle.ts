import { useMapStyle as usePortalsMapStyle } from "@carma-apps/portals";
import { MapStyleKeys, type MapStyle } from "../constants/MapStyleKeys";

export const useMapStyle = () => {
  const { currentStyle: currentStringStyle, setCurrentStyle: setStringStyle } =
    usePortalsMapStyle();

  const currentStyle = Object.values(MapStyleKeys).includes(
    currentStringStyle as MapStyleKeys
  )
    ? (currentStringStyle as MapStyleKeys)
    : MapStyleKeys.TOPO;

  const setCurrentStyle = (style: MapStyleKeys) => {
    setStringStyle(style);
  };

  return {
    currentStyle,
    setCurrentStyle,
  };
};

export type { MapStyle };
export { MapStyleKeys };
