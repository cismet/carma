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
  Viewer,
  Math as CesiumMath,
  Rectangle,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveFrustum,
  PerspectiveOffCenterFrustum,
} from "cesium";
import type { TilesetConfig } from "@carma-commons/resources";

import type { LatLng, NumericResult, Radians } from "@carma-commons/types";

import {
  EARTH_RADIUS,
  asRadians,
  asMeters,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma-commons/utils";

import type { CesiumContextType } from "../CesiumContext";

import { isValidViewerInstance } from "./cesiumTypeGuards";

// Helper methods for validated Cesium objects
export type ValidatedCesiumObjects = {
  viewer: Viewer | false;
  scene: Viewer["scene"] | false;
  camera: Viewer["camera"] | false;
};

/**
 * Gets all validated Cesium objects, with false for invalid properties
 */
export const getValidContext = (ctx: CesiumContextType): ValidatedCesiumObjects => {
  if (!ctx.isViewerValid()) return { viewer: false, scene: false, camera: false };
  const viewer = ctx.viewerRef.current!;
  const scene = defined(viewer.scene) ? viewer.scene : false;
  const camera = defined(viewer.camera) ? viewer.camera : false;
  return { viewer, scene, camera };
};

// Math

export const SELECTABLE_TRANSPARENT_3DTILESTYLE = create3DTileStyle({
  color: `vec4(1.0, 0.0, 0.0, 0.01)`,
  show: true,
});
export const SELECTABLE_TRANSPARENT_MATERIAL = new ColorMaterialProperty(
  Color.BLACK.withAlpha(1 / 255)
);

export function getModelMatrix(config: TilesetConfig, heightOffset = 0) {
  const { x, y, z } = config.translation ?? { x: 0, y: 0, z: 0 };
  const surface = Cartesian3.fromRadians(x, y, z);
  const offset = Cartesian3.fromRadians(x, y, z + heightOffset);
  const translation = Cartesian3.subtract(offset, surface, new Cartesian3());
  const modelMatrix = Matrix4.fromTranslation(translation);
  return modelMatrix;
}

export const getDegreesFromCartographic = (cartographic: Cartographic) => {
  return {
    longitude: CesiumMath.toDegrees(cartographic.longitude),
    latitude: CesiumMath.toDegrees(cartographic.latitude),
    height: cartographic.height,
  };
};

export const getDegreesFromCartesian = (cartesian: Cartesian3) => {
  const cartographic = Cartographic.fromCartesian(cartesian);
  return getDegreesFromCartographic(cartographic);
};

// use with onReady event of Cesium3DTileset
export const logTileSetInfoOnReady = (tileset: Cesium3DTileset) => {
  const { center } = tileset.root.boundingSphere;
  const cartographic = Cartographic.fromCartesian(center);
  const longitude = CesiumMath.toDegrees(cartographic.longitude);
  const latitude = CesiumMath.toDegrees(cartographic.latitude);
  const height = cartographic.height;

  console.debug(
    `Longitude: ${longitude}, Latitude: ${latitude}, Height: ${height}, center: ${center}, ${tileset.basePath}}`
  );
};

export const getTileSetInfo = (tileset: Cesium3DTileset) => {
  const { center } = tileset.root.boundingSphere;
  const cartographic = Cartographic.fromCartesian(center);
  const longitude = CesiumMath.toDegrees(cartographic.longitude);
  const latitude = CesiumMath.toDegrees(cartographic.latitude);
  const height = cartographic.height;
  console.debug(
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
      "Error in Tileset Style Creation from: ",
      styleDescription,
      error
    );

    return undefined;
  }
}

// CAMERA

const TOP_DOWN_DIRECTION = new Cartesian3(0, 0, -1);

export const cameraToCartographicDegrees = (camera: Camera) => {
  const { latitude, longitude, height } = camera.positionCartographic.clone();
  return {
    latitude: CesiumMath.toDegrees(latitude),
    longitude: CesiumMath.toDegrees(longitude),
    height,
  };
};

export const getTopDownCameraDeviationAngle = (ctx: CesiumContextType) => {
  const viewer = ctx.viewerRef.current!;
  const currentDirection = viewer.camera.direction;

  const internalAngle = Cartesian3.angleBetween(
    currentDirection,
    TOP_DOWN_DIRECTION
  );
  return Math.abs(internalAngle);
};

export const getCameraHeightAboveGround = (ctx: CesiumContextType) => {
  const viewer = ctx.viewerRef.current!;
  const { scenePosition: pos, coordinates } = pickViewerCanvasCenter(ctx, {
    getCoordinates: true,
  });

  let cameraHeightAboveGround: number;
  let groundHeight: number = 0;

  if (defined(pos) && defined(coordinates)) {
    groundHeight = coordinates.height;

    cameraHeightAboveGround =
      viewer.camera.positionCartographic.height - groundHeight;
  } else {
    console.warn("No ground position found under the camera.");

    cameraHeightAboveGround = viewer.camera.positionCartographic.height;
  }
  return { cameraHeightAboveGround, groundHeight };
};

