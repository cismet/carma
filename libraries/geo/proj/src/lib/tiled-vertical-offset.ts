export interface GeographicBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const FLOAT32_VERTICAL_OFFSET_TILE_FORMAT =
  "carma-gcg2016-float32-tile-v2" as const;
const FLOAT32_VERTICAL_OFFSET_TILE_ENCODING =
  "base64-float32-little-endian" as const;

export interface Float32VerticalOffsetTile {
  format: typeof FLOAT32_VERTICAL_OFFSET_TILE_FORMAT;
  id: string;
  bounds: [number, number, number, number];
  grid: {
    firstLongitude: number;
    firstLatitude: number;
    stepLongitude: number;
    stepLatitude: number;
    columnStart: number;
    rowStart: number;
    width: number;
    height: number;
    noDataValue: number | null;
  };
  values: {
    encoding: typeof FLOAT32_VERTICAL_OFFSET_TILE_ENCODING;
    data: string;
  };
}

export type Float32VerticalOffsetTileLoader = () => Promise<unknown>;

export interface TiledVerticalOffsetModel {
  getOffset(longitude: number, latitude: number): Promise<number>;
  queryOffset(
    longitude: number,
    latitude: number
  ): Promise<TiledVerticalOffsetQueryResult>;
  prefetch(longitude: number, latitude: number, radius?: number): Promise<void>;
  clearCache(): void;
  readonly cachedTileCount: number;
}

export interface TiledVerticalOffsetQueryResult {
  offset: number;
  tileIds: readonly string[];
}

export class VerticalOffsetTileLoadError extends Error {
  readonly tileId: string;

