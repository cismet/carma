import { AnnotationInfoBoxActions } from "@carma-mapping/annotations/ui";

import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotation-info-box.types";
import { LabelToolInfoBoxContent } from "./label-tool-info-box-content";
import { getDefaultLabelDisplayName } from "./label-tool-actions";

export const createLabelToolInfoBoxSlots = (
  toolType: RuntimeAnnotationInfoBoxContext["annotation"]["toolType"],
  {
    headingColor,
  }: {
    headingColor: string;
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
    infoBoxVisualOptions,
  }: RuntimeAnnotationInfoBoxContext) => {
    if (annotation.toolType !== toolType) {
      return null;
    }

    const labelMeasurements = annotationEntries.filter(
      (measurementEntry) => measurementEntry.toolType === toolType
    );
    const labelOrder =
      labelMeasurements.findIndex(
        (measurementEntry) => measurementEntry.id === annotation.id
      ) + 1;

    const actionIcons = (
      <AnnotationInfoBoxActions
        hidden={annotation.hidden}
        locked={annotation.locked}
        onFlyTo={(event) => {
          event.stopPropagation();
          focusAnnotationId(annotation.id);
        }}
        onExport={(event) => {
          event.stopPropagation();
          exportAnnotationGeoJson(annotation.id);
        }}
        onToggleVisibility={(event) => {
          event.stopPropagation();
          toggleAnnotationVisibility(annotation.id);
        }}
        onToggleLock={(event) => {
          event.stopPropagation();
          toggleAnnotationLocked(annotation.id);
        }}
        onDelete={(event) => {
          event.stopPropagation();
          removeAnnotationById(annotation.id);
        }}
        visualOptions={infoBoxVisualOptions}
        dataTestIdPrefix="carma-annotation-label-measurement"
        dataTestIds={{
          flyTo: "carma-annotation-flyto-label-measurement-btn",
          export: "carma-annotation-export-label-measurement-geojson-btn",
          visibility:
            "carma-annotation-toggle-label-measurement-visibility-btn",
          lock: "carma-annotation-toggle-label-measurement-lock-btn",
          delete: "carma-annotation-delete-label-measurement-btn",
        }}
      />
    );

    return {
      headingTitle: "Beschriftung",
      headingColor,
      subtitle: (
        <div className={infoBoxVisualOptions.subtitleContainerClassName}>
          <div className="flex items-center justify-between gap-2">
            <div
              className={`min-w-0 flex-1 ${infoBoxVisualOptions.titleTextClassName}`}
              style={infoBoxVisualOptions.titleTextStyle}
            >
              {annotation.displayName?.trim() ||
                getDefaultLabelDisplayName(labelOrder)}
            </div>
            <div className="shrink-0">{actionIcons}</div>
          </div>
        </div>
      ),
      content: (
        <div className={infoBoxVisualOptions.bodyContainerClassName}>
          <LabelToolInfoBoxContent
            annotation={annotation}
            visualOptions={infoBoxVisualOptions}
          />
        </div>
      ),
      collapsible: false,
    };
  };
};
