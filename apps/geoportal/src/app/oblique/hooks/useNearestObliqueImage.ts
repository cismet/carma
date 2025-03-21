import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import knn from "rbush-knn";

import { useCesiumContext } from "@carma-mapping/cesium-engine";

import { getCardinalDirectionFromHeading } from "../utils/orientationUtils";
import { useOrbitPoint } from "./useOrbitPoint";
import {
  calculatePointOnGround,
  calculatePointOnRadius,
  calculateSectorHeading,
  calculateImageCoordsFromCamera,
  calculateReferencePointFromOrbit,
  calculateImageCoordsFromCartesian,
} from "../utils/obliqueReferenceUtils";

import { NUM_NEAREST_IMAGES } from "../config";

import { RBushItem, type RBushBySectorBlocks } from "../utils/spatialIndexing";
import type {
  NearestObliqueImageRecord,
  ObliqueImageRecordMap,
  Proj4Converter,
} from "../types";

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
  centerpoints: RBushBySectorBlocks | null = null,
  options: UseNearestObliqueImageOptions = defaultOptions,
  lockFootprint: boolean = false
) {
  const { viewerRef } = useCesiumContext();
  const orbitPoint = useOrbitPoint();

  // State for values that need to be returned from the hook
  const [nearestImage, setNearestImage] =
    useState<NearestObliqueImageRecord | null>(null);
  const [nearestImages, setNearestImages] = useState<
    NearestObliqueImageRecord[]
  >([]);

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

  // Function to refresh the search for nearest images
  const refreshSearch = useCallback(() => {
    if (
      !viewerRef.current ||
      !obliqueRecords ||
      !obliqueRecords.size ||
      !converter ||
      !orbitPoint ||
      lockFootprint
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

      const orbitPointCoords = orbitPoint
        ? calculateImageCoordsFromCartesian(orbitPoint, converter)
        : null;

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
      let filteredImages = [];

      const orbitPointTargetCrs = {
        x: orbitPointCoords[0],
        y: orbitPointCoords[1],
      };
      const k = options.k || defaultOptions.k;

      if (centerpoints && centerpoints.has(cameraCardinal)) {
        const sectorTree = centerpoints.get(cameraCardinal);
        console.debug("sectorTree", sectorTree);
        if (sectorTree) {
          try {
            // Use the pre-built spatial index for this sector
            // Search directly based on orbit center coordinates
            const nearestItems = knn(
              sectorTree,
              orbitPointTargetCrs.x,
              orbitPointTargetCrs.y,
              k
            );
            console.debug(
              "sectorTree nearestItems",
              cameraCardinal,
              k,
              orbitPointTargetCrs,
              nearestItems
            );

            // Map to records with distances - use obliqueRecords directly since it's already a Map
            filteredImages = nearestItems
              .map((item: RBushItem) => {
                const record = obliqueRecords.get(item.id);
                if (!record) return null;

                const { x, y } = record.perspectiveCenter;

                // Calculate distance directly to orbit center for more stable results
                const dx = orbitPointTargetCrs.x - x;
                const dy = orbitPointTargetCrs.y - y;
                const distanceToCamera = Math.sqrt(dx * dx + dy * dy);

                // Calculate distance on ground
                const dxGround = orbitPointTargetCrs.x - item.x;
                const dyGround = orbitPointTargetCrs.y - item.y;
                const distanceOnGround = Math.sqrt(
                  dxGround * dxGround + dyGround * dyGround
                );

                return {
                  record,
                  distanceToCamera,
                  distanceOnGround,
                  imageCenter: item,
                };
              })
              .filter(Boolean);
          } catch (e) {
            console.warn("Error using spatial index", e);
          }
        }
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

        setNearestImage(nearestImageItem);
        setDistance(nearestImageItem.distanceOnGround);
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
    orbitPoint,
    centerpoints,
    lockFootprint,
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
      nearestImages,
      distance,
      refreshSearch,
      cameraPosition,
      cameraHeading,
      cardinalSector,
      radiusPointCoords,
      pointOnGround,
      pointOnRadius,
      sectorHeading,
    }),
    [
      nearestImage,
      nearestImages,
      distance,
      refreshSearch,
      cameraPosition,
      cameraHeading,
      cardinalSector,
      radiusPointCoords,
      pointOnGround,
      pointOnRadius,
      sectorHeading,
    ]
  );

  return returnValue;
}
