import { CardinalDirectionEnum } from "./orientationUtils";

const HEADER = "X,Y,FILENAME,ORI";
const getCardinalDirection = (value: string): CardinalDirectionEnum => {
  if (!value) return CardinalDirectionEnum.North;

  const normalized = value.trim().toUpperCase();

  //console.log(normalized);

  if (normalized === 'NORD') return CardinalDirectionEnum.North;
  if (normalized === 'OST') return CardinalDirectionEnum.East;
  if (normalized === 'SUED') return CardinalDirectionEnum.South;
  if (normalized === 'WEST') return CardinalDirectionEnum.West;

  return CardinalDirectionEnum.North;
};

export type PointMapById = Map<string, [number, number]>;
export type PointMapByIdBySectorBlocks = Map<
  CardinalDirectionEnum,
  PointMapById
>;

export function parsePointMapByIdBySectorBlocksFromCSV(
  csvText: string
): PointMapByIdBySectorBlocks {
  // Check for BOM and remove if present
  const cleanedText = csvText.charCodeAt(0) === 0xFEFF ? csvText.slice(1) : csvText;
  // Split by newlines (handle both \n and \r\n)
  const lines = cleanedText.split(/\r?\n/).filter((line) => line.trim());

  const headerIndex = lines.findIndex((line) => line.includes(HEADER));
  const dataLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  const result: PointMapByIdBySectorBlocks = new Map([
    [CardinalDirectionEnum.North, new Map<string, [number, number]>()],
    [CardinalDirectionEnum.East, new Map<string, [number, number]>()],
    [CardinalDirectionEnum.South, new Map<string, [number, number]>()],
    [CardinalDirectionEnum.West, new Map<string, [number, number]>()],
  ]);

  dataLines.reduce((result, row) => {
    const parts = row.split(",");
    if (parts.length < 4) return result;

    const [xRaw, yRaw, id, cardinalString] = parts;
    const cardinal = getCardinalDirection(cardinalString);
    const x = parseFloat(xRaw);
    const y = parseFloat(yRaw);

    if (isNaN(x) || isNaN(y)) return result;

    result.get(cardinal)?.set(id, [x, y]);
    return result;
  }, result);

  return result;
}

export async function getFootprintCentroidsAsync(url: string): Promise<{
  pointMapByIdBySectorBlock: PointMapByIdBySectorBlocks;
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
    const centroids = parsePointMapByIdBySectorBlocksFromCSV(csvText);
    return {
      pointMapByIdBySectorBlock: centroids,
      stats: {
        pointCount: Array.from(centroids.values()).reduce(
          (acc, sectorBlock) => acc + sectorBlock.size,
          0
        ),
        processingTimeMs: performance.now() - startTime,
      },
    };
  } catch (error: any) {
    console.error("Error processing CSV:", error);
    throw error;
  }
}
