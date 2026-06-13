import { buildAnnotationInfoBoxSlots } from "@carma-mapping/annotations/ui";
import type { AnnotationInfoBoxActionLabels } from "@carma-mapping/annotations/ui";

import type { RuntimeAnnotationInfoBoxContext } from "@carma-mapping/annotations/runtime";
import { ANNOTATION_DELETE_CONFIRMATION_SOURCES } from "@carma-mapping/annotations/runtime";
import {
  LabelToolInfoBoxContent,
  type LabelToolInfoBoxLabels,
} from "./label-tool-info-box-content";
import { getDefaultLabelDisplayName } from "./label-tool-actions";

export const createLabelToolInfoBoxSlots = (
  toolType: RuntimeAnnotationInfoBoxContext["annotation"]["toolType"],
  {
    headingTitle,
    defaultDisplayNamePrefix,
    actionLabels,
    infoBoxLabels,
  }: {
    headingTitle: string;
    defaultDisplayNamePrefix: string;
    actionLabels?: Partial<AnnotationInfoBoxActionLabels>;
    infoBoxLabels?: LabelToolInfoBoxLabels;
  }
) => {
  return ({
    annotation,
    annotationEntries,
    focusAnnotationId,
    removeAnnotationById,
    exportAnnotationGeoJson,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    updateAnnotationDisplayName,
    infoBoxVisualOptions,
  }: RuntimeAnnotationInfoBoxContext) => {
    if (annotation.toolType !== toolType) {
      return null;
    }

    const labelAnnotations = annotationEntries.filter(
      (annotationEntry) => annotationEntry.toolType === toolType
    );
    const labelOrder =
      labelAnnotations.findIndex(
        (annotationEntry) => annotationEntry.id === annotation.id
      ) + 1;
    const defaultDisplayName = getDefaultLabelDisplayName(
      labelOrder,
      defaultDisplayNamePrefix
    );

    return buildAnnotationInfoBoxSlots({
      headingTitle,
      titleInput: {
        value: annotation.displayName ?? "",
        placeholder: defaultDisplayName,
        onCommit: (nextValue) =>
          updateAnnotationDisplayName(annotation.id, nextValue),
      },
      actions: {
        hidden: annotation.hidden,
        locked: annotation.locked,
        onFlyTo: (event) => {
          event.stopPropagation();
          focusAnnotationId(annotation.id);
        },
        onExport: (event) => {
          event.stopPropagation();
          exportAnnotationGeoJson(annotation.id);
        },
        onToggleVisibility: (event) => {
          event.stopPropagation();
          toggleAnnotationVisibility(annotation.id);
        },
        onToggleLock: (event) => {
          event.stopPropagation();
          toggleAnnotationLocked(annotation.id);
        },
        onDelete: (event) => {
          event.stopPropagation();
          removeAnnotationById(annotation.id, {
            skipConfirmation: event.shiftKey,
            source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.UI,
          });
        },
        labels: actionLabels,
        dataTestIdPrefix: "carma-annotation-label-annotation",
        dataTestIds: {
          flyTo: "carma-annotation-flyto-label-annotation-btn",
          export: "carma-annotation-export-label-annotation-geojson-btn",
          visibility: "carma-annotation-toggle-label-annotation-visibility-btn",
          lock: "carma-annotation-toggle-label-annotation-lock-btn",
          delete: "carma-annotation-delete-label-annotation-btn",
        },
      },
      content: (
        <LabelToolInfoBoxContent
          annotation={annotation}
          labels={infoBoxLabels}
          visualOptions={infoBoxVisualOptions}
        />
      ),
      contentVariant: "raw",
      collapsible: false,
      visualOptions: infoBoxVisualOptions,
    });
  };
};
