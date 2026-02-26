import MeasurementTitle from "../MeasurementTitle";
import {
  getCustomPointMeasurementName,
  type PointMeasurementEntry,
} from "@carma-mapping/engines/cesium/measurements";

interface InfoBoxMeasurementLabelTitleProps {
  measurement: PointMeasurementEntry;
  order: number;
  collapsed: boolean;
  onNameUpdate: (measurementId: string | number, name: string) => void;
  autoFocusTrigger?: number;
}

const LABEL_PLACEHOLDER_PREFIX = "Beschriftung";

export const InfoBoxMeasurementLabelTitle = ({
  measurement,
  order,
  collapsed,
  onNameUpdate,
  autoFocusTrigger,
}: InfoBoxMeasurementLabelTitleProps) => {
  const labelText = getCustomPointMeasurementName(measurement.name) ?? "";
  const compactBadge = measurement.labelAnchor?.compactContent?.trim();

  return (
    <MeasurementTitle
      key={measurement.id}
      order={order}
      title={labelText}
      shapeId={measurement.id}
      setUpdateMeasurementStatus={() => {}}
      updateTitleMeasurementById={onNameUpdate}
      isCollapsed={collapsed}
      placeholderText={`${LABEL_PLACEHOLDER_PREFIX} #${order}`}
      clearPlaceholderOnFocus
      showOrder={false}
      collapsedContent={labelText || `${LABEL_PLACEHOLDER_PREFIX} #${order}`}
      editable={true}
      capitalize={false}
      multiline={true}
      autoFocusTrigger={autoFocusTrigger}
      leadingBadgeText={compactBadge}
    />
  );
};

export default InfoBoxMeasurementLabelTitle;
