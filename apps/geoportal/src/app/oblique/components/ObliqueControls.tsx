import {
  useCallback,
  useRef,
  useState,
  useEffect,
  useMemo,
  type CSSProperties,
} from "react";
import { useSelector } from "react-redux";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExternalLink,
  faFileArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import { useControls } from "leva";

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
import { useSiblingsByCardinal } from "../hooks/useSiblingsByCardinal";

import { flyToExteriorOrientation } from "../utils/cameraUtils";
import { downloadAsBlobAsync } from "../utils/downloads";
import { getImageUrls } from "../utils/imageHandling";
import {
  subscribeToPreviewVisibility,
  notifyPreviewVisibilityChange,
} from "../utils/previewVisibility";

import { CAMERA_ID_INTERIOR_ORIENTATION_PERCENTAGE_OFFSETS } from "../config";
import { CardinalDirectionEnum } from "../utils/orientationUtils";

interface ObliqueControlsProps {
  headingOffset?: number;
  isObliqueMode?: boolean;
}

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
    setNearestImage,
    prefetchSiblingPreview,
  } = useOblique();
  const siblingsByCardinal = useSiblingsByCardinal();
  const { viewerRef } = useCesiumContext();
  const imageId = nearestImage?.record?.id;
  const cameraId = nearestImage?.record?.cameraId;
  const { isDebugMode, isObliqueUiEval } = useFeatureFlags();
  const animationInProgressRef = useRef<boolean>(false);
  // Used to trigger fly-to after next capture navigation
  const nextCaptureShouldFlyRef = useRef(false);
  // Exterior orientation for current nearest image (used for fly-to actions)
  const { derivedExteriorOrientationRef } =
    useExteriorOrientation(nearestImage);

  const [isVisible, setIsVisible] = useState(isObliqueMode);
  const [showFacadeLabels, setShowFacadeLabels] = useState(true);
  const [offsetEnabled, setOffsetEnabled] = useState(true);
  const [offsetCube, setOffsetCube] = useState(false);
  const [invertLabels, setInvertLabels] = useState(true);
  const [shouldRender, setShouldRender] = useState(isObliqueMode);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [showDirectionControls, setShowDirectionControls] = useState(true);
  const [showOrientationCube, setShowOrientationCube] = useState(false);
  const [directionalButtonType, setDirectionalButtonType] = useState<
    "captureDirection" | "nextCapture"
  >("nextCapture");
  const isTransitioning = useSelector(selectViewerIsTransitioning);
  // Track last directional move to prefetch ahead in the same direction on arrival
  const lastMoveDirRef = useRef<CardinalDirectionEnum | null>(null);

  const handleNextCapture = useCallback(
    (dir: CardinalDirectionEnum) => {
      nextCaptureShouldFlyRef.current = true;
      lastMoveDirRef.current = dir;
      const candidate = siblingsByCardinal[dir];
      if (!candidate) return;
      setNearestImage({
        record: candidate,
        distanceOnGround: 0,
        distanceToCamera: 0,
        imageCenter: {
          x: candidate.x,
          y: candidate.y,
          longitude: candidate.centerWGS84[0],
          latitude: candidate.centerWGS84[1],
          cardinal: candidate.sector,
        },
      });
    },
    [siblingsByCardinal, setNearestImage]
  );

  const siblingCallbacks = useMemo(
    () => ({
      [CardinalDirectionEnum.North]: siblingsByCardinal[
        CardinalDirectionEnum.North
      ]
        ? () => handleNextCapture(CardinalDirectionEnum.North)
        : undefined,
      [CardinalDirectionEnum.East]: siblingsByCardinal[
        CardinalDirectionEnum.East
      ]
        ? () => handleNextCapture(CardinalDirectionEnum.East)
        : undefined,
      [CardinalDirectionEnum.South]: siblingsByCardinal[
        CardinalDirectionEnum.South
      ]
        ? () => handleNextCapture(CardinalDirectionEnum.South)
        : undefined,
      [CardinalDirectionEnum.West]: siblingsByCardinal[
        CardinalDirectionEnum.West
      ]
        ? () => handleNextCapture(CardinalDirectionEnum.West)
        : undefined,
    }),
    [siblingsByCardinal, handleNextCapture]
  );

  // Fly-to handling for next capture (without opening preview)

  const flyToCurrentEOWithoutPreview = useCallback(() => {
    const viewer = viewerRef.current;
    if (
      !isValidViewerInstance(viewer) ||
      !derivedExteriorOrientationRef.current
    )
      return;
    setLockFootprint(true);
    animationInProgressRef.current = true;
    const siblingFlyOptions =
      animations.flyToNextImage ?? animations.flyToExteriorOrientation;
    flyToExteriorOrientation(
      viewer,
      derivedExteriorOrientationRef.current,
      () => {
        animationInProgressRef.current = false;
        setLockFootprint(false);
        cesiumSafeRequestRender(viewerRef.current);
      },
      siblingFlyOptions
    );
  }, [viewerRef, animations, setLockFootprint, derivedExteriorOrientationRef]);

  useEffect(() => {
    if (!nextCaptureShouldFlyRef.current) return;
    nextCaptureShouldFlyRef.current = false;
    flyToCurrentEOWithoutPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearestImage?.record?.id]);

  // After arrival at a new image, prefetch only the sibling in the same direction as the last move
  useEffect(() => {
    const dir = lastMoveDirRef.current;
    if (!imageId || dir == null) return;
    prefetchSiblingPreview(imageId, dir);
  }, [imageId, prefetchSiblingPreview]);

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

  const { activeDirection, rotateCamera, rotateToDirection, rotateToHeading } =
    useObliqueCameraHandlers(animationInProgressRef, isDebugMode);

  useFootprints(isDebugMode);

  const { downloadUrl, previewUrl, previewUrlHq, previewUrlOriginal } = useMemo(
    () => getImageUrls(imageId, previewPath, previewQualityLevel),
    [previewPath, previewQualityLevel, imageId]
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransitioning, viewerRef]);

  useEffect(() => {
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

  if (!shouldRender) {
    return null;
  }
  const effectiveOffsetRad = offsetEnabled ? headingOffset ?? 0 : 0;

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
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              alignItems: "center",
            }}
          >
            {imageId && derivedExteriorOrientationRef.current && (
              <ControlButtonStyler
                onClick={flyToNearestExteriorOrientation}
                width="160px"
                height="40px"
                className="pointer-events-auto bg-blue-50 hover:bg-blue-100"
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
                  alignItems: "center",
                  pointerEvents: "auto",
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

            {showDirectionControls && (
              <div className="flex justify-center">
                <ObliqueDirectionControls
                  rotateCamera={rotateCamera}
                  rotateToDirection={rotateToDirection}
                  activeDirection={activeDirection}
                  isLoading={!isAllDataReady}
                  siblingCallbacks={
                    directionalButtonType === "nextCapture"
                      ? siblingCallbacks
                      : undefined
                  }
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
                    siblingCallbacks={
                      directionalButtonType === "nextCapture"
                        ? siblingCallbacks
                        : undefined
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ObliqueControls;