// SCENE

// PICKERS HELPERS

const getWindowPositions = (viewer: Viewer, [x, y] = [0.5, 0.5]) => {
  return new Cartesian2(
    (viewer.canvas.clientWidth - 1) * x + 0.5, // needs pixel to sample so shift into pixel centers
    (viewer.canvas.clientHeight - 1) * y + 0.5
  );
};

const CENTER_POSITION: [number, number] = [0.5, 0.5];

/* Helper function to pick positions on the viewer canvas in unit coordinates*/

export type PickResult = {
  position: [number, number];
  windowPosition: Cartesian2;
  pixelSize: number | null;
  scenePosition: Cartesian3 | null;
  coordinates: Cartographic | null;
};

interface PickOptions {
  depthTestAgainstTerrain?: boolean;
  getPixelSize?: boolean;
  getCoordinates?: boolean;
  pickTranslucentDepth?: boolean;
}

export const pickViewerCanvasPositions = (
  ctx: CesiumContextType,
  positions: [number, number][] = [CENTER_POSITION],
  {
    getPixelSize = false,
    getCoordinates = false,
    depthTestAgainstTerrain = true,
    pickTranslucentDepth = true,
  }: PickOptions = {}
): PickResult[] => {
  if (!ctx.isViewerValid()) {
    return positions.map((position) => ({
      position,
      windowPosition: new Cartesian2(0, 0),
      scenePosition: null,
      pixelSize: null,
      coordinates: null,
    }));
  }
  const viewer = ctx.viewerRef.current!;
  // store previous settings
  const prev = {
    depthTestAgainstTerrain: viewer.scene.globe.depthTestAgainstTerrain,
    pickTranslucentDepth: viewer.scene.pickTranslucentDepth,
  };
  // apply overrides
  viewer.scene.pickTranslucentDepth = pickTranslucentDepth;
  viewer.scene.globe.depthTestAgainstTerrain = depthTestAgainstTerrain;
  const pickedPositions: PickResult[] = positions.map((position) => {
    const windowPosition = getWindowPositions(viewer, position);
    const result: PickResult = {
      position,
      windowPosition,
      scenePosition: null,
      pixelSize: null,
      coordinates: null,
    };

    const scenePosition = viewer.scene.pickPosition(windowPosition);

    if (!defined(scenePosition)) {
      console.warn(
        "No scene position found at the picked position.",
        position[0],
        position[1],
        windowPosition
      );
      return result;
    }

    result.scenePosition = scenePosition;

    if (getPixelSize) {
      result.pixelSize = getPixelSizeForPosition(viewer, scenePosition);
    }

    if (getCoordinates) {
      const coordinates =
        scenePosition instanceof Cartesian3
          ? Cartographic.fromCartesian(scenePosition)
          : null;
      result.coordinates = coordinates;
    }
    return result;
  });

  // restore previous settings
  Object.assign(viewer.scene.globe, prev);

  return pickedPositions;
};

// GET FRUSTUM/VIEWPORT EXTENT

export const createOffCenterFrustum = (
  // TODO Implement and Test
  sourceFrustum: PerspectiveFrustum | OrthographicFrustum,
  {
    near,
    far,
    left,
    right,
    top,
    bottom,
  }: {
    near?: number;
    far?: number;
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  } = {}
) => {
  const src = sourceFrustum.clone();

  if (src instanceof OrthographicFrustum) {
    const frustum = new OrthographicOffCenterFrustum({
      near: near ?? src.near,
      far: far ?? src.far,
      left: -500,
      right: 500,
      top: 800,
      bottom: -300,
    });

    return frustum;
  } else if (src instanceof PerspectiveFrustum) {
    const frustum = new PerspectiveOffCenterFrustum({
      //fov: fov ?? src.fov,
      //aspectRatio: aspectRatio ?? src.aspectRatio,
      near: near ?? src.near,
      far: far ?? src.far,
      left: left ?? -500,
      right: right ?? 500,
      top: top ?? 800,
      bottom: bottom ?? -300,
    });
    return frustum;
  }
  console.warn("Unsupported frustum type");
  return;
};

