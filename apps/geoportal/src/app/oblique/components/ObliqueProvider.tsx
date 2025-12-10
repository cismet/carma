import React, {
  createContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
} from "react";
import knn from "rbush-knn";
import debounce from "lodash/debounce";

import type { FeatureCollection, Polygon } from "geojson";

import { useHashState } from "@carma-providers/hash-state";

import type { Radians } from "@carma/geo/types";

import type {
  ExteriorOrientations,
  NearestObliqueImageRecord,
  ObliqueAnimationsConfig,
  ObliqueDataProviderConfig,
  ObliqueFootprintsStyle,
  ObliqueImagePreviewStyle,
  ObliqueImageRecordMap,
  Proj4Converter,
} from "../types";

import { useObliqueData } from "../hooks/useObliqueData";
import {
  useCesiumContext,
  pickSceneCenter,
} from "@carma-mapping/engines/cesium";

import { FootprintProperties } from "../utils/footprintUtils";
import { RBushBySectorBlocks } from "../utils/spatialIndexing";
import type { CardinalDirectionEnum } from "../utils/orientationUtils";
import {
  getCardinalDirectionFromHeading,
  getHeadingFromCardinalDirection,
} from "../utils/orientationUtils";
import { calculateImageCoordsFromCartesian } from "../utils/obliqueReferenceUtils";
import type { RBushItem } from "../utils/spatialIndexing";

import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import { NUM_NEAREST_IMAGES } from "../config";
import { createConverter } from "../utils/crsUtils";
import { prefetchSiblingPreviewFor } from "../utils/prefetch";
import { useKnownSiblings } from "../hooks/useKnownSiblings";

const DEBOUNCE_MS = 250; // time in milliseconds
const DEBOUNCE_LEADING_EDGE = { leading: true, trailing: false };

type SelectedImageRefreshArgs = {
  direction?: CardinalDirectionEnum;
  headingRad?: number;
  immediate?: boolean;
  computeOnly?: boolean;
};

interface ObliqueContextType {
  isObliqueMode: boolean;
  toggleObliqueMode: () => void;
  converter: Proj4Converter;

  imageRecords: ObliqueImageRecordMap | null;
  exteriorOrientations: ExteriorOrientations | null;
  footprintData: FeatureCollection<Polygon, FootprintProperties> | null;
  footprintCenterpointsRBushByCardinals: RBushBySectorBlocks | null;

  selectedImage: NearestObliqueImageRecord | null;
  setSelectedImage: (image: NearestObliqueImageRecord | null) => void;
  selectedImageDistanceRef: React.MutableRefObject<number | null>;

  selectedImageRefresh:
    | ((
        args?: SelectedImageRefreshArgs
      ) => NearestObliqueImageRecord[] | undefined)
    | null;
  setSelectedImageRefresh: (
    refresh:
      | ((
          args?: SelectedImageRefreshArgs
        ) => NearestObliqueImageRecord[] | undefined)
      | null
  ) => void;
  lockFootprint: boolean;
  setLockFootprint: (value: boolean) => void;
  suspendSelectionSearch: boolean;
  setSuspendSelectionSearch: (value: boolean) => void;

  isLoading: boolean;
  isAllDataReady: boolean;
  error: string | null;

  previewQualityLevel: OBLIQUE_PREVIEW_QUALITY;
  previewPath: string;
  fixedPitch: number;
  fixedHeight: number;
  minFov: Radians;
  maxFov: Radians;
  headingOffset: number;

  animations: ObliqueAnimationsConfig;
  footprintsStyle: ObliqueFootprintsStyle;
  imagePreviewStyle: ObliqueImagePreviewStyle;

  // Known sibling lookup after visiting images
  knownSiblingIds: Record<
    string,
    Partial<Record<CardinalDirectionEnum, string>>
  >;
  prefetchSiblingPreview: (imageId: string, dir: CardinalDirectionEnum) => void;
  // Optional override for heading used in nearest-image computation (radians). One-shot.
  requestedHeadingRef: React.MutableRefObject<number | null>;
}

const ObliqueContext = createContext<ObliqueContextType | null>(null);

export { ObliqueContext };

interface ObliqueProviderProps {
  children: ReactNode;
  config: ObliqueDataProviderConfig;
  fallbackDirectionConfig: Record<
    string,
    Record<string, CardinalDirectionEnum>
  >;
}

