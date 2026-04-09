import type { ReactNode } from "react";
import type { CSSProperties } from "react";

import type {
  RuntimeAnnotationEntry,
  RuntimeNode,
} from "../../context/AnnotationsProvider";
import type { AnnotationsRuntimeFormatOptions } from "../../config/annotationsRuntimeFormatOptions";
import type { RuntimeAnnotationInfoBoxVisualOptions } from "./annotationInfoBoxVisualDefaults";
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
  setSelectedAnnotationId: (annotationId: string | null) => void;
  focusAnnotationId: (annotationId: string | null) => void;
  flyToAllAnnotations: () => void;
  removeAnnotationById: (annotationId: string) => void;
  elevationReferenceAnnotationId: string | null;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  updateAnnotationDisplayName: (
    annotationId: string,
    displayName: string
  ) => void;
  updateAnnotationShortLabel: (
    annotationId: string,
    shortLabel: string
  ) => void;
  formatOptions: AnnotationsRuntimeFormatOptions;
  infoBoxVisualOptions: RuntimeAnnotationInfoBoxVisualOptions;
};

export type RuntimeAnnotationInfoBoxLayoutProps = {
  pixelWidth?: number;
  useControlLayout?: boolean;
  controlPosition?:
    | "topleft"
    | "topright"
    | "topcenter"
    | "bottomleft"
    | "bottomright"
    | "bottomcenter";
  controlOrder?: number;
  style?: CSSProperties;
  visualOptions?: Partial<RuntimeAnnotationInfoBoxVisualOptions>;
};
