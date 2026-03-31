import type {
  AnnotationEntry,
  NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

import type {
  AnnotationSlots,
  AnnotationInfoBoxEntryPayload,
} from "../annotationInfoBoxSlots.types";
import { AnnotationJsonPreview } from "../components";
import { INFO_BOX_MUTED_BODY_TEXT_CLASSNAME } from "./shared";
const resolveRawAnnotationEntry = (
  input: AnnotationInfoBoxEntryPayload
): AnnotationEntry | NodeChainAnnotation | null => {
  if (input.pointAnnotation) {
    return input.pointAnnotation;
  }

  if (input.nodeChainAnnotation) {
    return input.nodeChainAnnotation;
  }

  if (!input.annotationId) {
    return null;
  }

  return (
    input.annotations.find((entry) => entry.id === input.annotationId) ??
    [
      ...input.polylineAnnotations,
      ...input.groundPolygons,
      ...input.planarPolygons,
      ...input.verticalPolygons,
    ].find((entry) => entry.id === input.annotationId) ??
    null
  );
};

export const getGenericAnnotationInfoBoxSlots = (
  input: AnnotationInfoBoxEntryPayload
): AnnotationSlots => {
  const rawAnnotationEntry = resolveRawAnnotationEntry(input);

  return {
    headingTitle: "Messung",
    subtitle: rawAnnotationEntry ? (
      <div
        className={`mt-1 mb-0 w-full px-2 ${INFO_BOX_MUTED_BODY_TEXT_CLASSNAME}`}
      >
        Generische Darstellung fuer Typ:{" "}
        <span className="font-semibold">{input.kind}</span>
      </div>
    ) : null,
    content: <AnnotationJsonPreview value={rawAnnotationEntry} />,
    collapsible: false,
    instructionText: null,
  };
};
