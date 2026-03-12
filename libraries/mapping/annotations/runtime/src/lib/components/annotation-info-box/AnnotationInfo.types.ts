import type { ReactNode } from "react";

export type AnnotationInfoBoxPayload = {
  pixelWidth: number;
  headingColor: string;
  headingTitle: string;
  collapsible: boolean;
  footer: ReactNode;
  subtitle: ReactNode;
  content: ReactNode;
};
