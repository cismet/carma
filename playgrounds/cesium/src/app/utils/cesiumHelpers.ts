import {
  Camera,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Cesium3DTileset,
  Cesium3DTileStyle,
  Color,
  ColorMaterialProperty,
  defined,
  Entity,
  GroundPrimitive,
  Matrix4,
  Primitive,
  Scene,
  Viewer,
  Math as CeMath,
  BoundingSphere,
} from 'cesium';
import { ColorRgbaArray, NumericResult, TilesetConfig } from '../..';

// Constants


export const resolutionFractions = [
  5,
  4,
  3,
  2,
  1,
  1 / 2,
  1 / 3,
  1 / 4,
  1 / 5,
  1 / 6,
  1 / 8,
  1 / 10,
  1 / 16,
].reverse();

// Math

export const SELECTABLE_TRANSPARENT_3DTILESTYLE = create3DTileStyle({
  color: `vec4(1.0, 0.0, 0.0, 0.01)`,
  show: true,
});
export const SELECTABLE_TRANSPARENT_MATERIAL = new ColorMaterialProperty(
  Color.BLACK.withAlpha(1 / 255)
);

export function getModelMatrix(config: TilesetConfig, heightOffset = 0) {
  const { x, y, z } = config.translation;
  const surface = Cartesian3.fromRadians(x, y, z);
  const offset = Cartesian3.fromRadians(x, y, z + heightOffset);
  const translation = Cartesian3.subtract(offset, surface, new Cartesian3());
  const modelMatrix = Matrix4.fromTranslation(translation);
  return modelMatrix;
}

// use with onReady event of Cesium3DTileset
export const logTileSetInfoOnReady = (tileset: Cesium3DTileset) => {
  const { center } = tileset.root.boundingSphere;
  const cartographic = Cartographic.fromCartesian(center);
  const longitude = CeMath.toDegrees(cartographic.longitude);
  const latitude = CeMath.toDegrees(cartographic.latitude);
  const height = cartographic.height;

  console.log(
    `Longitude: ${longitude}, Latitude: ${latitude}, Height: ${height}, center: ${center}, ${tileset.basePath}}`
  );
};

export const colorToArray = (color: Color): ColorRgbaArray => {
  const { red, green, blue, alpha } = color;
  return [red, green, blue, alpha];
};

export const getTileSetInfo = (tileset: Cesium3DTileset) => {
  const { center } = tileset.root.boundingSphere;
  const cartographic = Cartographic.fromCartesian(center);
  const longitude = CeMath.toDegrees(cartographic.longitude);
  const latitude = CeMath.toDegrees(cartographic.latitude);
  const height = cartographic.height;
  console.log(
    `Longitude: ${longitude}, Latitude: ${latitude}, Height: ${height}, center: ${center}, ${tileset.basePath}}`
  );
};

export function create3DTileStyle(
  styleDescription: Record<string, unknown | string>
): Cesium3DTileStyle | undefined {
  try {
    return new Cesium3DTileStyle(styleDescription);
  } catch (error) {
    console.warn(
      'Error in Tileset Style Creation from: ',
      styleDescription,
      error
    );

    return undefined;
  }
}

// CAMERA

const TOP_DOWN_DIRECTION = new Cartesian3(0, 0, -1);

export const getTopDownCameraDeviationAngle = (viewer: Viewer) => {
  const currentDirection = viewer.camera.direction;

  const internalAngle = Cartesian3.angleBetween(
    currentDirection,
    TOP_DOWN_DIRECTION
  );
  return Math.abs(internalAngle);
};

export const getCameraHeightAboveGround = (viewer: Viewer) => {
  const groundCenterPickPos = pickViewerCanvasCenter(viewer);

  let cameraHeightAboveGround: number;
  const groundPositionCartographic =
    Cartographic.fromCartesian(groundCenterPickPos);
  const groundHeight = groundPositionCartographic.height;

  if (defined(groundCenterPickPos)) {
    cameraHeightAboveGround =
      viewer.camera.positionCartographic.height - groundHeight;
  } else {
    console.warn('No ground position found under the camera.');

    cameraHeightAboveGround = viewer.camera.positionCartographic.height;
  }
  return { cameraHeightAboveGround, groundHeight };
};

