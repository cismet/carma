import { RuntimeAnnotationInfoBoxActions } from "../../components/annotation-info-box/RuntimeAnnotationInfoBoxActions";
import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";
import { LabelToolInfoBoxContent } from "./LabelToolInfoBoxContent";
import { getDefaultLabelDisplayName } from "./labelToolActions";

export const createLabelToolInfoBoxSlots = (
  toolType: RuntimeAnnotationInfoBoxContext["annotation"]["toolType"]
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
      <RuntimeAnnotationInfoBoxActions
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
        dataTestIdPrefix="carma-v2-label-measurement"
        dataTestIds={{
          flyTo: "carma-v2-flyto-label-measurement-btn",
          export: "carma-v2-export-label-measurement-geojson-btn",
          visibility: "carma-v2-toggle-label-measurement-visibility-btn",
          lock: "carma-v2-toggle-label-measurement-lock-btn",
          delete: "carma-v2-delete-label-measurement-btn",
        }}
      />
    );

    return {
      headingTitle: "Beschriftung",
      subtitle: (
        <div className={infoBoxVisualOptions.subtitleContainerClassName}>
          <div className="flex items-start justify-between gap-2">
            <div className={`min-w-0 flex-1 ${infoBoxVisualOptions.subtitleTextClassName}`}>
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
