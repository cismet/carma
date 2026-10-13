import type { ReactNode } from "react";
import type { LabelOverlayHostBinding } from "@carma-providers/label-overlay";

import type {
  AnnotationToolId,
  AnnotationEngine,
} from "@carma-mapping/annotations/core";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import type { AnnotationReferenceObjectSizingOptions } from "../config/annotation-reference-object-sizing";
import type {
  AnnotationToolDraftStore,
  AnnotationToolPlugin,
  AnnotationToolRegistry,
} from "../registry";
import type {
  AnnotationsRuntimeGeoJsonFeatureCollection,
  AnnotationsRuntimePersistenceEnvelope,
  AnnotationsStore,
} from "../store";
import type {
  AnnotationEntryRole,
  AnnotationElevationDisplayMode,
  AnnotationGeographicCoordinate,
  StoredAnnotation,
} from "../store/annotations-store.types";
import type { AppendAnnotationsRuntimePersistenceStateOptions } from "../utils/annotation-tool-collections";
import type {
  AnnotationDeleteConfirmationRequester,
  AnnotationDeleteRequestOptions,
} from "./annotation-delete-confirmation";
import type { AddAnnotation } from "./use-annotation-add";
import type { AnnotationLabelTextDialogState } from "./use-annotation-label-text-request";

export type AnnotationsRuntimeServices = {
  engine: AnnotationEngine | null;
  registry: AnnotationToolRegistry;
  annotationToolDraftStore: AnnotationToolDraftStore;
  annotationsStore: AnnotationsStore;
  formatOptions: AnnotationsRuntimeFormatOptions;
  activeEditedNodeId: string | null;
  addAnnotation: AddAnnotation;
  appendAnnotationsRuntimePersistenceState: (
    persistenceState: AnnotationsRuntimePersistenceEnvelope,
    options?: AppendAnnotationsRuntimePersistenceStateOptions
  ) => readonly string[];
  removeExternalAnnotationsByCollection: (
    externalCollection: NonNullable<StoredAnnotation["externalCollection"]>
  ) => readonly string[];
  setActiveToolType: (toolId: AnnotationToolId) => void;
  requestModeChange: (toolId: AnnotationToolId) => void;
  requestActivateTool: (toolId?: AnnotationToolId) => void;
  requestFinishMeasurement: () => boolean;
  requestPointAt: (coordinate: AnnotationGeographicCoordinate) => boolean;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  focusAnnotationId: (annotationId: string | null) => void;
  flyToAnnotationById: (annotationId: string | null) => void;
  flyToAllAnnotations: () => void;
  removeAnnotationById: (
    annotationId: string,
    options?: AnnotationDeleteRequestOptions
  ) => void;
  removeAnnotationsByIds: (
    annotationIds: readonly string[],
    options?: AnnotationDeleteRequestOptions
  ) => void;
  buildAllAnnotationsGeoJson: () => AnnotationsRuntimeGeoJsonFeatureCollection;
  exportAnnotationGeoJson: (annotationId: string) => void;
  exportAllAnnotationsGeoJson: () => void;
  toggleAnnotationVisibility: (annotationId: string) => void;
  toggleAnnotationLocked: (annotationId: string) => void;
  removeSelectedAnnotations: (options?: AnnotationDeleteRequestOptions) => void;
  selectAllAnnotations: () => void;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  toggleAnnotationElevationDisplayMode: (
    annotationId: string,
    currentElevationDisplayMode?: AnnotationElevationDisplayMode
  ) => void;
  updateAnnotationDisplayName: (
    annotationId: string,
    displayName: string
  ) => void;
  updateAnnotationShortLabel: (
    annotationId: string,
    shortLabel: string
  ) => void;
  setPointTemporaryMode: (temporaryMode: boolean) => void;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  setSelectedAnnotationIds: (annotationIds: readonly string[]) => void;
  labelTextDialogState: AnnotationLabelTextDialogState;
};

export type AnnotationsProviderProps = {
  /**
   * Engine adapter the runtime draws and picks with. The app owns the engine
   * lifetime; the provider never disposes it. A different engine remounts the
   * engine-bound hosts so adapter-contributed hooks keep a stable order.
   */
  engine: AnnotationEngine | null;
  plugins: readonly AnnotationToolPlugin[];
  children?: ReactNode;
  annotationOverlayContainer?: Element | DocumentFragment | null;
  initialActiveToolType?: AnnotationToolId;
  initialPointTemporaryMode?: boolean;
  labelOverlayHost?: LabelOverlayHostBinding | null;
  localPersistence?: {
    enabled?: boolean;
    storageKey: string;
  };
  renderEnabled?: boolean;
  visualRenderEnabled?: boolean;
  visualInteractionEnabled?: boolean;
  visualAnnotationEntryRoles?: readonly AnnotationEntryRole[];
  formatOptions?: AnnotationsRuntimeFormatOptions;
  lineLabelOptions?: PartialAnnotationLineLabelOptions;
  referenceObjectSizing?: AnnotationReferenceObjectSizingOptions;
  initialPersistenceState?: AnnotationsRuntimePersistenceEnvelope | null;
  onPersistenceStateChange?: (
    state: AnnotationsRuntimePersistenceEnvelope
  ) => void;
  confirmAnnotationDelete?: AnnotationDeleteConfirmationRequester;
  /**
   * Answer `carma.annotations` while mounted, so scripts, stories and tests
   * can drive the tools. On by default; the latest mounted runtime answers.
   */
  carmaApi?: boolean;
};
