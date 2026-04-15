import type { CSSProperties, ReactNode } from "react";

type AnnotationToolOptionsBoxProps = {
  panelStyle: CSSProperties;
  children: ReactNode;
};

export function AnnotationToolOptionsBox({
  panelStyle,
  children,
}: AnnotationToolOptionsBoxProps) {
  if (!children) {
    return null;
  }

  return <div style={panelStyle}>{children}</div>;
}
