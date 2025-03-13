import React, { useEffect, useState, useMemo } from "react";
import { Math as CesiumMath } from "cesium";
import { useCesiumContext } from "@carma-mapping/cesium-engine";

import { useObliqueDataContext } from "./ObliqueDataContext";
import { findNearestKObliqueImages } from "../utils/spatialIndexing";
import { ObliqueImageRecord } from "../types";
import {
  CardinalDirectionEnum,
  CardinalNames,
  getCardinalDirectionFromHeading,
  getHeadingFromCardinalDirection,
} from "../utils/orientationUtils";

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
  numImages: number;
}

export const ObliqueDebugSvg: React.FC<ObliqueDebugSvgProps> = ({
  numImages,
}) => {
  const { viewerRef } = useCesiumContext();
  const camera = viewerRef?.current?.camera;
  const { imageRecords, converter, headingOffset } = useObliqueDataContext();
  // Stores the converted coordinates of the radius point in image CRS for reference
  const [radiusPointCoords, setRadiusPointCoords] = useState<
    [number, number] | null
  >(null);
  const [sectorImages, setSectorImages] = useState<
    Array<{
      record: ObliqueImageRecord;
      distance: number;
    }>
  >([]);
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
  const [cardinalSector, setCardinalSector] =
    useState<CardinalDirectionEnum>(0);
  const [angleType] = useState<AngleType>("calculatedHeading");
  const [cameraConvention] = useState<CameraConvention>("xForward");

  // SVG dimensions
  const svgWidth = 800;
  const svgHeight = 800;
  const extent = 1500; // meters in local crs
  const gridSize = extent * 2; // meters in local crs

  // For storing the point on radius coordinates for search
  const [pointOnRadiusRef, setPointOnRadiusRef] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Effect to find images nearest to the radius point
  useEffect(() => {
    if (
      !camera?.positionCartographic ||
      !converter ||
      !imageRecords ||
      !imageRecords.length ||
      !pointOnRadiusRef
    ) {
      return;
    }

    // Get the camera position in image CRS
    const cartographic = camera.positionCartographic;
    const positionInImageCrs = converter.inverse([
      CesiumMath.toDegrees(cartographic.longitude),
      CesiumMath.toDegrees(cartographic.latitude),
      cartographic.height,
    ]);

    // Convert pointOnRadius from SVG to world coordinates
    // SVG coordinates are relative to camera position, so add offset
    const radiusPointInImageCrs: [number, number] = [
      positionInImageCrs[0] + pointOnRadiusRef.x,
      positionInImageCrs[1] - pointOnRadiusRef.y, // Y is inverted in SVG
    ];

    setRadiusPointCoords(radiusPointInImageCrs);

    // Find nearest images to the radius point
    const radiusImages = findNearestKObliqueImages(
      imageRecords,
      radiusPointInImageCrs,
      numImages
    );

    setSectorImages(radiusImages);
  }, [camera, converter, imageRecords, numImages, pointOnRadiusRef]);

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
        const cartographic = camera?.positionCartographic;
        const heading = camera?.heading;

        setCameraHeading(heading);

        const effectiveHeading = heading - headingOffset;
        const cameraCardinal =
          getCardinalDirectionFromHeading(effectiveHeading);
        setCardinalSector(cameraCardinal);

        const positionInImageCrs = converter.inverse([
          CesiumMath.toDegrees(cartographic?.longitude),
          CesiumMath.toDegrees(cartographic?.latitude),
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
  }, [viewerRef, imageRecords, converter, numImages, camera, headingOffset]);

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

  const cameraHeight = camera?.positionCartographic?.height || 0;
  const distanceOnGround = camera?.pitch
    ? cameraHeight * Math.tan(camera.pitch)
    : 0;
  const perpendicularExtent = extent;

  const pointOnGround = useMemo(
    () => ({
      x: -distanceOnGround * Math.sin(cameraHeading),
      y: distanceOnGround * Math.cos(cameraHeading),
    }),
    [distanceOnGround, cameraHeading]
  );

  const sectorHeading = useMemo(
    () => getHeadingFromCardinalDirection(cardinalSector) + headingOffset,
    [cardinalSector, headingOffset]
  );

  const pointOnRadius = useMemo(
    () => ({
      x: pointOnGround.x + distanceOnGround * Math.sin(sectorHeading),
      y: pointOnGround.y - distanceOnGround * Math.cos(sectorHeading),
    }),
    [pointOnGround.x, pointOnGround.y, distanceOnGround, sectorHeading]
  );

  useEffect(() => {
    setPointOnRadiusRef(pointOnRadius);
  }, [pointOnRadius]);

  if (!nearestImages.length) {
    return null;
  }

  const nearestImage =
    nearestImages.length > 0 ? nearestImages[0].record : null;

  const lineToNearest = nearestImage ? (
    <line
      x1={0}
      y1={0}
      x2={nearestImage.perspectiveCenter.x - cameraPosition[0]}
      y2={-(nearestImage.perspectiveCenter.y - cameraPosition[1])}
      stroke="rgba(0, 255, 0, 0.8)"
      strokeWidth={2}
      strokeDasharray="5,5"
    />
  ) : null;

  // Map image points - show images found at the radius point
  const imagePoints = sectorImages
    .slice(0, numImages)
    .filter(({ record }) => {
      // Filter out nadir images (typically have "NAD" in their ID)
      return !record.id.includes("NAD");
    })
    .map(({ record }, index) => {
      // Calculate position relative to camera position (which is now at the origin)
      const relX = record.perspectiveCenter.x - cameraPosition[0];
      const relY = record.perspectiveCenter.y - cameraPosition[1];

      // SVG Y axis is inverted
      const x = relX;
      const y = -relY;

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
          <polygon points={points} fill="none" stroke="blue" strokeWidth={3} />
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

  // Camera position marker (at the origin)
  const cameraMarker = (
    <g>
      <circle
        cx={0}
        cy={0}
        r={6}
        fill="rgba(255, 50, 50, 0.8)"
        stroke="white"
        strokeWidth={2}
      />
      <line x1={0} y1={-12} x2={0} y2={12} stroke="white" strokeWidth={2} />
      <line x1={-12} y1={0} x2={12} y2={0} stroke="white" strokeWidth={2} />
    </g>
  );

  // estimated footprint around Point of ground when looking from the current camera
  const cameraFootprintTrapezoid = (
    <polygon
      points={"-500,-300 500,-300 250,150 -250,150"}
      fill="none"
      stroke="yellow"
      strokeWidth={5}
      transform={`translate(${pointOnGround.x}, ${pointOnGround.y}) rotate(${
        (cameraHeading * 180) / Math.PI
      })`}
    />
  );

  const obliqueFootprintTrapezoid = (
    <polygon
      points={"-200,-200 200,-200 100,100 -100,100"}
      fill="none"
      stroke="red"
      strokeWidth={8}
      transform={`translate(${pointOnGround.x}, ${
        pointOnGround.y
      }) rotate(${CesiumMath.toDegrees(sectorHeading)})`}
    />
  );

  // Heading indicator
  const headingIndicator = (
    <g>
      {/* Purple heading line */}
      <line
        x1={0}
        y1={0}
        x2={pointOnGround.x}
        y2={pointOnGround.y}
        stroke="yellow"
        strokeWidth={16}
      />

      {/* Purple point on ground */}
      <circle
        cx={pointOnGround.x}
        cy={pointOnGround.y}
        r={20}
        fill="purple"
        stroke="white"
        strokeWidth={4}
      />

      {/* Search Radius for best Camera Position */}
      <circle
        cx={pointOnGround.x}
        cy={pointOnGround.y}
        r={Math.abs(distanceOnGround)}
        fill="none"
        stroke="purple"
        strokeWidth={8}
      />

      {/* current cardinal direction from point on ground */}
      <line
        x1={pointOnGround.x}
        y1={pointOnGround.y}
        x2={pointOnRadius.x}
        y2={pointOnRadius.y}
        stroke="purple"
        strokeWidth={8}
      />

      {/* Purple point on radius */}
      <circle
        cx={pointOnRadius.x}
        cy={pointOnRadius.y}
        r={20}
        fill="purple"
        stroke="white"
        strokeWidth={4}
      />

      {/* Sector heading line */}

      {cameraFootprintTrapezoid}
      {obliqueFootprintTrapezoid}

      {/* Blue perpendicular line */}
      <line
        x1={-perpendicularExtent * Math.sin(-cameraHeading + Math.PI / 2)}
        y1={-perpendicularExtent * Math.cos(-cameraHeading + Math.PI / 2)}
        x2={perpendicularExtent * Math.sin(-cameraHeading + Math.PI / 2)}
        y2={perpendicularExtent * Math.cos(-cameraHeading + Math.PI / 2)}
        stroke="rgba(0, 0, 255, 0.5)"
        strokeWidth={8}
      />
    </g>
  );

  return (
    <>
      {/**
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
      */}
      <svg
        width={`${svgWidth}px`}
        height={`${svgHeight}px`}
        viewBox={`${-extent} ${-extent} ${gridSize} ${gridSize}`}
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
        {lineToNearest}
        {imagePoints}
        {cameraMarker}
        {headingIndicator}
        <text x={-10} y={40} fontSize="40" textAnchor="end">
          Camera
        </text>
        <text x={-10} y={90} fontSize="40" textAnchor="end">
          <tspan>{String(Math.floor(cameraPosition[0])).slice(0, -4)}</tspan>
          <tspan fontWeight="bold">
            {String(Math.floor(cameraPosition[0])).slice(-4)}
          </tspan>
        </text>
        <text x={-10} y={140} fontSize="40" textAnchor="end">
          <tspan>{String(Math.floor(cameraPosition[1])).slice(0, -4)}</tspan>
          <tspan fontWeight="bold">
            {String(Math.floor(cameraPosition[1])).slice(-4)}
          </tspan>
        </text>
        <text x={-extent + 50} y={extent - 50} fontSize="50">
          Heading: {((cameraHeading * 180) / Math.PI).toFixed(1)}°
        </text>
        <text x={-extent + 50} y={extent - 120} fontSize="40">
          Sector Images: {sectorImages.length}
        </text>
        <text x={-extent + 50} y={extent - 180} fontSize="40">
          Current Sector: {cardinalSector} (
          {CardinalNames["EN"].get(cardinalSector)})
        </text>
        <text x={-extent + 50} y={extent - 240} fontSize="40">
          Heading Offset: {((headingOffset * 180) / Math.PI).toFixed(1)}°
        </text>

        {/* Yellow line to reference point */}
        <line
          x1={0}
          y1={0}
          x2={pointOnRadius.x}
          y2={pointOnRadius.y}
          stroke="rgba(255, 255, 0, 0.6)"
          strokeWidth={2}
          strokeDasharray="5,5"
        />

        {/* Yellow reference point marker with coordinates */}
        <circle
          cx={pointOnRadius.x}
          cy={pointOnRadius.y}
          r={10}
          fill="rgba(255, 255, 0, 0.8)"
          stroke="white"
          strokeWidth={2}
        />
        <text
          x={pointOnRadius.x - 10}
          y={pointOnRadius.y + 40}
          textAnchor="end"
          fontSize="40"
        >
          Reference
        </text>
        <text
          x={pointOnRadius.x - 10}
          y={pointOnRadius.y + 90}
          fontSize="40"
          textAnchor="end"
        >
          <tspan>
            {radiusPointCoords
              ? String(Math.floor(radiusPointCoords[0])).slice(0, -4)
              : ""}
          </tspan>
          <tspan fontWeight="bold">
            {radiusPointCoords
              ? String(Math.floor(radiusPointCoords[0])).slice(-4)
              : ""}
          </tspan>
        </text>
        <text
          x={pointOnRadius.x - 10}
          y={pointOnRadius.y + 140}
          fontSize="40"
          textAnchor="end"
        >
          <tspan>
            {radiusPointCoords
              ? String(Math.floor(radiusPointCoords[1])).slice(0, -4)
              : ""}
          </tspan>
          <tspan fontWeight="bold">
            {radiusPointCoords
              ? String(Math.floor(radiusPointCoords[1])).slice(-4)
              : ""}
          </tspan>
        </text>
      </svg>
    </>
  );
};

export default ObliqueDebugSvg;
