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
  fitContentWidth = true,
  collapsedHorizontalAnchor = "control-edge",
  useControlLayout = true,
  controlPosition = "bottomright",
  controlOrder = 11,
  style,
  slots,
  visualOptions,
}: AnnotationInfoBoxContainerProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);
  const headingTitle = slots.headingTitle?.trim() ?? "";

  return (
    <div data-test-id="annotation-info-box">
      <CarmaResponsiveInfoBox
        width={pixelWidth ?? resolvedVisualOptions.defaultPixelWidth}
        fitContentWidth={fitContentWidth}
        useControlLayout={useControlLayout}
        controlPosition={controlPosition}
        controlOrder={controlOrder}
        style={style}
        bodyStyle={resolvedVisualOptions.bodyPanelStyle}
        onPanelClick={(event) => event.stopPropagation()}
        collapsible={slots.collapsible ?? true}
        header={undefined}
        headingColor={slots.headingColor ?? resolvedVisualOptions.headingColor}
        headingStyle={resolvedVisualOptions.headerStyle}
        footer={slots.footer}
        hideSubtitleWhenCollapsed={false}
        hideFooterWhenCollapsed={true}
        collapsedHorizontalAnchor={collapsedHorizontalAnchor}
        heading={
          headingTitle ? (
            <div className="flex w-full items-center gap-2">
              <span
                className={`${resolvedVisualOptions.headerForegroundClassName} ${resolvedVisualOptions.headerTitleClassName}`}
                title={headingTitle}
              >
                {headingTitle}
              </span>
            </div>
          ) : undefined
        }
        subtitle={slots.subtitle}
        content={slots.content}
      />
    </div>
  );
};
