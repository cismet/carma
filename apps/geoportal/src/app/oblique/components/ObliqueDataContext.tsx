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
  ExteriorOrientations,
  NearestObliqueImageRecord,
  ObliqueDataProviderConfig,
  ObliqueImageRecord,
  ObliqueImageRecordMap,
  Proj4Converter,
} from "../types";
import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import { CardinalDirectionEnum } from "../utils/orientationUtils";
import { fetchGeoJson, FootprintProperties } from "../utils/footprintUtils";
import {
  RBushBySectorBlocks,
  createRBushByCardinal,
} from "../utils/spatialIndexing";
import { getFootprintCenterpoints } from "../utils/footprintCenterpoints";
import type { FeatureCollection, Polygon } from "geojson";
import { OBLIQUE_2024_EXT_ORI_UTM32_URI } from "@carma-commons/resources";

// Define the shape of our context
// todo: consolidate per Image result data into NearestImageRecord
interface ObliqueDataContextType {
  imageRecords: ObliqueImageRecordMap | null;
  isLoading: boolean;
  error: string | null;
  nearestImage: NearestObliqueImageRecord | null;
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
  exteriorOrientations: ExteriorOrientations | null;
  footprintData: FeatureCollection<Polygon, FootprintProperties> | null;
  footprintCenterpointsRBushByCardinals: RBushBySectorBlocks | null;
  isFootprintLoading: boolean;
  footprintError: string | null;
  isAllDataReady: boolean;
  lockFootprint: boolean;
  setLockFootprint: (value: boolean) => void;
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

const fetchExteriorOrientationsJson = async (
  url: string
): Promise<ExteriorOrientations> => {
  const response = await fetch(url);
  return response.json();
};

// Provider component that wraps parts of the app that need access to the context
export const ObliqueDataProvider: React.FC<ObliqueDataProviderProps> = ({
  children,
  config,
  fallbackDirectionConfig,
}) => {
  const isObliqueMode = useSelector(getObliqueMode);
  const [lockFootprint, setLockFootprint] = useState(false);
  const {
    orientationsURI,
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
  } = config;

  // Use the oblique data hook to get camera orientations
  const {
    imageRecordMap: imageRecords,
    parseCSV,
    isLoading,
    converter,
    error,
  } = useObliqueData(
    orientationsURI,
    crs,
    headingOffset,
    fallbackDirectionConfig
  );

  // Store when data has been previously loaded to prevent duplicate loads
  const [dataLoaded, setDataLoaded] = useState(false);

  // Footprint data states
  const [footprintData, setFootprintData] = useState<FeatureCollection<
    Polygon,
    FootprintProperties
  > | null>(null);
  const [
    footprintCenterpointsRBushByCardinals,
    setFootprintCenterpointsRBushByCardinals,
  ] = useState<RBushBySectorBlocks | null>(null);
  const [exteriorOrientations, setExteriorOrientations] =
    useState<ExteriorOrientations | null>(null);
  const [isFootprintLoading, setIsFootprintLoading] = useState(false);
  const [isExtOriLoading, setIsExtOriLoading] = useState(false);

  // Add nearest image finding
  const { nearestImage, distance, refreshSearch } = useNearestObliqueImage(
    imageRecords,
    converter,
    headingOffset,
    footprintCenterpointsRBushByCardinals,
    { debounceTime: 150, k: NUM_NEAREST_IMAGES },
    lockFootprint
  );

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
      imageRecords &&
      imageRecords.size > 0 &&
      isObliqueMode &&
      !lockFootprint
    ) {
      refreshSearch();
    }
  }, [imageRecords, isObliqueMode, refreshSearch, lockFootprint]);

  // Load footprint data when in oblique mode
  useEffect(() => {
    if (!isObliqueMode || !footprintsURI) return;

    setIsFootprintLoading(true);
    setFootprintError(null);

    fetchGeoJson(footprintsURI)
      .then((data: FeatureCollection<Polygon, FootprintProperties>) => {
        setFootprintData(data);
        const footprintCenterpoints = getFootprintCenterpoints(data, converter);
        const footprintCenterpointsRBushByCardinals = createRBushByCardinal(
          footprintCenterpoints
        );
        setFootprintCenterpointsRBushByCardinals(
          footprintCenterpointsRBushByCardinals
        );
        setIsFootprintLoading(false);
      })
      .catch((error) => {
        console.error("Error loading footprint data:", error);
        setFootprintError(error.message);
        setIsFootprintLoading(false);
      });
  }, [isObliqueMode, converter, footprintsURI]);

  // Load exterior orientations data when in oblique mode
  useEffect(() => {
    if (!isObliqueMode || !OBLIQUE_2024_EXT_ORI_UTM32_URI) return;

    setIsExtOriLoading(true);

    fetchExteriorOrientationsJson(exteriorOrientationsURI)
      .then((data: ExteriorOrientations) => {
        setExteriorOrientations(data);
        setIsExtOriLoading(false);
      })
      .catch((error) => {
        console.error("Error loading exterior orientations data:", error);
        setIsExtOriLoading(false);
      });
  }, [isObliqueMode, exteriorOrientationsURI]);

  // Update global loading state when all data is ready
  useEffect(() => {
    if (dataLoaded && !isFootprintLoading && !isExtOriLoading && !isLoading) {
      setIsAllDataReady(true);
    } else {
      setIsAllDataReady(false);
    }
  }, [dataLoaded, isFootprintLoading, isExtOriLoading, isLoading]);

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
    exteriorOrientations,
    footprintData,
    footprintCenterpointsRBushByCardinals,
    isFootprintLoading,
    footprintError,
    isAllDataReady,
    lockFootprint,
    setLockFootprint,
  };

  return (
    <ObliqueDataContext.Provider value={value}>
      {children}
    </ObliqueDataContext.Provider>
  );
};
