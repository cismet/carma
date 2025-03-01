import { useState, useCallback } from "react";
import proj4, { type Converter } from "proj4";

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
  parseCSV: () => Promise<void | ObliqueImageRecord[]>;
  converter: Converter;
};

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
  const converter = proj4(crs, "EPSG:4326");

  // Function to parse camera orientation CSV
  const parseCSV = useCallback(async () => {
    // Check if we have a valid URL to parse
    if (!uri) {
      setError("No URL provided for CSV data");
      console.error("Attempted to parse CSV without a valid URL");
      return Promise.reject(new Error("No URL provided for CSV data"));
    }

    // Don't parse again if we're already loading
    if (isLoading) {
      console.log("CSV parsing already in progress, skipping request");
      return Promise.resolve(); // Return resolved promise when already loading
    }

    // If we already have data loaded, just return it
    if (imageRecords && imageRecords.length > 0) {
      console.log("CSV data already loaded, using cached data");
      return Promise.resolve(imageRecords);
    }

    // Reset states
    setIsLoading(true);
    setProgress(0);
    setProgressStage("Fetching camera orientations");
    setError(null);

    try {
      const parser = createImageOrientationsCSVParser();
      const result = await parser.parseCSV(uri);

      // Create the proj4 converter once

      // Transform basic records to ObliqueImageRecord with all required properties
      const completeRecords = result.images
        .filter((image) => {
          // Filter out records without valid perspectiveCenter
          if (
            !image.perspectiveCenter ||
            typeof image.perspectiveCenter.x === "undefined" ||
            typeof image.perspectiveCenter.y === "undefined" ||
            typeof image.perspectiveCenter.z === "undefined"
          ) {
            console.warn(
              "Filtering out record with invalid perspectiveCenter:",
              image.id
            );
            return false;
          }
          return true;
        })
        .map((image) => extendObliqueImageRecord(image, converter));

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

      setIsLoading(false);
      setProgressStage("Complete");
      setProgress(100);

      return Promise.resolve(completeRecords);
    } catch (error) {
      console.error("Error parsing CSV:", error);
      setError(`Error parsing CSV: ${error}`);
      setIsLoading(false);
      return Promise.reject(error);
    }
  }, [uri, isLoading, converter]);

  return {
    isLoading,
    progress,
    progressStage,
    imageRecords,
    converter,
    error,
    stats,
    parseCSV,
  };
}
