import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  defined,
  Entity,
  GroundPrimitive,
  Math as CesiumMath,
} from "cesium";

import { CesiumContextType } from "../CesiumContext";
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

// Convert normalized canvas coords [0..1] to window pixel position centered on pixels
export const getCanvasWindowPosition = (
  width: number,
  height: number,
  x = 0.5,
  y = 0.5
): Cartesian2 => {
  return new Cartesian2((width - 1) * x + 0.5, (height - 1) * y + 0.5);
};

// shorthand helper for canvas center position
export const getCanvasCenterWindowPosition = (
  height: number,
  width: number
): Cartesian2 =>
  getCanvasWindowPosition(
    width,
    height,
    CENTER_POSITION[0],
    CENTER_POSITION[1]
  );

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
  let results: PickResult[] = [];
  ctx.withViewer((viewer) => {
    // store previous settings
    const prev = {
      depthTestAgainstTerrain: viewer.scene.globe.depthTestAgainstTerrain,
      pickTranslucentDepth: viewer.scene.pickTranslucentDepth,
    };

    // apply overrides
    viewer.scene.pickTranslucentDepth = pickTranslucentDepth;
    viewer.scene.globe.depthTestAgainstTerrain = depthTestAgainstTerrain;
    results = positions.map((position) => {
      const windowPosition = getCanvasWindowPosition(
        viewer.canvas.clientWidth,
        viewer.canvas.clientHeight,
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

      let scenePosition: Cartesian3 | null = null;
      ctx.withScene((scene) => {
        scenePosition = scene.pickPosition(windowPosition) as Cartesian3 | null;
      });

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
        const { drawingBufferWidth, drawingBufferHeight } = viewer.scene;
        result.pixelSize = getPixelSizeForPosition(
          scenePosition,
          viewer.camera,
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
    // restore previous settings
    Object.assign(viewer.scene.globe, prev);
  });
  return results;
};

// helper shorthand
export const pickViewerCanvasCenter = (
  ctx: CesiumContextType,
  options?: PickOptions
): PickResult => {
  return pickViewerCanvasPositions(ctx, [CENTER_POSITION], options)[0];
};

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
  const viewer = ctx.viewerRef.current;
  if (
    !viewer ||
    viewer.isDestroyed() ||
    !viewer.scene ||
    viewer.scene.isDestroyed() ||
    !viewer.camera
  ) {
    return null;
  }
  const pickedObjects = viewer.scene.drillPick(position, limit);
  console.debug("SCENE DRILL PICK:", pickedObjects);
  return getLastGroundPrimitive(pickedObjects);
}

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
