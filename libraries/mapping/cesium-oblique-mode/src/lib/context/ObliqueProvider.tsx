import React, {
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
} from "react";
import knn from "rbush-knn";
import debounce from "lodash/debounce";

import { useHashState } from "@carma-appframeworks/portals";
import { normalizeOptions } from "@carma-commons/utils";

import type {
  NearestObliqueImageRecord,
  ObliqueDataProviderConfig,
  SelectedImageRefreshArgs,
} from "../types";

import { useObliqueData } from "../hooks/useObliqueData";
import {
  useCesiumContext,
  getOrbitPoint,
  isValidScene,
  Color,
} from "@carma-mapping/engines/cesium";
import { useOrbitPoint } from "../hooks/useOrbitPoint";

import type { CardinalDirectionEnum } from "../utils/orientationUtils";
import {
  getCardinalDirectionFromHeading,
  getHeadingFromCardinalDirection,
} from "../utils/orientationUtils";
import { calculateImageCoordsFromCartesian } from "../utils/obliqueReferenceUtils";
import type { RBushItem } from "../utils/spatialIndexing";

import { NUM_NEAREST_IMAGES } from "../config";
import { getProj4Converter, ManagedProjections } from "@carma/geo/proj";
import { prefetchSiblingPreviewFor } from "../utils/prefetch";
import { useKnownSiblings } from "../hooks/useKnownSiblings";
import { ObliqueContext } from "./ObliqueContext";
import { PI, PI_OVER_TWO } from "@carma/units/helpers";
import { Radians, Meters } from "@carma/units/types";
import { OBLIQUE_PREVIEW_QUALITIES } from "../constants";
import { Easing } from "@carma-commons/math";

const DEBOUNCE_MS = 250; // time in milliseconds
const DEBOUNCE_LEADING_EDGE = { leading: true, trailing: false };

// Validate required config properties
const validateRequiredConfig = (config: ObliqueDataProviderConfig) => {
  if (!config.exteriorOrientationsURI) {
    throw new Error("ObliqueProvider: exteriorOrientationsURI is required");
  }
  if (!config.footprintsURI) {
    throw new Error("ObliqueProvider: footprintsURI is required");
  }
  if (!config.crs) {
    throw new Error("ObliqueProvider: crs is required");
  }
  if (!config.previewPath) {
    throw new Error("ObliqueProvider: previewPath is required");
  }
};

type OptionalConfigOptions = Omit<
  ObliqueDataProviderConfig,
  "exteriorOrientationsURI" | "footprintsURI" | "crs" | "previewPath"
>;

