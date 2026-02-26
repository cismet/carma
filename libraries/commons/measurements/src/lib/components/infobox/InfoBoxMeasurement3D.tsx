import { CarmaResponsiveInfoBox } from "@carma-commons/ui/components";

import { InfoBoxMeasurement3DContent } from "./InfoBoxMeasurement3DContent";
import { InfoBoxMeasurement3DNavigation } from "./InfoBoxMeasurement3DNavigation";
import { InfoBoxMeasurement3DSubtitle } from "./InfoBoxMeasurement3DSubtitle";
import { useInfoBoxMeasurement3DState } from "./useInfoBoxMeasurement3DState";
import "../../styles/infoBox.css";

type InfoBoxMeasurement3DProps = {
  pixelWidth?: number;
};

export function InfoBoxMeasurement3D({
  pixelWidth = 350,
}: InfoBoxMeasurement3DProps) {
  const {
    activeMeasurementTypeTitle,
    infoBoxHeaderColor,
    collapsible,
    footerProps,
    subtitleProps,
    contentProps,
  } = useInfoBoxMeasurement3DState();

  return (
    <div>
      <CarmaResponsiveInfoBox
        width={pixelWidth}
        onPanelClick={(event) => event.stopPropagation()}
        collapsible={collapsible}
        header={undefined}
        headingColor={infoBoxHeaderColor}
        footer={<InfoBoxMeasurement3DNavigation {...footerProps} />}
        heading={
          <div className="w-full px-2 flex items-center justify-between">
            <span className="truncate" title={activeMeasurementTypeTitle}>
              {activeMeasurementTypeTitle}
            </span>
          </div>
        }
        subtitle={<InfoBoxMeasurement3DSubtitle {...subtitleProps} />}
        content={<InfoBoxMeasurement3DContent {...contentProps} />}
      />
    </div>
  );
}
