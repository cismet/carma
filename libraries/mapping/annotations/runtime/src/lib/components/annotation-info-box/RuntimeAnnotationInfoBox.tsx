import {
  AnnotationInfoBoxContainer,
  type AnnotationInfoBoxLayoutProps,
} from "@carma-mapping/annotations/ui";

import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  useRuntimeAnnotationInfoBoxSlots,
} from "./use-runtime-annotation-info-box-slots";

export const RuntimeAnnotationInfoBox = ({
  pixelWidth,
  fitContentWidth,
  useControlLayout,
  controlPosition,
  controlOrder,
  collapsedHorizontalAnchor,
  style,
  visualOptions,
}: AnnotationInfoBoxLayoutProps) => {
  const infoBoxState = useRuntimeAnnotationInfoBoxSlots({ visualOptions });

  if (
    !infoBoxState ||
    infoBoxState.kind !==
      RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION
  ) {
    return null;
  }

  return (
    <AnnotationInfoBoxContainer
      pixelWidth={pixelWidth}
      fitContentWidth={fitContentWidth}
      useControlLayout={useControlLayout}
      controlPosition={controlPosition}
      controlOrder={controlOrder}
      collapsedHorizontalAnchor={collapsedHorizontalAnchor}
      style={style}
      slots={infoBoxState.slots}
      visualOptions={infoBoxState.visualOptions}
    />
  );
};