// Default values for optional config properties
const defaultOptionalConfigOptions: Required<OptionalConfigOptions> = {
  fixedPitch: -PI_OVER_TWO as Radians, // Default 45° down
  fixedHeight: 800 as Meters, // Default 800m
  minFov: (PI * 0.01) as Radians,
  maxFov: (PI * 0.66) as Radians,
  headingOffset: 0 as Radians, // Default no offset
  previewQualityLevel: OBLIQUE_PREVIEW_QUALITIES.LEVEL_3,
  animations: {
    flyToExteriorOrientation: {
      duration: 800,
      easingFunction: Easing.QUADRATIC_IN,
    },
    flyToNextImage: {
      delay: 0,
      duration: 100,
      easingFunction: Easing.LINEAR_NONE,
    },
    flyToRotatedImage: {
      duration: 1800,
      easingFunction: Easing.CUBIC_IN_OUT,
    },
    outlineFadeOut: {
      delay: 500,
      duration: 300,
      easingFunction: Easing.QUADRATIC_IN_OUT,
    },
  },
  footprintsStyle: {
    outlineColor: Color.WHITE,
    outlineWidth: 8,
    outlineOpacity: 0.85,
  },
  imagePreviewStyle: {
    backdropColor: "rgba(0, 0, 0, 0.13)",
  },
} as const;

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
  const { sceneRef, requestRender } = useCesiumContext();
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
  const [selectedImageDistance, setSelectedImageDistance] = useState<
    number | null
  >(null);
  const [selectedImageRefresh, setSelectedImageRefresh] = useState<
    | ((
        args?: SelectedImageRefreshArgs
      ) => NearestObliqueImageRecord[] | undefined)
    | null
  >(null);

  // Validate required config properties upfront
  validateRequiredConfig(config);

  // Extract required properties - guaranteed to exist after validation
  const { exteriorOrientationsURI, footprintsURI, crs, previewPath } = config;

  // Extract only optional properties and normalize with defaults
  const {
    previewQualityLevel,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
    animations,
    footprintsStyle,
    imagePreviewStyle,
  } = normalizeOptions(
    config as OptionalConfigOptions,
    defaultOptionalConfigOptions
  );

  // Store when data has been previously loaded to prevent duplicate loads

  const converter = useMemo(
    () => getProj4Converter(crs, ManagedProjections.EPSG4326),
    [crs]
  );

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

  const orbitPoint = useOrbitPoint(isObliqueMode);

  const refreshSearch = useCallback(
    (
      args?: SelectedImageRefreshArgs
    ): NearestObliqueImageRecord[] | undefined => {
      const force = !!args?.force;
      const scene = sceneRef.current;
      if (!isValidScene(scene)) return;
      const { camera } = scene;

      if (!isObliqueMode || (suspendSelectionSearch && !force)) {
        return;
      }
      if (!imageRecords || !imageRecords.size || !converter) {
        return;
      }

      const appliedHeadingOffset = headingOffset ?? 0;

      const now = Date.now();
      const explicitHeadingOverride =
        typeof args?.headingRad === "number"
          ? (args!.headingRad as number)
          : args?.direction != null
          ? getHeadingFromCardinalDirection(args.direction) +
            appliedHeadingOffset
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
        const cartographic = camera.positionCartographic;
        if (!cartographic) return;

        let heading = camera.heading;
        if (usedOverride) heading = overrideHeading as number;
        const effectiveHeading = heading - appliedHeadingOffset;
        const cameraCardinal =
          getCardinalDirectionFromHeading(effectiveHeading);

        const orbit = orbitPoint ?? getOrbitPoint(scene);
        const orbitPointCoords = orbit
          ? calculateImageCoordsFromCartesian(orbit, converter)
          : null;
        if (!orbitPointCoords) return;

        const orbitPointTargetCrs = {
          x: orbitPointCoords[0],
          y: orbitPointCoords[1],
        };
        const k = NUM_NEAREST_IMAGES;
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
          if (filteredImages?.length) {
            const next = filteredImages[0];
            if (selectedImage?.record?.id !== next.record.id) {
              setSelectedImage(next);
            }
            setSelectedImageDistance(next.distanceOnGround);
          } else {
            if (selectedImage !== null) setSelectedImage(null);
            setSelectedImageDistance(null);
          }
        }

        computedResults = filteredImages;
        return computedResults;
      } catch (error) {
        console.error("Error in refreshSearch:", error);
      }
    },
    [
      sceneRef,
      imageRecords,
      converter,
      headingOffset,
      orbitPoint,
      footprintCenterpointsRBushByCardinals,
      setSelectedImageDistance,
      setSelectedImage,
      isObliqueMode,
      suspendSelectionSearch,
      requestedHeadingRef,
      selectedImage,
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
      isAllDataReady &&
      typeof selectedImageRefresh === "function" &&
      !lockFootprint &&
      !suspendSelectionSearch
    ) {
      // Run immediately to bypass debounce and use current camera heading,
      // then retry a few times with small render nudges until results are available
      let cancelled = false;
      const trySearch = (attemptsLeft: number) => {
        if (cancelled || attemptsLeft <= 0) return;
        const results = selectedImageRefresh({ immediate: true, force: true });
        if (!results || results.length === 0) {
          requestRender({ delay: 50, repeat: 1 });
          setTimeout(() => trySearch(attemptsLeft - 1), 60);
        }
      };
      trySearch(8);

      // As a fallback, hook into a few postRender frames to attempt again when depth/orbit point is available
      let remainingFrames = 20;
      let detach: (() => void) | null = null;

      const scene = sceneRef.current;
      if (!isValidScene(scene)) return;

      const handler = () => {
        if (cancelled || remainingFrames-- <= 0) {
          if (!isValidScene(scene)) return;
          scene.postRender.removeEventListener(handler);
          detach = null;
          return;
        }
        const results = selectedImageRefresh({
          immediate: true,
          force: true,
        });
        if (results && results.length > 0) {
          scene.postRender.removeEventListener(handler);
          detach = null;
        }
      };
      scene.postRender.addEventListener(handler);
      detach = () => scene.postRender.removeEventListener(handler);

      // Minimal extra safety: schedule two additional forced refreshes shortly after settle
      const t1 = setTimeout(
        () => selectedImageRefresh({ immediate: true, force: true }),
        150
      );
      const t2 = setTimeout(
        () => selectedImageRefresh({ immediate: true, force: true }),
        350
      );
      return () => {
        cancelled = true;
        if (detach) detach();
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    // We intentionally do not include imageRecords here to avoid multiple triggers
  }, [
    sceneRef,
    isObliqueMode,
    requestRender,
    isAllDataReady,
    selectedImageRefresh,
    lockFootprint,
    suspendSelectionSearch,
  ]);

  // Single source of truth: trigger nearest-image refresh based on orbitPoint changes after settle
  useEffect(() => {
    if (
      !isObliqueMode ||
      typeof selectedImageRefresh !== "function" ||
      !orbitPoint
    ) {
      return;
    }
    // Use debounced behavior inside refreshSearch; no force here during normal operation
    selectedImageRefresh();
  }, [isObliqueMode, orbitPoint, selectedImageRefresh]);

  // Once a nearest image exists and the viewer is ready, retrigger render twice (100ms apart)
  // to ensure derived visuals (e.g., footprint outline) become visible without interaction
  useEffect(() => {
    if (isObliqueMode && selectedImage && !lockFootprint) {
      requestRender({ delay: 500, repeat: 10, repeatInterval: 200 });
    }
  }, [isObliqueMode, selectedImage, lockFootprint, requestRender]);

  // When initial camera apply starts (settled=false), clear selection and caches to avoid stale state.
  useEffect(() => {
    if (selectedImage !== null) setSelectedImage(null);
    setSelectedImageDistance(null);
    lastFrameIdRef.current = null;
    lastKeyRef.current = null;
    lastResultsRef.current = null;
  }, [selectedImage, setSelectedImage, setSelectedImageDistance]);

  const value = {
    isObliqueMode,
    imageRecords,
    isLoading,
    isAllDataReady,
    error,
    selectedImageDistance,
    setSelectedImageDistance,
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
  };

  return (
    <ObliqueContext.Provider value={value}>{children}</ObliqueContext.Provider>
  );
};
