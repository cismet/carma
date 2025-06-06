import {
  Checkbox,
  Radio,
  Slider,
  Button,
  ConfigProvider,
  theme,
  Typography,
  Tabs,
  Space,
} from "antd";
import type { ElevationStandard } from "../hooks/useNivPPoints";
import "../styles/cesium-ref-styles.css";

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
  hasAnyMeasurementEntities: boolean;
}

/* eslint-disable react/prop-types */
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
  hasAnyMeasurementEntities,
}) => {
  const getActiveTab = () => {
    if (enableMeasurement) return "measurement";
    if (enableTerrainClick) return "elevation";
    return "elevation";
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
        <div>
          <div>
            <Paragraph>
              Click anywhere on the terrain to see elevation.
            </Paragraph>
          </div>

          <div>
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
        <div>
          <div>
            <Paragraph>
              Left click to add points, right click or double click to finish.
            </Paragraph>
          </div>

          <div>
            <Button
              type="primary"
              danger
              size="small"
              onClick={onClearMeasurements}
              disabled={!hasAnyMeasurementEntities}
            >
              Clear Measurements
            </Button>
            {measurementCount > 0 && (
              <Paragraph style={{ display: "inline", marginLeft: "8px" }}>
                ({measurementCount} completed measurement
                {measurementCount !== 1 ? "s" : ""})
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
      <div className="panel-base panel-top-left">
        {/* Elevation Control Points Section - Always visible at top */}
        <div style={{ marginBottom: "1rem" }}>
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

        <div
          style={{
            margin: "8px 0",
            borderTop: "1px solid rgba(255, 255, 255, 0.15)",
          }}
        />

        {/* Interactive Tools Section - Tabbed interface */}
        <div>
          <Tabs
            activeKey={getActiveTab()}
            onChange={handleTabChange}
            items={interactiveTabItems}
            size="small"
          />
        </div>
      </div>
    </ConfigProvider>
  );
};

export default PointControls;
