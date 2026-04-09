import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";

import type {
  RuntimeAnnotationInfoBoxLayoutProps,
  RuntimeAnnotationInfoBoxSlots,
} from "./annotationInfoBox.types";
import {
  resolveRuntimeAnnotationInfoBoxVisualOptions,
  type RuntimeAnnotationInfoBoxVisualOptions,
} from "./annotationInfoBoxVisualDefaults";

type RuntimeAnnotationInfoBoxContainerProps =
  RuntimeAnnotationInfoBoxLayoutProps & {
    slots: RuntimeAnnotationInfoBoxSlots;
    visualOptions?: Partial<RuntimeAnnotationInfoBoxVisualOptions>;
  };

export const RuntimeAnnotationInfoBoxContainer = ({
  pixelWidth,
  useControlLayout = true,
  controlPosition = "bottomright",
  controlOrder = 11,
  style,
  slots,
  visualOptions,
}: RuntimeAnnotationInfoBoxContainerProps) => {
  const resolvedVisualOptions =
    resolveRuntimeAnnotationInfoBoxVisualOptions(visualOptions);

  return (
    <div data-test-id="annotation-info-box">
      <CarmaResponsiveInfoBox
        width={pixelWidth ?? resolvedVisualOptions.defaultPixelWidth}
        useControlLayout={useControlLayout}
        controlPosition={controlPosition}
        controlOrder={controlOrder}
        style={style}
        onPanelClick={(event) => event.stopPropagation()}
        collapsible={slots.collapsible ?? true}
        header={undefined}
        headingColor={slots.headingColor ?? resolvedVisualOptions.headingColor}
        footer={slots.footer}
        hideSubtitleWhenCollapsed={true}
        heading={
          <div className="flex w-full items-center justify-between gap-2 px-1">
            <span
              className={`${resolvedVisualOptions.headerForegroundClassName} ${resolvedVisualOptions.headerTitleClassName}`}
              title={slots.headingTitle}
            >
              {slots.headingTitle}
            </span>
            {slots.actions ? (
              <span className="shrink-0">{slots.actions}</span>
            ) : null}
          </div>
        }
        subtitle={slots.subtitle}
        content={slots.content}
      />
    </div>
  );
};
