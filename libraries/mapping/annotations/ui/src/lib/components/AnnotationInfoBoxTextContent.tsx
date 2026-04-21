import type { CSSProperties, ReactNode } from "react";

import type { AnnotationInfoBoxVisualOptions } from "../annotation-info-box.types";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";

type AnnotationInfoBoxTextContentProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  visualOptions?: Partial<AnnotationInfoBoxVisualOptions>;
};

export const AnnotationInfoBoxTextContent = ({
  children,
  className,
  style,
  visualOptions,
}: AnnotationInfoBoxTextContentProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);

  return (
    <div
      className={`${resolvedVisualOptions.bodyContainerClassName} ${resolvedVisualOptions.bodyTextClassName}${
        className ? ` ${className}` : ""
      }`}
      style={{
        ...resolvedVisualOptions.bodyTextStyle,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
