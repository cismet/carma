import type { CSSProperties, ReactNode } from "react";
import { DismissibleHelpBox } from "@carma-commons/ui/components";
import { optionsContainerStyle } from "../../shared";

type ToolOptionsSectionProps = {
  dataTestId: string;
  helpDataTestId: string;
  helpContent: ReactNode;
  helpCollapsed: boolean;
  onHelpCollapsedChange: (collapsed: boolean) => void;
  optionsStyle?: CSSProperties;
  children: ReactNode;
};

export function ToolOptionsSection({
  dataTestId,
  helpDataTestId,
  helpContent,
  helpCollapsed,
  onHelpCollapsedChange,
  optionsStyle,
  children,
}: ToolOptionsSectionProps) {
  return (
    <div
      style={
        optionsStyle
          ? { ...optionsContainerStyle, ...optionsStyle }
          : optionsContainerStyle
      }
      data-test-id={dataTestId}
    >
      {children}
      <DismissibleHelpBox
        dataTestId={helpDataTestId}
        content={helpContent}
        collapsed={helpCollapsed}
        onCollapsedChange={onHelpCollapsedChange}
      />
    </div>
  );
}
