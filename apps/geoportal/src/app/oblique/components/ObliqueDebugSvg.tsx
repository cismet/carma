import React, { useState } from "react";
import { Math as CesiumMath } from "cesium";
import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { Slider } from "antd";
import { styled } from "styled-components";

import { useObliqueDataContext } from "../../oblique/hooks/useObliqueDataContext";
import { CardinalNames } from "../utils/orientationUtils";
import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import { getPreviewImageUrl } from "../utils/imageHandling";
import { calculateCustomHeading as calculateHeadingForRecord } from "../utils/obliqueReferenceUtils";
import { useNearestObliqueImage } from "../hooks/useNearestObliqueImage";
import { NUM_NEAREST_IMAGES } from "../config";

const SvgContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10000;
  pointer-events: none;
`;

interface ControlPanelProps {
  isCollapsed: boolean;
}

const ControlPanel = styled.div<ControlPanelProps>`
  position: fixed;
  top: 10px;
  left: 60px;
  width: 300px;
  background: rgba(255, 255, 255, 0.9);
  padding: 15px;
  border-radius: 8px;
  z-index: 10001;
  pointer-events: all;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  overflow: hidden;
  max-height: ${(props) => (props.isCollapsed ? "42px" : "500px")};
`;

const SliderGroup = styled.div`
  margin-bottom: 15px;
  padding-top: 5px;

  .ant-slider-track {
    background-color: #1890ff;
  }

  .ant-slider-handle {
    border-color: #1890ff;
  }
`;

const SliderLabel = styled.div`
  color: #333;
  margin-bottom: 5px;
  display: flex;
  justify-content: space-between;
  font-weight: 500;
`;

const SliderValue = styled.span`
  color: #1890ff;
  font-weight: bold;
`;

interface ControlButtonProps {
  primary?: boolean;
}

const ControlButton = styled.button<ControlButtonProps>`
  background: ${(props) => (props.primary ? "#1890ff" : "white")};
  color: ${(props) => (props.primary ? "white" : "#333")};
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 4px 8px;
  margin-right: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.015);

  &:hover {
    background: ${(props) => (props.primary ? "#40a9ff" : "#f5f5f5")};
    border-color: ${(props) => (props.primary ? "#40a9ff" : "#d9d9d9")};
  }

  &:active {
    background: ${(props) => (props.primary ? "#096dd9" : "#e6e6e6")};
  }
`;

const ControlHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  cursor: pointer;
`;

const ControlTitle = styled.div`
  font-weight: bold;
  color: #333;
`;

const ButtonRow = styled.div`
  display: flex;
  margin-bottom: 10px;
`;

