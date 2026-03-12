import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";

import { usePayload } from "./usePayload";

type AnnotationInfoBoxProps = {
  pixelWidth?: number;
};

export function AnnotationInfoBox({
  pixelWidth = 350,
}: AnnotationInfoBoxProps) {
  const payload = usePayload(pixelWidth);
  const {
    pixelWidth: boxWidth,
    headingColor,
    headingTitle,
    headingActions,
    collapsible,
    footer,
    subtitle,
    content,
  } = payload;

  return (
    <div data-test-id="annotation-info-box">
      <CarmaResponsiveInfoBox
        width={boxWidth}
        onPanelClick={(event) => event.stopPropagation()}
        collapsible={collapsible}
        header={undefined}
        headingColor={headingColor}
        footer={footer}
        heading={
          <div className="w-full px-2 flex items-center justify-between">
            <span className="truncate" title={headingTitle}>
              {headingTitle}
            </span>
            {headingActions ?? null}
          </div>
        }
        subtitle={subtitle}
        content={content}
      />
    </div>
  );
}
