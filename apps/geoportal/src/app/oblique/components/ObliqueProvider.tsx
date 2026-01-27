import React, {
  createContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
} from "react";
import debounce from "lodash/debounce";

import type { FeatureCollection, Polygon } from "geojson";

import { useSelection } from "@carma-appframeworks/portals";

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
import { useCesiumContext } from "@carma-mapping/engines/cesium";

import { FootprintProperties } from "../utils/footprintUtils";
import { RBushBySectorBlocks } from "../utils/spatialIndexing";
import type { CardinalDirectionEnum } from "../utils/orientationUtils";

import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import { createConverter } from "../utils/crsUtils";
import { prefetchSiblingPreviewFor } from "../utils/prefetch";
import { useKnownSiblings } from "../hooks/useKnownSiblings";

const DEBOUNCE_MS = 250; // time in milliseconds
const DEBOUNCE_LEADING_EDGE = { leading: true, trailing: false };

interface ObliqueContextType {
  isObliqueMode: boolean;
  toggleObliqueMode: () => void;
  converter: Proj4Converter;

  isPreviewVisible: boolean;
  setPreviewVisible: (visible: boolean) => void;

  imageRecords: ObliqueImageRecordMap | null;
  exteriorOrientations: ExteriorOrientations | null;
  footprintData: FeatureCollection<Polygon, FootprintProperties> | null;
  footprintCenterpointsRBushByCardinals: RBushBySectorBlocks | null;

  selectedImage: NearestObliqueImageRecord | null;
  setSelectedImage: (image: NearestObliqueImageRecord | null) => void;
  selectedImageDistanceRef: React.MutableRefObject<number | null>;
  lockFootprint: boolean;
  setLockFootprint: (value: boolean) => void;
  suspendSelectionSearch: boolean;
  setSuspendSelectionSearch: (value: boolean) => void;

  isLoading: boolean;
  isAllDataReady: boolean;
  error: string | null;

  previewQualityLevel: OBLIQUE_PREVIEW_QUALITY;
  downloadQualityLevel?: OBLIQUE_PREVIEW_QUALITY;
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
  const { isViewerReady, requestRender } = useCesiumContext();
  const { selectionFlyToCameraHeightRef } = useSelection();
  const { updateHash, getHashValues } = useHashState();
  // Read initial oblique mode from hash only once on mount
  const [isObliqueMode, setIsObliqueMode] = useState<boolean>(() => {
    const { isOblique } = getHashValues();
    return isOblique === "1";
  });
  const [lockFootprint, setLockFootprint] = useState(false);
  const [suspendSelectionSearch, setSuspendSelectionSearch] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [selectedImage, setSelectedImage] =
    useState<NearestObliqueImageRecord | null>(null);
  const selectedImageDistanceRef = useRef<number | null>(null);

  const setPreviewVisible = useCallback((visible: boolean) => {
    setIsPreviewVisible(visible);
  }, []);

  const {
    exteriorOrientationsURI,
    footprintsURI,
    crs,
    previewPath,
    previewQualityLevel,
    downloadQualityLevel,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
    animations,
    footprintsStyle,
    imagePreviewStyle,
  } = config;

  useEffect(() => {
    selectionFlyToCameraHeightRef.current = isObliqueMode ? fixedHeight : null;
    return () => {
      selectionFlyToCameraHeightRef.current = null;
    };
  }, [fixedHeight, isObliqueMode, selectionFlyToCameraHeightRef]);

  useEffect(() => {
    if (!isObliqueMode && isPreviewVisible) {
      setIsPreviewVisible(false);
    }
  }, [isObliqueMode, isPreviewVisible]);

  useEffect(() => {
    return () => {
      setIsPreviewVisible(false);
    };
  }, []);

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

  const value = useMemo(
    () => ({
      isObliqueMode,
      isPreviewVisible,
      setPreviewVisible,
      imageRecords,
      isLoading,
      isAllDataReady,
      error,
      selectedImageDistanceRef,
      toggleObliqueMode,
      selectedImage,
      setSelectedImage,
      converter,
      previewPath,
      previewQualityLevel,
      downloadQualityLevel,
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
      isPreviewVisible,
      setPreviewVisible,
      imageRecords,
      isLoading,
      isAllDataReady,
      error,
      selectedImageDistanceRef,
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
