import type { DynamicStylingListConfig } from "@carma-mapping/layers";
import type { LayerInfo } from "./dynamicStyling.helpers";
import { DynamicStylingList } from "./DynamicStylingList";

export interface DynamicStylingControlProps {
  config: DynamicStylingListConfig;
  maplibreMap: any;
  carmaLayerId: string;
  currentSelection: string;
  onSelectionChange: (selection: string) => void;
  onLayerInfoChange?: (layerInfo: LayerInfo) => void;
  showIcon?: boolean;
  children?: React.ReactNode;
}

export const DynamicStylingControl = (props: DynamicStylingControlProps) => {
  return <DynamicStylingList {...props} />;
};
