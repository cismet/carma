import {
  Checkbox,
  Radio,
  Slider,
  Button,
  ConfigProvider,
  theme,
  Typography,
  Tabs,
  Divider,
  Space,
} from "antd";
import type { ElevationStandard } from "../hooks/useNivPPoints";
import "./PointControls.css";

const { Title, Paragraph } = Typography;

interface PointControlsProps {
  showNivPPoints: boolean;
  onShowNivPPointsChange: (checked: boolean) => void;
  elevationStandard: ElevationStandard;
  onElevationStandardChange: (standard: ElevationStandard) => void;
  includeHistoric: boolean;
  onIncludeHistoricChange: (include: boolean) => void;
  enableTerrainClick: boolean;
  onEnableTerrainClickChange: (enabled: boolean) => void;
  searchRadius: number;
  onSearchRadiusChange: (radius: number) => void;
  pointCount: number;
  // Measurement props
  enableMeasurement: boolean;
  onEnableMeasurementChange: (enabled: boolean) => void;
  onClearMeasurements: () => void;
  measurementCount: number;
}

const PointControls: React.FC<PointControlsProps> = ({
  showNivPPoints,
  onShowNivPPointsChange,
  elevationStandard,
  onElevationStandardChange,
  includeHistoric,
  onIncludeHistoricChange,
  enableTerrainClick,
  onEnableTerrainClickChange,
  searchRadius,
  onSearchRadiusChange,
  pointCount,
  // Measurement props
  enableMeasurement,
  onEnableMeasurementChange,
  onClearMeasurements,
  measurementCount,
}) => {
  // Determine which tab should be active based on enabled modes (only for the two interactive modes)
  const getActiveTab = () => {
    if (enableMeasurement) return "measurement";
    if (enableTerrainClick) return "elevation";
    return "elevation"; // Default to elevation tab
  };

  const handleTabChange = (activeKey: string) => {
    // Disable all interactive modes first
    onEnableTerrainClickChange(false);
    onEnableMeasurementChange(false);

    // Enable the selected mode
    switch (activeKey) {
      case "elevation":
        onEnableTerrainClickChange(true);
        break;
      case "measurement":
        onEnableMeasurementChange(true);
        break;
    }
  };

  const interactiveTabItems = [
    {
      key: "elevation",
      label: "3D Point Query",
      children: (
        <div className="section-content">
          <div className="control-item">
            <Paragraph>
              Click anywhere on the terrain to see elevation.
            </Paragraph>
          </div>

          <div className="control-item">
            <Paragraph>Search Radius: {searchRadius}m</Paragraph>
            <Slider
              min={5}
              max={50}
              value={searchRadius}
              onChange={onSearchRadiusChange}
              step={5}
              tooltip={{ formatter: (value) => `${value}m` }}
            />
            <Paragraph>
              Marker size and search range for nearby NivP points
            </Paragraph>
          </div>
        </div>
      ),
    },
    {
      key: "measurement",
      label: "Distance Measurement",
      children: (
        <div className="section-content">
          <div className="control-item">
            <Paragraph>
              Left click to add points, right click or double click to finish.
            </Paragraph>
          </div>

          <div className="control-item">
            <Button
              type="primary"
              danger
              size="small"
              onClick={onClearMeasurements}
              disabled={measurementCount === 0}
            >
              Clear Measurements
            </Button>
            {measurementCount > 0 && (
              <Paragraph style={{ display: "inline", marginLeft: "8px" }}>
                ({measurementCount} measurement entities)
              </Paragraph>
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
      }}
    >
      <div className="point-controls">
        {/* Elevation Control Points Section - Always visible at top */}
        <section className="elevation-points-section">
          <Title level={3}>Elevation Control Points</Title>

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
        </section>
        <Divider />

        {/* Interactive Tools Section - Tabbed interface */}
        <section className="interactive-tools-section">
          <Tabs
            activeKey={getActiveTab()}
            onChange={handleTabChange}
            items={interactiveTabItems}
            size="small"
          />
        </section>
      </div>
    </ConfigProvider>
  );
};

export default PointControls;
