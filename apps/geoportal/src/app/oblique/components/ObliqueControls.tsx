import React, { useCallback, useRef, useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { styled, createGlobalStyle } from "styled-components";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotateLeft,
  faRotateRight,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { Tooltip, Image as AntdImage } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import {
  HeadingPitchRange,
  Math as CesiumMath,
  Cartesian3,
  Cartographic,
  Matrix4,
  EasingFunction,
  Entity,
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  ConstantPositionProperty,
  sampleTerrainMostDetailed,
  PerspectiveFrustum,
} from "cesium";

import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useFeatureFlags } from "@carma-apps/portals";

import { getObliqueMode } from "../../store/slices/ui";
import { useObliqueDataContext } from "../hooks/useObliqueDataContext";
import { useOrbitPoint } from "../hooks/useOrbitPoint";

import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import { getPreviewImageUrl } from "../utils/imageHandling";
import { ObliqueFootprintLayer } from "./ObliqueFootprintLayer";
import { ObliqueDebugSvg } from "./ObliqueDebugSvg";
import { ObliqueImageInfo } from "./ObliqueImageInfo";
import {
  subscribeToPreviewVisibility,
  notifyPreviewVisibilityChange,
} from "../utils/previewVisibility";
import { getDirectionFromCartesian } from "../utils/orientationUtils";
import { FOV_SCALE_FACTOR } from "../config";

type ObliqueControlsProps = {
  /**
   * Offset angle in radians to apply to all cardinal directions.
   * For example, Math.PI/12 (15 degrees) will rotate all directions clockwise.
   * This allows for aligning the cardinal directions with specific features.
   */
  headingOffset?: number;
  isObliqueMode?: boolean;
};

enum CardinalDirection {
  North = 0,
  East = 1,
  South = 2,
  West = 3,
}

const HiddenImagePreviewContainer = styled.div`
  position: "absolute";
  opacity: 0;
  pointer-events: none;
  width: 1;
  height: 1;
  overflow: hidden;
`;

