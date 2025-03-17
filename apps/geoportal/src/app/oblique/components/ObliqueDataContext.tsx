import React, {
  createContext,
  useEffect,
  useState,
  useMemo,
  ReactNode,
} from "react";
import { useSelector } from "react-redux";

import { getObliqueMode } from "../../store/slices/ui";
import { useObliqueData } from "../hooks/useObliqueData";
import { NUM_NEAREST_IMAGES } from "../config";
import { useNearestObliqueImage } from "../hooks/useNearestObliqueImage";
import {
  ObliqueDataProviderConfig,
  ObliqueImageRecord,
  ObliqueImageRecordMap,
  Proj4Converter,
} from "../types";
import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import { CardinalDirectionEnum } from "../utils/orientationUtils";
import {
  type FootprintCollection,
  fetchGeoJson,
  FOOTPRINT_URL,
} from "../utils/footprintUtils";
import { RBushBySectorBlocks } from "../utils/spatialIndexing";

// Define the shape of our context
interface ObliqueDataContextType {
  imageRecords: ObliqueImageRecordMap | null;
  centroidRBushBySectorBlocks: RBushBySectorBlocks | null;
  isLoading: boolean;
  error: string | null;
  nearestImage: ObliqueImageRecord | null;
  distanceToNearestImage: number | null;
  refreshNearestImageSearch: () => void;
  converter: Proj4Converter;
  previewQualityLevel: OBLIQUE_PREVIEW_QUALITY;
  previewPath: string;
  fixedPitch: number;
  fixedHeight: number;
  minFov: number;
  maxFov: number;
  headingOffset: number;
  footprintData: FootprintCollection | null;
  isFootprintLoading: boolean;
  footprintError: string | null;
  isAllDataReady: boolean;
  hasFlownToImage: boolean;
  setHasFlownToImage: (value: boolean) => void;
}

// Create the context with a default value
const ObliqueDataContext = createContext<ObliqueDataContextType | null>(null);

// Export the context for the hook file to use
export { ObliqueDataContext };

interface ObliqueDataProviderProps {
  children: ReactNode;
  config: ObliqueDataProviderConfig;
  fallbackDirectionConfig: Record<
    string,
    Record<string, CardinalDirectionEnum>
  >;
}

// Provider component that wraps parts of the app that need access to the context
export const ObliqueDataProvider: React.FC<ObliqueDataProviderProps> = ({
  children,
  config,
  fallbackDirectionConfig,
}) => {
  const isObliqueMode = useSelector(getObliqueMode);
  const [hasFlownToImage, setHasFlownToImage] = useState(false);
  const {
    orientationsURI,
    centroidsURI,
    crs,
    previewPath,
    previewQualityLevel,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
  } = config;

  // Use the oblique data hook to get camera orientations
  const {
    imageRecordMap,
    centroidRBushBySectorBlocks,
    parseCSV,
    isLoading,
    converter,
    error,
  } = useObliqueData(
    orientationsURI,
    centroidsURI,
    crs,
    headingOffset,
    fallbackDirectionConfig
  );

  // Use a stable reference for the centroid map to prevent unnecessary re-renders
  const centroidMapBySectorBlock = useMemo(
    () => centroidRBushBySectorBlocks,
    [centroidRBushBySectorBlocks]
  );

  // Store when data has been previously loaded to prevent duplicate loads
  const [dataLoaded, setDataLoaded] = useState(false);

  // Add nearest image finding
  const { nearestImage, distance, refreshSearch } = useNearestObliqueImage(
    imageRecordMap,
    converter,
    headingOffset,
    centroidMapBySectorBlock,
    { debounceTime: 150, k: NUM_NEAREST_IMAGES },
    hasFlownToImage
  );

  // Footprint data states
  const [footprintData, setFootprintData] =
    useState<FootprintCollection | null>(null);
  const [isFootprintLoading, setIsFootprintLoading] = useState(false);
  const [footprintError, setFootprintError] = useState<string | null>(null);

  // Global loading state
  const [isAllDataReady, setIsAllDataReady] = useState(false);

  // Only load data when oblique mode is enabled and not already loaded
  useEffect(() => {
    let isMounted = true;

    if (isObliqueMode && !isLoading && !dataLoaded) {
      // Load the CSV data only once
      parseCSV()
        .then(() => {
          if (isMounted) {
            setDataLoaded(true);
          }
        })
        .catch((error) => {
          console.error("Error loading oblique data:", error);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [isObliqueMode, parseCSV, isLoading, dataLoaded]);

  // Trigger nearest image search when data is loaded
  useEffect(() => {
    if (
      imageRecordMap &&
      imageRecordMap.size > 0 &&
      isObliqueMode &&
      !hasFlownToImage
    ) {
      refreshSearch();
    }
  }, [imageRecordMap, isObliqueMode, refreshSearch, hasFlownToImage]);

  // Load footprint data when in oblique mode
  useEffect(() => {
    if (!isObliqueMode) return;

    setIsFootprintLoading(true);
    setFootprintError(null);

    fetchGeoJson(FOOTPRINT_URL)
      .then((data) => {
        setFootprintData(data);
        setIsFootprintLoading(false);
      })
      .catch((error) => {
        console.error("Error loading footprint data:", error);
        setFootprintError(error.message);
        setIsFootprintLoading(false);
      });
  }, [isObliqueMode]);

  // Update global loading state when all data is ready
  useEffect(() => {
    if (dataLoaded && !isFootprintLoading && !isLoading) {
      setIsAllDataReady(true);
    } else {
      setIsAllDataReady(false);
    }
  }, [dataLoaded, isFootprintLoading, isLoading]);

  const value = {
    imageRecords: imageRecordMap,
    centroidRBushBySectorBlocks,
    isLoading,
    error,
    nearestImage,
    distanceToNearestImage: distance,
    refreshNearestImageSearch: refreshSearch,
    converter,
    previewPath,
    previewQualityLevel,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
    footprintData,
    isFootprintLoading,
    footprintError,
    isAllDataReady,
    hasFlownToImage,
    setHasFlownToImage,
  };

  return (
    <ObliqueDataContext.Provider value={value}>
      {children}
    </ObliqueDataContext.Provider>
  );
};
