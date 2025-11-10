import { useState, useEffect } from "react";
import { Card, Slider } from "antd";
import type { CesiumWidget } from "@carma/cesium";
import { PixelResolutionVis } from "./PixelResolutionVis";

interface FovControlProps {
  cesiumWidget: CesiumWidget | null;
}

// Calculate pixel resolution at center and edge
//
// Generic formula for any ground point at distance d from center C:
//   c = sqrt(h² + d²)                         // Right triangle: camera height h, ground distance d
//   pixel_res = (2 * c * tan(fovy/2)) / height
//
// This single formula works for all points because the right triangle (h, d, c)
// inherently encodes the oblique viewing angle. No second triangle needed - the
// h-c relationship captures both distance and angle effects.
const calculatePixelResolutions = (
  bufferSize: { width: number; height: number },
  fovDegrees: number,
  cameraElevation: number
) => {
  const { width, height } = bufferSize;

  // Calculate aspect ratio and vertical FOV
  const aspectRatio = width / height;
  const fovRadians = (fovDegrees * Math.PI) / 180;
  const fovy =
    aspectRatio <= 1
      ? fovRadians
      : Math.atan(Math.tan(fovRadians * 0.5) / aspectRatio) * 2.0;

  // Center pixel resolution: d=0, so c=h (nadir view)
  const centerPixelResolution =
    (2 * cameraElevation * Math.tan(fovy / 2)) / height;

  // Edge pixel resolution: d=r (distance to edge midpoint)
  // Calculate ground distances covered by FOV at camera height
  const halfHeight = cameraElevation * Math.tan(fovy / 2);
  const halfWidth = halfHeight * aspectRatio;

  // Distance to middle of longer edge (what FOV actually defines)
  let distanceToEdge: number; // This is 'r' in the triangle
  if (aspectRatio > 1) {
    // Wide viewport - fov is horizontal, edge is at halfWidth distance
    distanceToEdge = Math.sqrt(
      Math.pow(cameraElevation, 2) + Math.pow(halfWidth, 2)
    );
  } else {
    // Tall viewport - fov is vertical, edge is at halfHeight distance
    distanceToEdge = Math.sqrt(
      Math.pow(cameraElevation, 2) + Math.pow(halfHeight, 2)
    );
  }

  // Apply the same formula with c = sqrt(h² + r²)
  // The oblique angle is inherent in c - no second triangle construction needed
  const groundHeightAtEdge = 2 * distanceToEdge * Math.tan(fovy / 2);
  const edgePixelResolution = groundHeightAtEdge / height;

  return { centerPixelResolution, edgePixelResolution };
};

// Viewport & Buffer Visualization Component
const ViewportBufferVisualization = ({
  viewportSize,
  bufferSize,
  fovDegrees,
  cameraElevation,
}: {
  viewportSize: { width: number; height: number };
  bufferSize: { width: number; height: number };
  fovDegrees: number;
  cameraElevation: number | null;
}) => {
  // Guard against zero dimensions
  if (bufferSize.width === 0 || bufferSize.height === 0 || !cameraElevation) {
    return (
      <div>
        <div
          style={{
            fontSize: "11px",
            color: "#666",
            marginBottom: "8px",
            textAlign: "center",
          }}
        >
          Pixel Resolution
        </div>
        <div
          style={{
            width: "120px",
            height: "90px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
            fontSize: "10px",
          }}
        >
          Initializing...
        </div>
        <div
          style={{
            fontSize: "10px",
            color: "#666",
            marginTop: "4px",
            textAlign: "center",
          }}
        >
          Waiting for camera data...
        </div>
      </div>
    );
  }

  // Calculate pixel resolutions
  const { centerPixelResolution, edgePixelResolution } =
    calculatePixelResolutions(bufferSize, fovDegrees, cameraElevation);

  return (
    <PixelResolutionVis
      bufferSize={bufferSize}
      centerPixelResolution={centerPixelResolution}
      edgePixelResolution={edgePixelResolution}
      cameraElevation={cameraElevation}
    />
  );
};

