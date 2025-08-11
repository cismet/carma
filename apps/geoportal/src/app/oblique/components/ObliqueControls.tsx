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
  faExternalLink,
  faFileArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import { useControls } from "leva";
import { Math as CesiumMath } from "cesium";

import {
  cesiumSafeRequestRender,
  isValidViewerInstance,
  selectViewerIsTransitioning,
  useCesiumContext,
} from "@carma-mapping/cesium-engine";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { useFeatureFlags, ContactMailButton } from "@carma-apps/portals";

import { ObliqueDebugSvg } from "./debugUI/ObliqueDebugSvg";
import { ObliqueImagePreview } from "./ObliqueImagePreview";
import { ObliqueImageInfo } from "./debugUI/ObliqueImageInfo";
import { CameraVectorControls } from "./debugUI/CameraVectorControls";
import { ObliqueDirectionControls } from "./ObliqueDirectionControls";
import ObliqueOrientationCube from "./ObliqueOrientationCube";

import { useExteriorOrientation } from "../hooks/useExteriorOrientation";
import { useFootprints } from "../hooks/useFootprints";
import { useOblique } from "../hooks/useOblique";
import { useObliqueCameraHandlers } from "../hooks/useObliqueCameraHandlers";

import { flyToExteriorOrientation } from "../utils/cameraUtils";
import { downloadAsBlobAsync } from "../utils/downloads";
import { formatHeadingDegrees } from "../utils/formatters";
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
  const imageId = nearestImage?.record?.id;
  const cameraId = nearestImage?.record?.cameraId;
  const { isDebugMode, isObliqueUiEval } = useFeatureFlags();
  const animationInProgressRef = useRef<boolean>(false);

  const [isVisible, setIsVisible] = useState(isObliqueMode);
  const [showFacadeLabels, setShowFacadeLabels] = useState(true);
  const [offsetEnabled, setOffsetEnabled] = useState(true);
  const [offsetCube, setOffsetCube] = useState(false);
  const [invertLabels, setInvertLabels] = useState(true);
  const [shouldRender, setShouldRender] = useState(isObliqueMode);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [showDirectionControls, setShowDirectionControls] = useState(false);
  const [showOrientationCube, setShowOrientationCube] = useState(true);
  const [directionalButtonType, setDirectionalButtonType] = useState<
    "captureDirection" | "nextCapture"
  >("captureDirection");
  const isTransitioning = useSelector(selectViewerIsTransitioning);
  const preloadImageRef = useRef<ReturnType<typeof debounce> | null>(null);

  // Leva control panel (flat) for UI visibility and cube options
  useControls(
    isObliqueUiEval
      ? {
          showDirectionControls: {
            value: showDirectionControls,
            onChange: setShowDirectionControls,
            label: "Dir controls",
          },
          showOrientationCube: {
            value: showOrientationCube,
            onChange: setShowOrientationCube,
            label: "Cube",
          },
          offsetEnabled: {
            value: offsetEnabled,
            onChange: setOffsetEnabled,
            label: "Offset",
            render: () => showOrientationCube,
          },
          offsetCube: {
            value: offsetCube,
            onChange: setOffsetCube,
            label: "Offset on cube",
            render: () => showOrientationCube,
          },
          invertLabels: {
            value: invertLabels,
            onChange: setInvertLabels,
            label: "Invert labels",
            render: () => showOrientationCube,
          },
          showFacadeLabels: {
            value: showFacadeLabels,
            onChange: setShowFacadeLabels,
            label: "Fassaden",
            render: () => showOrientationCube,
          },
          nextCapture: {
            value: directionalButtonType === "nextCapture",
            onChange: (checked: boolean) =>
              setDirectionalButtonType(
                checked ? "nextCapture" : "captureDirection"
              ),
            label: "Next capture",
            render: () => showOrientationCube,
          },
        }
      : {}
  );

  const {
    currentHeading,
    activeDirection,
    rotateCamera,
    rotateToDirection,
    rotateToHeading,
  } = useObliqueCameraHandlers(animationInProgressRef, isDebugMode);

  const { derivedExteriorOrientationRef } =
    useExteriorOrientation(nearestImage);

  useFootprints(isDebugMode);

  const { downloadUrl, previewUrl, previewUrlHq, previewUrlOriginal } = useMemo(
    () => getImageUrls(imageId, previewPath, previewQualityLevel),
    [previewPath, previewQualityLevel, imageId]
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

  const headingDegrees = formatHeadingDegrees(currentHeading);

  const effectiveOffsetRad = offsetEnabled ? headingOffset ?? 0 : 0;
  const offsetDegrees = Math.round(CesiumMath.toDegrees(effectiveOffsetRad));

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
            imageId={imageId}
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
      {nearestImage && imageId && (
        <ObliqueImagePreview
          src={previewUrl}
          srcHQ={previewUrlHq}
          srcOriginal={previewUrlOriginal}
          imageId={imageId}
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
            {imageId && derivedExteriorOrientationRef.current && (
              <ControlButtonStyler
                onClick={flyToNearestExteriorOrientation}
                width="160px"
                height="40px"
                className="bg-blue-50 hover:bg-blue-100"
              >
                <span className="flex items-center">Flug zum Bild</span>
              </ControlButtonStyler>
            )}

            {imageId && downloadUrl && (
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
                  <ControlButtonStyler onClick={openImageLink} width="160px">
                    <span className="flex items-center text-base">
                      <FontAwesomeIcon icon={faExternalLink} className="mr-2" />
                      Bild öffnen
                    </span>
                  </ControlButtonStyler>
                </Tooltip>

                <Tooltip placement="right" title="Bild direkt herunterladen">
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
                </Tooltip>

                <ContactMailButton
                  width="160px"
                  emailAddress="geodatenzentrum@stadt.wuppertal.de"
                  subjectPrefix="Datenschutzprüfung Luftbildschrägaufnahme"
                  productName="Luftbildschrägaufnahmen"
                  portalName="Wuppertaler Geodatenportal"
                  imageId={imageId}
                  imageUri={downloadUrl}
                  tooltip={{
                    title: "Datenschutzprüfung Luftbildschrägaufnahme",
                    placement: "right",
                  }}
                />
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              {showDirectionControls && (
                <div className="flex justify-center">
                  <ObliqueDirectionControls
                    rotateCamera={rotateCamera}
                    rotateToDirection={rotateToDirection}
                    activeDirection={activeDirection}
                    activeButtonClass={activeButtonClass}
                    headingDegrees={headingDegrees}
                    offsetDegrees={offsetDegrees}
                    isLoading={!isAllDataReady}
                  />
                </div>
              )}
              {showOrientationCube && (
                <div className="flex justify-center">
                  <div className="flex flex-col items-center">
                    <ObliqueOrientationCube
                      size={70}
                      rotateCamera={rotateCamera}
                      onDirectionSelect={rotateToDirection}
                      onHeadingSelect={rotateToHeading}
                      offsetRad={effectiveOffsetRad}
                      offsetCube={offsetCube}
                      invertCardinalLabels={invertLabels}
                      showFacadeLabels={showFacadeLabels}
                      directionalButtonType={directionalButtonType}
                      isLoading={!isAllDataReady}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ObliqueControls;
