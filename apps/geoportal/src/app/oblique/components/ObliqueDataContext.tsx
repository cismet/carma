import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useSelector } from "react-redux";
import { type Converter } from "proj4";

import { getObliqueMode } from "../../store/slices/ui";
import { useObliqueData } from "../hooks/useObliqueData";
import { useNearestObliqueImage } from "../hooks/useNearestObliqueImage";
import { ObliqueDataProviderConfig, ObliqueImageRecord } from "../types";
import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import { CardinalDirectionEnum } from "../utils/orientationUtils";
import {
  type FootprintCollection,
  fetchGeoJson,
  FOOTPRINT_URL,
} from "../utils/footprintUtils";

// Define the shape of our context
interface ObliqueDataContextType {
  imageRecords: ObliqueImageRecord[] | null;
  isLoading: boolean;
  error: string | null;
  nearestImage: ObliqueImageRecord | null;
  distanceToNearestImage: number | null;
  refreshNearestImageSearch: () => void;
  converter: Converter;
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
}

// Create the context with a default value
const ObliqueDataContext = createContext<ObliqueDataContextType | null>(null);

// Custom hook to use the oblique data context
const useObliqueDataContext = () => {
  const context = useContext(ObliqueDataContext);
  if (!context) {
    throw new Error(
      "useObliqueDataContext must be used within an ObliqueDataProvider"
    );
  }
  return context;
};

// Export the hook separately to avoid fast refresh issues
export { useObliqueDataContext };

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
  const {
    uri,
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
  const { imageRecords, parseCSV, isLoading, converter, error } =
    useObliqueData(uri, crs, headingOffset, fallbackDirectionConfig);

  // Store when data has been previously loaded to prevent duplicate loads
  const [dataLoaded, setDataLoaded] = useState(false);

  // Add nearest image finding
  const { nearestImage, distance, refreshSearch } = useNearestObliqueImage(
    imageRecords,
    converter,
    headingOffset
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
    if (imageRecords && imageRecords.length > 0 && isObliqueMode) {
      refreshSearch();
    }
  }, [imageRecords, isObliqueMode, refreshSearch]);

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
    imageRecords,
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
  };

  return (
    <ObliqueDataContext.Provider value={value}>
      {children}
    </ObliqueDataContext.Provider>
  );
};
