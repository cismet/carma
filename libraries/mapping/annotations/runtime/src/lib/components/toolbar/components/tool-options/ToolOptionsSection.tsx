import type { CSSProperties, ReactNode } from "react";
import { optionsContainerStyle } from "../../shared";

type ToolOptionsSectionProps = {
  dataTestId: string;
  optionsStyle?: CSSProperties;
  children: ReactNode;
};

export function ToolOptionsSection({
  dataTestId,
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
    </div>
  );
}
