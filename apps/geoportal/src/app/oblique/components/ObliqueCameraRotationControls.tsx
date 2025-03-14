import React, { useCallback, useRef, useState, useEffect } from "react";
import { useSelector } from "react-redux";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotateLeft,
  faRotateRight,
  faImage,
} from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import {
  HeadingPitchRange,
  Math as CesiumMath,
  Cartesian3,
  Matrix4,
  EasingFunction,
  Entity,
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  ConstantPositionProperty,
} from "cesium";

import { useCesiumContext, getOrbitPoint } from "@carma-mapping/cesium-engine";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { getObliqueMode } from "../../store/slices/ui";
import { useObliqueDataContext } from "../../oblique/components/ObliqueDataContext";
import { showObliqueImageInfo } from "../../oblique/components/ObliqueImageInfoContainer";
import { useFeatureFlags } from "@carma-apps/portals";
import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import { getPreviewImageUrl } from "../utils/imageHandling";
import {
  subscribeToPreviewVisibility,
  notifyPreviewVisibilityChange,
} from "../utils/previewVisibility";

type CameraRotationControlsProps = {
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

export const ObliqueCameraRotationControls: React.FC<
  CameraRotationControlsProps
> = () => {
  const isObliqueMode = useSelector(getObliqueMode);
  const { headingOffset, nearestImage, previewPath } = useObliqueDataContext();
  const { viewerRef } = useCesiumContext();
  const flags = useFeatureFlags();
  const isDebugMode = flags.featureFlagDebugOblique;
  const animationInProgressRef = useRef<boolean>(false);
  const [activeDirection, setActiveDirection] =
    useState<CardinalDirection | null>(null);
  const [isVisible, setIsVisible] = useState(isObliqueMode);
  const [shouldRender, setShouldRender] = useState(isObliqueMode);
  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const orbitPointRef = useRef<Cartesian3 | null>(null);
  const orbitPointEntityRef = useRef<Entity | null>(null);
  const userMovedCameraRef = useRef<boolean>(false);

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
    if (!viewerRef.current || !orbitPointRef.current || !isDebugMode) {
      if (orbitPointEntityRef.current) {
        viewerRef.current?.entities.remove(orbitPointEntityRef.current);
        orbitPointEntityRef.current = null;
      }
      return;
    }

    const viewer = viewerRef.current;
    const position = orbitPointRef.current;

    if (!orbitPointEntityRef.current) {
      orbitPointEntityRef.current = viewer.entities.add({
        position: new ConstantPositionProperty(position),
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
        position
      );
    }
  }, [viewerRef, isDebugMode]);

  // Remove orbit point entity when component unmounts
  useEffect(() => {
    // Capture the current values inside the effect
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
    // Convert to degrees and normalize to 0-360
    const degrees = CesiumMath.toDegrees(
      CesiumMath.zeroToTwoPi(headingRadians)
    );
    // Round to nearest integer
    return Math.round(degrees);
  }, []);

  const flyToNearestImage = useCallback(() => {
    // If preview is visible, close it
    if (isPreviewVisible) {
      setIsPreviewVisible(false);
      notifyPreviewVisibilityChange(false);
      return;
    }

    if (!viewerRef.current || !nearestImage) return;

    const viewer = viewerRef.current;

    // Extract position from the image record
    const { centerWGS84, fallbackHeading: calculatedHeading } = nearestImage;
    if (!centerWGS84) return;

    // Create Cartesian3 from WGS84 coordinates
    const [longitude, latitude, height] = centerWGS84;
    const position = Cartesian3.fromDegrees(longitude, latitude, height - 400);

    // Fly to the image position
    viewer.camera.flyTo({
      destination: position,
      orientation: {
        heading: calculatedHeading,
        pitch: -Math.PI / 4, // 45 degrees down
        roll: 0,
      },
      duration: 1.5,
      complete: () => {
        viewer.camera.lookAtTransform(Matrix4.IDENTITY);
        viewer.scene.requestRender();
        animationInProgressRef.current = false;

        // Show the image info overlay and trigger fullscreen preview
        showObliqueImageInfo(true);
        setIsPreviewVisible(true);
        notifyPreviewVisibilityChange(true);
      },
    });
  }, [viewerRef, nearestImage, isPreviewVisible]);

  const downloadHighQualityImage = useCallback(() => {
    if (!nearestImage || !previewPath) return;

    // Use level 2 for download
    const downloadUrl = getPreviewImageUrl(
      previewPath,
      OBLIQUE_PREVIEW_QUALITY.LEVEL_2,
      nearestImage.id
    );

    // Open in a new tab
    window.open(downloadUrl, "_blank");
  }, [nearestImage, previewPath]);

  // Update current heading and set up camera movement detection
  useEffect(() => {
    if (!viewerRef.current || !isObliqueMode) return;

    const viewer = viewerRef.current;
    const camera = viewer.camera;

    // Initial update of heading
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

    // Update heading on camera change
    const updateCameraInfo = () => {
      // Update current heading for display
      setCurrentHeading(camera.heading);

      if (animationInProgressRef.current) {
        return; // Don't process further if we're in the middle of an animation
      }

      // Only reset orbit point if user manually moved the camera
      if (userMovedCameraRef.current) {
        orbitPointRef.current = getOrbitPoint(viewer);
        updateOrbitPointEntity();
        userMovedCameraRef.current = false;
      }

      // Update the active direction
      const cardinalHeadings = getCardinalHeadings();
      const closestCardinalIndex = findClosestCardinalIndex(
        camera.heading,
        cardinalHeadings
      );
      setActiveDirection(closestCardinalIndex);
    };

    // Initialize orbit point if not yet set
    if (!orbitPointRef.current) {
      orbitPointRef.current = getOrbitPoint(viewer);
      if (isDebugMode) {
        updateOrbitPointEntity();
      }
    }

    // Initial update for active direction
    const cardinalHeadings = getCardinalHeadings();
    const closestCardinalIndex = findClosestCardinalIndex(
      camera.heading,
      cardinalHeadings
    );
    setActiveDirection(closestCardinalIndex);

    // Add listener for camera changes
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
  ]);

  const rotateToDirection = useCallback(
    (targetDirection: CardinalDirection) => {
      const viewer = viewerRef.current;
      if (!viewer || animationInProgressRef.current) return;

      const camera = viewer.camera;
      const scene = viewer.scene;
      const currentHeading = camera.heading;

      // Get all cardinal headings with offset applied
      const cardinalHeadings = getCardinalHeadings();

      // Skip if we're already precisely at this cardinal direction
      if (
        Math.abs(currentHeading - cardinalHeadings[targetDirection]) < 0.0001
      ) {
        return;
      }

      // Get the target heading
      const targetHeading = cardinalHeadings[targetDirection];

      // Get the center point for orbiting - use stored point if available or calculate new one
      if (!orbitPointRef.current) {
        orbitPointRef.current = getOrbitPoint(viewer);
        if (isDebugMode) {
          updateOrbitPointEntity();
        }
      }

      const centerPoint = orbitPointRef.current;

      // Calculate the range (distance from center)
      const range = Cartesian3.distance(centerPoint, camera.position);

      // Start the animation
      animationInProgressRef.current = true;
      userMovedCameraRef.current = false; // Reset this flag since we're starting a programmatic move

      let startTime = Date.now();
      const duration = 500; // ms

      // Calculate the rotation difference (shortest path)
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
          // Calculate the intermediate heading
          const intermediateHeading = currentHeading + headingChange * t;

          // Apply the intermediate heading while maintaining pitch and range
          camera.lookAt(
            centerPoint,
            new HeadingPitchRange(intermediateHeading, camera.pitch, range)
          );

          // Update current heading display during animation
          setCurrentHeading(intermediateHeading);

          scene.requestRender();
        } else {
          // Set the final heading exactly to avoid any floating point imprecision
          camera.lookAt(
            centerPoint,
            new HeadingPitchRange(targetHeading, camera.pitch, range)
          );

          // Update current heading to final value
          setCurrentHeading(targetHeading);

          // Reset transform
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
    [viewerRef, getCardinalHeadings, updateOrbitPointEntity, isDebugMode]
  );

  const rotateCamera = useCallback(
    (clockwise: boolean) => {
      const viewer = viewerRef.current;
      if (!viewer || animationInProgressRef.current) return;

      const camera = viewer.camera;

      // Get all cardinal headings with offset applied
      const cardinalHeadings = getCardinalHeadings();

      // Find the index of the closest cardinal direction
      const closestCardinalIndex = findClosestCardinalIndex(
        camera.heading,
        cardinalHeadings
      );

      // Determine the next cardinal index based on rotation direction
      const nextCardinalIndex = clockwise
        ? (closestCardinalIndex + 1) % 4 // Next clockwise cardinal
        : (closestCardinalIndex + 3) % 4; // Next counterclockwise cardinal (4-1)

      // Rotate to the target direction
      rotateToDirection(nextCardinalIndex);
    },
    [
      viewerRef,
      getCardinalHeadings,
      findClosestCardinalIndex,
      rotateToDirection,
    ]
  );

  // Don't render if we shouldn't
  if (!shouldRender) {
    return null;
  }

  // Direction label style
  const directionLabelStyle = {
    fontWeight: 800,
    fontSize: "16px",
  };

  // Heading display style
  const headingDisplayStyle = {
    fontWeight: 600,
    fontSize: "14px",
    color: "#333",
    userSelect: "none" as const,
  };

  // Active button className
  const activeButtonClass = "!bg-blue-100 !border-blue-400";

  // Format current heading for display
  const headingDegrees = formatHeadingDegrees(currentHeading);

  // Calculate the offset in degrees for the tooltip
  const offsetDegrees = Math.round(CesiumMath.toDegrees(headingOffset));

  return (
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
        zIndex: 100000,
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
          transform: `translateY(${isPreviewVisible ? 240 : 0}px)`,
        }}
      >
                {/* Fly to image button or close preview button */}
                {nearestImage && (
          <Tooltip
            title={
              isPreviewVisible
                ? "Vorschau schließen"
                : "Zu nächstem Schrägluftbild fliegen"
            }
          >
            <div>
              <ControlButtonStyler onClick={flyToNearestImage} width="160px" height="80px">
                <span>{isPreviewVisible ? "Schließen" : "Flug zum Bild"}</span>
              </ControlButtonStyler>
            </div>
          </Tooltip>
        )}
        {/* Download button */}
        {nearestImage && previewPath && (
          <Tooltip title="Bild in Qualität Level 2 herunterladen, Bild öffnet in neuemFenster">
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



        {/* Cardinal direction controls */}
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
          }}
        >
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
  );
};

export default ObliqueCameraRotationControls;
