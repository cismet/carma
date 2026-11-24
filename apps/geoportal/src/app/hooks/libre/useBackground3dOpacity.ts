import { useSelector } from "react-redux";

import {
  findBackgroundCategory,
  getLibre3dOption,
} from "../../config/backgroundConfig";
import type { Libre3dOption } from "../../config/geoportalBackground";
import {
  getBackground3dMainOpacity,
  getBackground3dOpacityByCategory,
  getBackgroundLayer,
  getSelected3dByCategory,
} from "../../store/slices/mapping";
import { getLibre3d } from "../../store/slices/ui";

export type Background3dOpacity = {
  /** the models' own slider, or the option's default */
  opacity: number;
  /** the top slider, scaling base map and models; 1 for a covering mesh */
  main: number;
  /** the models cover the base map, so they take its slider (see Libre3dOption) */
  coversBase: boolean;
};

export const resolveBackground3dOpacity = (
  option: Libre3dOption,
  stored: number | undefined,
  main: number
): Background3dOpacity => ({
  opacity: stored ?? option.opacity ?? 1,
  main: option.coversBase ? 1 : main,
  coversBase: option.coversBase === true,
});

/**
 * The opacities of the background's 3D models, or undefined while the
 * maplibre 3D view draws none (2D, Cesium, a category without `libre3d`).
 */
export const useBackground3dOpacity = (): Background3dOpacity | undefined => {
  const libre3d = useSelector(getLibre3d);
  const backgroundId = useSelector(getBackgroundLayer).id;
  const selected3d = useSelector(getSelected3dByCategory)[backgroundId];
  const stored = useSelector(getBackground3dOpacityByCategory)[backgroundId];
  const main = useSelector(getBackground3dMainOpacity);
  const option = libre3d
    ? getLibre3dOption(findBackgroundCategory(backgroundId), selected3d)
    : undefined;
  return option && option.styles.length > 0
    ? resolveBackground3dOpacity(option, stored, main)
    : undefined;
};