// SCENE

// PICKERS HELPERS

const getWindowPositions = (viewer: Viewer, [x, y] = [0.5, 0.5]) => {
  return new Cartesian2(
    viewer.canvas.clientWidth * x,
    viewer.canvas.clientHeight * y
  );
};

const CENTER_POSITION: [number, number] = [0.5, 0.5];

/* Helper function to pick positions on the viewer canvas in unit coordinates*/

export const pickViewerCanvasPositions = (
  viewer: Viewer,
  positions: [number, number][] = [CENTER_POSITION],
  {
    depthTestAgainstTerrain = true,
    pickTranslucentDepth = true,
  }: {
    depthTestAgainstTerrain?: boolean;
    pickTranslucentDepth?: boolean;
  } = {}
) => {
  // store previous settings
  const prev = {
    depthTestAgainstTerrain: viewer.scene.globe.depthTestAgainstTerrain,
    pickTranslucentDepth: viewer.scene.pickTranslucentDepth,
  };
  // apply overrides
  viewer.scene.pickTranslucentDepth = pickTranslucentDepth;
  viewer.scene.globe.depthTestAgainstTerrain = depthTestAgainstTerrain;
  const pickedPositions = positions.map((position) =>
    viewer.scene.pickPosition(getWindowPositions(viewer, position))
  );

  // restore previous settings
  Object.assign(viewer.scene.globe, prev);

  return pickedPositions;
};

// helper shorthand
export const pickViewerCanvasCenter = (viewer: Viewer) =>
  pickViewerCanvasPositions(viewer, [CENTER_POSITION])[0];

const GEOJSON_DRILL_LIMIT = 10;

// get last ground primitive from picked objects
// needed since default picker fails with ground primitives created from GeoJson
function getLastGroundPrimitive(
  pickedObjects: { primitive: unknown; id?: unknown }[]
): Entity | null {
  let lastGroundPrimitive: Entity | null = null;

  pickedObjects.reverse().some((pickedObject) => {
    if (defined(pickedObject)) {
      if (pickedObject.primitive instanceof GroundPrimitive) {
        lastGroundPrimitive = pickedObject.id as Entity;
        return true;
      }
    }
    return false;
  });

  return lastGroundPrimitive;
}

export function pickFromClampedGeojson(
  viewer: Viewer,
  position: Cartesian2,
  limit: number = GEOJSON_DRILL_LIMIT
): Entity | null {
  const pickedObjects = viewer.scene.drillPick(position, limit);
  return getLastGroundPrimitive(pickedObjects);
}

export const getHeightAtPosition = async (
  scene: Scene,
  camera: Camera,
  fallBackHeightOffset
) => {
  const [sample] = await scene.sampleHeightMostDetailed([
    camera.positionCartographic,
  ]);
  return sample.height !== undefined ? sample.height : fallBackHeightOffset;
};

export function getPrimitiveById(viewer: Viewer, id: string) {
  const primitives = viewer.scene.primitives;
  const length = primitives.length;

  for (let i = 0; i < length; ++i) {
    const p = primitives.get(i);
    if (p.id === id) {
      return p;
    }
  }

  return null;
}

export function getAllPrimitives(viewer: Viewer) {
  const primitives = viewer.scene.primitives;
  const length = primitives.length;

  const primitiveArray: Primitive[] = [];
  for (let i = 0; i < length; ++i) {
    const p = primitives.get(i);
    primitiveArray.push(p);
  }
  return primitiveArray;
}

// GEO

export const EARTH_CIRCUMFERENCE = 40075016.686;
export const DEFAULT_LEAFLET_TILESIZE = 256;

