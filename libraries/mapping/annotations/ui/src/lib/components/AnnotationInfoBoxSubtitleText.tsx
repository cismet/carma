import type { CSSProperties, ReactNode } from "react";

import type { AnnotationInfoBoxVisualOptions } from "../annotation-info-box.types";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";

type AnnotationInfoBoxSubtitleTextProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  visualOptions?: Partial<AnnotationInfoBoxVisualOptions>;
};

export const AnnotationInfoBoxSubtitleText = ({
  children,
  className,
  style,
  visualOptions,
}: AnnotationInfoBoxSubtitleTextProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);

  return (
    <div
      className={`${resolvedVisualOptions.subtitleTextClassName}${
        className ? ` ${className}` : ""
      }`}
      style={{
        ...resolvedVisualOptions.subtitleTextStyle,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
