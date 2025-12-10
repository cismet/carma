import { useCallback, useEffect, useRef } from "react";
import knn from "rbush-knn";

import {
  sceneHasTweens,
  useCesiumContext,
  pickSceneCenter,
  isValidScene,
} from "@carma-mapping/engines/cesium";

import { useOblique } from "./useOblique";

import {
  getCardinalDirectionFromHeading,
  getHeadingFromCardinalDirection,
  type CardinalDirectionEnum,
} from "../utils/orientationUtils";
import { calculateImageCoordsFromCartesian } from "../utils/obliqueReferenceUtils";
import type { RBushItem } from "../utils/spatialIndexing";

import type { NearestObliqueImageRecord } from "../types";

import { NUM_NEAREST_IMAGES } from "../config";

interface UseObliqueNearestImageOptions {
  debounceTime?: number;
  k?: number;
  // When true, attaches a camera.changed listener for continuous updates
  continuous?: boolean;
}

const defaultOptions: UseObliqueNearestImageOptions = {
  debounceTime: 150,
  k: NUM_NEAREST_IMAGES,
  continuous: false,
};

interface RequestNearestArgs {
  direction?: CardinalDirectionEnum;
  headingRad?: number;
  immediate?: boolean; // bypass debounce
  computeOnly?: boolean; // don't mutate selection, just return results
}

