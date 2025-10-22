/**
 * Blank scene style - Just a dark gray ellipsoid globe
 * No external resources needed
 */
import { Color, toColorRgbaArray } from "@carma/cesium";
import type { SceneStyleConfig } from "@carma-mapping/engines/cesium/core";

export const BLANK_GLOBE_STYLE: SceneStyleConfig = {
  styles: [
    {
      id: "blank",
      name: "Blank",
      shadows: false,
      backgroundColor: toColorRgbaArray(Color.BLACK),
      globe: {
        baseColor: toColorRgbaArray(Color.DARKGRAY),
      },
    },
  ],
};
