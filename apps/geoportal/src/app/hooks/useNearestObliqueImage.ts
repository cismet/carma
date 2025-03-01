import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Math as CesiumMath } from "cesium";

import { useCesiumContext } from "@carma-mapping/cesium-engine";

import { getObliqueMode } from "../store/slices/ui";
import { findNearestKObliqueImages } from "../helper/oblique/utils";
import type { ObliqueImageRecord } from "../helper/oblique/types";
import { getSectorFromHeading } from "../helper/oblique/orientationUtils";
import { type Converter } from "proj4";

export interface UseNearestObliqueImageOptions {
  trackingThreshold?: number;
  debounceTime?: number;
  enabled?: boolean;
  k?: number;
  matchSector?: boolean;
}

const defaultOptions: UseNearestObliqueImageOptions = {
  trackingThreshold: 5.0,
  debounceTime: 300,
  enabled: true,
  k: 5,
  matchSector: true,
};

/**
 * Hook to find the nearest oblique image to the current camera position
 */
export function useNearestObliqueImage(
  obliqueRecords: ObliqueImageRecord[] | null,
  converter: Converter | null,
  options: UseNearestObliqueImageOptions = defaultOptions
) {
  const { viewerRef } = useCesiumContext();
  const isObliqueMode = useSelector(getObliqueMode);
  const [nearestImage, setNearestImage] = useState<ObliqueImageRecord | null>(
    null
  );
  const [distance, setDistance] = useState<number | null>(null);

  // Function to refresh the search for the nearest image
  const refreshSearch = useCallback(() => {
    if (
      !viewerRef.current ||
      !obliqueRecords ||
      !obliqueRecords.length ||
      !converter ||
      !isObliqueMode
    ) {
      return;
    }

    try {
      const camera = viewerRef.current.camera;
      const cameraPosition = camera.positionCartographic;
      
      // Get camera heading and determine sector
      const cameraHeading = camera.heading;
      const cameraSector = getSectorFromHeading(cameraHeading);

      // Convert camera position to cartographic (longitude, latitude, height)
      const cartographic = cameraPosition;

      const positionInImageCrs = converter.inverse([
        CesiumMath.toDegrees(cartographic.longitude),
        CesiumMath.toDegrees(cartographic.latitude),
        cartographic.height,
      ]);

      // Find k nearest images
      const nearestImages = findNearestKObliqueImages(
        obliqueRecords,
        [positionInImageCrs[0], positionInImageCrs[1]],
        options.k || defaultOptions.k,
        (item) => {
          const record = obliqueRecords[item.index];
          
          // Filter out nadir images
          if (record.cameraId === "NAD") {
            return false;
          }
          
          // Apply sector matching if enabled
          if (options.matchSector && cameraSector && record.sector) {
            return record.sector === cameraSector;
          }
          
          return true;
        }
      );

      if (nearestImages.length > 0) {
        const nearestResult = nearestImages[0];
        setNearestImage(nearestResult.record);
        setDistance(nearestResult.distance);
      } else if (options.matchSector) {
        // If no images found with matching sector, try again without sector matching
        const fallbackImages = findNearestKObliqueImages(
          obliqueRecords,
          [positionInImageCrs[0], positionInImageCrs[1]],
          options.k || defaultOptions.k,
          (record) => obliqueRecords[record.index].cameraId !== "NAD"
        );
        
        if (fallbackImages.length > 0) {
          const nearestResult = fallbackImages[0];
          setNearestImage(nearestResult.record);
          setDistance(nearestResult.distance);
        }
      }
    } catch (error) {
      console.error("Error finding nearest oblique image:", error);
    }
  }, [viewerRef, obliqueRecords, converter, isObliqueMode, options.k, options.matchSector]);

  // Setup camera movement listener
  useEffect(() => {
    if (
      !viewerRef.current ||
      !isObliqueMode ||
      !obliqueRecords ||
      !obliqueRecords.length
    ) {
      return;
    }

    // Refresh on mount
    refreshSearch();

    // Refresh when camera moves
    const viewer = viewerRef.current;

    // Set up a debounced camera moved listener
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const handleCameraMove = () => {
      if (timerId) {
        clearTimeout(timerId);
      }

      timerId = setTimeout(() => {
        refreshSearch();
      }, options.debounceTime); // Debounce time
    };

    const removeListener =
      viewer.camera.changed.addEventListener(handleCameraMove);

    return () => {
      removeListener();
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [
    viewerRef,
    isObliqueMode,
    obliqueRecords,
    refreshSearch,
    options.debounceTime,
  ]);

  return { nearestImage, distance, refreshSearch };
}
