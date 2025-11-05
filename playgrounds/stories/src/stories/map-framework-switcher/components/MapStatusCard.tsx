import { Card, Tag, Statistic } from "antd";
import type { Scene } from "@carma/cesium";
import type { Map as LeafletMap } from "leaflet";
import type { TransitionStage } from "@carma-mapping/engines-interop";

interface MapStatusCardProps {
  cesiumScene: Scene | null;
  leafletMap: LeafletMap | null;
  activeFramework: "leaflet" | "cesium";
  cesiumResolutionScale: number;
  cesiumContainer: HTMLElement | null;
  devicePixelRatio: number;
  // Transition props
  currentStage: TransitionStage | null;
  lastZoom: number | null;
  lastDistance: number | null;
  lastTerrainHeight: number | null;
  currentFOV: number | null;
}

export const MapStatusCard = ({
  cesiumScene,
  activeFramework,
  cesiumResolutionScale,
  cesiumContainer,
  devicePixelRatio,
}: MapStatusCardProps) => {
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
          <Tag color={activeFramework === "cesium" ? "blue" : "green"}>
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
      </Card>
    </div>
  );
};