export const ObliqueControls: React.FC<ObliqueControlsProps> = () => {
  const isObliqueMode = useSelector(getObliqueMode);
  const {
    headingOffset,
    nearestImage,
    isAllDataReady,
    previewPath,
    previewQualityLevel,
    setLockFootprint,
  } = useObliqueDataContext();
  const { viewerRef, terrainProviderRef } = useCesiumContext();
  const flags = useFeatureFlags();
  const isDebugMode = flags.featureFlagDebugOblique;
  const animationInProgressRef = useRef<boolean>(false);
  const [activeDirection, setActiveDirection] =
    useState<CardinalDirection | null>(null);
  const [isVisible, setIsVisible] = useState(isObliqueMode);
  const [shouldRender, setShouldRender] = useState(isObliqueMode);
  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  const closePreview = useCallback(() => {
    setIsPreviewVisible(false);
  }, []);
  const orbitPointEntityRef = useRef<Entity | null>(null);
  const userMovedCameraRef = useRef<boolean>(false);

  const GlobalPreviewStyles = createGlobalStyle<{ scale: number }>`
  .ant-image-preview-root .ant-image-preview-img {
    cursor: default !important;
    pointer-events: none !important;
        transform: scale(${({ scale }) => scale}) !important;
    transform-origin: center center !important;
    max-width: none !important;
    max-height: none !important;
  }
`;

  const orbitPoint = useOrbitPoint();

  // Handle visibility changes when oblique mode toggles
  useEffect(() => {
    if (isObliqueMode) {
      setShouldRender(true);
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
      const timeout = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [isObliqueMode]);

  // Subscribe to preview visibility changes from outside this component
  useEffect(() => {
    // Update our local state when preview visibility changes elsewhere
    const unsubscribe = subscribeToPreviewVisibility((visible) => {
      setIsPreviewVisible(visible);
    });

    return unsubscribe;
  }, []);

  // Create or update the orbit point entity
  const updateOrbitPointEntity = useCallback(() => {
    if (!viewerRef.current || !orbitPoint || !isDebugMode) {
      if (orbitPointEntityRef.current) {
        viewerRef.current?.entities.remove(orbitPointEntityRef.current);
        orbitPointEntityRef.current = null;
      }
      return;
    }

    const viewer = viewerRef.current;
    if (!orbitPointEntityRef.current) {
      orbitPointEntityRef.current = viewer.entities.add({
        position: new ConstantPositionProperty(orbitPoint),
        point: {
          pixelSize: 10,
          color: Color.YELLOW,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    } else {
      orbitPointEntityRef.current.position = new ConstantPositionProperty(
        orbitPoint
      );
    }
  }, [viewerRef, isDebugMode, orbitPoint]);

  // Remove orbit point entity when component unmounts
  useEffect(() => {
    const currentViewer = viewerRef.current;
    const currentOrbitPointEntity = orbitPointEntityRef.current;

    return () => {
      if (currentViewer && currentOrbitPointEntity) {
        currentViewer.entities.remove(currentOrbitPointEntity);
      }
    };
  }, [viewerRef]);

  const getCardinalHeadings = useCallback(() => {
    // Base cardinal directions in radians
    const directions = [
      0, // North
      CesiumMath.PI_OVER_TWO, // East
      CesiumMath.PI, // South
      CesiumMath.THREE_PI_OVER_TWO, // West
    ];

    // Apply the heading offset to all directions
    return directions.map((heading) =>
      CesiumMath.zeroToTwoPi(heading + headingOffset)
    );
  }, [headingOffset]);

  const findClosestCardinalIndex = useCallback(
    (heading: number, cardinals: number[]) => {
      const normalizedHeading = CesiumMath.zeroToTwoPi(heading);

      let closestIndex = 0;
      let minDifference = Number.MAX_VALUE;

      cardinals.forEach((cardinal, index) => {
        let diff = Math.abs(normalizedHeading - cardinal);
        if (diff > Math.PI) {
          diff = CesiumMath.TWO_PI - diff;
        }

        if (diff < minDifference) {
          minDifference = diff;
          closestIndex = index;
        }
      });

      return closestIndex;
    },
    []
  );

  // Convert radians to degrees for display
  const formatHeadingDegrees = useCallback((headingRadians: number): number => {
    const degrees = CesiumMath.toDegrees(
      CesiumMath.zeroToTwoPi(headingRadians)
    );
    return Math.round(degrees);
  }, []);

  const flyToNearestImage = useCallback(async () => {
    if (isPreviewVisible) {
      setIsPreviewVisible(false);
      notifyPreviewVisibilityChange(false);
      return;
    }

    if (!viewerRef.current || !nearestImage) return;

    const viewer = viewerRef.current;

    const { centerWGS84, fallbackHeading: calculatedHeading } =
      nearestImage.record;
    const { imageCenter, distanceToCamera } = nearestImage;
    if (!centerWGS84 || !imageCenter) return;

    const [longitude, latitude, height] = centerWGS84;
    const position = Cartesian3.fromDegrees(longitude, latitude, height);
    const imageCenterCartesian = Cartesian3.fromDegrees(
      imageCenter.longitude,
      imageCenter.latitude
    );

    console.log("imageCenterCartesian", imageCenterCartesian, imageCenter);

    const imageCenterCartograpic =
      Cartographic.fromCartesian(imageCenterCartesian);
    const [centerWithHeight] = await sampleTerrainMostDetailed(
      terrainProviderRef.current,
      [imageCenterCartograpic]
    );

    const centerWithHeightCartesian =
      Cartographic.toCartesian(centerWithHeight);

    const direction = getDirectionFromCartesian(
      position,
      centerWithHeightCartesian
    );

    // local UP
    const up = Cartesian3.normalize(position, new Cartesian3());

    setLockFootprint(true);

    const duration = Math.max(0, Math.min(1.5, distanceToCamera ** 0.5 / 20));

    viewer.camera.flyTo({
      destination: position,
      orientation: { direction, up },
      endTransform: Matrix4.IDENTITY,
      duration,
      complete: () => {
        viewer.camera.lookAtTransform(Matrix4.IDENTITY);
        viewer.scene.requestRender();
        animationInProgressRef.current = false;
        setIsPreviewVisible(true);
        notifyPreviewVisibilityChange(true);
      },
    });
  }, [
    viewerRef,
    terrainProviderRef,
    nearestImage,
    isPreviewVisible,
    setLockFootprint,
  ]);

  const downloadHighQualityImage = useCallback(() => {
    if (!nearestImage || !previewPath) return;

    const downloadUrl = getPreviewImageUrl(
      previewPath,
      OBLIQUE_PREVIEW_QUALITY.LEVEL_2,
      nearestImage.record.id
    );

    // Open in a new tab
    window.open(downloadUrl, "_blank");
  }, [nearestImage, previewPath]);

  // Update current heading and set up camera movement detection
  useEffect(() => {
    if (!viewerRef.current || !isObliqueMode) return;

    const viewer = viewerRef.current;
    const camera = viewer.camera;

    setCurrentHeading(camera.heading);

    // Set up event handlers to detect when the user moves the camera manually
    const inputHandler = new ScreenSpaceEventHandler(viewer.canvas);

    // Track when the user starts manipulating the camera
    inputHandler.setInputAction(() => {
      if (!animationInProgressRef.current) {
        userMovedCameraRef.current = true;
      }
    }, ScreenSpaceEventType.LEFT_DOWN);

    inputHandler.setInputAction(() => {
      if (!animationInProgressRef.current) {
        userMovedCameraRef.current = true;
      }
    }, ScreenSpaceEventType.MIDDLE_DOWN);

    inputHandler.setInputAction(() => {
      if (!animationInProgressRef.current) {
        userMovedCameraRef.current = true;
      }
    }, ScreenSpaceEventType.RIGHT_DOWN);

    const updateCameraInfo = () => {
      setCurrentHeading(camera.heading);

      if (animationInProgressRef.current) {
        return; // Don't process further if we're in the middle of an animation
      }

      if (userMovedCameraRef.current) {
        updateOrbitPointEntity();
        userMovedCameraRef.current = false;
      }

      const cardinalHeadings = getCardinalHeadings();
      const closestCardinalIndex = findClosestCardinalIndex(
        camera.heading,
        cardinalHeadings
      );
      setActiveDirection(closestCardinalIndex);
    };

    if (!orbitPoint && isDebugMode) {
      updateOrbitPointEntity();
    }

    const cardinalHeadings = getCardinalHeadings();
    const closestCardinalIndex = findClosestCardinalIndex(
      camera.heading,
      cardinalHeadings
    );
    setActiveDirection(closestCardinalIndex);

    viewer.camera.changed.addEventListener(updateCameraInfo);
    viewer.camera.moveEnd.addEventListener(updateCameraInfo);

    return () => {
      viewer.camera.changed.removeEventListener(updateCameraInfo);
      viewer.camera.moveEnd.removeEventListener(updateCameraInfo);
      inputHandler.destroy();
    };
  }, [
    viewerRef,
    isObliqueMode,
    getCardinalHeadings,
    findClosestCardinalIndex,
    updateOrbitPointEntity,
    isDebugMode,
    orbitPoint,
  ]);

  const rotateToDirection = useCallback(
    (targetDirection: CardinalDirection) => {
      const viewer = viewerRef.current;
      if (!viewer || animationInProgressRef.current) return;

      const camera = viewer.camera;
      const scene = viewer.scene;
      const currentHeading = camera.heading;

      const cardinalHeadings = getCardinalHeadings();

      if (
        Math.abs(currentHeading - cardinalHeadings[targetDirection]) < 0.0001
      ) {
        return;
      }

      const targetHeading = cardinalHeadings[targetDirection];

      if (!orbitPoint && isDebugMode) {
        updateOrbitPointEntity();
      }

      // Calculate the range (distance from center)
      const range = Cartesian3.distance(orbitPoint, camera.position);

      // Start the animation
      animationInProgressRef.current = true;
      userMovedCameraRef.current = false; // Reset this flag since we're starting a programmatic move

      let startTime = Date.now();
      const duration = 500; // ms

      let headingChange = targetHeading - currentHeading;

      // Ensure we take the shortest path
      if (headingChange > Math.PI) {
        headingChange -= CesiumMath.TWO_PI;
      } else if (headingChange < -Math.PI) {
        headingChange += CesiumMath.TWO_PI;
      }

      // Skip animation if the change is very small
      if (Math.abs(headingChange) < 0.0001) {
        animationInProgressRef.current = false;
        return;
      }

      const onPreUpdate = () => {
        const currentTime = Date.now();
        let t = Math.min((currentTime - startTime) / duration, 1);
        t = EasingFunction.SINUSOIDAL_IN_OUT(t);

        if (t < 1) {
          const intermediateHeading = currentHeading + headingChange * t;

          camera.lookAt(
            orbitPoint,
            new HeadingPitchRange(intermediateHeading, camera.pitch, range)
          );

          setCurrentHeading(intermediateHeading);

          scene.requestRender();
        } else {
          camera.lookAt(
            orbitPoint,
            new HeadingPitchRange(targetHeading, camera.pitch, range)
          );

          setCurrentHeading(targetHeading);

          camera.lookAtTransform(Matrix4.IDENTITY);

          scene.requestRender();
          animationInProgressRef.current = false;

          scene.preUpdate.removeEventListener(onPreUpdate);
          animationInProgressRef.current = false;
          setActiveDirection(targetDirection);
        }
      };

      scene.preUpdate.addEventListener(onPreUpdate);
    },
    [
      viewerRef,
      getCardinalHeadings,
      updateOrbitPointEntity,
      orbitPoint,
      isDebugMode,
    ]
  );

  const rotateCamera = useCallback(
    (clockwise: boolean) => {
      const viewer = viewerRef.current;
      if (!viewer || animationInProgressRef.current) return;

      const camera = viewer.camera;

      const cardinalHeadings = getCardinalHeadings();

      const closestCardinalIndex = findClosestCardinalIndex(
        camera.heading,
        cardinalHeadings
      );

      const nextCardinalIndex = clockwise
        ? (closestCardinalIndex + 1) % 4 // Next clockwise cardinal
        : (closestCardinalIndex + 3) % 4; // Next counterclockwise cardinal (4-1)

      rotateToDirection(nextCardinalIndex);
    },
    [
      viewerRef,
      getCardinalHeadings,
      findClosestCardinalIndex,
      rotateToDirection,
    ]
  );

  if (!shouldRender) {
    return null;
  }

  const directionLabelStyle = {
    fontWeight: 800,
    fontSize: "16px",
  };

  const headingDisplayStyle = {
    fontWeight: 600,
    fontSize: "14px",
    color: "#333",
    userSelect: "none" as const,
  };

  const activeButtonClass = "!bg-blue-100 !border-blue-400";

  const headingDegrees = formatHeadingDegrees(currentHeading);

  const offsetDegrees = Math.round(CesiumMath.toDegrees(headingOffset));

  const viewerAspectRatio =
    viewerRef.current?.scene.canvas.width >
    viewerRef.current?.scene.canvas.height
      ? viewerRef.current?.scene.canvas.width /
        viewerRef.current?.scene.canvas.height
      : 1;

  // always use longer dimension
  let scaleFactor = 1;

  if (viewerRef.current?.camera.frustum instanceof PerspectiveFrustum) {
    const fov = viewerRef.current?.camera.frustum.fov;
    scaleFactor =
      viewerAspectRatio * (1 / Math.tan(fov / 2)) * FOV_SCALE_FACTOR;
  }

  return (
    <>
      <GlobalPreviewStyles scale={scaleFactor} />
      <ObliqueFootprintLayer />
      {isDebugMode && <ObliqueDebugSvg />}
      {isDebugMode && nearestImage && (
        <ObliqueImageInfo imageRecord={nearestImage} />
      )}
      {/* Hidden image in center that will be used for preview */}
      {nearestImage && previewPath && nearestImage.record.id && (
        <HiddenImagePreviewContainer>
          <AntdImage
            src={getPreviewImageUrl(
              previewPath,
              previewQualityLevel,
              nearestImage.record.id
            )}
            alt={`Image preview ${nearestImage.record.id}`}
            preview={{
              visible: isPreviewVisible,
              style: {
                cursor: "default", // Prevent the grab cursor
              },
              src: getPreviewImageUrl(
                previewPath,
                previewQualityLevel,
                nearestImage.record.id
              ),
              onVisibleChange: (visible) => {
                setIsPreviewVisible(visible);
                notifyPreviewVisibilityChange(visible);
                if (!visible) {
                  setLockFootprint(false);
                }
              },
              toolbarRender: () => null,
              movable: false,
            }}
          />
        </HiddenImagePreviewContainer>
      )}
      <div
        className="camera-rotation-controls-container"
        style={{
          position: "absolute",
          bottom: "60px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          opacity: isVisible ? 1 : 0,
          transition: "opacity 300ms ease-in-out",
          pointerEvents: isVisible ? "auto" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            transition: "transform 300ms ease-in-out",
            transform: `translateY(${isPreviewVisible ? 200 : 0}px)`,
          }}
        >
          {/* Fly to image button or close preview button */}
          {nearestImage && (
            <Tooltip
              placement="right"
              title={
                isPreviewVisible
                  ? "Vorschau schließen"
                  : "Zur ausgewählten Schrägluftbild-Aufnahmeposition fliegen"
              }
            >
              <div>
                <ControlButtonStyler
                  onClick={isPreviewVisible ? closePreview : flyToNearestImage}
                  width="160px"
                  height="80px"
                >
                  <span>
                    {isPreviewVisible ? "Schließen" : "Flug zum Bild"}
                  </span>
                </ControlButtonStyler>
              </div>
            </Tooltip>
          )}

          {/* Download button when preview is not visible */}
          {!isPreviewVisible && nearestImage && previewPath && (
            <Tooltip
              placement="right"
              title="Bild in Qualität Level 2 herunterladen, Bild öffnet in neuemFenster"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  whiteSpace: "nowrap",
                  paddingBottom: "40px",
                }}
              >
                <ControlButtonStyler
                  onClick={downloadHighQualityImage}
                  width="160px"
                  className="download-button"
                >
                  <DownloadOutlined style={{ marginRight: "8px" }} />
                  <span>Herunterladen</span>
                </ControlButtonStyler>
              </div>
            </Tooltip>
          )}

          {/* Cardinal direction controls with loading spinner overlay */}
          <div
            className="camera-rotation-controls"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gridTemplateRows: "repeat(3, 1fr)",
              gap: "4px",
              padding: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.4)",
              borderRadius: "8px",
              boxShadow: "0 0 8px rgba(0, 0, 0, 0.2)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                zIndex: 10,
                borderRadius: "8px",
                opacity: isAllDataReady ? 0 : 1,
                transition: "opacity 0.5s ease",
                pointerEvents: isAllDataReady ? "none" : "auto",
              }}
            >
              <FontAwesomeIcon
                icon={faSpinner}
                spin
                style={{ fontSize: "24px", marginBottom: "10px" }}
              />
              <div style={{ textAlign: "center", fontSize: "12px" }}>
                Schrägluftbild-Daten werden geladen...
              </div>
            </div>
            {/* Top row */}
            <ControlButtonStyler
              onClick={() => rotateCamera(false)}
              width="40px"
              height="40px"
            >
              <FontAwesomeIcon icon={faRotateLeft} className="text-base" />
            </ControlButtonStyler>
            <ControlButtonStyler
              onClick={() => rotateToDirection(CardinalDirection.North)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirection.North
                  ? activeButtonClass
                  : ""
              }
            >
              <span style={directionLabelStyle}>N</span>
            </ControlButtonStyler>
            <ControlButtonStyler
              onClick={() => rotateCamera(true)}
              width="40px"
              height="40px"
            >
              <FontAwesomeIcon icon={faRotateRight} className="text-base" />
            </ControlButtonStyler>

            {/* Middle row */}
            <ControlButtonStyler
              onClick={() => rotateToDirection(CardinalDirection.West)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirection.West
                  ? activeButtonClass
                  : ""
              }
            >
              <span style={directionLabelStyle}>W</span>
            </ControlButtonStyler>
            <Tooltip
              title={`Luftbildblickrichtung "Nord" hat ${offsetDegrees} Grad Abweichung von Nord`}
              placement="top"
              overlayInnerStyle={{
                userSelect: "none",
                pointerEvents: "none",
              }}
              overlayStyle={{
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  margin: "2px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={headingDisplayStyle}>{headingDegrees}°</span>
              </div>
            </Tooltip>
            <ControlButtonStyler
              onClick={() => rotateToDirection(CardinalDirection.East)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirection.East
                  ? activeButtonClass
                  : ""
              }
            >
              <span style={directionLabelStyle}>O</span>
            </ControlButtonStyler>

            {/* Bottom row */}
            <div style={{ width: "40px", height: "40px", margin: "2px" }}>
              {/* Empty bottom-left cell */}
            </div>
            <ControlButtonStyler
              onClick={() => rotateToDirection(CardinalDirection.South)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirection.South
                  ? activeButtonClass
                  : ""
              }
            >
              <span style={directionLabelStyle}>S</span>
            </ControlButtonStyler>
            <div style={{ width: "40px", height: "40px", margin: "2px" }}>
              {/* Empty bottom-right cell */}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ObliqueControls;
