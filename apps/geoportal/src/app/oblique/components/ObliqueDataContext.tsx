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
}

// Create the context with a default value
const ObliqueDataContext = createContext<ObliqueDataContextType | null>(null);

// Custom hook to use the oblique data context
export const useObliqueDataContext = () => {
  const context = useContext(ObliqueDataContext);
  if (!context) {
    throw new Error(
      "useObliqueDataContext must be used within an ObliqueDataProvider"
    );
  }
  return context;
};

interface ObliqueDataProviderProps {
  children: ReactNode;
  config: ObliqueDataProviderConfig;
}

// Provider component that wraps parts of the app that need access to the context
export const ObliqueDataProvider: React.FC<ObliqueDataProviderProps> = ({
  children,
  config,
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
    useObliqueData(uri, crs);

  // Store when data has been previously loaded to prevent duplicate loads
  const [dataLoaded, setDataLoaded] = useState(false);

  // Add nearest image finding
  const { nearestImage, distance, refreshSearch } = useNearestObliqueImage(
    imageRecords,
    converter
  );

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
  };

  return (
    <ObliqueDataContext.Provider value={value}>
      {children}
    </ObliqueDataContext.Provider>
  );
};