export const ObliqueProvider: React.FC<ObliqueProviderProps> = ({
  children,
  config,
  fallbackDirectionConfig,
}) => {
  const {
    isViewerReady,
    initialCameraSettled,
    requestRender,
    withCamera,
    withViewer,
  } = useCesiumContext();
  const { updateHash, getHashValues } = useHashState();
  // Read initial oblique mode from hash only once on mount
  const [isObliqueMode, setIsObliqueMode] = useState<boolean>(() => {
    const { isOblique } = getHashValues();
    return isOblique === "1";
  });
  const [lockFootprint, setLockFootprint] = useState(false);
  const [suspendSelectionSearch, setSuspendSelectionSearch] = useState(false);
  const [selectedImage, setSelectedImage] =
    useState<NearestObliqueImageRecord | null>(null);
  const selectedImageDistanceRef = useRef<number | null>(null);
  const [selectedImageRefresh, setSelectedImageRefresh] = useState<
    | ((
        args?: SelectedImageRefreshArgs
      ) => NearestObliqueImageRecord[] | undefined)
    | null
  >(null);

  // After visiting images, store known siblings by cardinal for quick lookup

  const {
    exteriorOrientationsURI,
    footprintsURI,
    crs,
    previewPath,
    previewQualityLevel,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
    animations,
    footprintsStyle,
    imagePreviewStyle,
  } = config;

  // Store when data has been previously loaded to prevent duplicate loads

  const converter = useMemo(() => createConverter(crs, "EPSG:4326"), [crs]);

  const {
    imageRecordMap: imageRecords,
    isLoading,
    isAllDataReady,
    exteriorOrientations,
    footprintCenterpointsRBushByCardinals,
    footprintData,
    error,
  } = useObliqueData(
    isObliqueMode,
    exteriorOrientationsURI,
    footprintsURI,
    converter,
    headingOffset,
    fallbackDirectionConfig
  );

  const knownSiblingIds = useKnownSiblings(imageRecords, selectedImage);

  // Allows one-shot override of camera heading for nearest-image search flows
  const requestedHeadingRef = useRef<number | null>(null);
  const lastSearchTimeRef = useRef<number>(0);
  const lastFrameIdRef = useRef<number | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const lastResultsRef = useRef<NearestObliqueImageRecord[] | null>(null);
  const isInitialCameraSettled = initialCameraSettled === true;

  const refreshSearch = useCallback(
    (
      args?: SelectedImageRefreshArgs
    ): NearestObliqueImageRecord[] | undefined => {
      if (!isObliqueMode || (suspendSelectionSearch && !args?.computeOnly)) {
        return;
      }
      // Do not perform searches on load until initial camera was settled
      if (!isInitialCameraSettled) {
        return;
      }
      if (!imageRecords || !imageRecords.size || !converter) {
        return;
      }

      const now = Date.now();
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
      if (!usedOverride && !bypassDebounce && timeDelta < DEBOUNCE_MS) {
        return;
      }
      lastSearchTimeRef.current = now;

      try {
        let computedResults: NearestObliqueImageRecord[] | undefined;
        withCamera((camera, viewer) => {
          const cartographic = camera.positionCartographic;
          if (!cartographic) return;

          let heading = camera.heading;
          if (usedOverride) heading = overrideHeading as number;
          const effectiveHeading = heading - headingOffset;
          const cameraCardinal =
            getCardinalDirectionFromHeading(effectiveHeading);

          const orbit = pickSceneCenter(viewer.scene);
          let orbitPointCoords = orbit
            ? calculateImageCoordsFromCartesian(orbit, converter)
            : null;

          // Fallback: use camera position if pickSceneCenter fails (e.g., during initial load)
          if (!orbitPointCoords && cartographic) {
            const cameraLon = cartographic.longitude * (180 / Math.PI);
            const cameraLat = cartographic.latitude * (180 / Math.PI);
            const projected = converter.converter.forward([
              cameraLon,
              cameraLat,
            ]);
            orbitPointCoords = [
              projected[0],
              projected[1],
              cartographic.height,
            ];
          }

          if (!orbitPointCoords) return;

          const orbitPointTargetCrs = {
            x: orbitPointCoords[0],
            y: orbitPointCoords[1],
          };
          const k = NUM_NEAREST_IMAGES;
          const frameId =
            (
              viewer as unknown as {
                scene?: { frameState?: { frameNumber?: number } };
              }
            )?.scene?.frameState?.frameNumber ?? null;
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
                const nearestItems = knn(
                  sectorTree,
                  orbitPointTargetCrs.x,
                  orbitPointTargetCrs.y,
                  k
                );
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

          lastFrameIdRef.current = frameId;
          lastKeyRef.current = key;
          lastResultsRef.current = filteredImages;

          if (
            usedOverride &&
            refHeadingOverride != null &&
            explicitHeadingOverride == null
          ) {
            requestedHeadingRef.current = null;
          }

          if (!args?.computeOnly) {
            // Do not mutate selection until the initial camera has settled,
            // unless we explicitly override (direction/heading) to avoid stale selection
            if (isInitialCameraSettled || usedOverride) {
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
          }

          computedResults = filteredImages;
        });
        return computedResults;
      } catch (error) {
        console.error("Error in refreshSearch:", error);
      }
    },
    [
      imageRecords,
      converter,
      headingOffset,
      footprintCenterpointsRBushByCardinals,
      setSelectedImage,
      isObliqueMode,
      suspendSelectionSearch,
      requestedHeadingRef,
      selectedImage,
      isInitialCameraSettled,
      withCamera,
    ]
  );

  // Initial camera settled is driven by CesiumContextProvider/useInitializeViewer

  const performToggleAction = useCallback(() => {
    setIsObliqueMode((prevMode: boolean) => {
      const newMode = !prevMode;
      updateHash?.({ isOblique: newMode ? "1" : undefined });
      return newMode;
    });
  }, [setIsObliqueMode, updateHash]);

  const toggleObliqueMode = useMemo(
    () => debounce(performToggleAction, DEBOUNCE_MS, DEBOUNCE_LEADING_EDGE),
    [performToggleAction]
  );

  // When initial camera just settled, clear caches to avoid reusing stale results
  useEffect(() => {
    if (isInitialCameraSettled) {
      lastFrameIdRef.current = null;
      lastKeyRef.current = null;
      lastResultsRef.current = null;
    }
  }, [isInitialCameraSettled]);

  const prefetchSiblingPreview = useCallback(
    (imageId: string, dir: CardinalDirectionEnum) => {
      prefetchSiblingPreviewFor(
        imageId,
        dir,
        imageRecords,
        previewPath,
        previewQualityLevel
      );
    },
    [imageRecords, previewPath, previewQualityLevel]
  );

  // Trigger selection search when data is loaded
  useEffect(() => {
    if (
      imageRecords &&
      isObliqueMode &&
      isInitialCameraSettled &&
      !lockFootprint &&
      !suspendSelectionSearch &&
      typeof selectedImageRefresh === "function"
    ) {
      // TODO: check if this ever needed, remove if not
      selectedImageRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    imageRecords,
    isObliqueMode,
    isInitialCameraSettled,
    selectedImageRefresh,
    lockFootprint,
    suspendSelectionSearch,
  ]);

  useEffect(() => {
    setSelectedImageRefresh(() => refreshSearch);
  }, [refreshSearch, setSelectedImageRefresh]);

  // Log the active image once it is determined
  useEffect(() => {
    if (selectedImage?.record?.id) {
      console.info(
        "[OBLQ|ACTIVE_IMAGE]",
        selectedImage.record.id,
        selectedImage.imageCenter || null
      );
    }
  }, [selectedImage]);

  // Ensure nearest image search runs once on load from URL in oblique mode
  useEffect(() => {
    if (
      isObliqueMode &&
      isViewerReady &&
      isInitialCameraSettled &&
      isAllDataReady &&
      typeof selectedImageRefresh === "function" &&
      !lockFootprint &&
      !suspendSelectionSearch
    ) {
      // Run immediately to bypass debounce and use current camera heading,
      // then retry a few times with small render nudges until results are available
      let cancelled = false;
      const trySearch = (attemptsLeft: number, delay: number) => {
        if (cancelled || attemptsLeft <= 0) return;
        const results = selectedImageRefresh({ immediate: true });
        if (!results || results.length === 0) {
          requestRender({ delay: 50, repeat: 1 });
          // Increase delay progressively to allow scene to be ready for depth picking
          setTimeout(
            () => trySearch(attemptsLeft - 1, Math.min(delay * 1.5, 500)),
            delay
          );
        }
      };
      // Start with shorter delay, increase progressively
      trySearch(12, 80);

      // As a fallback, hook into a few postRender frames to attempt again when depth/orbit point is available
      let remainingFrames = 30;
      let detach: (() => void) | null = null;
      withViewer((viewer) => {
        const handler = () => {
          if (cancelled || remainingFrames-- <= 0) {
            viewer.scene.postRender.removeEventListener(handler);
            detach = null;
            return;
          }
          const results = selectedImageRefresh({
            immediate: true,
          });
          if (results && results.length > 0) {
            viewer.scene.postRender.removeEventListener(handler);
            detach = null;
          }
        };
        viewer.scene.postRender.addEventListener(handler);
        detach = () => viewer.scene.postRender.removeEventListener(handler);
      });

      // Minimal extra safety: schedule additional refreshes with longer delays
      const t1 = setTimeout(
        () => selectedImageRefresh({ immediate: true }),
        200
      );
      const t2 = setTimeout(
        () => selectedImageRefresh({ immediate: true }),
        500
      );
      const t3 = setTimeout(
        () => selectedImageRefresh({ immediate: true }),
        1000
      );
      return () => {
        cancelled = true;
        if (detach) detach();
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
    // We intentionally do not include imageRecords here to avoid multiple triggers
  }, [
    isObliqueMode,
    isViewerReady,
    isInitialCameraSettled,
    isAllDataReady,
    selectedImageRefresh,
    lockFootprint,
    suspendSelectionSearch,
    requestRender,
    withViewer,
  ]);

  // Single source of truth: trigger nearest-image refresh based on camera changes after settle
  useEffect(() => {
    if (
      !isObliqueMode ||
      !isViewerReady ||
      !isInitialCameraSettled ||
      typeof selectedImageRefresh !== "function"
    ) {
      return;
    }

    let removeListener: (() => void) | undefined;
    withViewer((viewer) => {
      const onCameraChange = () => {
        if (typeof selectedImageRefresh === "function") {
          selectedImageRefresh();
        }
      };
      // Listen to camera changes directly to avoid React re-renders on every frame
      viewer.scene.camera.changed.addEventListener(onCameraChange);
      // We also need moveEnd for some interactions
      viewer.scene.camera.moveEnd.addEventListener(onCameraChange);
      removeListener = () => {
        if (viewer && !viewer.isDestroyed()) {
          viewer.scene.camera.changed.removeEventListener(onCameraChange);
          viewer.scene.camera.moveEnd.removeEventListener(onCameraChange);
        }
      };
    });

    return () => {
      if (removeListener) removeListener();
    };
  }, [
    isObliqueMode,
    isViewerReady,
    isInitialCameraSettled,
    selectedImageRefresh,
    withViewer,
  ]);

  // Once a nearest image exists and the viewer is ready, retrigger render twice (100ms apart)
  // to ensure derived visuals (e.g., footprint outline) become visible without interaction
  useEffect(() => {
    if (isObliqueMode && isViewerReady && selectedImage && !lockFootprint) {
      requestRender({ delay: 500, repeat: 10, repeatInterval: 200 });
    }
  }, [
    isObliqueMode,
    isViewerReady,
    requestRender,
    selectedImage,
    lockFootprint,
  ]);

  // When initial camera apply starts (settled=false), clear selection and caches to avoid stale state.
  useEffect(() => {
    if (initialCameraSettled === false) {
      if (selectedImage !== null) setSelectedImage(null);
      selectedImageDistanceRef.current = null;
      lastFrameIdRef.current = null;
      lastKeyRef.current = null;
      lastResultsRef.current = null;
    }
  }, [initialCameraSettled, selectedImage, setSelectedImage]);

  const value = useMemo(
    () => ({
      isObliqueMode,
      imageRecords,
      isLoading,
      isAllDataReady,
      error,
      selectedImageDistanceRef,
      selectedImageRefresh,
      setSelectedImageRefresh,
      toggleObliqueMode,
      selectedImage,
      setSelectedImage,
      converter,
      previewPath,
      previewQualityLevel,
      fixedPitch,
      fixedHeight,
      minFov,
      maxFov,
      headingOffset,
      exteriorOrientations,
      footprintData,
      footprintCenterpointsRBushByCardinals,
      lockFootprint,
      setLockFootprint,
      suspendSelectionSearch,
      setSuspendSelectionSearch,
      animations,
      footprintsStyle,
      imagePreviewStyle,
      knownSiblingIds,
      prefetchSiblingPreview,
      requestedHeadingRef,
    }),
    [
      isObliqueMode,
      imageRecords,
      isLoading,
      isAllDataReady,
      error,
      selectedImageDistanceRef,
      selectedImageRefresh,
      setSelectedImageRefresh,
      toggleObliqueMode,
      selectedImage,
      setSelectedImage,
      converter,
      previewPath,
      previewQualityLevel,
      fixedPitch,
      fixedHeight,
      minFov,
      maxFov,
      headingOffset,
      exteriorOrientations,
      footprintData,
      footprintCenterpointsRBushByCardinals,
      lockFootprint,
      setLockFootprint,
      suspendSelectionSearch,
      setSuspendSelectionSearch,
      animations,
      footprintsStyle,
      imagePreviewStyle,
      knownSiblingIds,
      prefetchSiblingPreview,
      requestedHeadingRef,
    ]
  );

  return (
    <ObliqueContext.Provider value={value}>{children}</ObliqueContext.Provider>
  );
};
