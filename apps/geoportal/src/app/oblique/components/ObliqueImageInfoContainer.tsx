import React, { useState, useCallback, useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import { Cartesian3 } from "cesium";
import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { Image, type ImageProps } from "antd";
import { styled } from "styled-components";

import { getObliqueMode } from "../../store/slices/ui";
import { ObliqueImageInfo } from "./ObliqueImageInfo";
import { ObliqueDebugSvg } from "./ObliqueDebugSvg";
import { ObliqueFootprintLayer } from "./ObliqueFootprintLayer";
import { ObliqueImageRecord } from "../types";
import { useObliqueDataContext } from "./ObliqueDataContext";
import { useFeatureFlags } from "@carma-apps/portals";
import { getPreviewImageUrl } from "../utils/imageHandling";
import { NUM_NEAREST_IMAGES } from "../config";

// Styled components for the preview
const ImagePreviewContainer = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  width: 320px;
  height: 320px;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 1000;
`;

// Keep track of the current image instance for programmatic preview control
type PreviewControl = {
  showPreview: () => void;
  onComplete?: () => void;
};

let previewControlRef: PreviewControl | null = null;
let showPanelRef: (() => void) | null = null;
let activateFlyToModeRef: ((show: boolean) => void) | null = null;

// Export a function to access showPanel from outside
export const showObliqueImageInfo = (triggerPreview = false) => {
  if (showPanelRef) {
    showPanelRef();
  }

  // Activate the fly-to mode
  if (activateFlyToModeRef) {
    activateFlyToModeRef(true);
  }

  // Trigger preview if requested
  if (triggerPreview && previewControlRef) {
    setTimeout(() => {
      if (previewControlRef?.showPreview) {
        previewControlRef.showPreview();
      }
    }, 200); // Small delay to ensure rendering is complete
  }
};

export const ObliqueImageInfoContainer: React.FC = () => {
  const isObliqueMode = useSelector(getObliqueMode);
  const [isVisible, setIsVisible] = useState(true);
  const [flyToMode, setFlyToMode] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const imageRef = useRef<ImageProps>(null);
  const { viewerRef } = useCesiumContext();
  const flags = useFeatureFlags();

  const isDebugObliqueEnabled = flags.featureFlagDebugOblique;

  // Get oblique data from context
  const {
    nearestImage,
    distanceToNearestImage,
    refreshNearestImageSearch,
    previewQualityLevel,
    previewPath,
  } = useObliqueDataContext();

  const hidePanel = useCallback(() => {
    setIsVisible(false);
  }, []);

  const showPanel = useCallback(() => {
    setIsVisible(true);
  }, []);

  // Store the functions in refs so they can be accessed from outside
  showPanelRef = showPanel;
  activateFlyToModeRef = setFlyToMode;

  // Setup the preview control that will be accessible outside the component
  useEffect(() => {
    previewControlRef = {
      showPreview: () => {
        setPreviewVisible(true);
      },
      onComplete: () => {
        // Any additional actions to take when preview is displayed
      },
    };

    return () => {
      previewControlRef = null;
    };
  }, []);

  const flyToImage = useCallback(
    (image: ObliqueImageRecord) => {
      if (!viewerRef.current) return;

      const viewer = viewerRef.current;

      // Extract position from the image record
      const { centerWGS84, fallbackHeading: calculatedHeading, sector } = image;
      if (!centerWGS84) return;

      // Create Cartesian3 from WGS84 coordinates
      const [longitude, latitude, height] = centerWGS84;
      const position = Cartesian3.fromDegrees(
        longitude,
        latitude,
        height - 400
      );

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
          // Refresh nearest image search after flying
          refreshNearestImageSearch();

          // Trigger fullscreen preview after flyTo completes
          showObliqueImageInfo(true);
        },
      });
    },
    [viewerRef, refreshNearestImageSearch]
  );

  // Don't render anything if not in oblique mode
  if (!isObliqueMode) {
    return null;
  }

  return (
    <>
      {isObliqueMode && <ObliqueFootprintLayer />}

      {isDebugObliqueEnabled && (
        <ObliqueDebugSvg numImages={NUM_NEAREST_IMAGES} />
      )}

      {isDebugObliqueEnabled && isVisible && nearestImage && (
        <ObliqueImageInfo
          imageRecord={nearestImage}
          distance={distanceToNearestImage}
          onClose={hidePanel}
          flyToImage={flyToImage}
        />
      )}

      {/* Hidden image in center that will be used for preview */}
      {nearestImage && previewPath && nearestImage.id && (
        <div
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
            width: 1,
            height: 1,
            overflow: "hidden",
          }}
        >
          <Image
            src={getPreviewImageUrl(
              previewPath,
              previewQualityLevel,
              nearestImage.id
            )}
            alt={`Image preview ${nearestImage.id}`}
            preview={{
              visible: previewVisible,
              src: getPreviewImageUrl(
                previewPath,
                previewQualityLevel,
                nearestImage.id
              ),
              onVisibleChange: (visible) => {
                setPreviewVisible(visible);
                if (!visible) {
                  setFlyToMode(false);
                }
              },
              toolbarRender: () => null,
            }}
          />
        </div>
      )}

      {/* Show preview image when in fly-to mode but not in debug mode */}
      {!isDebugObliqueEnabled &&
        flyToMode &&
        nearestImage &&
        !previewVisible && (
          <>
            <ImagePreviewContainer>
              {previewPath && nearestImage.id && !imageError ? (
                <Image
                  src={getPreviewImageUrl(
                    previewPath,
                    previewQualityLevel,
                    nearestImage.id
                  )}
                  alt={`Image preview ${nearestImage.id}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  onError={() => setImageError(true)}
                  onClick={() => setPreviewVisible(true)}
                  preview={{
                    toolbarRender: () => null,
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#f5f5f5",
                    color: "#bfbfbf",
                    fontSize: "14px",
                  }}
                >
                  Image not available
                </div>
              )}
            </ImagePreviewContainer>

            <div
              style={{
                position: "absolute",
                bottom: "10px",
                right: "10px",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                padding: "8px",
                borderRadius: "4px",
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
                zIndex: 1000,
                fontSize: "14px",
              }}
            >
              <div>
                <strong>Luftbild:</strong> {nearestImage.id}
              </div>
              <div>
                <strong>Position:</strong>{" "}
                {nearestImage.centerWGS84?.[0].toFixed(5) ?? "N/A"},
                {nearestImage.centerWGS84?.[1].toFixed(5) ?? "N/A"}
              </div>
              {distanceToNearestImage !== null && (
                <div>
                  <strong>Entfernung:</strong>{" "}
                  {distanceToNearestImage.toFixed(2)}m
                </div>
              )}
            </div>
          </>
        )}
    </>
  );
};

export default ObliqueImageInfoContainer;
