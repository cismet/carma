import { ORIENTATIONS_CSV_HEADER } from "../constants";
import { BasicObliqueImageRecord } from "../types";
import { Math as CesiumMath } from "cesium";

function parseOrientedImageRecordsFromCsv(
  csvText: string,
  noNadir = true,
  debug = true
): BasicObliqueImageRecord[] {
  const lines = csvText.split("\n").filter((line) => line.trim());

  const headerIndex = lines.findIndex((line) =>
    line.includes(ORIENTATIONS_CSV_HEADER)
  );
  const dataLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  return dataLines
    .map((row) => {
      const parts = row.split(";");
      const [, id, rawX, rawY, rawZ, rawOmega, rawPhi, rawKappa] = parts;

      const [lineNumber, waypointNumber, imageDescription] = id.split("_");
      const cameraId = imageDescription.slice(0, 3);
      const locationNumber = parseInt(imageDescription.slice(3));

      if (noNadir && cameraId === "NAD") {
        return null;
      }

      const orientation = {
        omega: CesiumMath.toRadians(parseFloat(rawOmega)),
        phi: CesiumMath.toRadians(parseFloat(rawPhi)),
        kappa: CesiumMath.toRadians(parseFloat(rawKappa)),
      };

      const perspectiveCenter = {
        x: parseFloat(rawX),
        y: parseFloat(rawY),
        z: parseFloat(rawZ),
      };

      if (
        isNaN(orientation.omega) ||
        isNaN(orientation.phi) ||
        isNaN(orientation.kappa) ||
        isNaN(perspectiveCenter.x) ||
        isNaN(perspectiveCenter.y) ||
        isNaN(perspectiveCenter.z)
      ) {
        console.info("Invalid orientation or perspective center:", row);
        return null;
      }

      const record: BasicObliqueImageRecord = {
        id,
        cameraId,
        waypointId: `${lineNumber}_${waypointNumber}`,
        locationNumber,
        lineNumber,
        waypointNumber,
        perspectiveCenter,
        orientation,
      };

      if (debug) {
        record.__debugRecord = row;
      }

      return record;
    })
    .filter((record): record is BasicObliqueImageRecord => record !== null);
}

export async function getOrientedImageRecordAsync(
  url: string,
  noNadir = true,
  debug = true
): Promise<{
  images: BasicObliqueImageRecord[];
  stats: {
    imageCount: number;
    noNadir: boolean;
    processingTimeMs: number;
  };
}> {
  const startTime = performance.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/csv,text/plain" },
      mode: "cors",
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch CSV: ${response.status} ${response.statusText}`
      );
    }
    const csvText = await response.text();
    const imageRecords = parseOrientedImageRecordsFromCsv(
      csvText,
      noNadir,
      debug
    );
    return {
      images: imageRecords,
      stats: {
        imageCount: imageRecords.length,
        noNadir,
        processingTimeMs: performance.now() - startTime,
      },
    };
  } catch (error: any) {
    console.error("Error processing CSV:", error);
    throw error;
  }
}
