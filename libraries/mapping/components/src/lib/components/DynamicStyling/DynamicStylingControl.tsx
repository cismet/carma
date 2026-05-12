import type { DynamicStylingOptionsConfig } from "@carma-mapping/layers";
import type { LayerInfo } from "./dynamicStyling.helpers";
import { DynamicStylingList } from "./DynamicStylingList";
import { DynamicStylingToggle } from "./DynamicStylingToggle";

export interface DynamicStylingControlProps {
  config: DynamicStylingOptionsConfig;
  maplibreMap: any;
  carmaLayerId: string;
  currentSelection: string;
  onSelectionChange: (selection: string) => void;
  onLayerInfoChange?: (layerInfo: LayerInfo) => void;
  showIcon?: boolean;
  children?: React.ReactNode;
}

export const DynamicStylingControl = (props: DynamicStylingControlProps) => {
  if (props.config.type === "toggle") {
    return <DynamicStylingToggle {...props} />;
  }
  return <DynamicStylingList {...props} />;
};
