import React from "react";
import { Slider, Button, Typography, Tabs } from "antd";
import type { TabsProps } from "antd";
import "../styles/cesium-ref-styles.css";
import "./InteractiveModeTabs.css";

const { Paragraph } = Typography;

export interface InteractiveModeTabsProps {
  enableMeasurement: boolean;
  setEnableMeasurement: (enabled: boolean) => void;
  enableTerrainClick: boolean;
  onEnableTerrainClickChange: (enabled: boolean) => void;
  searchRadius: number;
  onSearchRadiusChange: (radius: number) => void;
  clearMeasurements: () => void;
  hasAnyMeasurementEntities: boolean;
  measurementCount: number;
}

const InteractiveModeTabs: React.FC<InteractiveModeTabsProps> = ({
  enableMeasurement,
  setEnableMeasurement,
  enableTerrainClick,
  onEnableTerrainClickChange,
  searchRadius,
  onSearchRadiusChange,
  clearMeasurements,
  hasAnyMeasurementEntities,
  measurementCount,
}) => {
  const getActiveTab = () => {
    if (enableMeasurement) return "measurement";
    if (enableTerrainClick) return "elevation";
    return "elevation";
  };

  const handleTabChange = (activeKey: string) => {
    onEnableTerrainClickChange(false);
    setEnableMeasurement(false);

    switch (activeKey) {
      case "elevation":
        onEnableTerrainClickChange(true);
        break;
      case "measurement":
        setEnableMeasurement(true);
        break;
    }
  };

  const interactiveTabItems: TabsProps["items"] = [
    {
      key: "elevation",
      label: "3D Point Query",
      children: (
        <div className="interactive-tabs-content">
          <Paragraph className="tab-paragraph">Click anywhere on the terrain to see elevation.</Paragraph>
          <Paragraph className="tab-paragraph">Search Radius: {searchRadius}m</Paragraph>
          <Slider
            min={5}
            max={50}
            value={searchRadius}
            onChange={onSearchRadiusChange}
            step={5}
            tooltip={{ formatter: (value) => `${value}m` }}
          />
          <Paragraph className="tab-paragraph">
            Marker size and search range for nearby NivP points.
          </Paragraph>
        </div>
      ),
    },
    {
      key: "measurement",
      label: "Distance Measurement",
      children: (
        <div className="interactive-tabs-content">
          <Paragraph className="tab-paragraph">
            Left click to add points, right click or double click to finish.
          </Paragraph>
          <div className="measurement-controls">
            <Button
              type="primary"
              danger
              size="small"
              onClick={clearMeasurements}
              disabled={!hasAnyMeasurementEntities}
            >
              Clear Measurements
            </Button>
            {measurementCount > 0 && (
              <Paragraph style={{ margin: 0 }}>
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
    <div className="panel-base interactive-tabs">
      <Tabs
        activeKey={getActiveTab()}
        onChange={handleTabChange}
        items={interactiveTabItems}
        size="small"
        className="interactive-tabs-content"
      />
    </div>
  );
};

export default InteractiveModeTabs;
