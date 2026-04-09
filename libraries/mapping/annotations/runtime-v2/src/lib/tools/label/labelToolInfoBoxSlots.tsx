import type { RuntimeAnnotationInfoBoxContext } from "../../components/annotation-info-box/annotationInfoBox.types";
import { LabelToolInfoBoxContent } from "./LabelToolInfoBoxContent";
import { getDefaultLabelDisplayName } from "./labelToolActions";

export const createLabelToolInfoBoxSlots = (
  toolType: RuntimeAnnotationInfoBoxContext["annotation"]["toolType"]
) => {
  return ({
    annotation,
    annotationEntries,
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

    return {
      headingTitle: "Beschriftung",
      subtitle: (
        <div className={infoBoxVisualOptions.subtitleTextClassName}>
          {annotation.displayName?.trim() ||
            getDefaultLabelDisplayName(labelOrder)}
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
