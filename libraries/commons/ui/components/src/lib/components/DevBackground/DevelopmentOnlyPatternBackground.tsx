import type { HTMLAttributes, ReactNode } from "react";

import {
  readDevelopmentOnlyPatternStyle,
  type DevelopmentOnlyPatternStyleOptions,
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
