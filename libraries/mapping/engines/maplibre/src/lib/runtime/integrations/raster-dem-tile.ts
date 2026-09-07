export const EARTH_CIRCUMFERENCE_METERS = 40_075_016.68557849;
const MAX_MERCATOR_LATITUDE = 85.0511287798066;

export type TerrainTileId = Readonly<{
  level: number;
  x: number;
  y: number;
}>;

export type TerrainTileBounds = Readonly<{
  west: number;
  south: number;
  east: number;
  north: number;
}>;

export type TerrainTile = Readonly<{
  id: TerrainTileId;
  bounds: TerrainTileBounds;
  u: Float32Array;
  v: Float32Array;
  heightMeters: Float32Array;
  minimumHeightMeters: number;
  maximumHeightMeters: number;
  indices: Uint32Array;
  westIndices: Uint32Array;
  southIndices: Uint32Array;
  eastIndices: Uint32Array;
  northIndices: Uint32Array;
  geometricErrorMeters: number;
  byteLength: number;
}>;

export type DecodedRaster = Readonly<{
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}>;

export const terrainTileKey = ({ level, x, y }: TerrainTileId) =>
  `${level}/${x}/${y}`;

export const clampLatitude = (latitude: number) =>
  Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));

export const longitudeToTileX = (longitude: number, level: number) =>
  ((longitude + 180) / 360) * 2 ** level;

export const latitudeToTileY = (latitude: number, level: number) => {
  const radians = (clampLatitude(latitude) * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** level;
};

const tileYToLatitude = (y: number, level: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** level))) * 180) / Math.PI;

export const assertTileId = ({ level, x, y }: TerrainTileId) => {
  const scale = 2 ** level;
  if (
    ![level, x, y].every(Number.isInteger) ||
    level < 0 ||
    x < 0 ||
    y < 0 ||
    x >= scale ||
    y >= scale
  ) {
    throw new RangeError(
      "Terrain tile coordinates must be non-negative integers"
    );
  }
};

export const getTileBounds = ({
  level,
  x,
  y,
}: TerrainTileId): TerrainTileBounds => {
  assertTileId({ level, x, y });
  const scale = 2 ** level;
  return {
    west: (x / scale) * 360 - 180,
    south: tileYToLatitude(y + 1, level),
    east: ((x + 1) / scale) * 360 - 180,
    north: tileYToLatitude(y, level),
  };
};

export const boundsIntersect = (
  left: TerrainTileBounds,
  right: readonly [number, number, number, number]
) =>
  left.west < right[2] &&
  left.east > right[0] &&
  left.south < right[3] &&
  left.north > right[1];