// FOV Cone Visualization Component
const FovConeVisualization = ({
  fovDegrees,
  cameraElevation,
  bufferSize,
}: {
  fovDegrees: number;
  cameraElevation: number | null;
  bufferSize: { width: number; height: number };
}) => {
  const fovRadians = (fovDegrees * Math.PI) / 180;
  const halfFovWidth = Math.tan(fovRadians / 2) * 65;

  // Calculate r in display pixels (half of viewport width or height depending on aspect)
  const aspectRatio = bufferSize.width / bufferSize.height;
  const rPixels =
    aspectRatio > 1
      ? Math.round(bufferSize.width / 2) // Wide: half width
      : Math.round(bufferSize.height / 2); // Tall: half height

  return (
    <div>
      <div
        style={{
          fontSize: "11px",
          color: "#666",
          marginBottom: "8px",
          textAlign: "center",
        }}
      >
        FOV Cone
      </div>
      <svg width="80" height="90" viewBox="10 0 90 90">
        {/* Ground line - only right side */}
        <line
          x1="30"
          y1="80"
          x2="90"
          y2="80"
          stroke="#8c8c8c"
          strokeWidth="2"
        />

        {/* Camera point */}
        <circle cx="30" cy="15" r="2" fill="#1677ff" />

        {/* FOV cone - right half, solid line */}
        <line
          x1="30"
          y1="15"
          x2={30 + halfFovWidth}
          y2="80"
          stroke="#722ed1"
          strokeWidth="2"
        />

        {/* Center line (height) */}
        <line
          x1="30"
          y1="15"
          x2="30"
          y2="80"
          stroke="#1677ff"
          strokeWidth="2"
        />

        {/* Height label h */}
        <text
          x="20"
          y="47"
          fill="#666"
          fontSize="10"
          fontFamily="monospace"
          textAnchor="end"
        >
          h
        </text>

        {/* FOV angle label */}
        <text
          x="30"
          y="10"
          fill="#722ed1"
          fontSize="10"
          fontFamily="monospace"
          textAnchor="middle"
        >
          {fovDegrees.toFixed(0)}°
        </text>

        {/* Ground radius line (r) */}
        <line
          x1="30"
          y1="80"
          x2={30 + halfFovWidth}
          y2="80"
          stroke="#722ed1"
          strokeWidth="2"
        />

        {/* r label on ground */}
        <text
          x={30 + halfFovWidth / 2}
          y="76"
          fill="#722ed1"
          fontSize="10"
          fontFamily="monospace"
          textAnchor="middle"
        >
          r
        </text>

        {/* c label on hypotenuse */}
        <text
          x={30 + halfFovWidth / 2 + 8}
          y="47"
          fill="#722ed1"
          fontSize="10"
          fontFamily="monospace"
          textAnchor="start"
        >
          c
        </text>

        {/* Center point on ground - C */}
        <circle cx="30" cy="80" r="2" fill="#1677ff" />
        <text
          x="30"
          y="88"
          fill="#1677ff"
          fontSize="8"
          fontFamily="monospace"
          textAnchor="middle"
        >
          C
        </text>

        {/* Edge point on ground - E */}
        <circle cx={30 + halfFovWidth} cy="80" r="2" fill="#722ed1" />
        <text
          x={30 + halfFovWidth}
          y="88"
          fill="#722ed1"
          fontSize="8"
          fontFamily="monospace"
          textAnchor="middle"
        >
          E
        </text>
      </svg>
    </div>
  );
};