const findTopPick = (
  ctx: CesiumContextType,
  xPos = 0,
  targetPixelSize: number
) => {
  let top: PickResult | null = null;
  let yPos = 0;

  while (top === null && yPos < 1) {
    const [candidate] = pickViewerCanvasPositions(ctx, [[xPos, yPos]], {
      getPixelSize: true,
      getCoordinates: true,
    });
    if (candidate && candidate.pixelSize) {
      const validResolution = candidate.pixelSize <= targetPixelSize;
      if (validResolution) {
        top = candidate;
      }
    }
    yPos += 0.1;
  }
  return top;
};

export const getViewerViewportPolygonRing = (
  ctx: CesiumContextType,
  { resolutionRange = 4 }: { resolutionRange?: number } = {}
): [number, number][] | null => {
  const bottom = pickViewerCanvasPositions(
    ctx,
    [
      [0, 1],
      //[0.25, 1],
      [0.5, 1],
      //[0.75, 1],
      [1, 1],
    ],
    {
      getPixelSize: true,
      getCoordinates: true,
    }
  );
  if (!bottom || bottom.length < 2) {
    console.warn("No bottom pixel position found", bottom);
    return null;
  }
  const targetPixelSize =
    bottom.reduce((acc, pos) => {
      // find smallesT Value for PixelSize
      if (pos.pixelSize && pos.pixelSize < acc) {
        return Math.min(acc, pos.pixelSize);
      } else {
        return acc;
      }
    }, Infinity) * resolutionRange;

  const top = bottom.map((pos) => {
    const result = findTopPick(ctx, pos.position[0], targetPixelSize);
    if (result) {
      console.debug("Top pixel position found", pos.position[0], result);
      return result;
    } else {
      console.warn("No valid top pixel position found");
      return null;
    }
  });

  const geom: ([number, number] | null)[] = [...top, ...bottom.reverse()].map(
    (result) => {
      if (result && result.coordinates) {
        return [
          CesiumMath.toDegrees(result.coordinates.latitude),
          CesiumMath.toDegrees(result.coordinates.longitude),
        ];
      } else {
        console.warn("No valid mapping", result);
        return null;
      }
    }
  );
  return geom.filter((point) => point !== null) as [number, number][];
};

// helper shorthand
export const pickViewerCanvasCenter = (
  ctx: CesiumContextType,
  options?: PickOptions
): PickResult => {
  if (!ctx.isViewerValid()) {
    return {
      position: CENTER_POSITION,
      windowPosition: new Cartesian2(0, 0),
      scenePosition: null,
      pixelSize: null,
      coordinates: null,
    };
  }
  return pickViewerCanvasPositions(ctx, [CENTER_POSITION], options)[0];
};

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
  ctx: CesiumContextType,
  position: Cartesian2,
  limit: number = GEOJSON_DRILL_LIMIT
): Entity | null {
  if (!ctx.isViewerValid()) {
    return null;
  }
  const viewer = ctx.viewerRef.current!;
  const pickedObjects = viewer.scene.drillPick(position, limit);
  console.debug("SCENE DRILL PICK:", pickedObjects);
  return getLastGroundPrimitive(pickedObjects);
}

