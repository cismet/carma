import type { HTMLAttributes, ReactNode } from "react";

import {
  readDevelopmentOnlyPatternStyle,
  readDevelopmentOnlyUiBackdropStyle,
  type DevelopmentOnlyPatternStyleOptions,
  type DevelopmentOnlyUiBackdropStyleOptions,
} from "./developmentOnlyPattern";

export type DevelopmentOnlyPatternBackgroundProps =
  HTMLAttributes<HTMLDivElement> & {
    children?: ReactNode;
    patternOptions?: DevelopmentOnlyPatternStyleOptions;
  };

export const DevelopmentOnlyPatternBackground = ({
  children,
  patternOptions,
  style,
  ...props
}: DevelopmentOnlyPatternBackgroundProps) => (
  <div
    {...props}
    style={{
      ...readDevelopmentOnlyPatternStyle(patternOptions),
      ...style,
    }}
  >
    {children}
  </div>
);

export type DevelopmentOnlyUiBackdropProps = HTMLAttributes<HTMLDivElement> & {
  patternOptions?: DevelopmentOnlyUiBackdropStyleOptions;
};

export const DevelopmentOnlyUiBackdrop = ({
  patternOptions,
  style,
  ...props
}: DevelopmentOnlyUiBackdropProps) => (
  <div
    aria-hidden
    {...props}
    style={{
      position: "absolute",
      inset: 0,
      zIndex: 0,
      pointerEvents: "none",
      ...readDevelopmentOnlyUiBackdropStyle(patternOptions),
      ...style,
    }}
  />
);
