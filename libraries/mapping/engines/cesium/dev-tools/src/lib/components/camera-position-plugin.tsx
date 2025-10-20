import React, { useState, useEffect } from "react";
import { createPlugin, useInputContext, LevaInputProps } from "leva/plugin";
import type { Camera } from "@carma/cesium";
import { Cartographic, Ellipsoid } from "@carma/cesium";

// Type definitions
type CameraPositionSettings = { showECEF?: boolean };
type CameraPositionValue = Camera | null;
type CameraPositionInput = { camera: Camera | null; showECEF?: boolean };

type CameraPositionProps = LevaInputProps<
  CameraPositionValue,
  CameraPositionSettings,
  CameraPositionValue
>;

// Component that renders camera position info
function CameraPositionComponent() {
  const props = useInputContext<CameraPositionProps>();
  const camera = props.value;
  const showECEF = props.settings?.showECEF || false;

  const [, forceUpdate] = useState(0);

  // Force re-render when camera changes
  useEffect(() => {
    if (!camera || !camera.changed) return;

    const handleCameraChange = () => {
      forceUpdate((prev) => prev + 1);
    };

    camera.changed.addEventListener(handleCameraChange);
    return () => {
      if (camera.changed) {
        camera.changed.removeEventListener(handleCameraChange);
      }
    };
  }, [camera]);

  if (!camera) {
    return (
      <div style={{ padding: "8px", color: "#999", fontSize: "12px" }}>
        Camera not available
      </div>
    );
  }

  // Get Cartesian position (always available)
  const cartesianPos = camera.position;

  // Compute Cartographic from Cartesian
  let position;
  try {
    if (cartesianPos) {
      position = Cartographic.fromCartesian(cartesianPos, Ellipsoid.WGS84);
    } else {
      position = camera.positionCartographic;
    }
  } catch (e) {
    position = camera.positionCartographic;
  }

  // Get orientation from camera (already in radians) - convert to degrees
  // These are readonly computed properties from the camera's direction/up/right vectors
  const heading =
    camera.heading !== undefined
      ? (camera.heading * (180 / Math.PI) + 360) % 360
      : 0;
  const pitch = camera.pitch !== undefined ? camera.pitch * (180 / Math.PI) : 0;
  const roll = camera.roll !== undefined ? camera.roll * (180 / Math.PI) : 0;

  // Compact value formatting
  const formatLarge = (val: number) => {
    if (Math.abs(val) > 1000000) return (val / 1000000).toFixed(2) + "M";
    if (Math.abs(val) > 1000) return (val / 1000).toFixed(2) + "k";
    return val.toFixed(2);
  };

  return (
    <div style={{ padding: "4px 0", fontSize: "11px" }}>
      {/* 2-column grid layout */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}
      >
        {/* Left column: Position */}
        <div>
          <div
            style={{
              color: "#aaa",
              fontSize: "10px",
              marginBottom: "4px",
              fontWeight: 500,
            }}
          >
            {showECEF ? "ECEF" : "WGS84"}
          </div>

          {/* Position values - 3 lines */}
          {showECEF ? (
            <>
              <div style={{ color: "#999", fontSize: "10px" }}>
                X:{" "}
                <span style={{ color: "#fff", fontFamily: "monospace" }}>
                  {formatLarge(cartesianPos?.x || 0)}m
                </span>
              </div>
              <div style={{ color: "#999", fontSize: "10px" }}>
                Y:{" "}
                <span style={{ color: "#fff", fontFamily: "monospace" }}>
                  {formatLarge(cartesianPos?.y || 0)}m
                </span>
              </div>
              <div style={{ color: "#999", fontSize: "10px" }}>
                Z:{" "}
                <span style={{ color: "#fff", fontFamily: "monospace" }}>
                  {formatLarge(cartesianPos?.z || 0)}m
                </span>
              </div>
            </>
          ) : position ? (
            <>
              <div style={{ color: "#999", fontSize: "10px" }}>
                Lat:{" "}
                <span style={{ color: "#fff", fontFamily: "monospace" }}>
                  {((position.latitude * 180) / Math.PI).toFixed(5)}°
                </span>
              </div>
              <div style={{ color: "#999", fontSize: "10px" }}>
                Lng:{" "}
                <span style={{ color: "#fff", fontFamily: "monospace" }}>
                  {((position.longitude * 180) / Math.PI).toFixed(5)}°
                </span>
              </div>
              <div style={{ color: "#999", fontSize: "10px" }}>
                Alt:{" "}
                <span style={{ color: "#fff", fontFamily: "monospace" }}>
                  {formatLarge(position.height)}m
                </span>
              </div>
            </>
          ) : (
            <div style={{ color: "#999", fontSize: "10px" }}>N/A</div>
          )}
        </div>

        {/* Right column: Orientation */}
        <div>
          <div
            style={{
              color: "#aaa",
              fontSize: "10px",
              marginBottom: "4px",
              fontWeight: 500,
            }}
          >
            Orientation
          </div>
          <div style={{ color: "#999", fontSize: "10px" }}>
            H:{" "}
            <span style={{ color: "#fff", fontFamily: "monospace" }}>
              {heading.toFixed(1)}°
            </span>
          </div>
          <div style={{ color: "#999", fontSize: "10px" }}>
            P:{" "}
            <span style={{ color: "#fff", fontFamily: "monospace" }}>
              {pitch.toFixed(1)}°
            </span>
          </div>
          <div style={{ color: "#999", fontSize: "10px" }}>
            R:{" "}
            <span style={{ color: "#fff", fontFamily: "monospace" }}>
              {roll.toFixed(1)}°
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Plugin configuration
const normalize = (input: CameraPositionInput) => {
  return {
    value: input.camera,
    settings: { showECEF: input.showECEF || false },
  };
};

const sanitize = (value: CameraPositionValue): CameraPositionValue => {
  return value;
};

const format = (value: CameraPositionValue): CameraPositionValue => {
  return value;
};

// Create and export the plugin
export const cameraPosition = createPlugin({
  normalize,
  sanitize,
  format,
  component: CameraPositionComponent,
});
