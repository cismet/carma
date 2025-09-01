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

import { useHashState } from "@carma-appframeworks/portals";

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
  isValidViewerInstance,
  getOrbitPoint,
} from "@carma-mapping/engines/cesium";
import { useOrbitPoint } from "../hooks/useOrbitPoint";

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
  force?: boolean;
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
  selectedImageDistance: number | null;
  setSelectedImageDistance: (distance: number | null) => void;

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
  minFov: number;
  maxFov: number;
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
  const { viewerRef } = useCesiumContext();
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

  const orbitPoint = useOrbitPoint(isObliqueMode);

  const refreshSearch = useCallback(
    (
      args?: SelectedImageRefreshArgs
    ): NearestObliqueImageRecord[] | undefined => {
      const force = !!args?.force;
      if (!isObliqueMode || (suspendSelectionSearch && !force)) {
        return;
      }

      const viewer = viewerRef.current;
      if (
        !isValidViewerInstance(viewer) ||
        !imageRecords ||
        !imageRecords.size ||
        !converter
      ) {
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
        const camera = viewer.camera;
        const cartographic = camera.positionCartographic;
        if (!cartographic) return;

        let heading = camera.heading;
        if (usedOverride) heading = overrideHeading as number;
        const effectiveHeading = heading - headingOffset;
        const cameraCardinal =
          getCardinalDirectionFromHeading(effectiveHeading);

        const orbit = orbitPoint ?? getOrbitPoint(viewer);
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

        return filteredImages;
      } catch (error) {
        console.error("Error in refreshSearch:", error);
      }
    },
    [
      viewerRef,
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

  const performToggleAction = useCallback(() => {
    setIsObliqueMode((prevMode: boolean) => {
      const newMode = !prevMode;
      updateHash && updateHash({ isOblique: newMode ? "1" : undefined });
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
