import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Cartographic, Math as CesiumMath } from "cesium";
import { type Converter } from "proj4";

import { getOrbitPoint, useCesiumContext } from "@carma-mapping/cesium-engine";

import { getObliqueMode } from "../../store/slices/ui";
import { findNearestKObliqueImages } from "../utils/spatialIndexing";
import type { ObliqueImageRecord } from "../types";
import {
  getCardinalDirectionFromHeading,
  getHeadingFromCardinalDirection,
} from "../utils/orientationUtils";
import { NADIR_CAMERA_ID } from "../constants";
import { NUM_NEAREST_IMAGES } from "../config";

export interface UseNearestObliqueImageOptions {
  debounceTime?: number;
  k?: number;
}

const defaultOptions: UseNearestObliqueImageOptions = {
  debounceTime: 150,
  k: NUM_NEAREST_IMAGES,
};

/**
 * Hook to find the nearest oblique image to the current camera position
 */
export function useNearestObliqueImage(
  obliqueRecords: ObliqueImageRecord[] | null,
  converter: Converter | null,
  headingOffset: number,
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
      const cartographic = camera.positionCartographic;

      // Get camera heading and determine sector
      const cameraHeading = camera.heading;
      const cameraSector = getCardinalDirectionFromHeading(cameraHeading);
      const effectiveHeading = cameraHeading - headingOffset;
      const cameraCardinal = getCardinalDirectionFromHeading(effectiveHeading);

      console.log(
        "Camera Sector:",
        cameraSector,
        cameraCardinal,
        cameraHeading,
        CesiumMath.toDegrees(headingOffset),
        CesiumMath.toDegrees(effectiveHeading)
      );

      const positionInLocalCrs = converter.inverse([
        CesiumMath.toDegrees(cartographic.longitude),
        CesiumMath.toDegrees(cartographic.latitude),
        cartographic.height,
      ]);

      const orbitPoint = getOrbitPoint(viewerRef.current);
      const orbitPointCartographic = Cartographic.fromCartesian(orbitPoint);

      const orbitPointInLocalCrs = converter.inverse([
        CesiumMath.toDegrees(orbitPointCartographic.longitude),
        CesiumMath.toDegrees(orbitPointCartographic.latitude),
        orbitPointCartographic.height,
      ]);

      const groundPointDistance = 740; // assumption
      const cardinalHeading =
        getHeadingFromCardinalDirection(cameraCardinal) + headingOffset;

      const offsetX = groundPointDistance * Math.sin(cardinalHeading);
      const offsetY = groundPointDistance * Math.cos(cardinalHeading);

      const testPositionCamera: [number, number] = [
        positionInLocalCrs[0],
        positionInLocalCrs[1],
      ];
      const testPositionGround: [number, number] = [
        orbitPointInLocalCrs[0] - offsetX,
        orbitPointInLocalCrs[1] - offsetY,
      ];

      const planarDistanceDiff = [
        positionInLocalCrs[0] - orbitPointInLocalCrs[0],
        positionInLocalCrs[1] - orbitPointInLocalCrs[1],
      ];

      const planarDistanceCameraGround = Math.sqrt(
        planarDistanceDiff[0] ** 2 + planarDistanceDiff[1] ** 2
      );

      console.log(
        "Test Position Camera:",
        planarDistanceCameraGround,
        planarDistanceDiff,
        offsetX,
        offsetY,
        testPositionCamera,
        testPositionGround,
        cardinalHeading
      );

      const nearestImages = findNearestKObliqueImages(
        obliqueRecords,
        testPositionGround,
        options.k || defaultOptions.k,
        (item) => {
          const record = obliqueRecords[item.index];

          // Filter out nadir images
          if (record.cameraId === NADIR_CAMERA_ID) {
            return false;
          }

          // Apply sector matching if enabled
          if (cameraSector && record.sector) {
            return record.sector === cameraSector;
          }

          return true;
        }
      );

      if (nearestImages.length > 0) {
        const nearestResult = nearestImages[0];
        setNearestImage(nearestResult.record);
        setDistance(nearestResult.distance);
      }
    } catch (error) {
      console.error("Error finding nearest oblique image:", error);
    }
  }, [
    viewerRef,
    obliqueRecords,
    converter,
    headingOffset,
    isObliqueMode,
    options.k,
  ]);

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
