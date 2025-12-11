import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExternalLink,
  faFileArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import { Tooltip } from "antd";
import { useControls } from "leva";

import {
  selectViewerIsTransitioning,
  useCesiumContext,
} from "@carma-mapping/engines/cesium";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { ContactMailButton } from "@carma-appframeworks/portals";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { ObliqueDebugSvg } from "./debugUI/ObliqueDebugSvg";
import { ObliqueImagePreview } from "./ObliqueImagePreview";
import { ObliqueImageInfo } from "./debugUI/ObliqueImageInfo";
import { CameraVectorControls } from "./debugUI/CameraVectorControls";
import {
  debugComponentsContainerLeftStyle,
  debugComponentsContainerRightStyle,
} from "./debugUI/styles";
import { ObliqueDirectionControls } from "./ObliqueDirectionControls";
import { ObliqueDirectionControlsCompact } from "./ObliqueDirectionControls.Compact";
import ObliqueOrientationCube from "./ObliqueOrientationCube";

import { useExteriorOrientation } from "../hooks/useExteriorOrientation";
import { useFootprints } from "../hooks/useFootprints";
import { useOblique } from "../hooks/useOblique";
import { useObliqueCameraHandlers } from "../hooks/useObliqueCameraHandlers";
import { useSiblingsByCardinal } from "../hooks/useSiblingsByCardinal";
import { useObliqueDirectionKeybindings } from "../hooks/useObliqueDirectionKeybindings";

import { flyToExteriorOrientation } from "../utils/cameraUtils";
import { downloadAsBlobAsync } from "../utils/downloads";
import { getImageUrls } from "../utils/imageHandling";
import {
  notifyPreviewVisibilityChange,
  subscribeToPreviewVisibility,
} from "../utils/previewVisibility";

import { CAMERA_ID_INTERIOR_ORIENTATION_PERCENTAGE_OFFSETS } from "../config";
import { CardinalDirectionEnum } from "../utils/orientationUtils";

interface ObliqueControlsProps {
  headingOffset?: number;
  isObliqueMode?: boolean;
}

