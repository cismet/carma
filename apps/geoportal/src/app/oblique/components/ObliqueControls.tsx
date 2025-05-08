import { useCallback, useRef, useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import { debounce } from "lodash";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotateLeft,
  faRotateRight,
  faSpinner,
  faExternalLink,
  faFileArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import {
  HeadingPitchRange,
  Math as CesiumMath,
  Cartesian3,
  Cartographic,
  Matrix4,
  EasingFunction,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  sampleTerrainMostDetailed,
} from "cesium";

import {
  selectViewerIsMode2d,
  selectViewerIsTransitioning,
  useCesiumContext,
} from "@carma-mapping/cesium-engine";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useFeatureFlags } from "@carma-apps/portals";

import { ObliqueDebugSvg } from "./debugUI/ObliqueDebugSvg";
import { ObliqueImagePreview } from "./ObliqueImagePreview";
import { ObliqueImageInfo } from "./debugUI/ObliqueImageInfo";
import { CameraVectorControls } from "./debugUI/CameraVectorControls";
import {
  DebugComponentsContainerLeft,
  DebugComponentsContainerRight,
} from "./debugUI/StyledComponents";

import { getObliqueMode, setObliqueMode } from "../../store/slices/ui";

import { useObliqueDataContext } from "../hooks/useObliqueDataContext";
import { useOrbitPoint } from "../hooks/useOrbitPoint";
import { useDebugOrbitPoint } from "../hooks/useDebugOrbitPoint";
import { useExteriorOrientation } from "../hooks/useExteriorOrientation";
import { useFootprints } from "../hooks/useFootprints";

import { resetCamera, flyToExteriorOrientation } from "../utils/cameraUtils";
import { downloadAsBlobAsync } from "../utils/downloads";
import { formatHeadingDegrees } from "../utils/formatters";
import {
  CardinalDirectionEnum,
  findClosestCardinalIndex,
  getCardinalHeadings,
  getDirectionFromCartesian,
} from "../utils/orientationUtils";
import { getPreviewImageUrl } from "../utils/imageHandling";
import {
  subscribeToPreviewVisibility,
  notifyPreviewVisibilityChange,
} from "../utils/previewVisibility";

import { OBLIQUE_PREVIEW_QUALITY } from "../constants";

type ObliqueControlsProps = {
  /**
   * Offset angle in radians to apply to all cardinal directions.
   * For example, Math.PI/12 (15 degrees) will rotate all directions clockwise.
   * This allows for aligning the cardinal directions with specific features.
   */
  headingOffset?: number;
  isObliqueMode?: boolean;
};

