import { useRef } from "react";
import { Math as CesiumMath } from "cesium";
import type { Vector3Arr } from "@carma-commons/types";

const CESIUM_DEBUG_AXIS_COLORS = {
  // https://cesium.com/learn/cesiumjs/ref-doc/DebugModelMatrixPrimitive.html
  // https://github.com/CesiumGS/cesium/blob/main/packages/engine/Source/Core/Color.js
  x: "#ff0000", // Red
  y: "#00ff00", // Green
  z: "#0000ff", // Blue
};

interface UnitVectorDisplayProps {
  // Current XY components with Z component
  vector: Vector3Arr;
  // Control size
  baseSize?: number;
}

export const UnitVectorDisplay: React.FC<UnitVectorDisplayProps> = ({
  vector,
  baseSize = 240,
}: UnitVectorDisplayProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const [x, y, z] = vector;

  // Center coordinates and radius
  const padding = 10;
  const unitRadius = baseSize / 2 - padding;
  const fontSize = 10;

  // extended Layout
  const zInputWidth = unitRadius;
  const zInputOriginX = unitRadius * 2 + padding;

  const totalWidth = baseSize + zInputWidth + padding * 2;

  const axisColor = "#ccc";
  const labelColor = "#666";
  const knobColor = "yellow";
  const knobStrokeColor = "#333";
  const knobStrokeWidth = 1;

  const axisWidth = 0.5;
  const unitCircleWidth = 1;
  const componentLineWidth = 4;
  const knobRadius = padding * 0.5;

  // naively mix red and green by they component values
  // This is not a real color mixing, but a simple way to visualize the XY vector
  const xyVectorColor = `RGB(${Math.abs(x) * 255}, ${Math.abs(y) * 255}, 0 )`;
  const xyzVectorColor = `RGB(${Math.abs(x) * 255}, ${Math.abs(y) * 255}, ${
    Math.abs(z) * 255
  })`;

  const xyMagnitude = Math.sqrt(x * x + y * y);

  const magnitude = Math.sqrt(x * x + y * y + z * z);

  const radius = unitRadius * xyMagnitude;

  // Calculate angle for display
  const angle = Math.atan2(x, y);
  const angleDeg = CesiumMath.toDegrees(angle);

  // Position on circle to draw marker
  // For display in SVG, we need to flip the Y coordinate back since SVG's Y axis points down

  const pointX = x * unitRadius;
  const pointY = -y * unitRadius; // Negative sign to flip back for SVG
  const pointZ = -z * unitRadius; // For Display Z is mapped to SVG Y-Axis here too

  return (
    <div style={{ marginBottom: 16 }}>
      x: {x.toFixed(4)}, y: {y.toFixed(4)}, z: {z.toFixed(4)}
      <br />
      M: {magnitude.toFixed(2)}, Mxy: {xyMagnitude.toFixed(2)}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 8,
          userSelect: "none",
        }}
      >
        <svg
          ref={svgRef}
          width={totalWidth}
          height={baseSize}
          style={{ touchAction: "none" }}
          viewBox={` ${Math.round(-baseSize / 2)}  ${Math.round(
            -baseSize / 2
          )} ${totalWidth} ${baseSize}`}
        >
          {/* Unit circle */}
          <circle
            r={unitRadius}
            stroke={axisColor}
            strokeWidth={unitCircleWidth}
            fill="none"
          />
          {/* XY circle */}
          <circle
            r={radius}
            stroke={axisColor}
            strokeWidth={axisWidth}
            fill="none"
          />
          {/* X axis */}
          <line
            x1={-unitRadius}
            x2={unitRadius}
            stroke={axisColor}
            strokeWidth={axisWidth}
          />
          {/* Y axis */}
          <line
            x1={0}
            y1={-unitRadius}
            x2={0}
            y2={unitRadius}
            stroke={axisColor}
            strokeWidth={axisWidth}
          />
          {/* Cardinal points */}
          <text
            textAnchor="middle"
            x={unitRadius - fontSize * 2}
            y={fontSize / 4}
            fontSize={fontSize}
            fill={labelColor}
          >
            +x
          </text>
          <text
            textAnchor="middle"
            x={-unitRadius + fontSize * 2}
            y={fontSize / 4}
            fontSize={fontSize}
            fill={labelColor}
          >
            -x
          </text>
          <text
            textAnchor="middle"
            y={-unitRadius + fontSize * 2}
            fontSize={fontSize}
            fill={labelColor}
          >
            y
          </text>
          <text
            textAnchor="middle"
            x={0}
            y={unitRadius - fontSize * 1}
            fontSize={fontSize}
            fill={labelColor}
          >
            -y
          </text>
          {/* Angle display */}
          <text
            textAnchor="end"
            x={fontSize * 1.5}
            y={unitRadius * 0.5}
            fontSize={fontSize}
            fill={labelColor}
          >
            {angleDeg.toFixed(2)}°
          </text>
          {/* X component line */}
          <line
            x2={pointX}
            stroke={CESIUM_DEBUG_AXIS_COLORS.x}
            strokeWidth={componentLineWidth}
          />
          {/* Y component line */}
          <line
            y2={pointY}
            stroke={CESIUM_DEBUG_AXIS_COLORS.y}
            strokeWidth={componentLineWidth}
          />
          {/* Direction line */}{" "}
          <line
            x1={0}
            y1={0}
            x2={pointX}
            y2={pointY}
            stroke={xyVectorColor}
            strokeWidth={componentLineWidth}
          />
          {/* Point marker */}
          <circle
            cx={pointX}
            cy={pointY}
            r={knobRadius}
            stroke={knobStrokeColor}
            strokeWidth={knobStrokeWidth}
            fill={knobColor}
          />
          {/* Z value display */}
          {/* Z axis */}
          <line
            x1={zInputOriginX}
            x2={zInputOriginX}
            y1={-unitRadius}
            y2={unitRadius}
            stroke={axisColor}
            strokeWidth={axisWidth}
          />
          {/* XY axis */}
          <line
            x1={zInputOriginX - unitRadius}
            x2={zInputOriginX + unitRadius}
            y1={0}
            y2={0}
            stroke={axisColor}
            strokeWidth={axisWidth}
          />
          <text
            textAnchor="middle"
            x={zInputOriginX - unitRadius + fontSize * 2}
            y={fontSize / 4}
            fontSize={fontSize}
            fill={labelColor}
          >
            xy
          </text>
          <text
            textAnchor="middle"
            x={zInputOriginX}
            y={-unitRadius + fontSize * 2}
            fontSize={fontSize}
            fill={labelColor}
          >
            +z
          </text>
          <text
            textAnchor="middle"
            x={zInputOriginX}
            y={unitRadius - fontSize * 1}
            fontSize={fontSize}
            fill={labelColor}
          >
            -z
          </text>
          <circle
            cx={zInputOriginX}
            cy={0}
            r={unitRadius}
            strokeWidth={unitCircleWidth}
            stroke={axisColor}
            fill="none"
          />
          {/* Z component line */}
          <line
            x1={zInputOriginX}
            x2={zInputOriginX}
            y1={0}
            y2={pointZ}
            stroke={CESIUM_DEBUG_AXIS_COLORS.z}
            strokeWidth="4"
          />
          {/* XY component line */}
          <line
            x1={zInputOriginX}
            x2={zInputOriginX - radius}
            y1={0}
            y2={0}
            stroke={xyVectorColor}
            strokeWidth="4"
          />
          {/* XYZ component line */}
          <line
            x1={zInputOriginX}
            x2={zInputOriginX - radius}
            y1={0}
            y2={pointZ}
            stroke={xyzVectorColor}
            strokeWidth="4"
          />
          <circle
            cx={zInputOriginX - radius}
            cy={pointZ}
            r={knobRadius}
            fill={knobColor}
          />
        </svg>
      </div>
    </div>
  );
};

export default UnitVectorDisplay;
