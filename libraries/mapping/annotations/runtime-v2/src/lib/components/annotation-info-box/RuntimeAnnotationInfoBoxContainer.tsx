import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";

import type { RuntimeAnnotationInfoBoxSlots } from "./annotationInfoBox.types";

type RuntimeAnnotationInfoBoxContainerProps = {
  pixelWidth?: number;
  slots: RuntimeAnnotationInfoBoxSlots;
};

const DEFAULT_PIXEL_WIDTH = 350;

export const RuntimeAnnotationInfoBoxContainer = ({
  pixelWidth = DEFAULT_PIXEL_WIDTH,
  slots,
}: RuntimeAnnotationInfoBoxContainerProps) => {
  return (
    <div data-test-id="annotation-info-box">
      <CarmaResponsiveInfoBox
        width={pixelWidth}
        onPanelClick={(event) => event.stopPropagation()}
        collapsible={slots.collapsible ?? true}
        header={undefined}
        headingColor={slots.headingColor ?? "#4b7ed1"}
        footer={slots.footer}
        heading={
          <div className="w-full px-2 flex items-center justify-between gap-2">
            <span className="truncate" title={slots.headingTitle}>
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
