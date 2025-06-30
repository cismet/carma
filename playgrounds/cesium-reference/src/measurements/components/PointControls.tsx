import { Checkbox, Radio, Typography, Space, Card } from "antd";
import { ElevationStandard } from "../types/MeasurementTypes";


interface PointControlsProps {
  showNivPPoints: boolean;
  onShowNivPPointsChange: (checked: boolean) => void;
  elevationStandard: ElevationStandard;
  onElevationStandardChange: (standard: ElevationStandard) => void;
  includeHistoric: boolean;
  onIncludeHistoricChange: (include: boolean) => void;
  pointCount: number;
}

/* eslint-disable react/prop-types */
const PointControls: React.FC<PointControlsProps> = ({
  showNivPPoints,
  onShowNivPPointsChange,
  elevationStandard,
  onElevationStandardChange,
  includeHistoric,
  onIncludeHistoricChange,
  pointCount,
}) => {
  return (
    <Card size="small" title="Point Controls">
      <Checkbox
        checked={showNivPPoints}
        onChange={(e) => onShowNivPPointsChange(e.target.checked)}
      >
        Show NivP Points ({pointCount > 0 ? pointCount : "Loading..."})
      </Checkbox>
      <br />

      {showNivPPoints && (
        <Space direction="vertical" size="middle">
          <Checkbox
            checked={includeHistoric}
            onChange={(e) => onIncludeHistoricChange(e.target.checked)}
          >
            include Historic (no Elevation)
          </Checkbox>

          <Radio.Group
            value={elevationStandard}
            onChange={(e) => onElevationStandardChange(e.target.value)}
          >
            <Radio.Button value="nhn">NHN (default)</Radio.Button>
            <Radio.Button value="nhn2016">NHN 2016</Radio.Button>
            <Radio.Button value="nn">NN</Radio.Button>
          </Radio.Group>
        </Space>
      )}
    </Card>
  );
};

export default PointControls;
