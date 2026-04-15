import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";

import type {
  AnnotationInfoBoxLayoutProps,
  AnnotationInfoBoxSlots,
} from "../annotation-info-box.types";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";
import type { AnnotationInfoBoxVisualOptions } from "../annotation-info-box.types";

type AnnotationInfoBoxContainerProps = AnnotationInfoBoxLayoutProps & {
  slots: AnnotationInfoBoxSlots;
  visualOptions?: Partial<AnnotationInfoBoxVisualOptions>;
};

export const AnnotationInfoBoxContainer = ({
  pixelWidth,
  useControlLayout = true,
  controlPosition = "bottomright",
  controlOrder = 11,
  style,
  slots,
  visualOptions,
}: AnnotationInfoBoxContainerProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);

  return (
    <div data-test-id="annotation-info-box">
      <CarmaResponsiveInfoBox
        width={pixelWidth ?? resolvedVisualOptions.defaultPixelWidth}
        fitContentWidth={true}
        useControlLayout={useControlLayout}
        controlPosition={controlPosition}
        controlOrder={controlOrder}
        style={style}
        bodyStyle={resolvedVisualOptions.bodyPanelStyle}
        onPanelClick={(event) => event.stopPropagation()}
        collapsible={slots.collapsible ?? true}
        header={undefined}
        headingColor={slots.headingColor ?? resolvedVisualOptions.headingColor}
        footer={slots.footer}
        hideSubtitleWhenCollapsed={true}
        heading={
          <div className="flex w-full items-center gap-2 px-1">
            <span
              className={`${resolvedVisualOptions.headerForegroundClassName} ${resolvedVisualOptions.headerTitleClassName}`}
              title={slots.headingTitle}
            >
              {slots.headingTitle}
            </span>
          </div>
        }
        subtitle={slots.subtitle}
        content={slots.content}
      />
    </div>
  );
};
