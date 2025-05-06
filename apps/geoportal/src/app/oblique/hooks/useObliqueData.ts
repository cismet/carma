import { useState, useCallback, useMemo } from "react";

import { extendObliqueImageRecord } from "../utils/obliqueImageRecord";
import { getOrientedImageRecordAsync } from "../utils/parseOrientationsCSV";

import {
  ObliqueImageRecord,
  ObliqueImageRecordMap,
  Proj4Converter,
} from "../types";
import { CardinalDirectionEnum } from "../utils/orientationUtils";
import { createConverter } from "../utils/crsUtils";

type UseObliqueDataResult = {
  isLoading: boolean;
  progress: number;
  progressStage: string;
  imageRecordMap: ObliqueImageRecordMap | null;
  parseCSV: () => Promise<void | ObliqueImageRecordMap>;
  converter: Proj4Converter;
  error: string | null;
  stats: {
    imageCount: number;
    noNadir: boolean;
    processingTimeMs: number;
    extensionTimeMs: number;
    totalProcessingTimeMs: number;
  } | null;
};

export function useObliqueData(
  orientationsUri: string,
  crs = "EPSG:25832",
  offset = 0,
  fallbackDirectionConfig: Record<
    string,
    Record<string, CardinalDirectionEnum>
  >,
  noNadir = true,
  debug = true
): UseObliqueDataResult {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState<string>("Initializing");
  const [error, setError] = useState<string | null>(null);
  const [imageRecordMap, setImageRecordMap] = useState<Map<
    string,
    ObliqueImageRecord
  > | null>(null);
  const [stats, setStats] = useState<UseObliqueDataResult["stats"] | null>(
    null
  );
  const converter = useMemo(() => createConverter(crs, "EPSG:4326"), [crs]);

  // Function to parse camera orientation CSV
  const parseCSV =
    useCallback(async (): Promise<void | ObliqueImageRecordMap> => {
      // Check if we have a valid URL to parse
      if (!orientationsUri) {
        setError("No URL provided for CSV data");
        console.error("Attempted to parse CSV without a valid URL");
        return Promise.reject(new Error("No URL provided for CSV data"));
      }

      // Don't parse again if we're already loading
      if (isLoading) {
        console.info("CSV parsing already in progress, skipping request");
        return Promise.resolve(undefined); // Return resolved promise when already loading
      }

      // If we already have data loaded, just return it
      if (imageRecordMap && imageRecordMap.size > 0) {
        console.info("CSV data already loaded, using cached data");
        return Promise.resolve(imageRecordMap);
      }

      // Reset states
      setIsLoading(true);
      setProgress(0);
      setProgressStage("Fetching camera orientations");
      setError(null);

      try {
        const { images, stats } = await getOrientedImageRecordAsync(
          orientationsUri,
          noNadir,
          debug
        );
        // Transform basic records to ObliqueImageRecord with all required properties
        const extensionStartTime = performance.now();
        const completeRecords = images.map((image) =>
          extendObliqueImageRecord(
            image,
            converter,
            offset,
            fallbackDirectionConfig
          )
        );
        const extensionTimeMs = performance.now() - extensionStartTime;
        const totalProcessingTimeMs = stats.processingTimeMs + extensionTimeMs;

        const imageRecordMap = new Map<string, ObliqueImageRecord>();
        completeRecords.forEach((record) => {
          imageRecordMap.set(record.id, record);
        });

        setImageRecordMap(imageRecordMap);
        setStats({
          imageCount: completeRecords.length,
          noNadir,
          processingTimeMs: stats.processingTimeMs,
          extensionTimeMs,
          totalProcessingTimeMs,
        });

        // Log sample records to console
        if (completeRecords.length > 0) {
          console.debug("Sample OBLIQUE image records:");
          console.debug("First OBLIQUE record:", completeRecords[0]);

          console.info(
            `ObliqueStats | Total records: ${completeRecords.length}`
          );
          console.info(
            `ObliqueStats | Orientation parse time: ${stats.processingTimeMs} ms`
          );
          console.info(`ObliqueStats | Extension time: ${extensionTimeMs} ms`);
          console.info(
            `ObliqueStats | Total processing time: ${totalProcessingTimeMs} ms`
          );
        } else {
          console.info("No OBLIQUE image records found in CSV data");
        }

        setIsLoading(false);
        setProgressStage("Complete");
        setProgress(100);

        return Promise.resolve(imageRecordMap);
      } catch (error) {
        console.error("Error parsing CSV:", error);
        setError(`Error parsing CSV: ${error}`);
        setIsLoading(false);
        return Promise.reject(error) as Promise<never>;
      }
    }, [
      orientationsUri,
      fallbackDirectionConfig,
      isLoading,
      converter,
      noNadir,
      debug,
      offset,
      imageRecordMap,
    ]);

  return {
    isLoading,
    progress,
    progressStage,
    imageRecordMap,
    converter,
    error,
    stats,
    parseCSV,
  };
}