export function useObliqueNearestImage(
  debug = false,
  options: UseObliqueNearestImageOptions = defaultOptions
) {
  const { getScene } = useCesiumContext();
  const lastSearchTimeRef = useRef<number>(0);
  const {
    converter,
    headingOffset,
    imageRecords,
    setSelectedImage,
    selectedImageDistanceRef,
    selectedImage,
    footprintCenterpointsRBushByCardinals,
    isObliqueMode,
    suspendSelectionSearch,
    requestedHeadingRef,
  } = useOblique();

  // Per-frame cache for deduplication of identical requests
  const lastFrameIdRef = useRef<number | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const lastResultsRef = useRef<NearestObliqueImageRecord[] | null>(null);

  // On-demand nearest-image search. Optionally override search heading
  const refreshSearch = useCallback(
    (args?: RequestNearestArgs): NearestObliqueImageRecord[] | undefined => {
      // Check if the search is enabled
      if (!isObliqueMode || (suspendSelectionSearch && !args?.computeOnly)) {
        debug && console.debug("refreshSearch skipped - disabled");
        return;
      }

      if (!imageRecords || !imageRecords.size || !converter) {
        return;
      }

      const scene = getScene();
      if (!isValidScene(scene)) return;

      const now = Date.now();
      // Determine override source: explicit args first, then context ref
      const explicitHeadingOverride =
        typeof args?.headingRad === "number"
          ? (args!.headingRad as number)
          : args?.direction != null
          ? getHeadingFromCardinalDirection(args.direction) + headingOffset
          : null;
      const refHeadingOverride =
        typeof requestedHeadingRef.current === "number"
          ? (requestedHeadingRef.current as number)
          : null;
      const overrideHeading =
        explicitHeadingOverride != null
          ? explicitHeadingOverride
          : refHeadingOverride;
      const usedOverride = typeof overrideHeading === "number";
      const timeDelta = now - lastSearchTimeRef.current;
      const bypassDebounce = !!args?.immediate;
      if (
        !usedOverride &&
        !bypassDebounce &&
        timeDelta < (options.debounceTime || defaultOptions.debounceTime)
      ) {
        debug && console.debug("Skipping refreshSearch");
        return;
      }
      lastSearchTimeRef.current = now;

      debug && console.debug(" refreshSearch");

      try {
        const camera = scene.camera;
        const cartographic = camera.positionCartographic;
        if (!cartographic) return;

        // Get camera heading and determine sector
        // Allow one-shot override of the camera heading via context ref (in radians)
        let heading = camera.heading;
        if (usedOverride) heading = overrideHeading as number;

        const effectiveHeading = heading - headingOffset;
        const cameraCardinal =
          getCardinalDirectionFromHeading(effectiveHeading);

        // Fallback to computing orbit point directly if shared orbit point isn't initialized yet
        const orbit = pickSceneCenter(scene);
        const orbitPointCoords = orbit
          ? calculateImageCoordsFromCartesian(orbit, converter)
          : null;

        // Calculate the point on ground based on camera pitch and heading
        // For nearest search we use orbit center as query point; ground/radius calcs omitted here

        // The orbit point coordinates are fetched by the useOrbitPoint hook
        if (!orbitPointCoords) return;

        // Create the search point in local CRS coordinates, relative to orbit point
        // Compute per-frame cache key before heavy work
        const orbitPointTargetCrs = {
          x: orbitPointCoords[0],
          y: orbitPointCoords[1],
        };
        const k = options.k || defaultOptions.k;
        const frameId =
          (scene as unknown as { frameState?: { frameNumber?: number } })
            .frameState?.frameNumber ?? null;
        const key = `${Math.round(orbitPointTargetCrs.x)}:${Math.round(
          orbitPointTargetCrs.y
        )}:${cameraCardinal}:${k}:${
          usedOverride ? (overrideHeading as number).toFixed(6) : "cam"
        }:${args?.computeOnly ? "co" : "mut"}`;

        if (
          frameId != null &&
          lastFrameIdRef.current === frameId &&
          lastKeyRef.current === key &&
          lastResultsRef.current
        ) {
          return lastResultsRef.current;
        }

        // Find and set nearest images
        let filteredImages: NearestObliqueImageRecord[] = [];

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
              // Map to records with distances
              filteredImages = nearestItems
                .map((item: RBushItem) => {
                  const record = imageRecords.get(item.id);
                  if (!record) return null;
                  const dxCam = orbitPointTargetCrs.x - record.x;
                  const dyCam = orbitPointTargetCrs.y - record.y;
                  const distanceToCamera = Math.sqrt(
                    dxCam * dxCam + dyCam * dyCam
                  );

                  const dxGround = orbitPointTargetCrs.x - item.x;
                  const dyGround = orbitPointTargetCrs.y - item.y;
                  const distanceOnGround = Math.sqrt(
                    dxGround * dxGround + dyGround * dyGround
                  );

                  const imageCenter = {
                    x: item.x,
                    y: item.y,
                    longitude: item.longitude,
                    latitude: item.latitude,
                    cardinal: item.cardinal,
                  };

                  return {
                    record,
                    distanceOnGround,
                    distanceToCamera,
                    imageCenter,
                  } as NearestObliqueImageRecord;
                })
                .filter(Boolean) as NearestObliqueImageRecord[];
            } catch (error) {
              console.error("Error during nearest images search:", error);
            }
          }
        }

        // Cache per-frame result
        lastFrameIdRef.current = frameId;
        lastKeyRef.current = key;
        lastResultsRef.current = filteredImages;

        // Reset the context heading override only if it was the source
        if (
          usedOverride &&
          refHeadingOverride != null &&
          explicitHeadingOverride == null
        ) {
          requestedHeadingRef.current = null;
        }

        // Apply selection unless computeOnly is requested
        if (!args?.computeOnly) {
          if (filteredImages?.length) {
            const next = filteredImages[0];
            if (selectedImage?.record?.id !== next.record.id) {
              setSelectedImage(next);
            }
            selectedImageDistanceRef.current = next.distanceOnGround;
          } else {
            if (selectedImage !== null) setSelectedImage(null);
            selectedImageDistanceRef.current = null;
            null;
          }
        }

        return filteredImages;
      } catch (error) {
        console.error("Error in refreshSearch:", error);
      }
    },
    [
      getScene,
      imageRecords,
      converter,
      headingOffset,
      options.k,
      options.debounceTime,
      footprintCenterpointsRBushByCardinals,
      setSelectedImage,
      isObliqueMode,
      suspendSelectionSearch,
      requestedHeadingRef,
      selectedImage,
      debug,
    ]
  ); // Include all dependencies for proper updates

  // Expose the on-request API via context as early as possible
  // Note: selection refresh is now managed by ObliqueProvider.

  // Optional continuous updates via camera.changed listener
  const timerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!options.continuous) return;

    if (
      !isObliqueMode ||
      suspendSelectionSearch ||
      !imageRecords ||
      !imageRecords.size
    ) {
      return;
    }

    const scene = getScene();
    if (!isValidScene(scene)) return;

    // Initial update
    refreshSearch({ immediate: true });

    const handleCameraMove = () => {
      if (suspendSelectionSearch) return;
      if (timerIdRef.current) clearTimeout(timerIdRef.current);
      timerIdRef.current = setTimeout(() => {
        if (!sceneHasTweens(scene) && !suspendSelectionSearch) {
          refreshSearch();
        }
      }, options.debounceTime || defaultOptions.debounceTime);
    };

    scene.camera.changed.addEventListener(handleCameraMove);
    return () => {
      if (!scene.isDestroyed()) {
        scene.camera.changed.removeEventListener(handleCameraMove);
      }
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, [
    options.continuous,
    getScene,
    imageRecords,
    refreshSearch,
    options.debounceTime,
    isObliqueMode,
    suspendSelectionSearch,
  ]);

  // Only return the on-request search callback
  return refreshSearch;
}

export default useObliqueNearestImage;
