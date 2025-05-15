import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import knn from "rbush-knn";

import {
  cesiumSceneHasTweens,
  isValidViewerInstance,
  useCesiumContext,
} from "@carma-mapping/cesium-engine";

import { useOrbitPoint } from "./useOrbitPoint";
import { useOblique } from "./useOblique";

import { getCardinalDirectionFromHeading } from "../utils/orientationUtils";
import {
  calculatePointOnGround,
  calculatePointOnRadius,
  calculateSectorHeading,
  calculateImageCoordsFromCamera,
  calculateReferencePointFromOrbit,
  calculateImageCoordsFromCartesian,
} from "../utils/obliqueReferenceUtils";
import type { RBushItem } from "../utils/spatialIndexing";

import type { NearestObliqueImageRecord } from "../types";

import { NUM_NEAREST_IMAGES } from "../config";

interface UseObliqueNearestImageOptions {
  debounceTime?: number;
  k?: number;
}

const defaultOptions: UseObliqueNearestImageOptions = {
  debounceTime: 150,
  k: NUM_NEAREST_IMAGES,
};

export function useObliqueNearestImage(
  debug = false,
  options: UseObliqueNearestImageOptions = defaultOptions
) {
  const { viewerRef } = useCesiumContext();
  const lastSearchTimeRef = useRef<number>(0);
  const {
    converter,
    headingOffset,
    imageRecords,
    setNearestImageDistance,
    setNearestImageRefresh,
    setNearestImage,
    footprintCenterpointsRBushByCardinals,
    isObliqueMode,
  } = useOblique();

  const [nearestImages, setNearestImages] = useState<
    NearestObliqueImageRecord[]
  >([]);

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

  const orbitPoint = useOrbitPoint(isObliqueMode);

  // Function to refresh the search for nearest images
  const refreshSearch = useCallback(() => {
    // Check if the search is enabled
    if (!isObliqueMode) {
      debug && console.debug("refreshSearch skipped - disabled");
      return;
    }

    const viewer = viewerRef.current;
    if (
      !isValidViewerInstance(viewer) ||
      !imageRecords ||
      !imageRecords.size ||
      !converter ||
      !orbitPoint
    ) {
      return;
    }

    const timeDelta = Date.now() - lastSearchTimeRef.current;
    if (timeDelta < (options.debounceTime || defaultOptions.debounceTime)) {
      debug && console.debug("Skipping refreshSearch");
      return;
    }
    lastSearchTimeRef.current = Date.now();

    debug && console.debug(" refreshSearch");

    try {
      const camera = viewer.camera;
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

      const centerpoints = footprintCenterpointsRBushByCardinals;

      if (centerpoints && centerpoints.has(cameraCardinal)) {
        const sectorTree = centerpoints.get(cameraCardinal);
        debug && console.debug("sectorTree", sectorTree);
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
            // Map to records with distances - use obliqueRecords directly since it's already a Map
            filteredImages = nearestItems
              .map((item: RBushItem) => {
                const record = imageRecords.get(item.id);
                if (!record) return null;

                const { x, y } = record;

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
        setNearestImageDistance(nearestImageItem.distanceOnGround);
      } else {
        setNearestImage(null);
        setNearestImageDistance(null);
      }
    } catch (error) {
      console.error("Error finding nearest oblique image:", error);
    }
  }, [
    viewerRef,
    imageRecords,
    converter,
    headingOffset,
    options.k,
    options.debounceTime,
    orbitPoint,
    footprintCenterpointsRBushByCardinals,
    setNearestImageDistance,
    setNearestImage,
    debug,
    isObliqueMode,
  ]); // Include all dependencies for proper updates

  // Store timer ID in a ref to persist across renders
  const timerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNearestImageRefresh(refreshSearch);
  }, [refreshSearch, setNearestImageRefresh]);

  // Setup camera movement listener
  useEffect(() => {
    const viewer = viewerRef.current;
    // Don't set up camera listener if not enabled
    if (
      !isObliqueMode ||
      !isValidViewerInstance(viewer) ||
      !imageRecords ||
      !imageRecords.size
    ) {
      return;
    }

    // Refresh on mount
    refreshSearch();

    // Create a stable handler function that doesn't change on every render
    const handleCameraMove = () => {
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
      }

      timerIdRef.current = setTimeout(() => {
        !cesiumSceneHasTweens(viewer) && refreshSearch();
      }, options.debounceTime || defaultOptions.debounceTime);
    };

    viewer.camera.changed.addEventListener(handleCameraMove);
    const removeListener = () => {
      if (isValidViewerInstance(viewer)) {
        viewer.camera.changed.removeEventListener(handleCameraMove);
      }
    };

    return () => {
      removeListener();
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, [
    viewerRef,
    imageRecords,
    refreshSearch,
    options.debounceTime,
    isObliqueMode,
  ]); // Include necessary dependencies

  // Use useMemo to create a stable return object that only changes when its dependencies change
  const returnValue = useMemo(
    () => ({
      nearestImages,
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
      nearestImages,
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

export default useObliqueNearestImage;
