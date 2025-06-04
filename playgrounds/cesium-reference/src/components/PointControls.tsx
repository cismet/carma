import { Checkbox, Alert, Radio } from "antd";
import type { ElevationStandard } from "../hooks/useNivPPoints";

interface PointControlsProps {
  showNivPPoints: boolean;
  onShowNivPPointsChange: (checked: boolean) => void;
  elevationStandard: ElevationStandard;
  onElevationStandardChange: (standard: ElevationStandard) => void;
  includeHistoric: boolean;
  onIncludeHistoricChange: (include: boolean) => void;
  enableTerrainClick: boolean;
  onEnableTerrainClickChange: (enabled: boolean) => void;
  pointCount: number;
  nivPLoading: boolean;
  nivPError: string | null;
  currentElevationStandard: ElevationStandard;
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
  pointCount,
  nivPLoading,
  nivPError,
  currentElevationStandard,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        top: "10px",
        left: "10px",
        backgroundColor: "rgba(48, 48, 48, 0.9)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        borderRadius: "8px",
        padding: "16px",
        minWidth: "320px",
        maxWidth: "fit-content",
        color: "white",
        fontSize: "14px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        zIndex: 1000,
      }}
    >
      {/* NivP Points Section */}
      <div style={{ marginBottom: "16px" }}>
        <div
          style={{ fontWeight: "600", marginBottom: "12px", color: "#ffffff" }}
        >
          NivP Points
        </div>
        <div style={{ marginBottom: "10px" }}>
          <Checkbox
            checked={showNivPPoints}
            onChange={(e) => onShowNivPPointsChange(e.target.checked)}
            style={{ color: "white" }}
          >
            <span style={{ color: "white" }}>
              Show NivP Points ({pointCount > 0 ? pointCount : "Loading..."})
            </span>
          </Checkbox>
        </div>

        {showNivPPoints && (
          <div style={{ marginBottom: "10px", marginLeft: "24px" }}>
            <Checkbox
              checked={includeHistoric}
              onChange={(e) => onIncludeHistoricChange(e.target.checked)}
              style={{ color: "white" }}
            >
              <span style={{ color: "white" }}>Include Historic Points</span>
            </Checkbox>
            <div
              style={{ marginTop: "2px", fontSize: "11px", color: "#bfbfbf" }}
            >
              Historic points are filtered out by default
            </div>
          </div>
        )}

        {showNivPPoints && (
          <div style={{ marginBottom: "10px", marginLeft: "24px" }}>
            <div
              style={{
                marginBottom: "8px",
                fontWeight: "500",
                color: "#e6f7ff",
              }}
            >
              Elevation Standard:
            </div>
            <Radio.Group
              value={elevationStandard}
              onChange={(e) => onElevationStandardChange(e.target.value)}
              size="small"
            >
              <Radio.Button value="nhn">NHN (default)</Radio.Button>
              <Radio.Button value="nhn2016">NHN 2016</Radio.Button>
              <Radio.Button value="nn">NN</Radio.Button>
            </Radio.Group>
            <div
              style={{ marginTop: "5px", fontSize: "11px", color: "#bfbfbf" }}
            >
              Current: {currentElevationStandard.toUpperCase()} - Points update
              automatically
            </div>
          </div>
        )}

        {showNivPPoints && nivPError && (
          <div style={{ marginLeft: "24px" }}>
            <Alert
              message="Error loading NivP points"
              description={nivPError}
              type="error"
              style={{ marginBottom: "8px" }}
            />
          </div>
        )}

        {showNivPPoints && nivPLoading && (
          <div style={{ marginLeft: "24px" }}>
            <Alert
              message="Loading NivP points..."
              type="info"
              style={{ marginBottom: "8px" }}
            />
          </div>
        )}
      </div>

      {/* Terrain Click Section */}
      <div>
        <div
          style={{ fontWeight: "600", marginBottom: "12px", color: "#ffffff" }}
        >
          Terrain Elevation
        </div>
        <div style={{ marginBottom: "8px" }}>
          <Checkbox
            checked={enableTerrainClick}
            onChange={(e) => onEnableTerrainClickChange(e.target.checked)}
            style={{ color: "white" }}
          >
            <span style={{ color: "white" }}>Enable Terrain Click</span>
          </Checkbox>
        </div>
        {enableTerrainClick && (
          <div
            style={{ fontSize: "11px", color: "#bfbfbf", marginLeft: "24px" }}
          >
            Click anywhere on the terrain to see elevation.
          </div>
        )}
      </div>
    </div>
  );
};

export default PointControls;
