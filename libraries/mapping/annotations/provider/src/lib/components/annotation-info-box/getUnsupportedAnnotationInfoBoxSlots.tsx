import { AnnotationInfoBoxNotImplemented } from "./AnnotationInfoBoxNotImplemented";
import type {
  AnnotationSlots,
  UnsupportedAnnotationSlotsInput,
} from "./annotationInfoBoxSlots.types";

export const getUnsupportedAnnotationInfoBoxSlots = (
  input: UnsupportedAnnotationSlotsInput
): AnnotationSlots => ({
  headingTitle: "Messung",
  subtitle: null,
  content: (
    <AnnotationInfoBoxNotImplemented
      kind={input.unsupportedKind ?? "unsupported"}
    />
  ),
  collapsible: false,
  instructionText: null,
});
