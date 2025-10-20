import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  defined,
  GroundPrimitive,
  CesiumMath,
  type Scene,
} from "@carma/cesium";

import {
  getCanvasDimensions,
  type CanvasDimensions,
} from "@carma-commons/dom/canvas";

import { getPixelSizeForPosition } from "./pixels";

// Scratch object to avoid allocation on every call
const scratchWindowPosition = new Cartesian2();

export type PickResult = {
  position: [number, number];
  windowPosition: Cartesian2;
  pixelSize: number | null;
  scenePosition: Cartesian3 | null;
  coordinates: Cartographic | null;
};

export enum PICKMODE {
  CENTER,
  RING,
}

interface PickOptions {
  depthTestAgainstTerrain?: boolean;
  getPixelSize?: boolean;
  getCoordinates?: boolean;
  pickTranslucentDepth?: boolean;
}
// ...

const GEOJSON_DRILL_LIMIT = 10;
const CENTER_POSITION: [number, number] = [0.5, 0.5];

// Convert normalized canvas coords [0..1] to window pixel position centered on pixels
export const getCanvasWindowPosition = (
  canvasDimensions: CanvasDimensions,
  x = 0.5,
  y = 0.5
): Cartesian2 => {
  const { width, height } = canvasDimensions;
  scratchWindowPosition.x = (width - 1) * x + 0.5;
  scratchWindowPosition.y = (height - 1) * y + 0.5;
  return scratchWindowPosition;
};

// shorthand helper for canvas center position
export const getCanvasCenterWindowPosition = (
  canvasDimensions: CanvasDimensions
): Cartesian2 =>
  getCanvasWindowPosition(
    canvasDimensions,
    CENTER_POSITION[0],
    CENTER_POSITION[1]
  );

export const pickScenePositions = (
  scene: Scene,
  positions: [number, number][] = [CENTER_POSITION], // canvas positions
  {
    getPixelSize = false,
    getCoordinates = false,
    depthTestAgainstTerrain = true,
    pickTranslucentDepth = true,
  }: PickOptions = {}
): PickResult[] => {
  let results: PickResult[] = [];

  if (scene.pickPositionSupported === false) {
    console.debug("Scene pickPositionSupported is false");
    return results;
  }

  const canvasDimensions: CanvasDimensions = getCanvasDimensions(
    scene.canvas as HTMLCanvasElement
  );
  // store previous settings
  const prev = {
    depthTestAgainstTerrain: scene.globe.depthTestAgainstTerrain,
    pickTranslucentDepth: scene.pickTranslucentDepth,
  };

  // apply overrides
  scene.pickTranslucentDepth = pickTranslucentDepth;
  scene.globe.depthTestAgainstTerrain = depthTestAgainstTerrain;
  try {
    results = positions.map((position) => {
      const windowPosition = getCanvasWindowPosition(
        canvasDimensions,
        position[0],
        position[1]
      );
      const result: PickResult = {
        position,
        windowPosition,
        scenePosition: null,
        pixelSize: null,
        coordinates: null,
      };

      const scenePosition = scene.pickPosition(
        windowPosition
      ) as Cartesian3 | null;

      if (!defined(scenePosition)) {
        console.debug(
          "No scene position found at the picked position.",
          position[0],
          position[1],
          windowPosition
        );
        return result;
      }

      result.scenePosition = scenePosition;

      if (getPixelSize) {
        const { drawingBufferWidth, drawingBufferHeight } = scene;
        result.pixelSize = getPixelSizeForPosition(
          scenePosition,
          scene.camera,
          drawingBufferWidth,
          drawingBufferHeight
        );
      }

      if (getCoordinates) {
        const coordinates =
          scenePosition && defined(scenePosition)
            ? Cartographic.fromCartesian(scenePosition)
            : null;
        result.coordinates = coordinates;
      }
      return result;
    });
  } catch (error) {
    console.error("Failed to pick scene positions", error);
  } finally {
    scene.pickTranslucentDepth = prev.pickTranslucentDepth;
    scene.globe.depthTestAgainstTerrain = prev.depthTestAgainstTerrain;
  }
  return results;
};

// helper shorthand
export const pickSceneCenter = (
  scene: Scene,
  options?: PickOptions
): PickResult => {
  return pickScenePositions(scene, [CENTER_POSITION], options)[0]!;
};

/**
 * Get last ground primitive from picked objects
 * Needed since default picker fails with ground primitives created from GeoJson
 * Returns the id property which can be any object attached to the primitive
 */
function getLastGroundPrimitive(
  pickedObjects: { primitive: unknown; id?: unknown }[]
): unknown {
  let lastGroundPrimitive: unknown = null;

  pickedObjects.reverse().some((pickedObject) => {
    if (defined(pickedObject)) {
      if (pickedObject.primitive instanceof GroundPrimitive) {
        lastGroundPrimitive = pickedObject.id;
        return true;
      }
    }
    return false;
  });

  return lastGroundPrimitive;
}

/**
 * Pick from clamped GeoJSON ground primitives
 * Only used in playground for testing
 * Returns the id object attached to the picked ground primitive
 */
export function pickFromClampedGeojson(
  scene: Scene,
  position: Cartesian2,
  limit: number = GEOJSON_DRILL_LIMIT
): unknown {
  const pickedObjects = scene.drillPick(position, limit);
  console.debug("SCENE DRILL PICK:", pickedObjects);
  const result = getLastGroundPrimitive(pickedObjects);
  return result;
}

const findTopPick = (scene: Scene, xPos = 0, targetPixelSize: number) => {
  let top: PickResult | null = null;
  let yPos = 0;

  while (top === null && yPos < 1) {
    const [candidate] = pickScenePositions(scene, [[xPos, yPos]], {
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

export const getSceneViewportPolygonRing = (
  scene: Scene,
  { resolutionRange = 4 }: { resolutionRange?: number } = {}
): [number, number][] | null => {
  const bottom = pickScenePositions(
    scene,
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
    console.debug("No bottom pixel position found", bottom);
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
    const result = findTopPick(scene, pos.position[0], targetPixelSize);
    if (result) {
      console.debug("Top pixel position found", pos.position[0], result);
      return result;
    } else {
      console.debug("No valid top pixel position found");
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
        console.debug("No valid mapping", result);
        return null;
      }
    }
  );
  return geom.filter((point) => point !== null) as [number, number][];
};
