import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";

import { usePayload } from "./usePayload";
type AnnotationInfoBoxProps = {
  pixelWidth?: number;
  useControlLayout?: boolean;
};

export function AnnotationInfoBox({
  pixelWidth = 350,
  useControlLayout = true,
}: AnnotationInfoBoxProps) {
  const payload = usePayload(pixelWidth);
  const {
    pixelWidth: boxWidth,
    headingColor,
    headingTitle,
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
        useControlLayout={useControlLayout}
        header={undefined}
        headingColor={headingColor}
        footer={footer}
        heading={
          <div className="w-full px-2 flex items-center">
            <span className="truncate" title={headingTitle}>
              {headingTitle}
            </span>
          </div>
        }
        subtitle={subtitle}
        content={content}
      />
    </div>
  );
}
