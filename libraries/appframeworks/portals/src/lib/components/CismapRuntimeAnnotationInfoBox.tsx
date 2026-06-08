import type { ReactNode } from "react";

import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import {
  AnnotationInfoBoxContainer,
  type AnnotationInfoBoxLayoutProps,
} from "@carma-mapping/annotations/ui";
import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type RuntimeAnnotationInfoBoxSlotsState,
} from "@carma-mapping/annotations/runtime";

import {
  CismapAnnotationInfoBox,
  CismapAnnotationInstructionInfoBox,
} from "./CismapAnnotationInfoBox";

export type CismapRuntimeAnnotationInfoBoxLayoutProps = Omit<
  AnnotationInfoBoxLayoutProps,
  "visualOptions"
>;

export type CismapRuntimeAnnotationInfoBoxProps = {
  infoBoxState: RuntimeAnnotationInfoBoxSlotsState;
  isCesium: boolean;
  annotationToolIds: readonly AnnotationToolId[];
  layoutProps?: CismapRuntimeAnnotationInfoBoxLayoutProps;
  secondaryInfoBoxElements?: ReactNode[];
};

export const CismapRuntimeAnnotationInfoBox = ({
  infoBoxState,
  isCesium,
  annotationToolIds,
  layoutProps,
  secondaryInfoBoxElements = [],
}: CismapRuntimeAnnotationInfoBoxProps) => {
  if (
    infoBoxState.kind === RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.FALLBACK
  ) {
    const hasHeaderStyle =
      Object.keys(infoBoxState.visualOptions.headerStyle ?? {}).length > 0;

    return (
      <CismapAnnotationInstructionInfoBox
        content={infoBoxState.slots.content}
        controlOrder={layoutProps?.controlOrder}
        headerTitle={hasHeaderStyle ? "Messungen" : undefined}
        pixelWidth={layoutProps?.pixelWidth}
        visualOptions={infoBoxState.visualOptions}
        secondaryInfoBoxElements={secondaryInfoBoxElements}
      />
    );
  }

  if (annotationToolIds.includes(infoBoxState.annotation.toolType)) {
    return (
      <CismapAnnotationInfoBox
        pixelWidth={layoutProps?.pixelWidth}
        instructionContent={
          isCesium ? infoBoxState.instructionContent : undefined
        }
        slots={infoBoxState.slots}
        visualOptions={infoBoxState.visualOptions}
        controlOrder={layoutProps?.controlOrder}
        secondaryInfoBoxElements={secondaryInfoBoxElements}
      />
    );
  }

  return (
    <AnnotationInfoBoxContainer
      {...layoutProps}
      slots={infoBoxState.slots}
      visualOptions={infoBoxState.visualOptions}
    />
  );
};
