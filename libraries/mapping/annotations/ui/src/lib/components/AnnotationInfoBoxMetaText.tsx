import type { CSSProperties, ReactNode } from "react";

import type { AnnotationInfoBoxVisualOptions } from "../annotation-info-box.types";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";

type AnnotationInfoBoxMetaTextProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  visualOptions?: Partial<AnnotationInfoBoxVisualOptions>;
};

export const AnnotationInfoBoxMetaText = ({
  children,
  className,
  style,
  visualOptions,
}: AnnotationInfoBoxMetaTextProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);

  return (
    <div
      className={`${resolvedVisualOptions.subtitleMetaTextClassName}${
        className ? ` ${className}` : ""
      }`}
      style={{
        ...resolvedVisualOptions.subtitleMetaTextStyle,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