const WEB_MERCATOR_MAX_LATITUDE = 85.051129;
export const WEB_MERCATOR_MAX_LATITUDE_RAD = CeMath.toRadians(
  WEB_MERCATOR_MAX_LATITUDE
);

export const getMercatorScaleFactorAtLatitude = (latitude: number): number => {
  if (latitude > WEB_MERCATOR_MAX_LATITUDE_RAD) {
    console.warn(
      'latitude is greater than max web mercator latitude, clamping applied'
    );
    latitude = WEB_MERCATOR_MAX_LATITUDE_RAD;
  } else if (latitude < -WEB_MERCATOR_MAX_LATITUDE_RAD) {
    console.warn(
      'latitude is smaller than min web mercator latitude, clamping applied'
    );
    latitude = -WEB_MERCATOR_MAX_LATITUDE_RAD;
  }
  return 1 / Math.cos(latitude);
};

export const getZoomFromPixelResolutionAtLatitude = (
  meterResolution: number,
  latitude: number = 0,
  { tileSize = DEFAULT_LEAFLET_TILESIZE }: { tileSize?: number } = {}
) => {
  const scaleFactor = getMercatorScaleFactorAtLatitude(latitude);
  const zoom = Math.log2(
    EARTH_CIRCUMFERENCE / (scaleFactor * meterResolution * tileSize)
  );
  console.log('zoom', zoom, scaleFactor, meterResolution, latitude);
  return zoom;
};

export const getPixelResolutionFromZoomAtLatitude = (
  zoom: number,
  latitude: number = 0,
  { tileSize = DEFAULT_LEAFLET_TILESIZE }: { tileSize?: number } = {}
) => {
  const scale = getMercatorScaleFactorAtLatitude(latitude);
  return EARTH_CIRCUMFERENCE / (scale * Math.pow(2, zoom) * tileSize);
};

// CESIUM TO WEB MAPS

enum PICKMODE {
  CENTER,
  RING,
}

const generatePostionsForRing = (n = 8, radius = 0.1, center = [0.5, 0.5]) => {
  const positions: [number, number][] = [];
  const [cx, cy] = center;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    positions.push([x, y]);
  }
  return positions;
};

const sampleRingPixelSize = (
  viewer: Viewer,
  samples: number,
  radius: number
) => {
  const positionCoords = generatePostionsForRing(samples, radius);
  const positions = pickViewerCanvasPositions(viewer, positionCoords);
  const pixelSizes = positions.map(
    (position) =>
      defined(position) &&
      viewer.camera.getPixelSize(
        new BoundingSphere(position, 1),
        viewer.scene.drawingBufferWidth,
        viewer.scene.drawingBufferHeight
      )
  );
  const validPixelSizes = pixelSizes.filter(
    (pixelSize): pixelSize is number =>
      typeof pixelSize === 'number' &&
      pixelSize !== 0 &&
      pixelSize !== Infinity &&
      !isNaN(pixelSize)
  );
  const sortedPixelSizes = validPixelSizes.sort(
    (a: number, b: number) => a - b
  );
  // Drop the extremes
  const drop = Math.floor(sortedPixelSizes.length / 4);
  const trimmedPixelSizes = sortedPixelSizes.slice(drop, -drop);
  // Calculate the average of the middle values
  const sum = trimmedPixelSizes.reduce((a, b) => a + b, 0);
  const avg = sum / trimmedPixelSizes.length;
  //console.log('pixel sizes', sortedPixelSizes, trimmedPixelSizes, avg);
  return avg;
};

