import { useCallback, useEffect, useState, useRef, useMemo } from "react";

import { useCesiumContext } from "@carma-mapping/cesium-engine";
import {
  findNearestKObliqueImages,
  RBushBySectorBlocks,
} from "../utils/spatialIndexing";
import type {
  ObliqueImageRecord,
  ObliqueImageRecordMap,
  Proj4Converter,
} from "../types";
import { getCardinalDirectionFromHeading } from "../utils/orientationUtils";
import { NUM_NEAREST_IMAGES } from "../config";
import { useOrbitPoint } from "./useOrbitPoint";
import knn from "rbush-knn";
import {
  calculatePointOnGround,
  calculatePointOnRadius,
  calculateSectorHeading,
  calculateImageCoordsFromCamera,
  calculateReferencePointFromOrbit,
} from "../utils/obliqueReferenceUtils";

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
  obliqueRecords: ObliqueImageRecordMap | null,
  converter: Proj4Converter | null,
  headingOffset: number,
  centroidMapBySectorBlock: RBushBySectorBlocks | null = null,
  options: UseNearestObliqueImageOptions = defaultOptions,
  hasFlownToImage: boolean = false
) {
  const { viewerRef } = useCesiumContext();
  const { orbitPointCoords } = useOrbitPoint(converter);

  // State for values that need to be returned from the hook
  const [nearestImage, setNearestImage] = useState<ObliqueImageRecord | null>(
    null
  );
  const [distance, setDistance] = useState<number | null>(null);
  const [cameraPosition, setCameraPosition] = useState<[number, number]>([
    0, 0,
  ]);
  const [cameraHeading, setCameraHeading] = useState<number>(0);
  const [cardinalSector, setCardinalSector] = useState<number>(0);
  const [radiusPointCoords, setRadiusPointCoords] = useState<
    [number, number] | null
  >(null);
  const [pointOnGround, setPointOnGround] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [pointOnRadius, setPointOnRadius] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [sectorHeading, setSectorHeading] = useState<number>(0);
  const [nearestImages, setNearestImages] = useState<
    Array<{ record: ObliqueImageRecord; distance: number }>
  >([]);

  // Function to refresh the search for nearest images
  const refreshSearch = useCallback(() => {
    if (
      !viewerRef.current ||
      !obliqueRecords ||
      !obliqueRecords.size ||
      !converter ||
      !orbitPointCoords ||
      hasFlownToImage
    ) {
      return;
    }

    try {
      const camera = viewerRef.current.camera;
      const cartographic = camera.positionCartographic;
      if (!cartographic) return;

      // Get camera heading and determine sector
      const heading = camera.heading;
      const effectiveHeading = heading - headingOffset;
      const cameraCardinal = getCardinalDirectionFromHeading(effectiveHeading);

      // Get camera position in image CRS
      const positionInImageCrs = calculateImageCoordsFromCamera(
        cartographic.longitude,
        cartographic.latitude,
        cartographic.height,
        converter
      );

      // Calculate the point on ground based on camera pitch and heading
      const cameraHeight = cartographic.height;
      const calculatedPointOnGround = calculatePointOnGround(
        heading,
        cameraHeight,
        camera.pitch
      );

      // Calculate the sector heading based on cardinal direction
      const calculatedSectorHeading = calculateSectorHeading(
        cameraCardinal,
        headingOffset
      );

      // Calculate distance on ground using the camera pitch
      const distanceOnGround = camera.pitch
        ? cameraHeight * Math.tan(camera.pitch)
        : 0;

      // Calculate the point on radius
      const calculatedPointOnRadius = calculatePointOnRadius(
        calculatedPointOnGround,
        distanceOnGround,
        calculatedSectorHeading
      );

      // The orbit point coordinates are fetched by the useOrbitPoint hook
      if (!orbitPointCoords) return;

      // Create the search point in local CRS coordinates, relative to orbit point
      const radiusPointInImageCrs = calculateReferencePointFromOrbit(
        orbitPointCoords,
        positionInImageCrs,
        calculatedPointOnRadius
      );

      // Find and set nearest images
      let filteredImages;

      const testPoint = {
        x: orbitPointCoords[0],
        y: orbitPointCoords[1],
      };
      const k = options.k || defaultOptions.k;

      // If we have a pre-built centroid spatial index, use it
      if (
        centroidMapBySectorBlock &&
        centroidMapBySectorBlock.has(cameraCardinal)
      ) {
        const sectorTree = centroidMapBySectorBlock.get(cameraCardinal);
        console.debug("sectorTree", sectorTree);
        if (sectorTree) {
          try {
            // Use the pre-built spatial index for this sector
            // Search directly based on orbit center coordinates
            const nearestItems = knn(sectorTree, testPoint.x, testPoint.y, k);
            console.debug(
              "sectorTree nearestItems",
              cameraCardinal,
              k,
              testPoint,
              nearestItems
            );

            // Map to records with distances - use obliqueRecords directly since it's already a Map
            filteredImages = nearestItems
              .map((item) => {
                const record = obliqueRecords.get(item.id);
                if (!record) return null;

                // Calculate distance directly to orbit center for more stable results
                const dx = orbitPointCoords[0] - record.perspectiveCenter.x;
                const dy = orbitPointCoords[1] - record.perspectiveCenter.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                return { record, distance };
              })
              .filter(Boolean);
          } catch (e) {
            console.warn(
              "Error using centroid spatial index, falling back to regular search:",
              e
            );
          }
        }
      }

      // If we don't have filtered images from the centroid index, use an empty array
      if (!filteredImages) {
        filteredImages = [];
      }

      // Update state in a batch to minimize rerenders
      setCameraHeading(heading);
      setCardinalSector(cameraCardinal);
      setCameraPosition([positionInImageCrs[0], positionInImageCrs[1]]);
      setPointOnGround(calculatedPointOnGround);
      setSectorHeading(calculatedSectorHeading);
      setPointOnRadius(calculatedPointOnRadius);
      setRadiusPointCoords([
        radiusPointInImageCrs[0],
        radiusPointInImageCrs[1],
      ]);
      setNearestImages(filteredImages);

      // Set the single nearest image
      if (filteredImages && filteredImages.length > 0) {
        const nearestImageItem = filteredImages[0];

        setNearestImage(nearestImageItem.record);
        setDistance(nearestImageItem.distance);
      } else {
        setNearestImage(null);
        setDistance(null);
      }
    } catch (error) {
      console.error("Error finding nearest oblique image:", error);
    }
  }, [
    viewerRef,
    obliqueRecords,
    converter,
    headingOffset,
    options.k,
    orbitPointCoords,
    centroidMapBySectorBlock,
    hasFlownToImage,
  ]); // Include all dependencies for proper updates

  // Store timer ID in a ref to persist across renders
  const timerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Setup camera movement listener
  useEffect(() => {
    if (!viewerRef.current || !obliqueRecords || !obliqueRecords.size) {
      return;
    }

    // Refresh on mount
    refreshSearch();

    // Refresh when camera moves
    const viewer = viewerRef.current;

    // Create a stable handler function that doesn't change on every render
    const handleCameraMove = () => {
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
      }

      timerIdRef.current = setTimeout(() => {
        refreshSearch();
      }, options.debounceTime || defaultOptions.debounceTime);
    };

    const removeListener =
      viewer.camera.changed.addEventListener(handleCameraMove);

    return () => {
      removeListener();
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, [viewerRef, obliqueRecords, refreshSearch, options.debounceTime]); // Include necessary dependencies

  // Use useMemo to create a stable return object that only changes when its dependencies change
  const returnValue = useMemo(
    () => ({
      nearestImage,
      distance,
      refreshSearch,
      cameraPosition,
      cameraHeading,
      cardinalSector,
      radiusPointCoords,
      pointOnGround,
      pointOnRadius,
      sectorHeading,
      nearestImages,
    }),
    [
      nearestImage,
      distance,
      refreshSearch,
      cameraPosition,
      cameraHeading,
      cardinalSector,
      radiusPointCoords,
      pointOnGround,
      pointOnRadius,
      sectorHeading,
      nearestImages,
    ]
  );

  return returnValue;
}