export const decodeImage = async (blob: Blob): Promise<DecodedRaster> => {
  const image = await createImageBitmap(blob, {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  try {
    const canvas =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(image.width, image.height)
        : Object.assign(document.createElement("canvas"), {
            width: image.width,
            height: image.height,
          });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !("getImageData" in context)) {
      throw new Error("A 2D canvas is required to decode raster DEM tiles");
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    return { width: image.width, height: image.height, pixels };
  } finally {
    image.close();
  }
};

export const decodeRasterDemHeight = (
  red: number,
  green: number,
  blue: number
) => red * 256 + green + blue / 256 - 32_768;

export const sampleRaster = (
  raster: DecodedRaster,
  x: number,
  y: number
): number => {
  const clampedX = Math.max(0, Math.min(raster.width - 1, x));
  const clampedY = Math.max(0, Math.min(raster.height - 1, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const offset = (y0 * raster.width + x0) * 4;
  const northWest = decodeRasterDemHeight(
    raster.pixels[offset],
    raster.pixels[offset + 1],
    raster.pixels[offset + 2]
  );
  const xWeight = clampedX - x0;
  const yWeight = clampedY - y0;
  // Preserve the cheap, exact path for every native interior sample.
  if (xWeight === 0 && yWeight === 0) return northWest;
  const northEast = sampleRaster(
    raster,
    Math.min(x0 + 1, raster.width - 1),
    y0
  );
  const southWest = sampleRaster(
    raster,
    x0,
    Math.min(y0 + 1, raster.height - 1)
  );
  const southEast = sampleRaster(
    raster,
    Math.min(x0 + 1, raster.width - 1),
    Math.min(y0 + 1, raster.height - 1)
  );
  const north = northWest * (1 - xWeight) + northEast * xWeight;
  const south = southWest * (1 - xWeight) + southEast * xWeight;
  return north * (1 - yWeight) + south * yWeight;
};

export const buildGridTile = (
  id: TerrainTileId,
  raster: DecodedRaster,
  meshSegments: number,
  geometricErrorMeters: number
): TerrainTile => {
  // Native pixels are samples at cell centers, not at tile edges. Keep every
  // source sample and add a separate boundary ring for cross-tile stitching.
  const nativeGrid = meshSegments >= Math.max(raster.width, raster.height);
  const columns = nativeGrid ? raster.width + 1 : meshSegments;
  const rows = nativeGrid ? raster.height + 1 : meshSegments;
  const rowLength = columns + 1;
  const vertexCount = rowLength * (rows + 1);
  const bounds = getTileBounds(id);
  const u = new Float32Array(vertexCount);
  const v = new Float32Array(vertexCount);
  const heightMeters = new Float32Array(vertexCount);
  const westIndices = new Uint32Array(rows + 1);
  const southIndices = new Uint32Array(rowLength);
  const eastIndices = new Uint32Array(rows + 1);
  const northIndices = new Uint32Array(rowLength);
  let minimumHeightMeters = Number.POSITIVE_INFINITY;
  let maximumHeightMeters = Number.NEGATIVE_INFINITY;

  for (let row = 0; row <= rows; row += 1) {
    const interiorY = nativeGrid
      ? Math.max(0, Math.min(1, (row - 0.5) / raster.height))
      : row / rows;
    const latitudeSpan = bounds.north - bounds.south;
    const interiorLatitudeFraction =
      (tileYToLatitude(id.y + interiorY, id.level) - bounds.south) /
      latitudeSpan;
    const edgeLatitudeFraction =
      (tileYToLatitude(id.y + row / rows, id.level) - bounds.south) /
      latitudeSpan;
    for (let column = 0; column <= columns; column += 1) {
      const index = row * rowLength + column;
      const interiorX = nativeGrid
        ? Math.max(0, Math.min(1, (column - 0.5) / raster.width))
        : column / columns;
      // Only the boundary ring is uniformly spaced. Pixel-center boundary
      // vertices miss the coarser neighbor's breakpoints at mixed LOD, leaving
      // T-junction cracks even after matching heights by interpolation.
      const normalizedX =
        row === 0 || row === rows ? column / columns : interiorX;
      const normalizedY =
        column === 0 || column === columns ? row / rows : interiorY;
      const latitudeFraction =
        column === 0 || column === columns
          ? edgeLatitudeFraction
          : interiorLatitudeFraction;
      // The uniform edge ring is between pixel centers. Nearest-pixel heights
      // would bend a planar slope into a ridge even after welding both tiles.
      const height = sampleRaster(
        raster,
        nativeGrid
          ? normalizedX * raster.width - 0.5
          : Math.round(normalizedX * (raster.width - 1)),
        nativeGrid
          ? normalizedY * raster.height - 0.5
          : Math.round(normalizedY * (raster.height - 1))
      );
      u[index] = normalizedX;
      v[index] = latitudeFraction;
      heightMeters[index] = height;
      minimumHeightMeters = Math.min(minimumHeightMeters, height);
      maximumHeightMeters = Math.max(maximumHeightMeters, height);
    }
  }
  for (let offset = 0; offset <= rows; offset += 1) {
    westIndices[offset] = offset * rowLength;
    eastIndices[offset] = offset * rowLength + columns;
  }
  for (let offset = 0; offset < rowLength; offset += 1) {
    northIndices[offset] = offset;
    southIndices[offset] = rows * rowLength + offset;
  }
  const indices = new Uint32Array(columns * rows * 6);
  let cursor = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const northWest = row * rowLength + column;
      const northEast = northWest + 1;
      const southWest = northWest + rowLength;
      const southEast = southWest + 1;
      indices[cursor++] = northWest;
      indices[cursor++] = southWest;
      indices[cursor++] = northEast;
      indices[cursor++] = northEast;
      indices[cursor++] = southWest;
      indices[cursor++] = southEast;
    }
  }
  const arrays = [
    u,
    v,
    heightMeters,
    indices,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
  ];
  return {
    id,
    bounds,
    u,
    v,
    heightMeters,
    minimumHeightMeters,
    maximumHeightMeters,
    indices,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
    geometricErrorMeters,
    byteLength: arrays.reduce((sum, array) => sum + array.byteLength, 0),
  };
};
