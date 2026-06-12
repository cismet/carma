import { useDispatch } from "react-redux";

import type { BackgroundLayer, Layer } from "@carma-mapping/layers";
import {
  DynamicStylingControl,
  LayerIcon,
  getDynamicStylingOptionsConfigs,
  getDynamicStylingSelections,
} from "@carma-mapping/components";

import { setLayerDynamicStylingSelection } from "../../store/slices/mapping";

interface DynamicStylingLayerIconProps {
  layer: Layer | BackgroundLayer;
  id?: string;
  fallbackIcon?: string;
  isBackgroundLayer?: boolean;
  isBaseLayer?: boolean;
  iconId?: string;
  iconClassName?: string;
  indicatorClassName?: string;
}

const DynamicStylingLayerIcon = ({
  layer,
  id = layer.id,
  fallbackIcon,
  isBackgroundLayer = false,
  isBaseLayer,
  iconId,
  iconClassName,
  indicatorClassName,
}: DynamicStylingLayerIconProps) => {
  const dispatch = useDispatch();

  const dynamicStylingConfigs = getDynamicStylingOptionsConfigs(
    layer.dynamicStyling
  );
  const dynamicStylingSelections = getDynamicStylingSelections(
    layer.dynamicStylingSelection
  );
  const primaryListConfigIndex = dynamicStylingConfigs.findIndex(
    (c) => c.type === "list"
  );
  const primaryListConfig =
    primaryListConfigIndex >= 0
      ? dynamicStylingConfigs[primaryListConfigIndex]
      : null;

  const icon = (
    <LayerIcon
      layer={layer}
      fallbackIcon={fallbackIcon}
      isBaseLayer={isBaseLayer}
      id={iconId}
      className={iconClassName}
    />
  );

  if (!primaryListConfig || isBackgroundLayer) {
    return icon;
  }

  return (
    <DynamicStylingControl
      config={primaryListConfig}
      carmaLayerId={id}
      indicatorClassName={indicatorClassName}
      currentSelection={
        dynamicStylingSelections[primaryListConfigIndex] ||
        primaryListConfig.default
      }
      onSelectionChange={(selection) => {
        dispatch(
          setLayerDynamicStylingSelection({
            id,
            configIndex: primaryListConfigIndex,
            selection,
          })
        );
      }}
    >
      {icon}
    </DynamicStylingControl>
  );
};

export default DynamicStylingLayerIcon;
