import React, { useState, useCallback } from "react";
import { useSelector } from "react-redux";
import { Cartesian3 } from "cesium";
import { useCesiumContext } from "@carma-mapping/cesium-engine";

import { getObliqueMode } from "../../store/slices/ui";
import { ObliqueImageInfo } from "./ObliqueImageInfo";
import { ObliqueImageRecord } from "../types";
import { useObliqueDataContext } from "./ObliqueDataContext";

export const ObliqueImageInfoContainer: React.FC = () => {
  const isObliqueMode = useSelector(getObliqueMode);
  const [isVisible, setIsVisible] = useState(true);
  const { viewerRef } = useCesiumContext();

  // Get oblique data from context
  const { nearestImage, distanceToNearestImage, refreshNearestImageSearch } =
    useObliqueDataContext();

  const hidePanel = useCallback(() => {
    setIsVisible(false);
  }, []);

  const showPanel = useCallback(() => {
    setIsVisible(true);
  }, []);

  const flyToImage = useCallback(
    (image: ObliqueImageRecord) => {
      if (!viewerRef.current) return;

      const viewer = viewerRef.current;

      // Extract position from the image record
      const { centerWGS84, calculatedHeading, sector } = image;
      if (!centerWGS84) return;

      // Create Cartesian3 from WGS84 coordinates
      const [longitude, latitude, height] = centerWGS84;
      const position = Cartesian3.fromDegrees(longitude, latitude, height);

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
        },
      });
    },
    [viewerRef, refreshNearestImageSearch]
  );

  // Don't render anything if not in oblique mode or panel is hidden
  if (!isObliqueMode || !isVisible || !nearestImage) {
    return null;
  }

  return (
    <ObliqueImageInfo
      imageRecord={nearestImage}
      distance={distanceToNearestImage}
      onClose={hidePanel}
      flyToImage={flyToImage}
    />
  );
};

export default ObliqueImageInfoContainer;
