import {
  useCallback,
  useRef,
  useState,
  useEffect,
  useMemo,
  type CSSProperties,
} from "react";
import { useSelector } from "react-redux";

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
import { Math as CesiumMath } from "cesium";

import {
  cesiumSafeRequestRender,
  isValidViewerInstance,
  selectViewerIsTransitioning,
  useCesiumContext,
} from "@carma-mapping/cesium-engine";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useFeatureFlags } from "@carma-apps/portals";

import { ObliqueDebugSvg } from "./debugUI/ObliqueDebugSvg";
import { ObliqueImagePreview } from "./ObliqueImagePreview";
import { ObliqueImageInfo } from "./debugUI/ObliqueImageInfo";
import { CameraVectorControls } from "./debugUI/CameraVectorControls";

import { useExteriorOrientation } from "../hooks/useExteriorOrientation";
import { useFootprints } from "../hooks/useFootprints";
import { useOblique } from "../hooks/useOblique";
import { useObliqueCameraHandlers } from "../hooks/useObliqueCameraHandlers";

import { flyToExteriorOrientation } from "../utils/cameraUtils";
import { downloadAsBlobAsync } from "../utils/downloads";
import { formatHeadingDegrees } from "../utils/formatters";
import { CardinalDirectionEnum } from "../utils/orientationUtils";
import { getImageUrls } from "../utils/imageHandling";
import {
  subscribeToPreviewVisibility,
  notifyPreviewVisibilityChange,
} from "../utils/previewVisibility";

import { CAMERA_ID_INTERIOR_ORIENTATION_PERCENTAGE_OFFSETS } from "../config";

interface ObliqueControlsProps {
  /**
   * Offset angle in radians to apply to all cardinal directions.
   * For example, Math.PI/12 (15 degrees) will rotate all directions clockwise.
   * This allows for aligning the cardinal directions with specific features.
   */
  headingOffset?: number;
  isObliqueMode?: boolean;
}

// Reusable styles
const debugComponentsContainerRightStyle: CSSProperties = {
  position: "absolute",
  top: "10px",
  right: "10px",
  width: "450px",
  maxWidth: "calc(100vw - 20px)",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  zIndex: 1000,
};

const debugComponentsContainerLeftStyle: CSSProperties = {
  position: "absolute",
  top: "10px",
  left: "60px",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  zIndex: 1000,
};

const activeButtonClass = "!bg-blue-100 !border-blue-400";

export const ObliqueControls: React.FC<ObliqueControlsProps> = () => {
  const {
    headingOffset,
    nearestImage,
    isAllDataReady,
    previewPath,
    previewQualityLevel,
    setLockFootprint,
    animations,
    isObliqueMode,
    toggleObliqueMode,
    imagePreviewStyle,
  } = useOblique();
  const { viewerRef } = useCesiumContext();
  const photoId = nearestImage?.record?.id;
  const cameraId = nearestImage?.record?.cameraId;
  const { isDebugMode } = useFeatureFlags();
  const animationInProgressRef = useRef<boolean>(false);

  const [isVisible, setIsVisible] = useState(isObliqueMode);
  const [shouldRender, setShouldRender] = useState(isObliqueMode);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const isTransitioning = useSelector(selectViewerIsTransitioning);
  const preloadImageRef = useRef<ReturnType<typeof debounce> | null>(null);

  const { currentHeading, activeDirection, rotateCamera, rotateToDirection } =
    useObliqueCameraHandlers(animationInProgressRef, isDebugMode);

  const { derivedExteriorOrientationRef } =
    useExteriorOrientation(nearestImage);

  useFootprints(isDebugMode);

  const { downloadUrl, previewUrl, previewUrlHq, previewUrlOriginal } = useMemo(
    () => getImageUrls(photoId, previewPath, previewQualityLevel),
    [previewPath, previewQualityLevel, photoId]
  );

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
    const viewer = viewerRef.current;
    if (isTransitioning && isValidViewerInstance(viewer)) {
      isDebugMode &&
        console.debug(
          "ObliqueControls: Transitioning to 2D mode disabling oblique mode"
        );
      if (isObliqueMode) {
        toggleObliqueMode();
      }
      viewer.scene.requestRender();
    }
    // only respond to change in transitioning state the whole component should not be rerendered in 2d mode even
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransitioning, viewerRef]);

  // Subscribe to preview visibility changes from outside this component
  useEffect(() => {
    // Update our local state when preview visibility changes elsewhere
    const unsubscribe = subscribeToPreviewVisibility((visible) => {
      setIsPreviewVisible(visible);
    });

    return unsubscribe;
  }, []);

  const flyToNearestExteriorOrientation = useCallback(async () => {
    if (isPreviewVisible) {
      setIsPreviewVisible(false);
      notifyPreviewVisibilityChange(false);
      return;
    }

    const viewer = viewerRef.current;
    if (
      !isValidViewerInstance(viewer) ||
      !nearestImage ||
      !derivedExteriorOrientationRef.current
    )
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
      },
      animations.flyToExteriorOrientation
    );
  }, [
    viewerRef,
    animations,
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

  if (!shouldRender) {
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

  const headingDegrees = formatHeadingDegrees(currentHeading);

  const offsetDegrees = Math.round(CesiumMath.toDegrees(headingOffset));

  return (
    <>
      {isDebugMode && (
        <div style={debugComponentsContainerLeftStyle}>
          <ObliqueDebugSvg />
        </div>
      )}
      {isDebugMode && nearestImage && (
        <div style={debugComponentsContainerRightStyle}>
          <CameraVectorControls
            photoId={photoId}
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
        </div>
      )}
      {nearestImage && photoId && (
        <ObliqueImagePreview
          src={previewUrl}
          srcHQ={previewUrlHq}
          srcOriginal={previewUrlOriginal}
          alt={`Image preview ${photoId}`}
          isVisible={isPreviewVisible}
          onOpenImageLink={openImageLink}
          onDirectDownload={handleDirectDownload}
          isDebugMode={isDebugMode}
          onClose={() => {
            setIsPreviewVisible(false);
            notifyPreviewVisibilityChange(false);
            setLockFootprint(false);
            // TODO: properly trigger a rerender that shows after not moving the camera, but leaving the preview
            setTimeout(() => {
              cesiumSafeRequestRender(viewerRef.current);
            }, 50);
          }}
          interiorOrientationOffsets={
            CAMERA_ID_INTERIOR_ORIENTATION_PERCENTAGE_OFFSETS[cameraId]
          }
          style={imagePreviewStyle}
        />
      )}
      <div className="absolute top-0 left-0 w-svw h-svh">
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
            {photoId && derivedExteriorOrientationRef.current && (
              <ControlButtonStyler
                onClick={flyToNearestExteriorOrientation}
                width="160px"
                height="40px"
                className="bg-blue-50 hover:bg-blue-100"
              >
                <span className="flex items-center">Flug zum Bild</span>
              </ControlButtonStyler>
            )}

            {photoId && downloadUrl && (
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
                        <FontAwesomeIcon
                          icon={faExternalLink}
                          className="mr-2"
                        />
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
      </div>
    </>
  );
};

export default ObliqueControls;
