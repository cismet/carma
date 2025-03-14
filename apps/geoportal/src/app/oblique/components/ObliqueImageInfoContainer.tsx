import React, { useState, useCallback, useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import { Cartesian3 } from "cesium";
import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { Image } from "antd";
import { styled, createGlobalStyle } from "styled-components";

import { getObliqueMode } from "../../store/slices/ui";
import { ObliqueImageInfo } from "./ObliqueImageInfo";
import { ObliqueDebugSvg } from "./ObliqueDebugSvg";
import { ObliqueFootprintLayer } from "./ObliqueFootprintLayer";
import { ObliqueImageRecord } from "../types";
import { useObliqueDataContext } from "./ObliqueDataContext";
import { useFeatureFlags } from "@carma-apps/portals";
import { getPreviewImageUrl } from "../utils/imageHandling";
import { NUM_NEAREST_IMAGES } from "../config";
import { notifyPreviewVisibilityChange } from "../utils/previewVisibility";

const HiddenImagePreviewContainer = styled.div`
  position: "absolute";
  opacity: 0;
  pointer-events: none;
  width: 1;
  height: 1;
  overflow: hidden;
`;

const GlobalPreviewStyles = createGlobalStyle`
  .ant-image-preview-root .ant-image-preview-img {
    cursor: default !important;
    pointer-events: none !important;
  }
`;

// Keep track of the current image instance for programmatic preview control
type PreviewControl = {
  showPreview: () => void;
  onComplete?: () => void;
};

let previewControlRef: PreviewControl | null = null;
let showPanelRef: (() => void) | null = null;

// Export a function to access showPanel from outside
export const showObliqueImageInfo = (triggerPreview = false) => {
  if (showPanelRef) {
    showPanelRef();
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
  const [previewVisible, setPreviewVisible] = useState(false);
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
      <GlobalPreviewStyles />
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
        <HiddenImagePreviewContainer>
          <Image
            src={getPreviewImageUrl(
              previewPath,
              previewQualityLevel,
              nearestImage.id
            )}
            alt={`Image preview ${nearestImage.id}`}
            preview={{
              visible: previewVisible,
              style: {
                cursor: "default", // Prevent the grab cursor
              },
              src: getPreviewImageUrl(
                previewPath,
                previewQualityLevel,
                nearestImage.id
              ),
              onVisibleChange: (visible) => {
                setPreviewVisible(visible);
                notifyPreviewVisibilityChange(visible);
              },
              toolbarRender: () => null,
              movable: false,
            }}
          />
        </HiddenImagePreviewContainer>
      )}
    </>
  );
};

export default ObliqueImageInfoContainer;
