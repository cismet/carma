import { useState, useEffect, useRef } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import type {
  ExteriorOrientationDataArray,
  ExteriorOrientations,
  ObliqueImageRecord,
  ObliqueImageRecordMap,
  Proj4Converter,
} from "../types";

import { fetchGeoJson, FootprintProperties } from "../utils/footprintUtils";
import { getFootprintCenterpoints } from "../utils/footprintCenterpoints";

import {
  extendObliqueImageRecord,
  mapExtOriArrToRecord,
} from "../utils/obliqueImageRecord";

import { CardinalDirectionEnum } from "../utils/orientationUtils";
import {
  createRBushByCardinal,
  RBushBySectorBlocks,
} from "../utils/spatialIndexing";

type UseObliqueDataResult = {
  isLoading: boolean;
  isAllDataReady: boolean;
  progress: number;
  progressStage: string;
  imageRecordMap: ObliqueImageRecordMap | null;
  exteriorOrientations: ExteriorOrientations | null;
  footprintData: FeatureCollection<Polygon, FootprintProperties> | null;
  footprintCenterpointsRBushByCardinals: RBushBySectorBlocks | null;
  converter: Proj4Converter;
  error: string | null;
};

const fetchExteriorOrientationsJson = async (
  url: string
): Promise<ExteriorOrientations> => {
  const response = await fetch(url);
  return response.json();
};

export function useObliqueData(
  shouldLoadData: boolean = false,
  exteriorOrientationsURI: string | null,
  footprintsURI: string | null,
  converter: Proj4Converter,
  offset = 0,
  fallbackDirectionConfig: Record<
    string,
    Record<string, CardinalDirectionEnum>
  >,
  noNadir = true, // not used for now
  debug = true
): UseObliqueDataResult {
  const [isAllDataReady, setIsAllDataReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState<string>("Initializing");
  const [error, setError] = useState<string | null>(null);
  const [imageRecordMap, setImageRecordMap] = useState<Map<
    string,
    ObliqueImageRecord
  > | null>(null);
  const stats = useRef({
    imageCount: 0,
    processingTimeMs: 0,
    extensionTimeMs: 0,
    totalProcessingTimeMs: 0,
  });
  const [isExtOriLoading, setIsExtOriLoading] = useState(false);
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
  const [footprintError, setFootprintError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldLoadData || !footprintsURI) return;

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
  }, [shouldLoadData, converter, footprintsURI]);

  // Update global loading state when all data is ready
  useEffect(() => {
    if (
      !isLoading &&
      !isFootprintLoading &&
      !isExtOriLoading &&
      imageRecordMap &&
      imageRecordMap.size > 0
    ) {
      setIsAllDataReady(true);
    } else {
      setIsAllDataReady(false);
    }
  }, [isLoading, isFootprintLoading, isExtOriLoading, imageRecordMap]);

  // Load exterior orientations data when in oblique mode
  useEffect(() => {
    if (!shouldLoadData || !exteriorOrientationsURI) return;

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
  }, [shouldLoadData, exteriorOrientationsURI]);

  useEffect(() => {
    // Skip if we don't have exteriorOrientations data or if we've already processed the data
    if (
      !exteriorOrientations ||
      (imageRecordMap && imageRecordMap.size > 0) ||
      converter === null
    ) {
      return;
    }

    // Set loading state
    setIsLoading(true);

    const entries = Object.entries(exteriorOrientations);

    if (entries.length === 0) {
      console.warn(
        "Oblique: No exterior orientations found in data",
        exteriorOrientations
      );
      setIsLoading(false);
      setProgressStage("No exterior orientations found");
      setProgress(100);
      return;
    }

    const startTime = performance.now();
    setProgressStage("Parsing exterior orientations");

    // Step 2: Create a properly typed map for basic image records
    const extendedImageRecordMap = new Map<
      string,
      ExteriorOrientationDataArray
    >(entries);

    // processing in one step is faster than copy to another array or map
    for (const [key, value] of extendedImageRecordMap.entries()) {
      const record = mapExtOriArrToRecord(key, value);
      if (!record) {
        console.warn("Failed to parse exterior orientation:", key, value);
        extendedImageRecordMap.delete(key);
        continue;
      }
      const extendedRecord = extendObliqueImageRecord(
        record,
        converter,
        offset,
        fallbackDirectionConfig
      );
      if (!extendedRecord) {
        console.warn("Failed to extend image record:", key, value);
        extendedImageRecordMap.delete(key);
        continue;
      }
      extendedImageRecordMap.set(key, extendedRecord);
    }

    stats.current.processingTimeMs = performance.now() - startTime;

    if (entries.length !== extendedImageRecordMap.size) {
      console.warn(
        `ObliqueStats | Mismatch in image record count: ${entries.length} vs ${extendedImageRecordMap.size}`
      );
    }
    // entries will be garbage collected automatically when the useEffect completes

    setImageRecordMap(extendedImageRecordMap as ObliqueImageRecordMap);

    if (debug) {
      stats.current.imageCount = extendedImageRecordMap.size;

      if (extendedImageRecordMap.size > 0) {
        console.debug(
          "Oblique: First record:",
          extendedImageRecordMap.values().next().value
        );

        console.info(
          `ObliqueStats | Total records: ${extendedImageRecordMap.size}`
        );
        console.info(
          `ObliqueStats | Orientation parse time: ${stats.current.processingTimeMs} ms`
        );
      } else {
        console.info(
          "Oblique: No image records found in data",
          exteriorOrientations
        );
      }
    }

    setIsLoading(false);
    setProgressStage("Complete");
    setProgress(100);
  }, [
    fallbackDirectionConfig,
    exteriorOrientations,
    converter,
    noNadir,
    debug,
    offset,
    imageRecordMap,
  ]);

  // collect Error messages
  useEffect(() => {
    if (footprintError) {
      setError(footprintError);
    } else if (isExtOriLoading) {
      setError("Loading exterior orientations...");
    } else if (isLoading) {
      setError("Loading image records...");
    } else if (isFootprintLoading) {
      setError("Loading footprint data...");
    } else if (isAllDataReady) {
      setError(null);
    } else {
      setError("Undefined Error while loading data...");
    }
  }, [
    footprintError,
    isExtOriLoading,
    isLoading,
    isFootprintLoading,
    isAllDataReady,
  ]);

  return {
    isLoading,
    isAllDataReady,
    progress,
    progressStage,
    imageRecordMap,
    converter,
    error,
    exteriorOrientations,
    footprintData,
    footprintCenterpointsRBushByCardinals,
  };
}
