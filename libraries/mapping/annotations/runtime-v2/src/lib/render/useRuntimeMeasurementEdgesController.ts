import { useEffect, useMemo, useRef } from "react";

import { createSvgLineVisualizers } from "@carma-commons/svg";
import {
  cartesian3FromGeographicCoordinate,
  isValidScene,
  projectGeographicCoordinateToScreen,
} from "@carma-mapping/engines/cesium/core";
import {
  BoundingSphere,
  Cartesian3,
  Color,
  Material,
  PolylineCollection,
} from "@carma-cesium";
import {
  useLineVisualizers,
  type LineVisualizerData,
} from "@carma-providers/label-overlay";

import type { RuntimeScene } from "../types/runtimeScene.types";
import type { RuntimeEdgeRenderModel } from "./measurementRenderModels";

type UseRuntimeMeasurementEdgesControllerArgs = {
  scene: RuntimeScene | null;
  edges: readonly RuntimeEdgeRenderModel[];
};

type RuntimeEdgeSceneLine = {
  id: string;
  start: Cartesian3;
  end: Cartesian3;
  stroke: string;
  strokeWidth: number;
  dashed: boolean;
};

type SceneLineHandle = {
  signature: string;
  collection: PolylineCollection;
  dashed: boolean;
  destroy: () => void;
};

const DEFAULT_DASH_LENGTH_METERS = 1.5;
const DEFAULT_GAP_LENGTH_METERS = 1.5;
const DEFAULT_DASH_LENGTH_PX = 6;
const DEFAULT_GAP_LENGTH_PX = 8;
const MIN_SEGMENT_LENGTH_METERS = 0.01;

const buildSceneLineSignature = (line: RuntimeEdgeSceneLine) =>
  [
    line.id,
    line.start.x,
    line.start.y,
    line.start.z,
    line.end.x,
    line.end.y,
    line.end.z,
    line.stroke,
    line.strokeWidth,
    line.dashed,
  ].join(":");

const estimateMetersPerPixel = (
  scene: RuntimeScene,
  start: Cartesian3,
  end: Cartesian3
): number => {
  const midpoint = Cartesian3.midpoint(start, end, new Cartesian3());
  const radius = Math.max(Cartesian3.distance(start, end) * 0.5, 1);
  const boundingSphere = new BoundingSphere(midpoint, radius);
  const metersPerPixel = scene.camera.getPixelSize(
    boundingSphere,
    scene.drawingBufferWidth,
    scene.drawingBufferHeight
  );

  if (Number.isFinite(metersPerPixel) && metersPerPixel > 0) {
    return metersPerPixel;
  }

  const fallbackLength = Math.max(Cartesian3.distance(start, end), 1);
  const fallbackPixels = Math.max(
    Math.hypot(scene.drawingBufferWidth, scene.drawingBufferHeight),
    1
  );
  return fallbackLength / fallbackPixels;
};

const buildLineSegments = (
  start: Cartesian3,
  end: Cartesian3,
  dashed: boolean,
  dashLength: number,
  gapLength: number,
  capLength: number
): Array<[Cartesian3, Cartesian3]> => {
  const totalLength = Cartesian3.distance(start, end);
  if (totalLength <= MIN_SEGMENT_LENGTH_METERS) {
    return [];
  }

  if (!dashed) {
    return [[start, end]];
  }

  const safeDashLength = Math.max(dashLength, MIN_SEGMENT_LENGTH_METERS);
  const safeGapLength = Math.max(gapLength, 0);
  const safeCapLength = Math.min(
    Math.max(capLength, 0),
    totalLength * 0.5 - MIN_SEGMENT_LENGTH_METERS * 0.5
  );
  const step = Math.max(
    safeDashLength + safeGapLength,
    MIN_SEGMENT_LENGTH_METERS
  );

  if (safeCapLength <= MIN_SEGMENT_LENGTH_METERS) {
    const segments: Array<[Cartesian3, Cartesian3]> = [];
    for (let distance = 0; distance < totalLength; distance += step) {
      const endDistance = Math.min(distance + safeDashLength, totalLength);
      if (endDistance - distance <= MIN_SEGMENT_LENGTH_METERS * 0.5) {
        continue;
      }

      segments.push([
        Cartesian3.lerp(start, end, distance / totalLength, new Cartesian3()),
        Cartesian3.lerp(
          start,
          end,
          endDistance / totalLength,
          new Cartesian3()
        ),
      ]);
    }
    return segments;
  }

  if (totalLength <= safeCapLength * 2 + MIN_SEGMENT_LENGTH_METERS) {
    return [[start, end]];
  }

  const segments: Array<[Cartesian3, Cartesian3]> = [];
  const pushSegment = (startDistance: number, endDistance: number) => {
    if (endDistance - startDistance <= MIN_SEGMENT_LENGTH_METERS * 0.5) {
      return;
    }

    segments.push([
      Cartesian3.lerp(
        start,
        end,
        startDistance / totalLength,
        new Cartesian3()
      ),
      Cartesian3.lerp(
        start,
        end,
        endDistance / totalLength,
        new Cartesian3()
      ),
    ]);
  };

  pushSegment(0, safeCapLength);

  const dashedStart = safeCapLength;
  const dashedEnd = totalLength - safeCapLength;
  for (let distance = dashedStart; distance < dashedEnd; distance += step) {
    const endDistance = Math.min(distance + safeDashLength, dashedEnd);
    if (endDistance - distance <= MIN_SEGMENT_LENGTH_METERS * 0.5) {
      continue;
    }

    segments.push([
      Cartesian3.lerp(start, end, distance / totalLength, new Cartesian3()),
      Cartesian3.lerp(
        start,
        end,
        endDistance / totalLength,
        new Cartesian3()
      ),
    ]);
  }

  pushSegment(dashedEnd, totalLength);
  return segments;
};

