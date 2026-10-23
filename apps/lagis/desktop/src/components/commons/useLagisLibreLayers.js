import { useMemo } from "react";
import { useSelector } from "react-redux";
import { getBackgroundLibreLayers } from "./BackgroundLayers";
import { getAdditionalLibreLayers } from "./AdditionalLayers";
import {
  getActiveAdditionalLayers,
  getActiveBackgroundLayer,
  getAdditionalLayerOpacities,
  getBackgroundLayerOpacities,
  getSelectedTrueOrthoYear,
} from "../../store/slices/ui";
import { getShowBackground } from "../../store/slices/mapping";

// As before: hiding the background hides the additional layers too.
const useLagisLibreLayers = () => {
  const showBackground = useSelector(getShowBackground);
  const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);
  const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  const activeAdditionalLayers = useSelector(getActiveAdditionalLayers);
  const additionalLayerOpacities = useSelector(getAdditionalLayerOpacities);
  const selectedTrueOrthoYear = useSelector(getSelectedTrueOrthoYear);

  return useMemo(() => {
    if (!showBackground) {
      return [];
    }
    return [
      ...getBackgroundLibreLayers(
        activeBackgroundLayer,
        backgroundLayerOpacities,
        selectedTrueOrthoYear
      ),
      ...getAdditionalLibreLayers(
        activeAdditionalLayers,
        additionalLayerOpacities
      ),
    ];
  }, [
    showBackground,
    activeBackgroundLayer,
    backgroundLayerOpacities,
    selectedTrueOrthoYear,
    activeAdditionalLayers,
    additionalLayerOpacities,
  ]);
};

export default useLagisLibreLayers;
