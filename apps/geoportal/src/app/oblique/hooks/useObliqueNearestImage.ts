import { useCallback, useEffect, useMemo, useRef } from "react";
import knn from "rbush-knn";

import { waitForCondition } from "@carma/cesium";
import { normalizeOptions } from "@carma-commons/utils";

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

export interface UseObliqueNearestImageOptions {
  debounceTime?: number;
  k?: number;
  maxDistanceMeters?: number;
}

const defaultOptions = {
  debounceTime: 150,
  k: NUM_NEAREST_IMAGES,
  maxDistanceMeters: 5000,
} satisfies Required<UseObliqueNearestImageOptions>;

export interface RefreshSearchArgs {
  direction?: CardinalDirectionEnum;
  headingRad?: number;
  immediate?: boolean;
  computeOnly?: boolean;
}

export function useObliqueNearestImage(
  debug = false,
  options: UseObliqueNearestImageOptions = defaultOptions
) {
  const { getScene, initialViewApplied } = useCesiumContext();
  const lastSearchTimeRef = useRef<number>(0);
  const { debounceTime, k, maxDistanceMeters } = useMemo(
    () => normalizeOptions(options, defaultOptions),
    [options]
  );
  const {
    converter,
    headingOffset,
    imageRecords,
    setSelectedImage,
    selectedImageDistanceRef,
    selectedImage,
    footprintCenterpointsRBushByCardinals,
    isObliqueMode,
    lockFootprint,
    suspendSelectionSearch,
    requestedHeadingRef,
  } = useOblique();

  // Per-frame cache for deduplication of identical requests
  const lastFrameIdRef = useRef<number | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const lastResultsRef = useRef<NearestObliqueImageRecord[] | null>(null);

  const refreshSearch = useCallback(
    (args?: RefreshSearchArgs): NearestObliqueImageRecord[] | undefined => {
      // Check if the search is enabled
      if (
        !isObliqueMode ||
        (lockFootprint && !args?.computeOnly) ||
        (suspendSelectionSearch && !args?.computeOnly)
      ) {
        debug && console.debug("refreshSearch skipped - disabled");
        return;
      }

      if (!imageRecords || !imageRecords.size || !converter) {
        return;
      }

      const scene = getScene();
      if (!isValidScene(scene)) return;

      if (scene.globe && scene.globe.depthTestAgainstTerrain !== true) {
        scene.globe.depthTestAgainstTerrain = true;
      }

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
      if (!usedOverride && !bypassDebounce && timeDelta < debounceTime) {
        debug && console.debug("Skipping refreshSearch");
        return;
      }
      lastSearchTimeRef.current = now;

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

        const orbit = pickSceneCenter(scene);
        const orbitPointCoords = orbit
          ? calculateImageCoordsFromCartesian(orbit, converter)
          : null;

        if (!orbitPointCoords) return;

        // Create the search point in local CRS coordinates, relative to orbit point
        // Compute per-frame cache key before heavy work
        const orbitPointTargetCrs = {
          x: orbitPointCoords[0],
          y: orbitPointCoords[1],
        };

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

        let filteredImages: NearestObliqueImageRecord[] = [];

        const centerpoints = footprintCenterpointsRBushByCardinals;

        if (centerpoints && centerpoints.has(cameraCardinal)) {
          const sectorTree = centerpoints.get(cameraCardinal);
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

                  // Discard images too far from camera (race condition protection)
                  if (distanceToCamera > maxDistanceMeters) {
                    debug &&
                      console.debug(
                        `Discarding image ${
                          item.id
                        }: distance ${distanceToCamera.toFixed(
                          0
                        )}m > ${maxDistanceMeters}m`
                      );
                    return null;
                  }

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
      debounceTime,
      k,
      maxDistanceMeters,
      footprintCenterpointsRBushByCardinals,
      setSelectedImage,
      selectedImageDistanceRef,
      isObliqueMode,
      lockFootprint,
      suspendSelectionSearch,
      requestedHeadingRef,
      selectedImage,
      debug,
    ]
  );

  // Attach camera listeners for automatic updates when in oblique mode
  // Initial search waits until the initial camera view has been applied and rendered.
  const timerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSearchRef = useRef(refreshSearch);
  refreshSearchRef.current = refreshSearch;
  const initialSearchDoneRef = useRef(false);
  const initialSearchInFlightRef = useRef(false);

  useEffect(() => {
    if (
      !isObliqueMode ||
      lockFootprint ||
      suspendSelectionSearch ||
      !imageRecords ||
      !imageRecords.size ||
      !initialViewApplied
    ) {
      return;
    }

    let cancelled = false;

    const scene = getScene();
    if (!isValidScene(scene)) return;

    const handleCameraMove = () => {
      if (timerIdRef.current) clearTimeout(timerIdRef.current);
      timerIdRef.current = setTimeout(() => {
        if (!sceneHasTweens(scene)) {
          refreshSearchRef.current();
        }
      }, debounceTime);
    };

    scene.camera.changed.addEventListener(handleCameraMove);
    scene.camera.moveEnd.addEventListener(handleCameraMove);

    if (!initialSearchDoneRef.current && !initialSearchInFlightRef.current) {
      initialSearchInFlightRef.current = true;
      (async () => {
        try {
          await waitForCondition(
            scene,
            (scene) => {
              if (
                cancelled ||
                !isValidScene(scene) ||
                initialSearchDoneRef.current
              ) {
                return true;
              }

              // Ensure picking works before we commit selection
              const center = pickSceneCenter(scene);
              if (!center) return false;

              const computed = refreshSearchRef.current({
                immediate: true,
                computeOnly: true,
              });
              if (!computed || computed.length === 0) return false;

              const committed = refreshSearchRef.current({ immediate: true });
              if (committed && committed.length > 0) {
                initialSearchDoneRef.current = true;
                return true;
              }

              return false;
            },
            600,
            "postRender"
          );
        } finally {
          initialSearchInFlightRef.current = false;
        }
      })();
    }

    return () => {
      cancelled = true;
      if (!scene.isDestroyed()) {
        scene.camera.changed.removeEventListener(handleCameraMove);
        scene.camera.moveEnd.removeEventListener(handleCameraMove);
      }
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, [
    getScene,
    imageRecords,
    isObliqueMode,
    initialViewApplied,
    lockFootprint,
    debounceTime,
    suspendSelectionSearch,
  ]);

  return refreshSearch;
}

export default useObliqueNearestImage;