const createSceneLineHandle = (
  scene: RuntimeScene,
  line: RuntimeEdgeSceneLine
): SceneLineHandle => {
  const metersPerPixel = estimateMetersPerPixel(scene, line.start, line.end);
  const dashLengthMeters = line.dashed
    ? Math.max(DEFAULT_DASH_LENGTH_PX * metersPerPixel, MIN_SEGMENT_LENGTH_METERS)
    : DEFAULT_DASH_LENGTH_METERS;
  const gapLengthMeters = line.dashed
    ? Math.max(DEFAULT_GAP_LENGTH_PX * metersPerPixel, 0)
    : DEFAULT_GAP_LENGTH_METERS;
  const capLengthMeters = line.dashed
    ? Math.max(line.strokeWidth * metersPerPixel, MIN_SEGMENT_LENGTH_METERS * 2)
    : 0;

  const segments = buildLineSegments(
    line.start,
    line.end,
    line.dashed,
    dashLengthMeters,
    gapLengthMeters,
    capLengthMeters
  );
  const collection = new PolylineCollection();

  if (segments.length > 0) {
    const material = Material.fromType("Color", {
      color: Color.fromCssColorString(line.stroke),
    });

    segments.forEach(([segmentStart, segmentEnd], index) => {
      collection.add({
        id: `${line.id}-${index}`,
        positions: [segmentStart, segmentEnd],
        width: line.strokeWidth,
        material,
        show: true,
      });
    });
  }

  scene.primitives.add(collection);

  const destroy = () => {
    if (!isValidScene(scene)) {
      return;
    }

    try {
      if (
        typeof collection.isDestroyed === "function" &&
        collection.isDestroyed()
      ) {
        return;
      }
      scene.primitives.remove(collection);
    } catch (error) {
      console.warn(
        "[annotations/runtime-v2] Ignoring committed edge destroy error.",
        error
      );
    }
  };

  return {
    signature: buildSceneLineSignature(line),
    collection,
    dashed: line.dashed,
    destroy,
  };
};

const destroySceneLineHandles = (handles: Map<string, SceneLineHandle>) => {
  handles.forEach((handle) => {
    handle.destroy();
  });
  handles.clear();
};

export const useRuntimeMeasurementEdgesController = ({
  scene,
  edges,
}: UseRuntimeMeasurementEdgesControllerArgs) => {
  const sceneLineHandleByIdRef = useRef<Map<string, SceneLineHandle>>(new Map());

  const edgeSegments = useMemo(
    () =>
      edges.flatMap((edge) => {
        const segments = [];

        for (let index = 0; index < edge.coordinates.length - 1; index += 1) {
          const startCoordinate = edge.coordinates[index];
          const endCoordinate = edge.coordinates[index + 1];

          if (!startCoordinate || !endCoordinate) {
            continue;
          }

          segments.push({
            id: `${edge.id}-${index}`,
            startCoordinate,
            endCoordinate,
            stroke: edge.stroke,
            strokeWidth: edge.strokeWidth,
            dashed: edge.dashed ?? false,
          });
        }

        return segments;
      }),
    [edges]
  );

  const sceneLines = useMemo<readonly RuntimeEdgeSceneLine[]>(
    () =>
      edgeSegments.map((edge) => ({
        id: edge.id,
        start: cartesian3FromGeographicCoordinate(edge.startCoordinate),
        end: cartesian3FromGeographicCoordinate(edge.endCoordinate),
        stroke: edge.stroke,
        strokeWidth: edge.strokeWidth,
        dashed: false,
      })),
    [edgeSegments]
  );

  const overlayLines = useMemo<readonly LineVisualizerData[]>(
    () =>
      edgeSegments.flatMap((edge) =>
        createSvgLineVisualizers({
          id: `runtime-edge-overlay-${edge.id}`,
          getSvgLine: () => {
            const start = projectGeographicCoordinateToScreen(
              scene,
              edge.startCoordinate
            );
            const end = projectGeographicCoordinateToScreen(
              scene,
              edge.endCoordinate
            );
            if (!start || !end) {
              return null;
            }

            return {
              start: { x: start.x, y: start.y },
              end: { x: end.x, y: end.y },
            };
          },
          stroke: edge.stroke,
          strokeWidth: edge.strokeWidth,
          dashed: edge.dashed,
          hitTargetStrokeWidth: 10,
        })
      ),
    [edgeSegments, scene]
  );

  useLineVisualizers([...overlayLines], overlayLines.length > 0);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
      destroySceneLineHandles(sceneLineHandleByIdRef.current);
      return;
    }

    const reconcileSceneLines = (lines: readonly RuntimeEdgeSceneLine[]) => {
      const nextIds = new Set(lines.map((line) => line.id));

      sceneLineHandleByIdRef.current.forEach((handle, id) => {
        if (nextIds.has(id)) {
          return;
        }

        handle.destroy();
        sceneLineHandleByIdRef.current.delete(id);
      });

      lines.forEach((line) => {
        const nextSignature = buildSceneLineSignature(line);
        const existingHandle = sceneLineHandleByIdRef.current.get(line.id);
        if (existingHandle?.signature === nextSignature) {
          return;
        }

        existingHandle?.destroy();
        sceneLineHandleByIdRef.current.set(
          line.id,
          createSceneLineHandle(scene, line)
        );
      });

      scene.requestRender();
    };

    reconcileSceneLines(sceneLines);

    return () => {
      destroySceneLineHandles(sceneLineHandleByIdRef.current);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    };
  }, [scene, sceneLines]);
};
