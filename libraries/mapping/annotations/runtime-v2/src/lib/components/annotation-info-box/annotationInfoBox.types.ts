import type { ReactNode } from "react";

import type {
  RuntimeAnnotationEntry,
  RuntimeNode,
} from "../../context/AnnotationsProvider";
export type RuntimeAnnotationInfoBoxSlots = {
  headingTitle: string;
  headingColor?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
  collapsible?: boolean;
};

export type RuntimeAnnotationInfoBoxContext = {
  annotation: RuntimeAnnotationEntry;
  annotationEntries: readonly RuntimeAnnotationEntry[];
  nodes: readonly RuntimeNode[];
  selectedAnnotationId: string;
};