export const ObliqueDebugSvg = () => {
  // UI state variables
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [offsetImages, setOffsetImages] = useState(false);

  // Slider state variables
  const [imageWidth, setImageWidth] = useState(316);
  const [imageHeight, setImageHeight] = useState(100);
  const [cropWidthFactor, setCropWidthFactor] = useState(400);
  const [cropHeightFactor, setCropHeightFactor] = useState(400);
  const [imageRotation, setImageRotation] = useState(0); // 0, 90, 180, 270 degrees
  // Core contexts and refs
  const { viewer } = useCesiumContext();
  const {
    imageRecords,
    converter,
    headingOffset,
    previewPath,
    footprintCenterpointsRBushByCardinals,
  } = useObliqueDataContext();
  const camera = viewer.camera;

  // Use enhanced hook for camera and image calculations
  const {
    cameraPosition,
    cameraHeading,
    cardinalSector,
    radiusPointCoords,
    pointOnGround,
    pointOnRadius,
    sectorHeading,
    nearestImages,
  } = useNearestObliqueImage(
    imageRecords || null,
    converter,
    headingOffset,
    footprintCenterpointsRBushByCardinals,
    {
      k: NUM_NEAREST_IMAGES,
      debounceTime: 150,
    }
  );

  // SVG dimensions
  const svgWidth = 800;
  const svgHeight = 800;
  const extent = 1500; // meters in local crs
  const gridSize = extent * 2; // meters in local crs
  const perpendicularExtent = extent;

  // Camera properties
  const cameraHeight = camera?.positionCartographic?.height || 0;
  const distanceOnGround = camera?.pitch
    ? cameraHeight * Math.tan(camera.pitch)
    : 0;

  // No additional filtering needed - we'll directly use the nearest images
  // which are already filtered in the useEffect

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
      stroke="green"
      strokeWidth={20}
      strokeDasharray="20,20"
    />
  ) : null;

  // Map image points - show images found at the radius point
  const imagePoints = nearestImages.map(({ record }, index) => {
    // Check if this is the nearest image
    const isNearest = nearestImage && record.id === nearestImage.id;
    // Calculate position relative to camera position (which is now at the origin)
    let relX = record.perspectiveCenter.x - cameraPosition[0];
    let relY = record.perspectiveCenter.y - cameraPosition[1];

    // Apply translation based on sector heading if enabled
    if (offsetImages && pointOnGround) {
      // Calculate the distance from reference point to ground point
      const refToGroundDistance = Math.sqrt(
        pointOnGround.x * pointOnGround.x + pointOnGround.y * pointOnGround.y
      );

      // Calculate translation vector components based on sector heading
      // but using the magnitude of the reference-to-ground distance
      const translateX = refToGroundDistance * Math.sin(sectorHeading);
      const translateY = refToGroundDistance * Math.cos(sectorHeading);

      // Apply the translation
      relX += translateX;
      relY += translateY;
    }

    // SVG Y axis is inverted
    const x = relX;
    const y = -relY;

    // Use custom heading calculation with fixed sign combination
    const heading = calculateHeadingForRecord(
      record.orientation ? record.orientation : { omega: 0, phi: 0, kappa: 0 }
    );

    // We now use a simpler arrow representation with the path element
    // No need for complex triangle calculations

    return (
      <g key={record.id}>
        {/* Show images only when showImages is true */}
        {showImages && (
          <g transform={`rotate(${(heading * 180) / Math.PI} ${x} ${y})`}>
            <svg
              x={x - (record.sector % 2 === 0 ? imageWidth : imageHeight) / 2}
              y={y - (record.sector % 2 === 0 ? imageHeight : imageWidth) / 2}
              width={`${record.sector % 2 === 0 ? imageWidth : imageHeight}px`}
              height={`${record.sector % 2 === 0 ? imageHeight : imageWidth}px`}
              overflow="hidden"
              preserveAspectRatio="xMidYMid meet"
            >
              <g
                transform={`rotate(${imageRotation} ${
                  (record.sector % 2 === 0 ? imageWidth : imageHeight) / 2
                } ${(record.sector % 2 === 0 ? imageHeight : imageWidth) / 2})`}
              >
                <image
                  href={getPreviewImageUrl(
                    previewPath,
                    OBLIQUE_PREVIEW_QUALITY.LEVEL_5,
                    record.id
                  )}
                  x={`-${(cropWidthFactor - 100) / 2}%`}
                  y={`-${(cropHeightFactor - 100) / 2}%`}
                  width={`${cropWidthFactor}%`}
                  height={`${cropHeightFactor}%`}
                  preserveAspectRatio="xMidYMid slice"
                />
              </g>
            </svg>
          </g>
        )}

        {/* Arrow marker always visible */}
        <g transform={`rotate(${(heading * 180) / Math.PI - 90} ${x} ${y})`}>
          <path
            d={`M ${x} ${y - 30} L ${x - 15} ${y + 15} L ${x} ${y + 5} L ${
              x + 15
            } ${y + 15} Z`}
            fill={isNearest ? "yellow" : "grey"}
            stroke={isNearest ? "black" : "none"}
            strokeWidth={isNearest ? 4 : 2}
          />
        </g>

        {/* Labels independent of images - no rotation */}
        {showLabels && (
          <g>
            {/* Label background */}
            <rect
              x={x - 100}
              y={y - 25}
              width="200"
              height="50"
              fill="white"
              fillOpacity="0.9"
              stroke="black"
              strokeWidth="1"
              rx="3"
              ry="3"
            />

            {/* Main label */}
            <text
              x={x}
              y={y}
              fontSize="40"
              fill="black"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {record.cameraId}|{record.lineNumber}|
              {CardinalNames[record.sector]}
            </text>

            {/* ID text for nearest image - with separate background */}
            {isNearest && (
              <>
                <rect
                  x={x - 50}
                  y={y - 80}
                  width="100"
                  height="30"
                  fill="white"
                  fillOpacity="0.9"
                  stroke="black"
                  strokeWidth="1"
                  rx="3"
                  ry="3"
                />
                <text
                  x={x}
                  y={y - 65}
                  fontSize="30"
                  fill="black"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {record.id}
                </text>
              </>
            )}

            {/* Index number - with separate background */}
            {index < 10 && (
              <>
                <rect
                  x={x + 38}
                  y={y - 22}
                  width="25"
                  height="25"
                  fill="white"
                  fillOpacity="0.9"
                  stroke="black"
                  strokeWidth="1"
                  rx="3"
                  ry="3"
                />
                <text
                  x={x + 50}
                  y={y - 15}
                  fontSize="30"
                  fill="black"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {index + 1}
                </text>
              </>
            )}
          </g>
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
        strokeWidth={2}
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
        stroke="grey"
        strokeWidth={2}
      />
    </g>
  );

  const renderControls = () => (
    <ControlPanel isCollapsed={isControlsCollapsed}>
      <ControlHeader
        onClick={() => setIsControlsCollapsed(!isControlsCollapsed)}
      >
        <ControlTitle>
          Image Controls {isControlsCollapsed ? "▾" : "▴"}
        </ControlTitle>
      </ControlHeader>

      {!isControlsCollapsed && (
        <>
          <ButtonRow>
            <ControlButton
              primary={showImages}
              onClick={() => setShowImages(!showImages)}
            >
              {showImages ? "Hide Images" : "Show Images"}
            </ControlButton>
            <ControlButton
              primary={showLabels}
              onClick={() => setShowLabels(!showLabels)}
            >
              {showLabels ? "Hide Labels" : "Show Labels"}
            </ControlButton>
            <ControlButton
              primary={offsetImages}
              onClick={() => setOffsetImages(!offsetImages)}
            >
              {offsetImages
                ? "Center on Ground Points"
                : "Center on Capture Points"}
            </ControlButton>
          </ButtonRow>

          <SliderGroup>
            <SliderLabel>
              <span>Image Width</span>
              <SliderValue>{imageWidth}px</SliderValue>
            </SliderLabel>
            <Slider
              min={64}
              max={400}
              value={imageWidth}
              onChange={(value) => setImageWidth(value as number)}
            />
          </SliderGroup>

          <SliderGroup>
            <SliderLabel>
              <span>Image Height</span>
              <SliderValue>{imageHeight}px</SliderValue>
            </SliderLabel>
            <Slider
              min={64}
              max={400}
              value={imageHeight}
              onChange={(value) => setImageHeight(value as number)}
            />
          </SliderGroup>

          <SliderGroup>
            <SliderLabel>
              <span>Crop Width Factor</span>
              <SliderValue>{cropWidthFactor}%</SliderValue>
            </SliderLabel>
            <Slider
              min={100}
              max={800}
              value={cropWidthFactor}
              onChange={(value) => setCropWidthFactor(value as number)}
            />
          </SliderGroup>

          <SliderGroup>
            <SliderLabel>
              <span>Crop Height Factor</span>
              <SliderValue>{cropHeightFactor}%</SliderValue>
            </SliderLabel>
            <Slider
              min={100}
              max={800}
              value={cropHeightFactor}
              onChange={(value) => setCropHeightFactor(value as number)}
            />
          </SliderGroup>

          <div style={{ marginTop: "15px", marginBottom: "5px" }}>
            <SliderLabel>
              <span>Image Rotation</span>
            </SliderLabel>

            <div
              style={{
                display: "flex",
                justifyContent: "space-around",
                marginTop: "8px",
              }}
            >
              {[0, 90, 180, 270].map((angle) => (
                <div
                  key={angle}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    id={`rotation-${angle}`}
                    name="imageRotation"
                    value={angle}
                    checked={imageRotation === angle}
                    onChange={() => setImageRotation(angle)}
                    style={{ cursor: "pointer" }}
                  />
                  <label
                    htmlFor={`rotation-${angle}`}
                    style={{ marginLeft: "4px", cursor: "pointer" }}
                  >
                    {angle}°
                  </label>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </ControlPanel>
  );

  return (
    <SvgContainer>
      {renderControls()}
      <svg
        width={`${svgWidth}px`}
        height={`${svgHeight}px`}
        viewBox={`${-extent} ${-extent} ${gridSize} ${gridSize}`}
        style={{
          position: "fixed",
          top: "60px",
          left: "60px",
          pointerEvents: "none",
          background: "rgba(255, 255, 255, 0.8)",
          borderRadius: "4px",
          overflow: "hidden",
          border: "2px solid rgba(0, 0, 0, 0.3)",
          boxShadow: "0 0 15px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Chart elements that stay fixed regardless of centering */}
        <text x={-extent + 50} y={extent - 50} fontSize="50">
          Heading: {((cameraHeading * 180) / Math.PI).toFixed(1)}°
        </text>
        <text x={-extent + 50} y={extent - 120} fontSize="40">
          Images: {nearestImages.length}
        </text>
        <text x={-extent + 50} y={extent - 180} fontSize="40">
          Current Sector: {cardinalSector} (
          {CardinalNames["EN"].get(cardinalSector)})
        </text>
        <text x={-extent + 50} y={extent - 300} fontSize="40" fill="red">
          Images Filtered By Sector
        </text>
        <text x={-extent + 50} y={extent - 240} fontSize="40">
          Heading Offset: {((headingOffset * 180) / Math.PI).toFixed(1)}°
        </text>

        {/* Main chart group with conditional centering on ground point */}
        <g
          transform={
            offsetImages
              ? `translate(${-pointOnGround.x}, ${-pointOnGround.y})`
              : ""
          }
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
        </g>

        {/* Preview of selected image in lower right */}
        {nearestImage && (
          <g transform={`translate(${extent - 650}, ${extent - 650})`}>
            <rect
              x={0}
              y={0}
              width="600"
              height="600"
              fill="white"
              stroke="black"
              strokeWidth="2"
            />
            <image
              href={getPreviewImageUrl(
                previewPath,
                OBLIQUE_PREVIEW_QUALITY.LEVEL_5,
                nearestImage.id
              )}
              x={0}
              y={0}
              width="600"
              height="600"
              preserveAspectRatio="xMidYMid meet"
            />
            <rect
              x={0}
              y={600}
              width="600"
              height="50"
              fill="white"
              stroke="black"
              strokeWidth="1"
            />
            <text
              x={300}
              y={630}
              fontSize="30"
              fill="black"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              ID: {nearestImage.id}
            </text>
          </g>
        )}
      </svg>
    </SvgContainer>
  );
};

export default ObliqueDebugSvg;
