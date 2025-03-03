import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useSelector } from "react-redux";
import { type Converter } from "proj4";

import {
  OBLIQUE_2024_ORIENTATIONS_CSV_URI,
  OBLIQUE_2024_ORIENTATIONS_CRS,
  OBLIQUE_2024_PREVIEW_PATH,
} from "@carma-commons/resources";

import { getObliqueMode } from "../../store/slices/ui";
import { useObliqueData } from "../hooks/useObliqueData";
import { useNearestObliqueImage } from "../hooks/useNearestObliqueImage";
import { ObliqueImageRecord } from "../types";
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
  matchSector: boolean;
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

// Provider component that wraps parts of the app that need access to the context
export const ObliqueDataProvider: React.FC<{
  children: ReactNode;
  uri?: string;
  crs?: string;
  previewPath?: string;
  previewQualityLevel?: OBLIQUE_PREVIEW_QUALITY;
  matchSector?: boolean;
}> = ({
  children,
  uri = OBLIQUE_2024_ORIENTATIONS_CSV_URI,
  crs = OBLIQUE_2024_ORIENTATIONS_CRS,
  previewPath = OBLIQUE_2024_PREVIEW_PATH,
  previewQualityLevel = OBLIQUE_PREVIEW_QUALITY.LEVEL_3_HQ,
  matchSector = true,
}) => {
  // Get oblique mode state from Redux
  const isObliqueMode = useSelector(getObliqueMode);

  // Use the oblique data hook to get camera orientations
  const { imageRecords, parseCSV, isLoading, converter, error } =
    useObliqueData(uri, crs);

  // Store when data has been previously loaded to prevent duplicate loads
  const [dataLoaded, setDataLoaded] = useState(false);

  // Add nearest image finding
  const { nearestImage, distance, refreshSearch } = useNearestObliqueImage(
    imageRecords,
    converter,
    { matchSector }
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
    matchSector,
  };

  return (
    <ObliqueDataContext.Provider value={value}>
      {children}
    </ObliqueDataContext.Provider>
  );
};
