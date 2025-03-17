import { CardinalDirectionEnum } from "./orientationUtils";
import { createRBushByCardinal, RBushBySectorBlocks } from "./spatialIndexing";
import { PointWithSector } from "../types";

const HEADER = "X,Y,FILENAME,ORI";
const CARDINAL_STRINGS = Object.freeze({
  North: "NORD",
  East: "OST",
  South: "SUED",
  West: "WEST",
});

const getCardinalDirection = (value: string): CardinalDirectionEnum => {
  if (!value) return CardinalDirectionEnum.North;

  const normalized = value.trim().toUpperCase();

  if (normalized === CARDINAL_STRINGS.North) return CardinalDirectionEnum.North;
  if (normalized === CARDINAL_STRINGS.East) return CardinalDirectionEnum.East;
  if (normalized === CARDINAL_STRINGS.South) return CardinalDirectionEnum.South;
  if (normalized === CARDINAL_STRINGS.West) return CardinalDirectionEnum.West;

  return CardinalDirectionEnum.North;
};

export function parseFootprintCentroidsFromCSV(
  csvText: string
): PointWithSector[] {
  // Check for BOM and remove if present
  const cleanedText =
    csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  // Split by newlines (handle both \n and \r\n)
  const lines = cleanedText.split(/\r?\n/).filter((line) => line.trim());

  const headerIndex = lines.findIndex((line) => line.includes(HEADER));
  const dataLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  const centroids: PointWithSector[] = [];

  dataLines.forEach((row) => {
    const parts = row.split(",");
    if (parts.length < 4) return;

    const [xRaw, yRaw, id, cardinalString] = parts;
    const cardinal = getCardinalDirection(cardinalString);
    const x = parseFloat(xRaw);
    const y = parseFloat(yRaw);

    if (isNaN(x) || isNaN(y)) return;

    centroids.push({
      id,
      x,
      y,
      cardinal,
    });
  });

  return centroids;
}

export async function getFootprintCentroidsAsync(url: string): Promise<{
  centroids: PointWithSector[];
  rbushBySectorBlocks: RBushBySectorBlocks;
  stats: {
    pointCount: number;
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

    // First parse the CSV to get centroids
    const centroids = parseFootprintCentroidsFromCSV(csvText);

    // Then create spatial indices from the centroids
    const rbushBySectorBlocks = createRBushByCardinal(centroids);

    return {
      centroids,
      rbushBySectorBlocks,
      stats: {
        pointCount: centroids.length,
        processingTimeMs: performance.now() - startTime,
      },
    };
  } catch (error: unknown) {
    console.error("Error processing CSV:", error);
    throw error;
  }
}
