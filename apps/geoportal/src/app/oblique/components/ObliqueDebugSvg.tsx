import React, { useEffect, useState } from "react";
import { Math as CesiumMath } from "cesium";
import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { Select, Card, Space } from "antd";

import { useObliqueDataContext } from "./ObliqueDataContext";
import { findNearestKObliqueImages } from "../utils/spatialIndexing";
import { ObliqueImageRecord } from "../types";

type AngleType = "kappa" | "omega" | "phi" | "calculatedHeading";

// Camera coordinate system conventions
type CameraConvention =
  | "default"
  | "xForward"
  | "yForward"
  | "zUp"
  | "yUp"
  | "xUp";

interface ObliqueDebugSvgProps {
  numImages?: number;
}

export const ObliqueDebugSvg: React.FC<ObliqueDebugSvgProps> = ({
  numImages = 80,
}) => {
  const { viewerRef } = useCesiumContext();
  const { imageRecords, converter } = useObliqueDataContext();
  const [nearestImages, setNearestImages] = useState<
    Array<{
      record: ObliqueImageRecord;
      distance: number;
    }>
  >([]);
  const [cameraPosition, setCameraPosition] = useState<[number, number]>([
    0, 0,
  ]);
  const [cameraHeading, setCameraHeading] = useState<number>(0);
  const [angleType, setAngleType] = useState<AngleType>("calculatedHeading");
  const [cameraConvention, setCameraConvention] =
    useState<CameraConvention>("xForward");

  // SVG dimensions
  const svgWidth = 400;
  const svgHeight = 400;
  const gridSize = 400;

  useEffect(() => {
    if (
      !viewerRef.current ||
      !imageRecords ||
      !imageRecords.length ||
      !converter
    ) {
      return;
    }

    const handleCameraChange = () => {
      try {
        const camera = viewerRef.current.camera;
        const cartographic = camera.positionCartographic;
        const heading = camera.heading;

        setCameraHeading(heading);

        const positionInImageCrs = converter.inverse([
          CesiumMath.toDegrees(cartographic.longitude),
          CesiumMath.toDegrees(cartographic.latitude),
          cartographic.height,
        ]);

        setCameraPosition([positionInImageCrs[0], positionInImageCrs[1]]);

        const images = findNearestKObliqueImages(
          imageRecords,
          [positionInImageCrs[0], positionInImageCrs[1]],
          numImages
        );

        setNearestImages(images);
      } catch (error) {
        console.error("Error finding nearest oblique images:", error);
      }
    };

    // Initial calculation
    handleCameraChange();

    // Set up camera movement listener
    const removeListener =
      viewerRef.current.camera.changed.addEventListener(handleCameraChange);

    return () => {
      removeListener();
    };
  }, [viewerRef, imageRecords, converter, numImages]);

  const handleAngleTypeChange = (value: AngleType) => {
    setAngleType(value);
  };

  const handleCameraConventionChange = (value: CameraConvention) => {
    setCameraConvention(value);
  };

  // Function to calculate heading with fixed sign combination and camera convention
  const calculateCustomHeading = (record: ObliqueImageRecord): number => {
    if (!record.orientation) return 0;

    const { omega, phi, kappa } = record.orientation;

    // Calculate rotation matrix elements
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const sinKappa = Math.sin(kappa);
    const cosKappa = Math.cos(kappa);

    // Calculate rotation matrix elements based on convention
    let r31, r32;

    switch (cameraConvention) {
      case "xForward": // X-axis forward, Z-up
        // Rotation matrix with X-axis as forward direction
        r31 = sinPhi;
        r32 = -sinOmega * cosPhi;
        break;
      case "yForward": // Y-axis forward, Z-up
        // Rotation matrix with Y-axis as forward direction
        r31 = -sinOmega * cosPhi;
        r32 = -sinPhi;
        break;
      case "zUp": // Z-axis up, X-forward (common in photogrammetry)
        // This is the default photogrammetry convention
        r31 = sinKappa * sinOmega + cosKappa * sinPhi * cosOmega;
        r32 = cosKappa * sinOmega + sinKappa * sinPhi * cosOmega;
        break;
      case "yUp": // Y-axis up, Z-forward
        // Rotation matrix with Y-axis as up direction
        r31 = sinKappa * cosOmega - cosKappa * sinPhi * sinOmega;
        r32 = cosKappa * cosOmega + sinKappa * sinPhi * sinOmega;
        break;
      case "xUp": // X-axis up, Z-forward
        // Rotation matrix with X-axis as up direction
        r31 = cosKappa * cosPhi;
        r32 = sinKappa * cosPhi;
        break;
      case "default":
      default:
        // Standard photogrammetry convention (Z-up)
        r31 = sinKappa * sinOmega + cosKappa * sinPhi * cosOmega;
        r32 = cosKappa * sinOmega + sinKappa * sinPhi * cosOmega;
        break;
    }

    // Apply fixed sign combination: r31 = +1, r32 = -1
    const customR31 = r31;
    const customR32 = -r32;

    // Calculate heading with fixed signs
    const heading = Math.atan2(customR32, customR31);

    // Normalize to [0, 2π)
    return ((heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  };

  if (!nearestImages.length) {
    return null;
  }

  // Calculate grid bounds
  const halfGrid = gridSize / 2;
  const minX = cameraPosition[0] - halfGrid;
  const maxX = cameraPosition[0] + halfGrid;
  const minY = cameraPosition[1] - halfGrid;
  const maxY = cameraPosition[1] + halfGrid;

  // Create grid lines
  const gridLines = [];
  const gridStep = gridSize / 10;

  // Vertical grid lines
  for (let i = 0; i <= 10; i++) {
    const x = i * gridStep;
    gridLines.push(
      <line
        key={`v-${i}`}
        x1={x}
        y1={0}
        x2={x}
        y2={gridSize}
        stroke="rgba(200, 200, 200, 0.5)"
        strokeWidth={1}
      />
    );
  }

  // Horizontal grid lines
  for (let i = 0; i <= 10; i++) {
    const y = i * gridStep;
    gridLines.push(
      <line
        key={`h-${i}`}
        x1={0}
        y1={y}
        x2={gridSize}
        y2={y}
        stroke="rgba(200, 200, 200, 0.5)"
        strokeWidth={1}
      />
    );
  }

  // Get the nearest image for drawing the line
  const nearestImage =
    nearestImages.length > 0 ? nearestImages[0].record : null;

  // Line to nearest image
  const lineToNearest = nearestImage ? (
    <line
      x1={halfGrid}
      y1={halfGrid}
      x2={
        halfGrid +
        (nearestImage.perspectiveCenter.x - cameraPosition[0]) *
          (gridSize / (2 * halfGrid))
      }
      y2={
        halfGrid -
        (nearestImage.perspectiveCenter.y - cameraPosition[1]) *
          (gridSize / (2 * halfGrid))
      }
      stroke="rgba(0, 255, 0, 0.8)"
      strokeWidth={2}
      strokeDasharray="5,5"
    />
  ) : null;

  // Map image points - show images on both sides
  const imagePoints = nearestImages
    .slice(0, numImages)
    .filter(({ record }) => {
      // Filter out nadir images (typically have "NAD" in their ID)
      return !record.id.includes("NAD");
    })
    .map(({ record, distance }, index) => {
      // Calculate position relative to the grid
      const relX = record.perspectiveCenter.x - cameraPosition[0];
      const relY = record.perspectiveCenter.y - cameraPosition[1];

      // Scale to fit in our SVG
      const scale = gridSize / (2 * halfGrid);
      const x = halfGrid + relX * scale;
      const y = halfGrid - relY * scale; // Flip Y for SVG coords

      // Get the selected angle based on angleType
      let heading: number;
      switch (angleType) {
        case "kappa":
          heading = record.orientation.kappa;
          break;
        case "omega":
          heading = record.orientation.omega;
          break;
        case "phi":
          heading = record.orientation.phi;
          break;
        case "calculatedHeading":
        default:
          // Use custom heading calculation with fixed sign combination
          heading = calculateCustomHeading(record);
          break;
      }

      // Calculate color based on distance (closer = more opaque)
      const maxDistance =
        nearestImages[nearestImages.length - 1]?.distance || 1;
      const opacity = Math.max(0.2, 1 - distance / maxDistance);

      // Triangle size - 3x larger
      const triangleSize = 24;

      // Calculate triangle points
      // Tip at image position
      const tipX = x;
      const tipY = y;

      // Base points perpendicular to heading direction
      const baseAngle = heading + Math.PI; // Point base in direction of heading
      const perpAngle = baseAngle + Math.PI / 2; // Perpendicular to base

      // Left base point
      const leftX =
        tipX +
        triangleSize * Math.sin(baseAngle) +
        (triangleSize / 2) * Math.sin(perpAngle);
      const leftY =
        tipY -
        triangleSize * Math.cos(baseAngle) -
        (triangleSize / 2) * Math.cos(perpAngle);

      // Right base point
      const rightX =
        tipX +
        triangleSize * Math.sin(baseAngle) -
        (triangleSize / 2) * Math.sin(perpAngle);
      const rightY =
        tipY -
        triangleSize * Math.cos(baseAngle) +
        (triangleSize / 2) * Math.cos(perpAngle);

      // Create polygon points string
      const points = `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;

      return (
        <g key={record.id}>
          <polygon
            points={points}
            fill="none"
            stroke={`rgba(0, 100, 255, ${opacity})`}
            strokeWidth={2}
          />
          {index < 10 && (
            <text
              x={x + 10}
              y={y + 4}
              fontSize="10"
              fill="white"
              stroke="black"
              strokeWidth={0.5}
              paintOrder="stroke"
            >
              {index + 1}
            </text>
          )}
        </g>
      );
    });

  // Camera position marker (center of the grid)
  const cameraMarker = (
    <g>
      <circle
        cx={halfGrid}
        cy={halfGrid}
        r={6}
        fill="rgba(255, 50, 50, 0.8)"
        stroke="white"
        strokeWidth={2}
      />
      <line
        x1={halfGrid}
        y1={halfGrid - 12}
        x2={halfGrid}
        y2={halfGrid + 12}
        stroke="white"
        strokeWidth={2}
      />
      <line
        x1={halfGrid - 12}
        y1={halfGrid}
        x2={halfGrid + 12}
        y2={halfGrid}
        stroke="white"
        strokeWidth={2}
      />
    </g>
  );

  // Heading indicator
  const headingIndicator = (
    <g>
      {/* Purple heading line */}
      <line
        x1={halfGrid}
        y1={halfGrid}
        x2={halfGrid + 50 * Math.sin(cameraHeading)}
        y2={halfGrid - 50 * Math.cos(cameraHeading)}
        stroke="purple"
        strokeWidth={2}
      />

      {/* Blue perpendicular line */}
      <line
        x1={halfGrid - 200 * Math.sin(cameraHeading + Math.PI / 2)}
        y1={halfGrid + 200 * Math.cos(cameraHeading + Math.PI / 2)}
        x2={halfGrid + 200 * Math.sin(cameraHeading + Math.PI / 2)}
        y2={halfGrid - 200 * Math.cos(cameraHeading + Math.PI / 2)}
        stroke="rgba(0, 0, 255, 0.5)"
        strokeWidth={2}
      />
    </g>
  );

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "60px",
          zIndex: 2001,
          width: "200px",
          background: "rgba(255, 255, 255, 0.8)",
          padding: "10px",
          borderRadius: "4px",
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select
            style={{ width: "100%" }}
            value={angleType}
            onChange={handleAngleTypeChange}
            options={[
              { value: "calculatedHeading", label: "Heading" },
              { value: "kappa", label: "Kappa" },
              { value: "omega", label: "Omega" },
              { value: "phi", label: "Phi" },
            ]}
          />

          {angleType === "calculatedHeading" && (
            <Card
              size="small"
              title="Camera Coordinate System"
              style={{ marginTop: "10px" }}
            >
              <Select
                style={{ width: "100%" }}
                value={cameraConvention}
                onChange={handleCameraConventionChange}
                options={[
                  { value: "xForward", label: "X-Forward, Z-up" },
                  { value: "default", label: "Default (Z-up)" },
                  { value: "yForward", label: "Y-Forward, Z-up" },
                  { value: "zUp", label: "Z-up, X-forward" },
                  { value: "yUp", label: "Y-up, Z-forward" },
                  { value: "xUp", label: "X-up, Z-forward" },
                ]}
              />
            </Card>
          )}
        </Space>
      </div>
      <svg
        width={`${svgWidth}px`}
        height={`${svgHeight}px`}
        viewBox={`0 0 ${gridSize} ${gridSize}`}
        style={{
          position: "absolute",
          top: "10px",
          left: "60px", // Position with 60px left space
          pointerEvents: "none",
          background: "rgba(255, 255, 255, 0.5)",
          borderRadius: "4px",
          overflow: "hidden",
          zIndex: 2000,
          mixBlendMode: "normal",
          marginTop: "180px", // Adjusted space for controls
        }}
      >
        {gridLines}
        {lineToNearest}
        {imagePoints}
        {cameraMarker}
        {headingIndicator}
        <text
          x="10"
          y={gridSize - 10}
          fontSize="12"
          fill="black"
          stroke="white"
          strokeWidth={0.5}
          paintOrder="stroke"
        >
          Heading: {((cameraHeading * 180) / Math.PI).toFixed(1)}°
        </text>
      </svg>
    </>
  );
};

export default ObliqueDebugSvg;
