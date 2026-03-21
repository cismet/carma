import { useCallback } from "react";
import { useMapStyle as usePortalsMapStyle } from "@carma-appframeworks/portals";
import { MapStyleKeys, type MapStyle } from "../constants/MapStyleKeys";

export const useMapStyle = () => {
  const { currentStyle: currentStringStyle, setCurrentStyle: setStringStyle } =
    usePortalsMapStyle();

  const currentStyle = Object.values(MapStyleKeys).includes(
    currentStringStyle as MapStyleKeys
  )
    ? (currentStringStyle as MapStyleKeys)
    : MapStyleKeys.TOPO;

  const setCurrentStyle = useCallback(
    (style: MapStyleKeys) => {
      setStringStyle(style);
    },
    [setStringStyle]
  );

  return {
    currentStyle,
    setCurrentStyle,
  };
};

export type { MapStyle };
export { MapStyleKeys };
