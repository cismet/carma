import { useState, useCallback, useMemo } from "react";

import { extendObliqueImageRecord } from "../utils/obliqueImageRecord";
import { getOrientedImageRecordAsync } from "../utils/parseOrientationsCSV";

import {
  ObliqueImageRecord,
  ObliqueImageRecordMap,
  Proj4Converter,
} from "../types";
import { CardinalDirectionEnum } from "../utils/orientationUtils";
import { getFootprintCentroidsAsync } from "../utils/parseFootprintCentroidsCSV";
import { RBushBySectorBlocks } from "../utils/spatialIndexing";
import { createConverter } from "../utils/crsUtils";

type UseObliqueDataResult = {
  isLoading: boolean;
  progress: number;
  progressStage: string;
  imageRecordMap: ObliqueImageRecordMap | null;
  centroidRBushBySectorBlocks: RBushBySectorBlocks | null;
  error: string | null;
  stats: {
    imageCount: number;
    noNadir: boolean;
    processingTimeMs: number;
    extensionTimeMs: number;
    totalProcessingTimeMs: number;
    centroidStats: {
      pointCount: number;
      processingTimeMs: number;
    } | null;
  } | null;

  parseCSV: () => Promise<void | [ObliqueImageRecordMap, RBushBySectorBlocks]>;
  converter: Proj4Converter;
};

export function useObliqueData(
  orientationsUri: string,
  centroidsUri: string,
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
  const [centroidRBushBySectorBlocks, setCentroidRBushBySectorBlocks] =
    useState<RBushBySectorBlocks | null>(null);
  const [stats, setStats] = useState<UseObliqueDataResult["stats"] | null>(
    null
  );
  const converter = useMemo(() => createConverter(crs, "EPSG:4326"), [crs]);

  // Function to parse camera orientation CSV
  const parseCSV = useCallback(async (): Promise<
    void | [ObliqueImageRecordMap, RBushBySectorBlocks]
  > => {
    // Check if we have a valid URL to parse
    if (!orientationsUri) {
      setError("No URL provided for CSV data");
      console.error("Attempted to parse CSV without a valid URL");
      return Promise.reject(new Error("No URL provided for CSV data"));
    }

    // Don't parse again if we're already loading
    if (isLoading) {
      console.log("CSV parsing already in progress, skipping request");
      return Promise.resolve(undefined); // Return resolved promise when already loading
    }

    // If we already have data loaded, just return it
    if (
      imageRecordMap &&
      imageRecordMap.size > 0 &&
      centroidRBushBySectorBlocks
    ) {
      console.log("CSV data already loaded, using cached data");
      return Promise.resolve([imageRecordMap, centroidRBushBySectorBlocks] as [
        ObliqueImageRecordMap,
        RBushBySectorBlocks
      ]);
    }

    // Reset states
    setIsLoading(true);
    setProgress(0);
    setProgressStage("Fetching camera orientations");
    setError(null);

    try {
      const { rbushBySectorBlocks, stats: centroidStats } =
        await getFootprintCentroidsAsync(centroidsUri);
      setCentroidRBushBySectorBlocks(rbushBySectorBlocks);

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
        centroidStats,
        noNadir,
        processingTimeMs: stats.processingTimeMs,
        extensionTimeMs,
        totalProcessingTimeMs,
      });

      // Log sample records to console
      if (completeRecords.length > 0) {
        console.log("Sample OBLIQUE image records:");
        console.log("First OBLIQUE record:", completeRecords[0]);
        console.log(
          "Last OBLIQUE record:",
          completeRecords[completeRecords.length - 1]
        );
        console.info(`ObliqueStats | Total records: ${completeRecords.length}`);
        console.info(
          `ObliqueStats | Orientation parse time: ${stats.processingTimeMs} ms`
        );
        console.info(`ObliqueStats | Extension time: ${extensionTimeMs} ms`);
        console.info(
          `ObliqueStats | Total processing time: ${totalProcessingTimeMs} ms`
        );
        console.info(`ObliqueStats | Centroids:`, rbushBySectorBlocks);
      } else {
        console.log("No OBLIQUE image records found in CSV data");
      }

      setIsLoading(false);
      setProgressStage("Complete");
      setProgress(100);

      return Promise.resolve([imageRecordMap, rbushBySectorBlocks] as [
        ObliqueImageRecordMap,
        RBushBySectorBlocks
      ]);
    } catch (error) {
      console.error("Error parsing CSV:", error);
      setError(`Error parsing CSV: ${error}`);
      setIsLoading(false);
      return Promise.reject(error) as Promise<never>;
    }
  }, [
    orientationsUri,
    centroidsUri,
    fallbackDirectionConfig,
    isLoading,
    converter,
    noNadir,
    debug,
    offset,
    imageRecordMap,
    centroidRBushBySectorBlocks,
  ]);

  return {
    isLoading,
    progress,
    progressStage,
    imageRecordMap,
    centroidRBushBySectorBlocks,
    converter,
    error,
    stats,
    parseCSV,
  };
}