  constructor(tileId: string, cause: unknown) {
    super(
      `Failed to load vertical-offset tile ${tileId}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause }
    );
    this.name = "VerticalOffsetTileLoadError";
    this.tileId = tileId;
  }
}

export class InvalidVerticalOffsetTileError extends Error {
  readonly tileId: string;

  constructor(tileId: string, reason: string) {
    super(`Invalid vertical-offset tile ${tileId}: ${reason}`);
    this.name = "InvalidVerticalOffsetTileError";
    this.tileId = tileId;
  }
}

export class UnsupportedVerticalOffsetRegionError extends RangeError {
  readonly longitude: number;
  readonly latitude: number;

  constructor(longitude: number, latitude: number, reason: string) {
    super(
      `No vertical-offset sample for ${longitude.toFixed(8)}, ` +
        `${latitude.toFixed(8)}: ${reason}`
    );
    this.name = "UnsupportedVerticalOffsetRegionError";
    this.longitude = longitude;
    this.latitude = latitude;
  }
}

interface DecodedTile {
  source: Float32VerticalOffsetTile;
  values: Float32Array;
}

interface TiledVerticalOffsetModelOptions {
  supportedRegion: GeographicBounds;
  rootTileSizeDegrees: number;
  tileLoaders: Readonly<Record<string, Float32VerticalOffsetTileLoader>>;
}

const SPLINE_STENCIL_RADIUS_BEFORE = 1;
const SPLINE_STENCIL_SIZE = 5;

const isLittleEndian = (() => {
  const bytes = new Uint8Array(2);
  new Uint16Array(bytes.buffer)[0] = 1;
  return bytes[0] === 1;
})();

const decodeBase64Float32 = (encoded: string) => {
  const binary = globalThis.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new RangeError(
      `decoded byte length ${bytes.byteLength} is not divisible by four`
    );
  }
  if (isLittleEndian) return new Float32Array(bytes.buffer);

  const view = new DataView(bytes.buffer);
  const values = new Float32Array(
    bytes.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  for (let index = 0; index < values.length; index += 1) {
    values[index] = view.getFloat32(
      index * Float32Array.BYTES_PER_ELEMENT,
      true
    );
  }
  return values;
};

const formatTileId = (west: number, south: number) => {
  const latitudePrefix = south < 0 ? "S" : "N";
  const longitudePrefix = west < 0 ? "W" : "E";
  return (
    `${latitudePrefix}${Math.abs(south).toString().padStart(2, "0")}` +
    `${longitudePrefix}${Math.abs(west).toString().padStart(3, "0")}`
  );
};

const tileCoordinates = (
  longitude: number,
  latitude: number,
  supportedRegion: GeographicBounds,
  rootTileSizeDegrees: number
) => ({
  west:
    supportedRegion.west +
    Math.floor((longitude - supportedRegion.west) / rootTileSizeDegrees) *
      rootTileSizeDegrees,
  south:
    supportedRegion.south +
    Math.floor((latitude - supportedRegion.south) / rootTileSizeDegrees) *
      rootTileSizeDegrees,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const unwrapTileModule = (loaded: unknown) =>
  isRecord(loaded) && "default" in loaded ? loaded.default : loaded;

const parseTile = (
  source: unknown,
  expectedId: string
): Float32VerticalOffsetTile => {
  if (!isRecord(source)) {
    throw new InvalidVerticalOffsetTileError(
      expectedId,
      "module does not export an object"
    );
  }
  if (source.id !== expectedId) {
    throw new InvalidVerticalOffsetTileError(
      expectedId,
      `loader returned tile ${String(source.id)}`
    );
  }
  if (source.format !== FLOAT32_VERTICAL_OFFSET_TILE_FORMAT) {
    throw new InvalidVerticalOffsetTileError(
      expectedId,
      `unsupported format ${String(source.format)}`
    );
  }
  if (
    !Array.isArray(source.bounds) ||
    source.bounds.length !== 4 ||
    source.bounds.some((value) => !Number.isFinite(value))
  ) {
    throw new InvalidVerticalOffsetTileError(
      expectedId,
      "bounds must contain four finite numbers"
    );
  }
  if (!isRecord(source.grid)) {
    throw new InvalidVerticalOffsetTileError(
      expectedId,
      "grid definition is missing"
    );
  }
  const { grid } = source;
  if (
    !Number.isFinite(grid.firstLongitude) ||
    !Number.isFinite(grid.firstLatitude) ||
    !Number.isFinite(grid.stepLongitude) ||
    grid.stepLongitude === 0 ||
    !Number.isFinite(grid.stepLatitude) ||
    grid.stepLatitude === 0 ||
    !Number.isInteger(grid.columnStart) ||
    !Number.isInteger(grid.rowStart) ||
    !Number.isInteger(grid.width) ||
    Number(grid.width) <= 0 ||
    !Number.isInteger(grid.height) ||
    Number(grid.height) <= 0 ||
    (grid.noDataValue !== null && !Number.isFinite(grid.noDataValue))
  ) {
    throw new InvalidVerticalOffsetTileError(
      expectedId,
      "grid contains invalid coordinates, dimensions, or NoData value"
    );
  }
  if (
    !isRecord(source.values) ||
    source.values.encoding !== FLOAT32_VERTICAL_OFFSET_TILE_ENCODING ||
    typeof source.values.data !== "string"
  ) {
    throw new InvalidVerticalOffsetTileError(
      expectedId,
      "values use an unsupported encoding or contain no data"
    );
  }

  return source as unknown as Float32VerticalOffsetTile;
};

const decodeTile = (rawSource: unknown, expectedId: string): DecodedTile => {
  const source = parseTile(rawSource, expectedId);
  let values: Float32Array;
  try {
    values = decodeBase64Float32(source.values.data);
  } catch (cause) {
    throw new InvalidVerticalOffsetTileError(
      source.id,
      `cannot decode Float32 values: ${
        cause instanceof Error ? cause.message : String(cause)
      }`
    );
  }
  const expectedLength = source.grid.width * source.grid.height;
  if (values.length !== expectedLength) {
    throw new InvalidVerticalOffsetTileError(
      source.id,
      `contains ${values.length} samples; expected ${expectedLength}`
    );
  }
  return { source, values };
};

const assertCompatibleGrid = (primary: DecodedTile, candidate: DecodedTile) => {
  const primaryGrid = primary.source.grid;
  const candidateGrid = candidate.source.grid;
  if (
    candidateGrid.firstLongitude !== primaryGrid.firstLongitude ||
    candidateGrid.firstLatitude !== primaryGrid.firstLatitude ||
    candidateGrid.stepLongitude !== primaryGrid.stepLongitude ||
    candidateGrid.stepLatitude !== primaryGrid.stepLatitude ||
    candidateGrid.noDataValue !== primaryGrid.noDataValue
  ) {
    throw new InvalidVerticalOffsetTileError(
      candidate.source.id,
      `grid definition or NoData value differs from ${primary.source.id}`
    );
  }
};

const readSourceSample = (
  tile: DecodedTile,
  sourceColumn: number,
  sourceRow: number
) => {
  const { grid } = tile.source;
  const column = sourceColumn - grid.columnStart;
  const row = sourceRow - grid.rowStart;
  if (column < 0 || row < 0 || column >= grid.width || row >= grid.height) {
    throw new InvalidVerticalOffsetTileError(
      tile.source.id,
      `does not contain source sample column ${sourceColumn}, row ${sourceRow}`
    );
  }
  return tile.values[row * grid.width + column];
};

const interpolateFivePointNaturalCubic = (
  samples: readonly number[],
  coordinate: number
) => {
  const secondDerivatives = [0, 0, 0, 0, 0];
  const work = [0, 0, 0, 0, 0];

  for (let index = 1; index < SPLINE_STENCIL_SIZE - 1; index += 1) {
    const sigma = 0.5;
    const denominator = sigma * secondDerivatives[index - 1] + 2;
    secondDerivatives[index] = (sigma - 1) / denominator;
    const curvature =
      samples[index + 1] - 2 * samples[index] + samples[index - 1];
    work[index] = (3 * curvature - sigma * work[index - 1]) / denominator;
  }

  for (let index = SPLINE_STENCIL_SIZE - 2; index >= 0; index -= 1) {
    secondDerivatives[index] =
      secondDerivatives[index] * secondDerivatives[index + 1] + work[index];
  }

  const lowerIndex = Math.floor(coordinate);
  const upperIndex = lowerIndex + 1;
  const lowerWeight = upperIndex - coordinate;
  const upperWeight = coordinate - lowerIndex;
  return (
    lowerWeight * samples[lowerIndex] +
    upperWeight * samples[upperIndex] +
    ((lowerWeight * lowerWeight * lowerWeight - lowerWeight) *
      secondDerivatives[lowerIndex] +
      (upperWeight * upperWeight * upperWeight - upperWeight) *
        secondDerivatives[upperIndex]) /
      6
  );
};

export const createTiledVerticalOffsetModel = ({
  supportedRegion,
  rootTileSizeDegrees,
  tileLoaders,
}: TiledVerticalOffsetModelOptions): TiledVerticalOffsetModel => {
  if (
    !Number.isFinite(supportedRegion.west) ||
    !Number.isFinite(supportedRegion.south) ||
    !Number.isFinite(supportedRegion.east) ||
    !Number.isFinite(supportedRegion.north) ||
    supportedRegion.east <= supportedRegion.west ||
    supportedRegion.north <= supportedRegion.south
  ) {
    throw new RangeError(
      "supportedRegion must contain finite, increasing bounds"
    );
  }
  if (!Number.isFinite(rootTileSizeDegrees) || rootTileSizeDegrees <= 0) {
    throw new RangeError("rootTileSizeDegrees must be a positive number");
  }
  const cache = new Map<string, Promise<DecodedTile>>();

  const assertSupportedRegion = (longitude: number, latitude: number) => {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new TypeError("Longitude and latitude must be finite numbers");
    }
    if (
      longitude < supportedRegion.west ||
      longitude >= supportedRegion.east ||
      latitude < supportedRegion.south ||
      latitude >= supportedRegion.north
    ) {
      throw new UnsupportedVerticalOffsetRegionError(
        longitude,
        latitude,
        "coordinate lies outside the supported region"
      );
    }
  };

  const loadTile = (id: string) => {
    const cached = cache.get(id);
    if (cached) return cached;
    const loader = tileLoaders[id];
    if (!loader) return undefined;
    const pending = loader()
      .then(unwrapTileModule)
      .then((source) => decodeTile(source, id))
      .catch((cause: unknown) => {
        cache.delete(id);
        if (cause instanceof InvalidVerticalOffsetTileError) throw cause;
        throw new VerticalOffsetTileLoadError(id, cause);
      });
    cache.set(id, pending);
    return pending;
  };

  const loadRequiredTile = async (id: string) => {
    const pending = loadTile(id);
    if (!pending) {
      throw new VerticalOffsetTileLoadError(
        id,
        new Error("no tile loader is configured")
      );
    }
    return pending;
  };

  const interpolate = async (
    primary: DecodedTile,
    longitude: number,
    latitude: number
  ) => {
    const { grid } = primary.source;
    const sourceColumn = (longitude - grid.firstLongitude) / grid.stepLongitude;
    const sourceRow = (latitude - grid.firstLatitude) / grid.stepLatitude;
    const column0 = Math.floor(sourceColumn);
    const row0 = Math.floor(sourceRow);
    const firstColumn = column0 - SPLINE_STENCIL_RADIUS_BEFORE;
    const firstRow = row0 - SPLINE_STENCIL_RADIUS_BEFORE;
    const samples = Array.from(
      { length: SPLINE_STENCIL_SIZE * SPLINE_STENCIL_SIZE },
      (_, index) => ({
        column: firstColumn + (index % SPLINE_STENCIL_SIZE),
        row: firstRow + Math.floor(index / SPLINE_STENCIL_SIZE),
      })
    );
    const tiles = new Map<string, DecodedTile>([[primary.source.id, primary]]);
    const requiredTileIds = new Set<string>();

    for (const { column, row } of samples) {
      const sampleLongitude = grid.firstLongitude + column * grid.stepLongitude;
      const sampleLatitude = grid.firstLatitude + row * grid.stepLatitude;
      if (
        sampleLongitude < supportedRegion.west ||
        sampleLongitude >= supportedRegion.east ||
        sampleLatitude < supportedRegion.south ||
        sampleLatitude >= supportedRegion.north
      ) {
        throw new UnsupportedVerticalOffsetRegionError(
          longitude,
          latitude,
          "the five-by-five source stencil leaves the supported region"
        );
      }
      const tile = tileCoordinates(
        sampleLongitude,
        sampleLatitude,
        supportedRegion,
        rootTileSizeDegrees
      );
      requiredTileIds.add(formatTileId(tile.west, tile.south));
    }

    await Promise.all(
      [...requiredTileIds].map(async (id) => {
        if (tiles.has(id)) return;
        const loaded = await loadRequiredTile(id);
        assertCompatibleGrid(primary, loaded);
        tiles.set(id, loaded);
      })
    );

    const values = samples.map(({ column, row }) => {
      const sampleLongitude = grid.firstLongitude + column * grid.stepLongitude;
      const sampleLatitude = grid.firstLatitude + row * grid.stepLatitude;
      const tile = tileCoordinates(
        sampleLongitude,
        sampleLatitude,
        supportedRegion,
        rootTileSizeDegrees
      );
      const id = formatTileId(tile.west, tile.south);
      const sampleTile = tiles.get(id);
      if (!sampleTile) {
        throw new VerticalOffsetTileLoadError(
          id,
          new Error("required tile did not finish loading")
        );
      }
      return readSourceSample(sampleTile, column, row);
    });
    if (
      values.some(
        (value) =>
          !Number.isFinite(value) ||
          (grid.noDataValue !== null && value === grid.noDataValue)
      )
    ) {
      throw new UnsupportedVerticalOffsetRegionError(
        longitude,
        latitude,
        "the source grid contains NoData"
      );
    }

    const rowInterpolations = Array.from(
      { length: SPLINE_STENCIL_SIZE },
      (_, rowIndex) =>
        interpolateFivePointNaturalCubic(
          values.slice(
            rowIndex * SPLINE_STENCIL_SIZE,
            (rowIndex + 1) * SPLINE_STENCIL_SIZE
          ),
          sourceColumn - firstColumn
        )
    );
    return {
      offset: interpolateFivePointNaturalCubic(
        rowInterpolations,
        sourceRow - firstRow
      ),
      tileIds: [...requiredTileIds].sort(),
    };
  };

  const queryOffset = async (longitude: number, latitude: number) => {
    assertSupportedRegion(longitude, latitude);
    const { west, south } = tileCoordinates(
      longitude,
      latitude,
      supportedRegion,
      rootTileSizeDegrees
    );
    const id = formatTileId(west, south);
    const pending = loadTile(id);
    if (!pending) {
      throw new VerticalOffsetTileLoadError(
        id,
        new Error("no tile loader is configured")
      );
    }
    return interpolate(await pending, longitude, latitude);
  };

  const prefetch = async (longitude: number, latitude: number, radius = 1) => {
    assertSupportedRegion(longitude, latitude);
    if (!Number.isFinite(radius) || radius < 0) {
      throw new RangeError(
        "prefetch radius must be a finite non-negative number"
      );
    }
    const center = tileCoordinates(
      longitude,
      latitude,
      supportedRegion,
      rootTileSizeDegrees
    );
    const integerRadius = Math.floor(radius);
    const loads: Promise<DecodedTile>[] = [];
    for (let y = -integerRadius; y <= integerRadius; y += 1) {
      for (let x = -integerRadius; x <= integerRadius; x += 1) {
        const west = center.west + x * rootTileSizeDegrees;
        const south = center.south + y * rootTileSizeDegrees;
        if (
          west < supportedRegion.west ||
          west >= supportedRegion.east ||
          south < supportedRegion.south ||
          south >= supportedRegion.north
        ) {
          continue;
        }
        const id = formatTileId(west, south);
        const pending = loadTile(id);
        if (!pending) {
          throw new VerticalOffsetTileLoadError(
            id,
            new Error("no tile loader is configured")
          );
        }
        loads.push(pending);
      }
    }
    await Promise.all(loads);
  };

  return {
    async getOffset(longitude, latitude) {
      return (await queryOffset(longitude, latitude)).offset;
    },
    queryOffset,
    prefetch,
    clearCache() {
      cache.clear();
    },
    get cachedTileCount() {
      return cache.size;
    },
  };
};
