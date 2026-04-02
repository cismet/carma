import type { DynamicStylingListConfig } from "@carma/types";
import type { MetadataChanges } from "./dynamicStyling.helpers";
import { DynamicStylingList } from "./DynamicStylingList";

export interface DynamicStylingControlProps {
  config: DynamicStylingListConfig;
  maplibreMap: any;
  carmaLayerId: string;
  currentSelection: string;
  onSelectionChange: (selection: string) => void;
  onMetadataChange?: (changes: MetadataChanges) => void;
  showIcon?: boolean;
  children?: React.ReactNode;
}

export const DynamicStylingControl = (props: DynamicStylingControlProps) => {
  return <DynamicStylingList {...props} />;
};
