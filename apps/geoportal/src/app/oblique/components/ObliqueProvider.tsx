import React, {
  createContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
} from "react";
import debounce from "lodash/debounce";

import type { FeatureCollection, Polygon } from "geojson";

import { useHashState } from "@carma-apps/portals";

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

  imageRecords: ObliqueImageRecordMap | null;
  exteriorOrientations: ExteriorOrientations | null;
  footprintData: FeatureCollection<Polygon, FootprintProperties> | null;
  footprintCenterpointsRBushByCardinals: RBushBySectorBlocks | null;

  selectedImage: NearestObliqueImageRecord | null;
  setSelectedImage: (image: NearestObliqueImageRecord | null) => void;
  selectedImageDistance: number | null;
  setSelectedImageDistance: (distance: number | null) => void;

  selectedImageRefresh: () => void | null;
  setSelectedImageRefresh: (refresh: () => void | null) => void;
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
  const [selectedImageRefresh, setSelectedImageRefresh] =
    useState<() => void | null>(null);

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
  };

  return (
    <ObliqueContext.Provider value={value}>{children}</ObliqueContext.Provider>
  );
};