export const FovControl = ({ cesiumWidget }: FovControlProps) => {
  const [fovDegrees, setFovDegrees] = useState<number>(60);
  const [viewportSize, setViewportSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });
  const [bufferSize, setBufferSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });
  const [cameraElevation, setCameraElevation] = useState<number | null>(null);

  const handleFovChange = (value: number) => {
    setFovDegrees(Math.round(value * 10) / 10);
    if (cesiumWidget?.camera?.frustum && "fov" in cesiumWidget.camera.frustum) {
      (cesiumWidget.camera.frustum as any).fov = value * (Math.PI / 180);
      cesiumWidget.scene.requestRender();
    }
  };

  // Update viewport, buffer sizes, and camera elevation when widget changes
  useEffect(() => {
    if (!cesiumWidget?.scene) return;

    const updateMetrics = () => {
      if (!cesiumWidget?.scene) return;

      const canvas = cesiumWidget.scene.canvas;
      setViewportSize({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      });
      setBufferSize({
        width: cesiumWidget.scene.drawingBufferWidth,
        height: cesiumWidget.scene.drawingBufferHeight,
      });

      const camera = cesiumWidget.camera;
      setCameraElevation(camera.positionCartographic.height);

      // Update FOV from camera frustum
      if (camera.frustum && "fov" in camera.frustum) {
        const currentFov = (camera.frustum as any).fov * (180 / Math.PI);
        setFovDegrees(currentFov);
      }
    };

    // Initial update
    updateMetrics();

    // Listen to camera changes
    const cameraChangedHandler = () => {
      updateMetrics();
    };

    cesiumWidget.scene.camera.changed.addEventListener(cameraChangedHandler);

    // Listen to canvas resize to update container dimensions
    const resizeObserver = new ResizeObserver(() => {
      updateMetrics();
    });

    // Observe the canvas element directly
    resizeObserver.observe(cesiumWidget.scene.canvas);

    return () => {
      cesiumWidget.scene.camera.changed.removeEventListener(
        cameraChangedHandler
      );
      resizeObserver.disconnect();
    };
  }, [cesiumWidget]);

  // Calculate values for display
  const aspectRatio = bufferSize.width / bufferSize.height;
  const rPixels =
    aspectRatio > 1
      ? Math.round(bufferSize.width / 2)
      : Math.round(bufferSize.height / 2);

  const fovRadians = (fovDegrees * Math.PI) / 180;
  const cDistance = cameraElevation
    ? Math.sqrt(
        Math.pow(cameraElevation, 2) +
          Math.pow(cameraElevation * Math.tan(fovRadians / 2), 2)
      )
    : 0;

  const { centerPixelResolution, edgePixelResolution } =
    cameraElevation && bufferSize.width > 0
      ? calculatePixelResolutions(bufferSize, fovDegrees, cameraElevation)
      : { centerPixelResolution: 0, edgePixelResolution: 0 };

  return (
    <div
      style={{
        position: "absolute",
        top: "16px",
        right: "16px",
        zIndex: 1000,
      }}
    >
      <Card size="small" style={{ width: "auto" }}>
        {/* FOV Slider */}
        <div style={{ marginBottom: "12px" }}>
          <div
            style={{ marginBottom: "4px", fontSize: "12px", fontWeight: 600 }}
          >
            FOV: {fovDegrees}°
          </div>
          <Slider
            min={10}
            max={120}
            value={fovDegrees}
            onChange={handleFovChange}
            tooltip={{ formatter: (value) => `${value}°` }}
          />
        </div>

        {/* Visualizations side-by-side */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "space-between",
          }}
        >
          {/* Pixel Resolution Visualization */}
          <ViewportBufferVisualization
            viewportSize={viewportSize}
            bufferSize={bufferSize}
            fovDegrees={fovDegrees}
            cameraElevation={cameraElevation}
          />

          {/* FOV Cone Visualization */}
          <FovConeVisualization
            fovDegrees={fovDegrees}
            cameraElevation={cameraElevation}
            bufferSize={bufferSize}
          />
        </div>

        {/* Combined values section */}
        <div
          style={{
            marginTop: "12px",
            paddingTop: "12px",
            borderTop: "1px solid #d9d9d9",
            fontSize: "9px",
            color: "#666",
            lineHeight: "1.6",
            fontFamily: "monospace",
            display: "flex",
            gap: "16px",
          }}
        >
          <div>
            <div>
              <span style={{ color: "#1677ff" }}>C</span> ={" "}
              <span style={{ fontWeight: 600 }}>
                {centerPixelResolution.toFixed(3)}
              </span>
              m/px
            </div>
            <div>
              <span style={{ color: "#722ed1" }}>E</span> ={" "}
              <span style={{ fontWeight: 600 }}>
                {edgePixelResolution.toFixed(3)}
              </span>
              m/px
            </div>
          </div>
          <div>
            <div>r = {rPixels}px</div>
            <div>c = {Math.round(cDistance)}m</div>
          </div>
          <div style={{ color: "#999" }}>
            @ h = {cameraElevation ? Math.round(cameraElevation) : "—"}m
          </div>
        </div>
      </Card>
    </div>
  );
};
