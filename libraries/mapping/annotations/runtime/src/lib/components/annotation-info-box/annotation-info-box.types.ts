import type {
  AnnotationInfoBoxLayoutProps,
  AnnotationInfoBoxSlots,
  AnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import type {
  RuntimeAnnotationEntry,
  RuntimeNode,
} from "../../store/annotations-store.types";
import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";

export type RuntimeAnnotationInfoBoxSlots = AnnotationInfoBoxSlots;

export type RuntimeAnnotationInfoBoxContext = {
  annotation: RuntimeAnnotationEntry;
  annotationEntries: readonly RuntimeAnnotationEntry[];
  nodes: readonly RuntimeNode[];
  selectedAnnotationId: string;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  focusAnnotationId: (annotationId: string | null) => void;
  flyToAllAnnotations: () => void;
  removeAnnotationById: (annotationId: string) => void;
  exportAnnotationGeoJson: (annotationId: string) => void;
  toggleAnnotationVisibility: (annotationId: string) => void;
  toggleAnnotationLocked: (annotationId: string) => void;
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
  infoBoxVisualOptions: AnnotationInfoBoxVisualOptions;
};

export type RuntimeAnnotationInfoBoxLayoutProps = AnnotationInfoBoxLayoutProps;
