import { useState } from "react";
import { Math as CesiumMath } from "cesium";
import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { Collapse } from "antd";

import { useOblique } from "../../hooks/useOblique";
import { CardinalNames } from "../../utils/orientationUtils";
import { OBLIQUE_PREVIEW_QUALITY } from "../../constants";
import { getPreviewImageUrl } from "../../utils/imageHandling";
import { useObliqueNearestImage } from "../../hooks/useObliqueNearestImage";
import { CAMERA_ID_TO_UP_VECTOR_MATRIX_MAPPING } from "../../config";
import { ObliqueControlPanel } from "./ObliqueControlPanel";
import { computeDerivedExteriorOrientation } from "../../utils/transformExteriorOrientation";

export const ObliqueDebugSvg = () => {
  // UI state variables
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(true);
  const [showImages, setShowImages] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [offsetImages, setOffsetImages] = useState(false);
  const [isSvgCollapsed, setIsSvgCollapsed] = useState(true);

  // Slider state variables
  const [imageWidth, setImageWidth] = useState(316);
  const [imageHeight, setImageHeight] = useState(100);
  const [cropWidthFactor, setCropWidthFactor] = useState(400);
  const [cropHeightFactor, setCropHeightFactor] = useState(400);
  const [imageRotation, setImageRotation] = useState(0); // 0, 90, 180, 270 degrees
  // Core contexts and refs
  const { viewerRef } = useCesiumContext();
  const { converter, headingOffset, previewPath } = useOblique();
  const camera = viewerRef?.current?.camera;

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
  } = useObliqueNearestImage(true);

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
      x2={nearestImage.x - cameraPosition[0]}
      y2={-(nearestImage.y - cameraPosition[1])}
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
    let relX = record.x - cameraPosition[0];
    let relY = record.y - cameraPosition[1];

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
    // todo: get from exterior orientation

    const upMapping = CAMERA_ID_TO_UP_VECTOR_MATRIX_MAPPING[record.cameraId];

    if (record.derivedExtOri === undefined) {
      const derivedExtOri = computeDerivedExteriorOrientation(
        record,
        converter,
        upMapping
      );
      record.derivedExtOri = derivedExtOri;
    }

    const headingVector = record.derivedExtOri.rotation.enu.sourceCRS.direction;

    const heading = Math.atan2(headingVector[1], headingVector[0]);

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
              {record.cameraId}|{record.lineIndex}|
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

  return (
    <Collapse
      activeKey={isSvgCollapsed ? [] : ["1"]}
      onChange={() => setIsSvgCollapsed(!isSvgCollapsed)}
    >
      <Collapse.Panel
        key="1"
        header="Debug Visualization"
        style={{
          background: "rgba(255, 255, 255, 0.8)",
          borderRadius: "4px",
          overflow: "hidden",
          border: "2px solid rgba(0, 0, 0, 0.3)",
          boxShadow: "0 0 15px rgba(0, 0, 0, 0.5)",
          position: "relative", // This makes positioning context for absolute children
        }}
      >
        {/* Image Controls Panel - Overlay on top of SVG */}
        <div style={{ position: "absolute", top: "4rem", left: "1rem" }}>
          <ObliqueControlPanel
            isCollapsed={isControlsCollapsed}
            onToggleCollapse={() =>
              setIsControlsCollapsed(!isControlsCollapsed)
            }
            showImages={showImages}
            onToggleImages={() => setShowImages(!showImages)}
            showLabels={showLabels}
            onToggleLabels={() => setShowLabels(!showLabels)}
            offsetImages={offsetImages}
            onToggleOffsetImages={() => setOffsetImages(!offsetImages)}
            imageWidth={imageWidth}
            onImageWidthChange={setImageWidth}
            imageHeight={imageHeight}
            onImageHeightChange={setImageHeight}
            cropWidthFactor={cropWidthFactor}
            onCropWidthFactorChange={setCropWidthFactor}
            cropHeightFactor={cropHeightFactor}
            onCropHeightFactorChange={setCropHeightFactor}
            imageRotation={imageRotation}
            onImageRotationChange={setImageRotation}
          />
        </div>
        <svg
          width={`${svgWidth}px`}
          height={`${svgHeight}px`}
          viewBox={`${-extent} ${-extent} ${gridSize} ${gridSize}`}
          style={{
            pointerEvents: "none",
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
              <tspan>
                {String(Math.floor(cameraPosition[0])).slice(0, -4)}
              </tspan>
              <tspan fontWeight="bold">
                {String(Math.floor(cameraPosition[0])).slice(-4)}
              </tspan>
            </text>
            <text x={-10} y={140} fontSize="40" textAnchor="end">
              <tspan>
                {String(Math.floor(cameraPosition[1])).slice(0, -4)}
              </tspan>
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
      </Collapse.Panel>
    </Collapse>
  );
};

export default ObliqueDebugSvg;