export const ObliqueControls: React.FC<ObliqueControlsProps> = () => {
  const isObliqueMode = useSelector(getObliqueMode);
  const dispatch = useDispatch();
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
    useState<CardinalDirectionEnum | null>(null);
  const [isVisible, setIsVisible] = useState(isObliqueMode);
  const [shouldRender, setShouldRender] = useState(isObliqueMode);
  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const isMode2d = useSelector(selectViewerIsMode2d);
  const isTransitioning = useSelector(selectViewerIsTransitioning);
  const userMovedCameraRef = useRef<boolean>(false);
  const preloadImageRef = useRef<ReturnType<typeof debounce> | null>(null);

  const orbitPoint = useOrbitPoint();
  const updateOrbitPointEntity = useDebugOrbitPoint(orbitPoint, isDebugMode);

  const { derivedExteriorOrientationRef } =
    useExteriorOrientation(nearestImage);

  useFootprints();

  const previewUrl = nearestImage
    ? getPreviewImageUrl(
        previewPath,
        previewQualityLevel,
        nearestImage.record.id
      )
    : null;

  const downloadUrl = nearestImage
    ? getPreviewImageUrl(
        previewPath,
        OBLIQUE_PREVIEW_QUALITY.LEVEL_2,
        nearestImage.record.id
      )
    : null;

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

  useEffect(() => {
    if (isTransitioning && !isMode2d && viewerRef.current) {
      console.debug(
        "ObliqueControls: Transitioning to 2D mode disabling oblique mode"
      );
      dispatch(setObliqueMode(false));
      viewerRef.current.scene.requestRender();
    }
  }, [isTransitioning, isMode2d, viewerRef, dispatch]);

  // Subscribe to preview visibility changes from outside this component
  useEffect(() => {
    // Update our local state when preview visibility changes elsewhere
    const unsubscribe = subscribeToPreviewVisibility((visible) => {
      setIsPreviewVisible(visible);
    });

    return unsubscribe;
  }, []);

  const flyToNearestImage = useCallback(async () => {
    if (isPreviewVisible) {
      setIsPreviewVisible(false);
      notifyPreviewVisibilityChange(false);
      return;
    }

    const viewer = viewerRef.current;

    if (!viewer || !nearestImage) return;

    const { centerWGS84 } = nearestImage.record;
    const { imageCenter } = nearestImage;
    if (!centerWGS84 || !imageCenter) return;

    const [longitude, latitude, height] = centerWGS84;
    const position = Cartesian3.fromDegrees(longitude, latitude, height);
    const imageCenterCartesian = Cartesian3.fromDegrees(
      imageCenter.longitude,
      imageCenter.latitude
    );

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
    animationInProgressRef.current = true;

    const currentDistanceToCamera = Cartesian3.distance(
      viewer.camera.positionWC,
      position
    );

    const duration = Math.max(
      0.05,
      Math.min(2, Math.sqrt(Math.abs(currentDistanceToCamera)) / 10)
    ); // seconds

    viewer.camera.flyTo({
      destination: position,
      orientation: { direction, up },
      endTransform: Matrix4.IDENTITY,
      duration,
      complete: () => {
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

  const flyToNearestExteriorOrientation = useCallback(async () => {
    if (isPreviewVisible) {
      setIsPreviewVisible(false);
      notifyPreviewVisibilityChange(false);
      return;
    }

    const viewer = viewerRef.current;
    if (!viewer || !nearestImage || !derivedExteriorOrientationRef.current)
      return;

    setLockFootprint(true);
    animationInProgressRef.current = true;

    flyToExteriorOrientation(
      viewer,
      derivedExteriorOrientationRef.current,
      () => {
        animationInProgressRef.current = false;
        setIsPreviewVisible(true);
        notifyPreviewVisibilityChange(true);
      }
    );
  }, [
    viewerRef,
    nearestImage,
    isPreviewVisible,
    setLockFootprint,
    derivedExteriorOrientationRef,
  ]);

  const openImageLink = useCallback(() => {
    window.open(downloadUrl, "_blank");
  }, [downloadUrl]);

  const handleDirectDownload = useCallback(
    () => downloadAsBlobAsync(downloadUrl),
    [downloadUrl]
  );

  // Update current heading and set up camera movement detection
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !isObliqueMode) return;

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

      const cardinalHeadings = getCardinalHeadings(headingOffset);
      const closestCardinalIndex = findClosestCardinalIndex(
        camera.heading,
        cardinalHeadings
      );
      setActiveDirection(closestCardinalIndex);
    };

    if (!orbitPoint && isDebugMode) {
      updateOrbitPointEntity();
    }

    const cardinalHeadings = getCardinalHeadings(headingOffset);
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
    headingOffset,
    updateOrbitPointEntity,
    isDebugMode,
    orbitPoint,
  ]);

  useEffect(() => {
    if (preloadImageRef.current) {
      preloadImageRef.current.cancel();
    }
    preloadImageRef.current = debounce(() => {
      const img = new window.Image();
      img.src = previewUrl;
    }, 500);
    preloadImageRef.current();
    return () => {
      if (preloadImageRef.current) {
        preloadImageRef.current.cancel();
      }
    };
  }, [previewUrl]);

  const rotateToDirection = useCallback(
    (targetDirection: CardinalDirectionEnum) => {
      const viewer = viewerRef.current;
      if (!viewer || animationInProgressRef.current) return;

      const camera = viewer.camera;
      const scene = viewer.scene;
      const currentHeading = camera.heading;

      const cardinalHeadings = getCardinalHeadings(headingOffset);

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
          resetCamera(viewer);
          animationInProgressRef.current = false;
          userMovedCameraRef.current = true;

          scene.preUpdate.removeEventListener(onPreUpdate);
          setActiveDirection(targetDirection);
        }
      };
      scene.preUpdate.addEventListener(onPreUpdate);
      return () => {
        resetCamera(viewer);
        animationInProgressRef.current = false;
        userMovedCameraRef.current = true;
        scene.preUpdate.removeEventListener(onPreUpdate);
      };
    },
    [viewerRef, headingOffset, updateOrbitPointEntity, orbitPoint, isDebugMode]
  );

  const rotateCamera = useCallback(
    (clockwise: boolean) => {
      const viewer = viewerRef.current;
      if (!viewer || animationInProgressRef.current) return;

      const camera = viewer.camera;

      const cardinalHeadings = getCardinalHeadings(headingOffset);

      const closestCardinalIndex = findClosestCardinalIndex(
        camera.heading,
        cardinalHeadings
      );

      const nextCardinalIndex = clockwise
        ? (closestCardinalIndex + 1) % 4 // Next clockwise cardinal
        : (closestCardinalIndex + 3) % 4; // Next counterclockwise cardinal (4-1)

      rotateToDirection(nextCardinalIndex);
    },
    [viewerRef, headingOffset, rotateToDirection]
  );

  if (!shouldRender || isMode2d) {
    return null;
  }
  // --- styles and derived formatting for render ---

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

  return (
    <>
      {isDebugMode && (
        <DebugComponentsContainerLeft>
          <ObliqueDebugSvg />
        </DebugComponentsContainerLeft>
      )}
      {isDebugMode && nearestImage && (
        <DebugComponentsContainerRight>
          <CameraVectorControls
            photoId={nearestImage.record.id}
            exteriorOrientation={derivedExteriorOrientationRef.current}
            directionVectorLocal={
              derivedExteriorOrientationRef.current?.rotation?.enu?.wgs84
                ?.direction
            }
            upVector={
              derivedExteriorOrientationRef.current?.rotation?.enu?.wgs84?.up
            }
            setUpVector={() => {}}
          />
          <ObliqueImageInfo imageRecord={nearestImage} />
        </DebugComponentsContainerRight>
      )}
      {nearestImage && previewPath && nearestImage.record.id && (
        <ObliqueImagePreview
          src={previewUrl}
          alt={`Image preview ${nearestImage.record.id}`}
          isVisible={isPreviewVisible}
          onOpenImageLink={openImageLink}
          onDirectDownload={handleDirectDownload}
          isDebugMode={isDebugMode}
          onClose={() => {
            setIsPreviewVisible(false);
            notifyPreviewVisibilityChange(false);
            setLockFootprint(false);
          }}
        />
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
          zIndex: 1000,
          opacity: isVisible && !isPreviewVisible ? 1 : 0,
          transition: "opacity 300ms ease-in-out",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {nearestImage && (
            <>
              <Tooltip
                placement="right"
                title={
                  "Zur ausgewählten Schrägluftbild-Aufnahmeposition fliegen"
                }
              >
                <div>
                  <ControlButtonStyler
                    onClick={flyToNearestImage}
                    width="160px"
                    height="40px"
                  >
                    <span>
                      Flug zum Bild&nbsp;
                      {derivedExteriorOrientationRef.current && <sup>alt</sup>}
                    </span>
                  </ControlButtonStyler>
                </div>
              </Tooltip>

              {derivedExteriorOrientationRef.current && (
                <Tooltip
                  placement="right"
                  title={
                    "Zur ausgewählten Schrägluftbild-Aufnahmeposition fliegen"
                  }
                >
                  <div>
                    <ControlButtonStyler
                      onClick={flyToNearestExteriorOrientation}
                      width="160px"
                      height="40px"
                      className="bg-blue-50 hover:bg-blue-100"
                    >
                      <span className="flex items-center">
                        Flug zum Bild&nbsp;<sup>neu</sup>
                      </span>
                    </ControlButtonStyler>
                  </div>
                </Tooltip>
              )}
            </>
          )}

          {nearestImage && previewPath && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingBottom: "40px",
              }}
            >
              <Tooltip
                placement="right"
                title="Bild in hoher Qualität in neuem Tab öffnen"
              >
                <div>
                  <ControlButtonStyler onClick={openImageLink} width="160px">
                    <span className="flex items-center text-base">
                      <FontAwesomeIcon icon={faExternalLink} className="mr-2" />
                      Bild öffnen
                    </span>
                  </ControlButtonStyler>
                </div>
              </Tooltip>

              <Tooltip placement="right" title="Bild direkt herunterladen">
                <div>
                  <ControlButtonStyler
                    onClick={handleDirectDownload}
                    width="160px"
                  >
                    <span className="flex items-center text-base">
                      <FontAwesomeIcon
                        icon={faFileArrowDown}
                        className="mr-2"
                      />
                      Herunterladen
                    </span>
                  </ControlButtonStyler>
                </div>
              </Tooltip>
            </div>
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
              onClick={() => rotateToDirection(CardinalDirectionEnum.North)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirectionEnum.North
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
              onClick={() => rotateToDirection(CardinalDirectionEnum.West)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirectionEnum.West
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
              onClick={() => rotateToDirection(CardinalDirectionEnum.East)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirectionEnum.East
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
              onClick={() => rotateToDirection(CardinalDirectionEnum.South)}
              width="40px"
              height="40px"
              className={
                activeDirection === CardinalDirectionEnum.South
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
