import { memo } from "react";
import {
  Checkbox,
  Radio,
  Typography,
  Space,
} from "antd";
import type { ElevationStandard } from "../hooks/useNivPData";
import "../styles/cesium-ref-styles.css";

const { Title } = Typography;

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
const PointControls: React.FC<PointControlsProps> = memo(({
  showNivPPoints,
  onShowNivPPointsChange,
  elevationStandard,
  onElevationStandardChange,
  includeHistoric,
  onIncludeHistoricChange,
  pointCount,
}) => {
  return (
    <div className="panel-base">
      <Title
        level={3}
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "rgba(255, 255, 255, 0.7)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: "8px",
        }}
      >
        Elevation Control Points
      </Title>

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
    </div>
  );
});

export default PointControls;
