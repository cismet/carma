import { MercatorCoordinate } from "maplibre-gl";
import {
  createLocalEcefFrame,
  createRasterEcefProjector,
} from "@carma-geo/proj";
import type { TerrainEcefConversionInput } from "./terrain-ecef-conversion";

const MAXIMUM_CONTEXTS = 8;
const MAXIMUM_LOOKUP_ENTRIES = 2048;

/** Only longitude columns and latitude rows are retained, never a vertex grid.
 * The key covers the exact immutable source extent and native origin. */
export const createTerrainEcefConversionContext = (
  input: Pick<TerrainEcefConversionInput, "origin" | "tile">
) => {
  const { bounds } = input.tile;
  const frame = createLocalEcefFrame(
    (bounds.west + bounds.east) / 2,
    (bounds.south + bounds.north) / 2
  );
  const project = createRasterEcefProjector({
    maximumCacheEntries: MAXIMUM_LOOKUP_ENTRIES,
  });
  const mercator = MercatorCoordinate.fromLngLat([...input.origin], 0);
  const scale = mercator.meterInMercatorCoordinateUnits();
  const verticalScales = new Map<number, number>();
  return {
    frame,
    project,
    mercator,
    scale,
    tileFromEcef: frame.ecefFromLocal.clone().invert(),
    verticalScale: (latitude: number) => {
      let value = verticalScales.get(latitude);
      if (value === undefined) {
        value = MercatorCoordinate.fromLngLat([0, latitude], 1).z / scale;
        if (verticalScales.size >= MAXIMUM_LOOKUP_ENTRIES)
          verticalScales.clear();
        verticalScales.set(latitude, value);
      }
      return value;
    },
    numericBytes: () =>
      project.cacheStats().numericBytes +
      verticalScales.size * 2 * Float64Array.BYTES_PER_ELEMENT +
      (frame.ecefFromLocal.elements.length +
        frame.localFromEcef.elements.length * 2 +
        3) *
        Float64Array.BYTES_PER_ELEMENT,
  };
};

const contexts = new Map<
  string,
  ReturnType<typeof createTerrainEcefConversionContext>
>();
export const getTerrainEcefConversionContext = (
  input: TerrainEcefConversionInput
) => {
  const { bounds } = input.tile;
  const key = JSON.stringify([
    ...input.origin,
    bounds.west,
    bounds.south,
    bounds.east,
    bounds.north,
  ]);
  let context = contexts.get(key);
  contexts.delete(key);
  if (!context) context = createTerrainEcefConversionContext(input);
  contexts.set(key, context);
  if (contexts.size > MAXIMUM_CONTEXTS)
    contexts.delete(contexts.keys().next().value!);
  return context;
};
export const terrainEcefConversionCacheStats = () => ({
  contexts: contexts.size,
  numericBytes: [...contexts.values()].reduce(
    (sum, context) => sum + context.numericBytes(),
    0
  ),
});
