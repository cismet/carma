import { Card, Tag, Statistic } from "antd";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

interface MapStatusCardProps {
  lastZoom?: number | null;
  lastDistance?: number | null;
  lastTerrainHeight?: number | null;
  currentFOV?: number | null;
}

export const MapStatusCard = ({
  lastZoom,
  lastDistance,
  lastTerrainHeight,
  currentFOV,
}: MapStatusCardProps = {}) => {
  const { activeFramework, isCesium, refs } = useMapFrameworkSwitcherContext();

  // Get refs from context
  const cesiumScene = refs.getCesiumScene();
  const cesiumContainer = refs.getCesiumContainer();
  const cesiumResolutionScale = refs.getResolutionScale() ?? 1;
  const devicePixelRatio = window.devicePixelRatio;
  return (
    <div
      style={{
        position: "absolute",
        bottom: "16px",
        left: "16px",
        zIndex: 1000,
      }}
    >
      {/* Main Status Card */}
      <Card size="small">
        <div style={{ marginBottom: "8px" }}>
          <strong>Active Framework</strong>{" "}
          <Tag color={isCesium ? "blue" : "green"}>
            {activeFramework.toUpperCase()}
          </Tag>
        </div>

        {/* Cesium Section */}
        <div
          style={{
            marginBottom: "12px",
            paddingTop: "8px",
            borderTop: "1px solid #f0f0f0",
          }}
        >
          <div style={{ marginBottom: "8px" }}>
            <strong>Cesium</strong>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginBottom: "8px",
              flexWrap: "wrap",
            }}
          >
            <Tag color={cesiumContainer ? "green" : "red"}>
              {cesiumContainer ? "✓ Container" : "✗ Container"}
            </Tag>
            <Tag color={cesiumScene ? "green" : "red"}>
              {cesiumScene ? "✓ Widget" : "✗ Widget"}
            </Tag>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <Statistic
              title="Buffer Size"
              value={`${cesiumScene?.drawingBufferWidth || 0}×${
                cesiumScene?.drawingBufferHeight || 0
              }`}
              valueStyle={{ fontSize: "16px" }}
            />
            <Statistic
              title="DPR"
              value={
                devicePixelRatio % 1 === 0
                  ? devicePixelRatio
                  : devicePixelRatio.toFixed(2)
              }
              valueStyle={{ fontSize: "16px" }}
            />
            <Statistic
              title="Scale"
              value={
                cesiumResolutionScale % 1 === 0
                  ? cesiumResolutionScale
                  : cesiumResolutionScale.toFixed(2)
              }
              valueStyle={{ fontSize: "16px" }}
            />
          </div>
        </div>

        {/* Last Transition Metrics */}
        {(lastZoom !== null ||
          lastDistance !== null ||
          lastTerrainHeight !== null ||
          currentFOV !== null) && (
          <div
            style={{
              paddingTop: "8px",
              borderTop: "1px solid #f0f0f0",
            }}
          >
            <div style={{ marginBottom: "8px" }}>
              <strong>Last Transition</strong>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {lastZoom !== null && lastZoom !== undefined && (
                <Tag color="cyan">Zoom {lastZoom.toFixed(1)}</Tag>
              )}
              {lastDistance !== null && lastDistance !== undefined && (
                <Tag color="cyan">Dist {lastDistance.toFixed(0)}m</Tag>
              )}
              {lastTerrainHeight !== null &&
                lastTerrainHeight !== undefined && (
                  <Tag color="cyan">Ground {lastTerrainHeight.toFixed(1)}m</Tag>
                )}
              {currentFOV !== null && currentFOV !== undefined && (
                <Tag color="cyan">FOV {currentFOV.toFixed(1)}°</Tag>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
