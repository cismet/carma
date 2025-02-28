import { BasicObliqueImageRecord } from "./types";

const TO_RADIANS = Math.PI / 180;

function degreesToRadians(degrees: number): number {
  return degrees * TO_RADIANS;
}

export function processCsv(
  csvText: string,
  debug = true
): BasicObliqueImageRecord[] {
  const lines = csvText.split("\n").filter((line) => line.trim());

  const headerIndex = lines.findIndex((line) =>
    line.includes("photo;x;y;z;omega;phi;kappa")
  );
  const dataLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  return dataLines.map((line) => {
    const parts = line.split(";");
    const [, id, rawX, rawY, rawZ, rawOmega, rawPhi, rawKappa] = parts;

    const record: BasicObliqueImageRecord = {
      id,
      perspectiveCenter: {
        x: parseFloat(rawX),
        y: parseFloat(rawY),
        z: parseFloat(rawZ),
      },
      orientation: {
        omega: degreesToRadians(parseFloat(rawOmega)),
        phi: degreesToRadians(parseFloat(rawPhi)),
        kappa: degreesToRadians(parseFloat(rawKappa)),
      },
    };

    if (debug) {
      record.__debugRecord = line;
    }

    return record;
  });
}

export async function processCSV(url: string): Promise<{
  images: BasicObliqueImageRecord[];
  stats: {
    imageCount: number;
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
    const imageRecords = processCsv(csvText);
    return {
      images: imageRecords,
      stats: {
        imageCount: imageRecords.length,
        processingTimeMs: performance.now() - startTime,
      },
    };
  } catch (error: any) {
    console.error("Error processing CSV:", error);
    throw error;
  }
}

export function createImageOrientationsCSVParser() {
  return {
    parseCSV: processCSV,
  };
}
