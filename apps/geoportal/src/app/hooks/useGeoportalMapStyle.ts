import { useCallback } from "react";
import { useMapStyle as usePortalsMapStyle } from "@carma-appframeworks/portals";

import {
  findBackgroundCategory,
  geoportalBackgroundConfig,
} from "../config/backgroundConfig";

/**
 * The portals map style, narrowed to a configured background category: an
 * unknown style (an old share link, a route whose categories changed) reads
 * as the default category.
 */
export const useMapStyle = () => {
  const { currentStyle: currentStringStyle, setCurrentStyle: setStringStyle } =
    usePortalsMapStyle();

  const currentStyle = findBackgroundCategory(currentStringStyle)
    ? currentStringStyle
    : geoportalBackgroundConfig.defaultCategory;

  const setCurrentStyle = useCallback(
    (style: string) => {
      setStringStyle(style);
    },
    [setStringStyle]
  );

  return {
    currentStyle,
    setCurrentStyle,
  };
};
