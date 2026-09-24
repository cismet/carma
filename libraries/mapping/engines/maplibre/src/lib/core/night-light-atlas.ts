export const NIGHT_LIGHT_ATLAS_MAX_RESOLUTION = 1024;

const COLOR_CHANNEL_COUNT = 4;
const BYTE_MAX = 255;

export interface NightLightAtlasLight {
  position: readonly [x: number, y: number, z: number];
  groundHeight: number;
  radius: number;
  color: readonly [r: number, g: number, b: number];
  strength: number;
}

export interface NightLightAtlasInput {
  resolution: number;
  bounds: readonly [minX: number, minZ: number, maxX: number, maxZ: number];
  heightRange: readonly [minY: number, maxY: number];
  lights: readonly NightLightAtlasLight[];
}

const assertFiniteTuple = (values: readonly number[], label: string) => {
  if (!values.every(Number.isFinite))
    throw new TypeError(`${label} must contain only finite numbers`);
};

const validateInput = ({
  resolution,
  bounds,
  heightRange,
  lights,
}: NightLightAtlasInput) => {
  if (!Number.isInteger(resolution) || resolution < 1)
    throw new RangeError("resolution must be a positive integer");
  assertFiniteTuple(bounds, "bounds");
  if (bounds[2] <= bounds[0] || bounds[3] <= bounds[1])
    throw new RangeError("bounds must have positive width and height");
  assertFiniteTuple(heightRange, "heightRange");
  if (heightRange[1] <= heightRange[0])
    throw new RangeError("heightRange must have a positive extent");
  for (const light of lights) {
    assertFiniteTuple(light.position, "light.position");
    assertFiniteTuple(light.color, "light.color");
    if (!Number.isFinite(light.groundHeight))
      throw new TypeError("light.groundHeight must be finite");
    if (!Number.isFinite(light.radius) || light.radius < 0)
      throw new RangeError("light.radius must be finite and nonnegative");
    if (!Number.isFinite(light.strength) || light.strength < 0)
      throw new RangeError("light.strength must be finite and nonnegative");
    if (light.color.some((channel) => channel < 0))
      throw new RangeError("light.color must be nonnegative");
  }
};

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Projects local street-light irradiance onto a world-space X/Z atlas.
 *
 * This is a 2.5D field approximation: RGB stores smoothly attenuated light and
 * alpha stores the contributing lights' irradiance-weighted ground height. It
 * does not inspect geometry and therefore cannot solve visibility, occlusion,
 * or shadows. Those require a separate geometry-aware runtime pass.
 */
export const bakeNightLightAtlas = (
  input: NightLightAtlasInput
): Uint8Array => {
  validateInput(input);

  const width = Math.min(input.resolution, NIGHT_LIGHT_ATLAS_MAX_RESOLUTION);
  const height = width;
  const pixels = new Uint8Array(width * height * COLOR_CHANNEL_COUNT);
  const red = new Float64Array(width * height);
  const green = new Float64Array(width * height);
  const blue = new Float64Array(width * height);
  const irradiance = new Float64Array(width * height);
  const weightedGroundHeight = new Float64Array(width * height);
  const [minX, minZ, maxX, maxZ] = input.bounds;
  const pixelWidth = (maxX - minX) / width;
  const pixelHeight = (maxZ - minZ) / height;

  for (const light of input.lights) {
    if (light.radius === 0 || light.strength === 0) continue;
    const [lightX, , lightZ] = light.position;
    const minColumn = Math.max(
      0,
      Math.ceil((lightX - light.radius - minX) / pixelWidth - 0.5)
    );
    const maxColumn = Math.min(
      width - 1,
      Math.floor((lightX + light.radius - minX) / pixelWidth - 0.5)
    );
    const minRow = Math.max(
      0,
      Math.ceil((lightZ - light.radius - minZ) / pixelHeight - 0.5)
    );
    const maxRow = Math.min(
      height - 1,
      Math.floor((lightZ + light.radius - minZ) / pixelHeight - 0.5)
    );
    if (minColumn > maxColumn || minRow > maxRow) continue;

    const radiusSquared = light.radius * light.radius;
    const spectralWeight = Math.max(...light.color);
    const verticalDistance = light.position[1] - light.groundHeight;
    const verticalDistanceSquared = verticalDistance * verticalDistance;
    for (let row = minRow; row <= maxRow; row += 1) {
      const z = minZ + (row + 0.5) * pixelHeight;
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const x = minX + (column + 0.5) * pixelWidth;
        const distanceSquared =
          (x - lightX) ** 2 + (z - lightZ) ** 2 + verticalDistanceSquared;
        if (distanceSquared >= radiusSquared) continue;
        const radial = 1 - Math.sqrt(distanceSquared) / light.radius;
        const contribution =
          light.strength * radial * radial * (3 - 2 * radial);
        const index = row * width + column;
        red[index] += contribution * light.color[0];
        green[index] += contribution * light.color[1];
        blue[index] += contribution * light.color[2];
        const localIrradiance = contribution * spectralWeight;
        irradiance[index] += localIrradiance;
        weightedGroundHeight[index] += localIrradiance * light.groundHeight;
      }
    }
  }

  const [minY, maxY] = input.heightRange;
  const heightExtent = maxY - minY;
  for (let index = 0; index < red.length; index += 1) {
    const offset = index * COLOR_CHANNEL_COUNT;
    pixels[offset] = Math.round(clampUnit(red[index]) * BYTE_MAX);
    pixels[offset + 1] = Math.round(clampUnit(green[index]) * BYTE_MAX);
    pixels[offset + 2] = Math.round(clampUnit(blue[index]) * BYTE_MAX);
    if (irradiance[index] > 0) {
      const groundHeight = weightedGroundHeight[index] / irradiance[index];
      pixels[offset + 3] = Math.round(
        clampUnit((groundHeight - minY) / heightExtent) * BYTE_MAX
      );
    }
  }

  return pixels;
};