export function getPrimitiveById(ctx: CesiumContextType, id: string) {
  if (!ctx.isViewerValid()) {
    return null;
  }
  const viewer = ctx.viewerRef.current!;
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

export function getAllPrimitives(ctx: CesiumContextType) {
  if (!ctx.isViewerValid()) {
    return [];
  }
  const viewer = ctx.viewerRef.current!;
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

export const extentDegreesToRectangle = (extent: {
  west: number;
  east: number;
  north: number;
  south: number;
}) => {
  const { west, east, north, south } = extent;
  const wsen = [west, south, east, north];
  const wsenRad = wsen.map((x) => CesiumMath.toRadians(x));
  return new Rectangle(...wsenRad);
};

export const rectangleToExtentDegrees = ({
  west,
  south,
  east,
  north,
}: Rectangle) => {
  const wsen = [west, south, east, north].map((x) => CesiumMath.toDegrees(x));
  return {
    west: wsen[0],
    south: wsen[1],
    east: wsen[2],
    north: wsen[3],
    leafletBounds: {
      NE: {
        lat: wsen[3],
        lng: wsen[2],
      },
      SW: {
        lat: wsen[1],
        lng: wsen[0],
      },
    },
  };
};
// Mercator helpers are provided by @carma-commons/utils/mercator; no re-exports here.

const getPixelSizeForPosition = (
  viewer: Viewer,
  position: Cartesian3 | null
) => {
  if (defined(position)) {
    // Calculate pixel size directly without creating BoundingSphere for better performance
    const distance = Cartesian3.distance(position, viewer.camera.position);
    const pixelDimensions = viewer.camera.frustum.getPixelDimensions(
      viewer.scene.drawingBufferWidth,
      viewer.scene.drawingBufferHeight,
      distance,
      1,
      new Cartesian2()
    );

    return Math.max(pixelDimensions.x, pixelDimensions.y);
  }
  return null;
};

// CESIUM TO WEB MAPS

enum PICKMODE {
  CENTER,
  RING,
}

const generatePositionsForRing = (n = 8, radius = 0.1, center = [0.5, 0.5]) => {
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

export const generateRingFromDegrees = (
  centerDeg: LatLng.deg,
  radiusInMeters: number,
  samples: number = 24
): LatLng.rad[] => {
  const center = Cartographic.fromDegrees(
    centerDeg.longitude,
    centerDeg.latitude
  );
  const points: LatLng.rad[] = [];

  const scaleFactor = {
    latitude: 1 / EARTH_RADIUS,
    longitude: 1 / (EARTH_RADIUS * Math.cos(center.latitude)),
  };

  for (let i = 0; i < samples; i++) {
    const angle = (CesiumMath.TWO_PI * i) / samples;
    const dx = radiusInMeters * Math.cos(angle);
    const dy = radiusInMeters * Math.sin(angle);
    const point = {
      longitude: (center.longitude + dx * scaleFactor.longitude) as Radians,
      latitude: (center.latitude + dy * scaleFactor.latitude) as Radians,
    };

    points.push(point);
  }
  points.push(points[0]); // Close the loop
  return points;
};

const sampleRingPixelSize = (
  ctx: CesiumContextType,
  samples: number,
  radius: number
) => {
  const positionCoords = generatePositionsForRing(samples, radius);
  const positions = pickViewerCanvasPositions(ctx, positionCoords);
  const viewer = ctx.isViewerValid() ? ctx.viewerRef.current! : null;
  const pixelSizes = positions.map(({ scenePosition }) =>
    viewer ? getPixelSizeForPosition(viewer, scenePosition) : null
  );
  const validPixelSizes = pixelSizes.filter(
    (pixelSize): pixelSize is number =>
      typeof pixelSize === "number" &&
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
  console.debug("pixel sizes", sortedPixelSizes, trimmedPixelSizes, avg);
  return avg;
};

export const getScenePixelSize = (
  ctx: CesiumContextType,
  mode = PICKMODE.CENTER,
  { samples = 10, radius = 0.2 }: { samples?: number; radius?: number } = {}
): NumericResult => {
  if (!ctx.isViewerValid()) return { value: null };

  // sample two position to get better approximation for full view extent
  if (radius >= 0.5) {
    console.warn(
      "radius is greater than 0.5, clamping applied",
      radius,
      samples
    );
    radius = 0.5;
  }

  let result: NumericResult = { value: null };

  switch (mode) {
    case PICKMODE.RING: {
      if (radius > 0) {
        result.value = sampleRingPixelSize(ctx, samples, radius);
        break;
      }
      console.warn("radius is 0, skipping");
      break;
    }
    case PICKMODE.CENTER:
    default: {
      const centerPos = pickViewerCanvasCenter(ctx, {
        getPixelSize: true,
      });
      result.value = centerPos.pixelSize;
    }
  }

  if (result.value === 0 || result.value === Infinity) {
    result = {
      value: null,
      error: "No pixel size found for camera position",
    };
  }

  return result;
};

export const cesiumCenterPixelSizeToLeafletZoom = (
  ctx: CesiumContextType
): NumericResult => {
  const pixelSize = getScenePixelSize(ctx, PICKMODE.RING);
  if (pixelSize.value === null) {
    console.warn("No pixel size found for camera position.", pixelSize.error);
    return { value: null, error: "No pixel size found for camera position" };
  }
  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    asMeters(pixelSize.value),
    asRadians(ctx.viewerRef.current!.camera.positionCartographic.latitude)
  );

  if (zoom === Infinity) {
    console.warn("zoom is infinity, skipping");
    return { value: null, error: "Zoom is infinity" };
  }

  return { value: zoom };
};

// Safe render that optionally enforces identity (same instance)
export const cesiumSafeRequestRender = (
  viewer: unknown,
  capturedIdentity?: unknown
): void => {
  if (isValidViewerInstance(viewer)) {
    if (!capturedIdentity || capturedIdentity === viewer) {
      viewer.scene.requestRender();
      return;
    }
    // Identity mismatch: likely a new viewer was mounted; skip
    console.warn(
      "Cesium Render skipped: viewer identity mismatch (stale instance)"
    );
    return;
  }
  console.warn(
    "Cesium Render request failed, viewer is destroyed or invalid"
  );
};

// Factory to produce a safe requestRender bound to a specific ref and identity
export const makeSafeRequestRender = (
  viewerRef: { current: unknown }
): (() => void) => {
  const captured = viewerRef.current;
  return () => cesiumSafeRequestRender(viewerRef.current, captured);
};
