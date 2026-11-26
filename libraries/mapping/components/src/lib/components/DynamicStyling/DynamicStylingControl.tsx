import type { DynamicStylingOptionsConfig } from "@carma-mapping/layers";

import { DynamicStylingList } from "./DynamicStylingList";
import { DynamicStylingToggle } from "./DynamicStylingToggle";

export interface DynamicStylingControlProps {
  config: DynamicStylingOptionsConfig;
  carmaLayerId: string;
  currentSelection: string;
  onSelectionChange: (selection: string) => void;
  showIcon?: boolean;
  /** Set while the control cannot be used; shown as tooltip (toggle only) */
  disabledHint?: string | null;
  indicatorClassName?: string;
  children?: React.ReactNode;
}

export const DynamicStylingControl = (props: DynamicStylingControlProps) => {
  if (props.config.type === "toggle") {
    return <DynamicStylingToggle {...props} />;
  }
  return <DynamicStylingList {...props} />;
};