export const ObliqueControls: React.FC<ObliqueControlsProps> = () => {
  const {
    headingOffset,
    selectedImage,
    isAllDataReady,
    previewPath,
    previewQualityLevel,
    setLockFootprint,
    animations,
    isObliqueMode,
    toggleObliqueMode,
    imagePreviewStyle,
    setSelectedImage,
    prefetchSiblingPreview,
    setSuspendSelectionSearch,
    selectedImageRefresh,
  } = useOblique();
  const siblingsByCardinal = useSiblingsByCardinal();
  const {
    shouldSuspendPitchLimiterRef,
    shouldSuspendCameraLimitersRef,
    requestRender,
    isValidViewer,
    withScene,
  } = useCesiumContext();
  const imageId = selectedImage?.record?.id;
  const cameraId = selectedImage?.record?.cameraId;
  const { isDebugMode, isObliqueUiEval } = useFeatureFlags();
  const animationInProgressRef = useRef<boolean>(false);
  // Avoid repeated logs when refresh is not yet wired

  // Used to trigger fly-to after next capture navigation
  const nextCaptureShouldFlyRef = useRef(false);
  // Marks that the upcoming fly was triggered by a rotation action in preview mode
  const rotatedFlyPendingRef = useRef(false);
  // Exterior orientation for current nearest image (used for fly-to actions)
  const { derivedExteriorOrientationRef } =
    useExteriorOrientation(selectedImage);

  const [isVisible, setIsVisible] = useState(isObliqueMode);
  const [showFacadeLabels, setShowFacadeLabels] = useState(true);
  const [offsetEnabled, setOffsetEnabled] = useState(true);
  const [offsetCube, setOffsetCube] = useState(false);
  const [invertLabels, setInvertLabels] = useState(true);
  const [shouldRender, setShouldRender] = useState(isObliqueMode);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [isFlyButtonHovered, setIsFlyButtonHovered] = useState(false);
  // Hide footprints while preview is visible
  useEffect(() => {
    setLockFootprint(isPreviewVisible);
  }, [isPreviewVisible, setLockFootprint]);
  // Suspend selection search while preview is visible
  useEffect(() => {
    setSuspendSelectionSearch(isPreviewVisible);
  }, [isPreviewVisible, setSuspendSelectionSearch]);

  // Disable camera limiters while preview is visible
  useEffect(() => {
    if (shouldSuspendPitchLimiterRef)
      shouldSuspendPitchLimiterRef.current = isPreviewVisible;
    if (shouldSuspendCameraLimitersRef)
      shouldSuspendCameraLimitersRef.current = isPreviewVisible;
    return () => {
      if (shouldSuspendPitchLimiterRef)
        shouldSuspendPitchLimiterRef.current = false;
      if (shouldSuspendCameraLimitersRef)
        shouldSuspendCameraLimitersRef.current = false;
    };
  }, [
    isPreviewVisible,
    shouldSuspendPitchLimiterRef,
    shouldSuspendCameraLimitersRef,
  ]);
  const [shouldRemoveCurrentPreviewImage, setShouldRemoveCurrentPreviewImage] =
    useState(false);
  const [flyCompletionTick, setFlyCompletionTick] = useState(0);
  const [showDirectionControls, setShowDirectionControls] = useState(true);
  const [showOrientationCube, setShowOrientationCube] = useState(false);
  const [directionalButtonType, setDirectionalButtonType] = useState<
    "captureDirection" | "nextCapture"
  >("nextCapture");

  const [brightnessBase, setBrightnessBase] = useState(125);
  const [contrastBase, setContrastBase] = useState(95);
  const [saturationBase, setSaturationBase] = useState(85);
  const [useLegacyDirControls, setUseLegacyDirControls] = useState(false);

  const isTransitioning = useSelector(selectViewerIsTransitioning);
  // Track last directional move to prefetch ahead in the same direction on arrival
  const lastMoveDirRef = useRef<CardinalDirectionEnum | null>(null);
  // Debounced intent for sibling navigation
  const pendingMoveDirRef = useRef<CardinalDirectionEnum | null>(null);
  const siblingMoveDebounceRef = useRef<number | undefined>(undefined);

  const executeNextCaptureFromIntent = useCallback(() => {
    const dir = pendingMoveDirRef.current;
    if (dir == null) return;
    pendingMoveDirRef.current = null;
    const candidate = siblingsByCardinal[dir];
    if (!candidate) return;
    // Keep overlay, just dim the image until the next one is loaded
    setShouldRemoveCurrentPreviewImage(true);
    nextCaptureShouldFlyRef.current = true;
    // This is a sibling navigation, not a rotation fly
    rotatedFlyPendingRef.current = false;
    lastMoveDirRef.current = dir;
    // Lock selection to the known next image to avoid flicker from live search
    setSuspendSelectionSearch(true);
    setSelectedImage({
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
  }, [siblingsByCardinal, setSelectedImage, setSuspendSelectionSearch]);

  const requestNextCapture = useCallback(
    (dir: CardinalDirectionEnum) => {
      pendingMoveDirRef.current = dir;
      if (siblingMoveDebounceRef.current !== undefined) {
        window.clearTimeout(siblingMoveDebounceRef.current);
      }
      siblingMoveDebounceRef.current = window.setTimeout(() => {
        executeNextCaptureFromIntent();
      }, 200);
    },
    [executeNextCaptureFromIntent]
  );

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (siblingMoveDebounceRef.current !== undefined) {
        window.clearTimeout(siblingMoveDebounceRef.current);
      }
    };
  }, []);

  const siblingCallbacks = useMemo(
    () => ({
      [CardinalDirectionEnum.North]: siblingsByCardinal[
        CardinalDirectionEnum.North
      ]
        ? () => requestNextCapture(CardinalDirectionEnum.North)
        : undefined,
      [CardinalDirectionEnum.East]: siblingsByCardinal[
        CardinalDirectionEnum.East
      ]
        ? () => requestNextCapture(CardinalDirectionEnum.East)
        : undefined,
      [CardinalDirectionEnum.South]: siblingsByCardinal[
        CardinalDirectionEnum.South
      ]
        ? () => requestNextCapture(CardinalDirectionEnum.South)
        : undefined,
      [CardinalDirectionEnum.West]: siblingsByCardinal[
        CardinalDirectionEnum.West
      ]
        ? () => requestNextCapture(CardinalDirectionEnum.West)
        : undefined,
    }),
    [siblingsByCardinal, requestNextCapture]
  );

  // Request nearest image for a given cardinal via on-demand search
  const findNearestForCardinal = useCallback(
    (dir: CardinalDirectionEnum, opts?: { computeOnly?: boolean }) => {
      if (typeof selectedImageRefresh !== "function") {
        return null;
      }
      const results = selectedImageRefresh({
        direction: dir,
        immediate: true,
        computeOnly: !!opts?.computeOnly,
      });
      return results && results.length ? results[0] : null;
    },
    [selectedImageRefresh]
  );

  // Fly-to handling for next capture (without opening preview)

  const flyToCurrentEOWithoutPreview = useCallback(() => {
    if (!isValidViewer() || !derivedExteriorOrientationRef.current) return;
    animationInProgressRef.current = true;
    // Choose animation based on whether this fly was triggered by a rotation in preview
    const flyOptions = rotatedFlyPendingRef.current
      ? animations.flyToRotatedImage ?? animations.flyToExteriorOrientation
      : animations.flyToNextImage ?? animations.flyToExteriorOrientation;
    rotatedFlyPendingRef.current = false;
    withScene((scene) => {
      flyToExteriorOrientation(
        scene,
        derivedExteriorOrientationRef.current,
        () => {
          animationInProgressRef.current = false;
          if (!isPreviewVisible) {
            setLockFootprint(false);
          }
          setShouldRemoveCurrentPreviewImage(false);
          setFlyCompletionTick((t) => t + 1);
          // Re-enable selection search after arriving only if preview is not visible
          if (!isPreviewVisible) {
            setSuspendSelectionSearch(false);
          }
          requestRender();
        },
        flyOptions
      );
    });
  }, [
    animations,
    setLockFootprint,
    derivedExteriorOrientationRef,
    setSuspendSelectionSearch,
    isPreviewVisible,
    requestRender,
    isValidViewer,
    withScene,
  ]);

  useEffect(() => {
    if (!nextCaptureShouldFlyRef.current) return;
    nextCaptureShouldFlyRef.current = false;
    flyToCurrentEOWithoutPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImage?.record?.id]);

  // After arrival at a new image, prefetch only the sibling in the same direction as the last move
  useEffect(() => {
    const dir = lastMoveDirRef.current;
    if (!imageId || dir == null) return;
    if (!isPreviewVisible) return; // do not prefetch while not in preview mode
    prefetchSiblingPreview(imageId, dir);
  }, [imageId, prefetchSiblingPreview, isPreviewVisible]);

  useControls(
    isDebugMode || isObliqueUiEval
      ? {
          showDirectionControls: {
            value: showDirectionControls,
            onChange: setShowDirectionControls,
            label: "Small controls",
          },
          legacyDirControls: {
            value: useLegacyDirControls,
            onChange: setUseLegacyDirControls,
            label: "Large controls",
            render: () => showDirectionControls,
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
          brightnessBase: {
            value: brightnessBase,
            min: 50,
            max: 150,
            step: 1,
            label: "Brightness",
            onChange: setBrightnessBase,
          },
          contrastBase: {
            value: contrastBase,
            min: 50,
            max: 150,
            step: 1,
            label: "Contrast",
            onChange: setContrastBase,
          },
          saturationBase: {
            value: saturationBase,
            min: 0,
            max: 200,
            step: 1,
            label: "Saturation",
            onChange: setSaturationBase,
          },
        }
      : {}
  );

  const {
    activeDirection,
    setActiveDirection,
    rotateCamera,
    rotateToDirection,
    rotateToHeading,
  } = useObliqueCameraHandlers(animationInProgressRef, isDebugMode);

  // When rotating in preview: fade current image, trigger nearest search after rotation, and fly to the result
  const rotateCameraWithPreview = useCallback(
    (clockwise: boolean): boolean => {
      if (isPreviewVisible) {
        // compute target direction relative to current active cardinal
        const targetDir = (
          clockwise ? (activeDirection + 3) % 4 : (activeDirection + 1) % 4
        ) as CardinalDirectionEnum;
        console.debug("[PreviewRotate] rotateCamera in preview", {
          clockwise,
          activeDirection,
          targetDir,
        });
        // First compute nearest without mutating selection so we can set flags before selection change
        const nearest = findNearestForCardinal(targetDir, {
          computeOnly: true,
        });
        if (!nearest) return false; // suppress free rotation when none found
        if (nearest.record.id === selectedImage?.record?.id) {
          return false;
        }

        lastMoveDirRef.current = targetDir;
        setShouldRemoveCurrentPreviewImage(true);
        nextCaptureShouldFlyRef.current = true;
        rotatedFlyPendingRef.current = true;
        // Update activeDirection immediately so buttons reflect new state
        setActiveDirection(targetDir);
        // Now trigger selection update directly (bypasses suspendSelectionSearch)
        setSelectedImage(nearest);
        return true; // step accepted; fly will be triggered by selection change
      }
      rotateCamera(clockwise);
      return true;
    },
    [
      isPreviewVisible,
      rotateCamera,
      activeDirection,
      findNearestForCardinal,
      setSelectedImage,
      setActiveDirection,
      selectedImage?.record?.id,
    ]
  );

  // Keypress: execute immediately
  const rotateCameraKeypress = useCallback(
    (clockwise: boolean) => {
      if (isPreviewVisible) {
        rotateCameraWithPreview(clockwise);
      } else {
        rotateCamera(clockwise);
      }
    },
    [isPreviewVisible, rotateCameraWithPreview, rotateCamera]
  );

  const rotateToDirectionWithPreview = useCallback(
    (dir: CardinalDirectionEnum) => {
      if (isPreviewVisible) {
        // Phase 1: compute nearest without mutating selection so flags can be set beforehand
        const nearest = findNearestForCardinal(dir, { computeOnly: true });
        if (!nearest) return; // no animation when nothing to fly to
        if (nearest.record.id === selectedImage?.record?.id) {
          return;
        }

        lastMoveDirRef.current = dir;
        setShouldRemoveCurrentPreviewImage(true);
        nextCaptureShouldFlyRef.current = true;
        rotatedFlyPendingRef.current = true;
        // Update activeDirection immediately so buttons reflect new state
        setActiveDirection(dir);
        // Phase 2: trigger selection update directly (bypasses suspendSelectionSearch)
        setSelectedImage(nearest);
        return; // skip camera rotation animation in preview
      }
      rotateToDirection(dir);
    },
    [
      isPreviewVisible,
      rotateToDirection,
      findNearestForCardinal,
      setSelectedImage,
      setActiveDirection,
      selectedImage?.record?.id,
    ]
  );

  useFootprints(isDebugMode);

  const { downloadUrl } = useMemo(
    () => getImageUrls(imageId, previewPath, previewQualityLevel),
    [previewPath, previewQualityLevel, imageId]
  );

  // Global keybindings for direction controls (WASD/Arrows/QE/Numpad)
  useObliqueDirectionKeybindings({
    activeDirection,
    siblingCallbacks,
    rotateCamera: rotateCameraKeypress,
  });

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
    if (isTransitioning && isValidViewer()) {
      isDebugMode &&
        console.debug(
          "ObliqueControls: Transitioning to 2D mode disabling oblique mode"
        );
      if (isObliqueMode) {
        toggleObliqueMode();
      }
      requestRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransitioning, isValidViewer]);

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

    if (
      !isValidViewer() ||
      !selectedImage ||
      !derivedExteriorOrientationRef.current
    )
      return;

    setLockFootprint(true);
    animationInProgressRef.current = true;

    withScene((scene) => {
      flyToExteriorOrientation(
        scene,
        derivedExteriorOrientationRef.current,
        () => {
          animationInProgressRef.current = false;
          setIsPreviewVisible(true);
          notifyPreviewVisibilityChange(true);
        },
        animations.flyToExteriorOrientation
      );
    });
  }, [
    animations,
    selectedImage,
    isPreviewVisible,
    setLockFootprint,
    derivedExteriorOrientationRef,
    isValidViewer,
    withScene,
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
      {isDebugMode && selectedImage && (
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
          <ObliqueImageInfo imageRecord={selectedImage} />
        </div>
      )}
      {selectedImage && imageId && (
        <ObliqueImagePreview
          key={imageId}
          previewPath={previewPath!}
          imageId={imageId}
          isVisible={isPreviewVisible}
          dimImage={shouldRemoveCurrentPreviewImage}
          flyCompletionTick={flyCompletionTick}
          onOpenImageLink={openImageLink}
          onDirectDownload={handleDirectDownload}
          isDebugMode={isDebugMode}
          showCompactDirectionControls
          rotateCamera={rotateCameraKeypress}
          rotateToDirection={rotateToDirectionWithPreview}
          activeDirection={activeDirection}
          siblingCallbacks={siblingCallbacks}
          isDirectionLoading={false}
          preloadNextEnabled={isFlyButtonHovered}
          onClose={() => {
            setIsPreviewVisible(false);
            notifyPreviewVisibilityChange(false);
            setLockFootprint(false);
            setSuspendSelectionSearch(false);
            setShouldRemoveCurrentPreviewImage(false);
            requestRender({ delay: 50 });
          }}
          interiorOrientationOffsets={
            CAMERA_ID_INTERIOR_ORIENTATION_PERCENTAGE_OFFSETS[cameraId]
          }
          brightnessBase={brightnessBase}
          contrastBase={contrastBase}
          saturationBase={saturationBase}
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
                onMouseEnter={() => setIsFlyButtonHovered(true)}
                onMouseLeave={() => setIsFlyButtonHovered(false)}
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

            {useLegacyDirControls && (
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
            )}
            {showDirectionControls && (
              <ObliqueDirectionControlsCompact
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
