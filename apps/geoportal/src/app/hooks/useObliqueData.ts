import { useState, useCallback } from "react";
import proj4 from "proj4";

import { createImageOrientationsCSVParser } from "../helper/oblique/parseOrientationsCSV";
import { ObliqueImageRecord } from "../helper/oblique/types";
import { extendObliqueImageRecord } from "../helper/oblique/utils";

type UseObliqueDataResult = {
  isLoading: boolean;
  progress: number;
  progressStage: string;
  imageRecords: ObliqueImageRecord[] | null;
  error: string | null;
  stats: {
    imageCount: number;
    processingTimeMs: number;
  } | null;
  parseCSV: (url?: string) => Promise<void>;
};

/**
 * Hook for parsing and managing oblique camera data
 */
export function useObliqueData(
  uri: string,
  crs = "EPSG:25832"
): UseObliqueDataResult {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState<string>("Initializing");
  const [error, setError] = useState<string | null>(null);
  const [imageRecords, setImageRecords] = useState<ObliqueImageRecord[] | null>(
    null
  );
  const [stats, setStats] = useState<UseObliqueDataResult["stats"] | null>(
    null
  );

  // Function to parse camera orientation CSV
  const parseCSV = useCallback(
    async (url?: string) => {
      // Reset states
      setIsLoading(true);
      setProgress(0);
      setProgressStage("Fetching camera orientations");
      setError(null);
      setImageRecords(null);

      try {
        const parser = createImageOrientationsCSVParser();
        const result = await parser.parseCSV(url || uri);

        // Create the proj4 converter once
        const converter = proj4(crs, "EPSG:4326");

        // Transform basic records to ObliqueImageRecord with all required properties
        const completeRecords = result.images.map((image) =>
          extendObliqueImageRecord(image, converter)
        );

        setImageRecords(completeRecords);
        setStats({
          imageCount: completeRecords.length,
          processingTimeMs: result.stats.processingTimeMs,
        });

        // Log sample records to console
        if (completeRecords.length > 0) {
          console.log("Sample OBLIQUE image records:");
          console.log("First OBLIQUE record:", completeRecords[0]);
          console.log(
            "Last OBLIQUE record:",
            completeRecords[completeRecords.length - 1]
          );
          console.log(`Total OBLIQUE records: ${completeRecords.length}`);
        } else {
          console.log("No OBLIQUE image records found in CSV data");
        }

        setProgress(100);
        setProgressStage("Complete");
      } catch (err: any) {
        setError(`Error parsing CSV: ${err.message}`);
        setProgressStage("Error");
        console.error("Error parsing CSV:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [uri, crs]
  );

  return {
    isLoading,
    progress,
    progressStage,
    imageRecords,
    error,
    stats,
    parseCSV,
  };
}
