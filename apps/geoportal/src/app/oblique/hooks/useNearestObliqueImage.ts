import { useCallback, useEffect, useState, useRef } from "react";
import { type Converter } from "proj4";

import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { findNearestKObliqueImages } from "../utils/spatialIndexing";
import type { ObliqueImageRecord } from "../types";
import { getCardinalDirectionFromHeading } from "../utils/orientationUtils";
import { NUM_NEAREST_IMAGES } from "../config";
import { useOrbitPoint } from "./useOrbitPoint";
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
  obliqueRecords: ObliqueImageRecord[] | null,
  converter: Converter | null,
  headingOffset: number,
  options: UseNearestObliqueImageOptions = defaultOptions
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

  // Refs to prevent unnecessary recalculations
  const lastProcessedHeadingRef = useRef<number | null>(null);
  const lastProcessedPositionRef = useRef<{
    x: number;
    y: number;
    z: number;
  } | null>(null);
  const lastProcessedSectorRef = useRef<number | null>(null);

  // Function to refresh the search for nearest images
  const refreshSearch = useCallback(() => {
    if (
      !viewerRef.current ||
      !obliqueRecords ||
      !obliqueRecords.length ||
      !converter
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

      // Get the current camera position
      const position = camera.position;

      // Skip processing if neither heading nor position has changed enough
      if (
        lastProcessedHeadingRef.current !== null &&
        lastProcessedPositionRef.current !== null &&
        Math.abs(heading - lastProcessedHeadingRef.current) < 0.01745 && // approx 1 degree in radians
        lastProcessedSectorRef.current === cameraCardinal &&
        Math.abs(position.x - lastProcessedPositionRef.current.x) < 1 &&
        Math.abs(position.y - lastProcessedPositionRef.current.y) < 1 &&
        Math.abs(position.z - lastProcessedPositionRef.current.z) < 1
      ) {
        return;
      }

      // Update refs to prevent reprocessing
      lastProcessedHeadingRef.current = heading;
      lastProcessedSectorRef.current = cameraCardinal;
      lastProcessedPositionRef.current = {
        x: position.x,
        y: position.y,
        z: position.z,
      };

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
      const filteredImages = findNearestKObliqueImages(
        obliqueRecords,
        radiusPointInImageCrs,
        options.k || defaultOptions.k,
        (item) => {
          const record = obliqueRecords[item.index];
          return record.sector === cameraCardinal;
        }
      );

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

      // Set the single nearest image for backward compatibility
      if (filteredImages.length > 0) {
        setNearestImage(filteredImages[0].record);
        setDistance(filteredImages[0].distance);
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
  ]); // Include all dependencies for proper updates

  // Setup camera movement listener
  useEffect(() => {
    if (!viewerRef.current || !obliqueRecords || !obliqueRecords.length) {
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
  }, [viewerRef, obliqueRecords, refreshSearch, options.debounceTime]); // Include necessary dependencies

  // Memoize the return object to prevent unnecessary rerenders in consumers
  const returnRef = useRef({
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
  });

  // Update the return ref when state changes
  useEffect(() => {
    returnRef.current = {
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
    };
  }, [
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
  ]);

  return returnRef.current;
}