const getScenePixelSize = (
  viewer: Viewer,
  mode = PICKMODE.CENTER,
  { samples = 10, radius = 0.2 }: { samples?: number; radius?: number } = {} // radius for unit screen coordinates, should be less than 0.5 with center at 0.5,0.5
): NumericResult => {
  const { camera, scene } = viewer;

  // sample two position to get better approximation for full view extent
  if (radius >= 0.5) {
    console.warn(
      'radius is greater than 0.5, clamping applied',
      radius,
      samples
    );
    radius = 0.5;
  }

  let result: NumericResult = { value: null };

  switch (mode) {
    case PICKMODE.RING: {
      if (radius > 0) {
        result.value = sampleRingPixelSize(viewer, samples, radius);
        break;
      }
      // intentional fallthrough for no radius
    }

    // eslint-disable-next-line no-fallthrough
    case PICKMODE.CENTER:
    default: {
      const groundCenterPickPos = pickViewerCanvasCenter(viewer);
      if (defined(groundCenterPickPos)) {
        result.value = camera.getPixelSize(
          new BoundingSphere(groundCenterPickPos, 1),
          scene.drawingBufferWidth,
          scene.drawingBufferHeight
        );
      }
    }
  }

  if (result.value === 0 || result.value === Infinity) {
    result = {
      value: null,
      error: 'No pixel size found for camera position',
    };
  }
  return result;
};

export const cesiumCenterPixelSizeToLeafletZoom = (
  viewer: Viewer
): NumericResult => {
  const pixelSize = getScenePixelSize(viewer, PICKMODE.RING);
  if (pixelSize.value === null) {
    console.warn('No pixel size found for camera position.', pixelSize.error);
    return { value: null, error: 'No pixel size found for camera position' };
  }
  const zoom = getZoomFromPixelResolutionAtLatitude(
    pixelSize.value,
    viewer.camera.positionCartographic.latitude
  );

  if (zoom === Infinity) {
    console.warn('zoom is infinity, skipping');
    return { value: null, error: 'Zoom is infinity' };
  }

  return { value: zoom };
};

// WEB MAPS TO CESIUM

export const leafletToCesiumCamera = (
  viewer: Viewer,
  { lat, lng, zoom }: { lat: number; lng: number; zoom: number },
  { epsilon = 0.02, limit = 5 }: { epsilon?: number; limit?: number } = {}
) => {
  const lngRad = CeMath.toRadians(lng);
  const latRad = CeMath.toRadians(lat);

  const targetPixelResolution = getPixelResolutionFromZoomAtLatitude(
    zoom,
    latRad
  );

  let currentPixelResolution = getScenePixelSize(viewer).value;

  if (currentPixelResolution === null) {
    console.warn('No pixel size found for camera position.');
    return false;
  }

  const { camera } = viewer;

  console.log('leafletToCesium', currentPixelResolution, targetPixelResolution);

  // move to new position
  camera.setView({
    destination: Cartesian3.fromRadians(
      lngRad,
      latRad,
      camera.positionCartographic.height
    ),
  });

  // Get the ground position directly under the camera

  const cameraPositionAtStart = camera.position.clone();
  let { cameraHeightAboveGround, groundHeight } =
    getCameraHeightAboveGround(viewer);
  const maxIterations = limit;
  let iterations = 0;

  // Iterative adjustment to match the target resolution
  while (Math.abs(currentPixelResolution - targetPixelResolution) > epsilon) {
    if (iterations >= maxIterations) {
      console.warn(
        'Maximum height finding iterations reached with no result, restoring last Cesium camera position.'
      );
      camera.setView({
        destination: cameraPositionAtStart,
      });
      return false;
    }
    const adjustmentFactor = targetPixelResolution / currentPixelResolution;
    cameraHeightAboveGround *= adjustmentFactor;
    camera.setView({
      destination: Cartesian3.fromRadians(
        lngRad,
        latRad,
        cameraHeightAboveGround + groundHeight
      ),
    });
    const newResolution = getScenePixelSize(viewer).value;
    if (newResolution === null) {
      return false;
    }
    currentPixelResolution = newResolution;
    iterations++;
  }
  //console.log('zoom iterations', iterations);
  return true; // Return true if camera position found within max iterations
};
