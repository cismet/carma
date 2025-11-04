import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  defined,
  GroundPrimitive,
  CesiumMath,
  Scene,
  isValidScene,
} from "@carma/cesium";

import {
  getCanvasDimensions,
  type CanvasDimensions,
} from "@carma-commons/dom/canvas";

import { getPixelSizeForPosition } from "./pixels";

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

const noopMap = (position: [number, number]) => ({
  position,
  windowPosition: new Cartesian2(0, 0),
  pixelSize: null,
  scenePosition: null,
  coordinates: null,
});

// Convert normalized canvas coords [0..1] to window pixel position centered on pixels
export const getCanvasWindowPosition = (
  canvasDimensions: CanvasDimensions,
  x = 0.5,
  y = 0.5
): Cartesian2 => {
  const { width, height } = canvasDimensions;
  return new Cartesian2((width - 1) * x + 0.5, (height - 1) * y + 0.5);
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

export const pickSceneCanvasPositions = (
  scene: Scene,
  positions: [number, number][] = [CENTER_POSITION],
  {
    getPixelSize = false,
    getCoordinates = false,
    depthTestAgainstTerrain = true,
    pickTranslucentDepth = true,
  }: PickOptions = {}
): PickResult[] => {
  if (!isValidScene(scene)) {
    console.warn("[CESIUM|PICKER] Invalid scene provided");
    return positions.map(noopMap);
  }
  const { camera, canvas } = scene;
  let results: PickResult[] = [];

  if (scene.pickPositionSupported === false) {
    console.debug("[CESIUM|PICKER] Scene pickPositionSupported is false");
    return results;
  }

  // Check if scene is ready for picking
  if (scene.isDestroyed()) {
    console.debug("[CESIUM|PICKER] Scene is destroyed");
    return results;
  }

  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

  // Check WebGL context state before attempting any picking operations
  if (!gl || gl.isContextLost()) {
    console.debug("[CESIUM|PICKER] WebGL context is lost or unavailable");
    return results;
  }

  // Check if framebuffer is valid
  const framebufferStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (framebufferStatus !== gl.FRAMEBUFFER_COMPLETE) {
    console.debug(
      "[CESIUM|PICKER] Framebuffer is not complete, skipping pick",
      framebufferStatus
    );
    return results;
  }

  // Check if scene is in a morphing/transition state
  if (scene.morphTime !== undefined && scene.morphTime !== 1.0) {
    console.debug(
      "[CESIUM|PICKER] Scene is morphing, skipping pick",
      scene.morphTime
    );
    return results;
  }

  const canvasDimensions: CanvasDimensions = getCanvasDimensions(canvas);

  console.debug("[CESIUM|PICKER] Canvas/WebGL state:", {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    canvasClientWidth: canvas.clientWidth,
    canvasClientHeight: canvas.clientHeight,
    drawingBufferWidth: gl.drawingBufferWidth,
    drawingBufferHeight: gl.drawingBufferHeight,
    contextLost: gl.isContextLost(),
    sceneIsDestroyed: scene.isDestroyed(),
    sceneMode: scene.mode,
    morphTime: scene.morphTime,
    globeIsDestroyed: scene.globe?.isDestroyed?.() ?? "no isDestroyed method",
    hasGlobe: !!scene.globe,
    hasTerrainProvider: !!scene.terrainProvider,
  });

  // store previous settings (guard globe access)
  const prev = {
    depthTestAgainstTerrain: scene.globe?.depthTestAgainstTerrain ?? false,
    pickTranslucentDepth: scene.pickTranslucentDepth,
  };

  // apply overrides
  scene.pickTranslucentDepth = pickTranslucentDepth;
  if (scene.globe) {
    scene.globe.depthTestAgainstTerrain = depthTestAgainstTerrain;
  }
  scene.useDepthPicking = true;

  console.debug(
    "[CESIUM|PICKER] Picking with options:",
    pickTranslucentDepth,
    depthTestAgainstTerrain,
    scene.pickPositionSupported
  );

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

      // Guard against framebuffer errors during scene initialization
      let scenePosition: Cartesian3 | null = null;
      try {
        scenePosition = scene.pickPosition(windowPosition) as Cartesian3 | null;
      } catch (error) {
        console.error(
          "[CESIUM|PICKER] pickPosition failed - destroyed object detected",
          {
            error: error instanceof Error ? error.message : error,
            errorStack: error instanceof Error ? error.stack : undefined,
            windowPosition,
            sceneIsDestroyed: scene.isDestroyed(),
            globeIsDestroyed: scene.globe?.isDestroyed?.() ?? "unknown",
            pickTranslucentDepth: scene.pickTranslucentDepth,
            useDepthPicking: scene.useDepthPicking,
          }
        );
        return result;
      }

      if (!defined(scenePosition)) {
        console.debug(
          "[CESIUM|PICKER] No scene position found at the picked position.",
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
          camera,
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
  } finally {
    scene.pickTranslucentDepth = prev.pickTranslucentDepth;
    if (scene.globe) {
      scene.globe.depthTestAgainstTerrain = prev.depthTestAgainstTerrain;
    }
  }
  return results;
};

// helper shorthand
export const pickSceneCanvasCenter = (
  scene: Scene,
  options?: PickOptions
): PickResult => {
  return pickSceneCanvasPositions(scene, [CENTER_POSITION], options)[0];
};

// get last ground primitive from picked objects
// needed since default picker fails with ground primitives created from GeoJson
function getLastGroundPrimitive(
  pickedObjects: { primitive: unknown; id?: unknown }[]
): GroundPrimitive | null {
  let lastGroundPrimitive: GroundPrimitive | null = null;

  pickedObjects.reverse().some((pickedObject) => {
    if (defined(pickedObject)) {
      if (pickedObject.primitive instanceof GroundPrimitive) {
        lastGroundPrimitive = pickedObject.primitive;
        return true;
      }
    }
    return false;
  });

  return lastGroundPrimitive;
}

// only used in playground
export function pickFromClampedGeojson(
  scene: Scene,
  position: Cartesian2,
  limit: number = GEOJSON_DRILL_LIMIT
): GroundPrimitive | null {
  const pickedObjects = scene.drillPick(position, limit);
  console.debug("SCENE DRILL PICK:", pickedObjects);
  return getLastGroundPrimitive(pickedObjects);
}

const findTopPick = (scene: Scene, xPos = 0, targetPixelSize: number) => {
  let top: PickResult | null = null;
  let yPos = 0;

  while (top === null && yPos < 1) {
    const [candidate] = pickSceneCanvasPositions(scene, [[xPos, yPos]], {
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
  const bottom = pickSceneCanvasPositions(
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
