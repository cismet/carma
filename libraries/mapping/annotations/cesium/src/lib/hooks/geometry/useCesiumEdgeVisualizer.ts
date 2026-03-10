import { useEffect, useRef } from "react";

import {
  Cartesian3,
  Color,
  Material,
  PolylineCollection,
  isValidScene,
  type Scene,
} from "@carma/cesium";
import {
  LINE_TYPE_CARTESIAN,
  LINE_TYPE_GEOGRAPHIC,
  type LineType,
} from "@carma-mapping/annotations/core";

type CesiumEdgeLineRenderModel = {
  id: string;
  start: Cartesian3;
  end: Cartesian3;
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  lineType?: LineType;
};

export type CesiumEdgeVisualizerOptions = {
  enabled?: boolean;
};

const destroyLineVisualizerMap = (lineRefs: {
  current: Record<string, { destroy: () => void }>;
}) => {
  Object.values(lineRefs.current).forEach((lineVisualizer) => {
    lineVisualizer.destroy();
  });
  lineRefs.current = {};
};

const DEFAULT_DASH_LENGTH_METERS = 1.5;
const DEFAULT_GAP_LENGTH_METERS = 1.5;
const MIN_SEGMENT_LENGTH_METERS = 0.01;

const buildLineSegments = (
  start: Cartesian3,
  end: Cartesian3,
  dashed: boolean,
  dashLength: number,
  gapLength: number
): Array<[Cartesian3, Cartesian3]> => {
  const totalLength = Cartesian3.distance(start, end);
  if (totalLength <= MIN_SEGMENT_LENGTH_METERS) return [];
  if (!dashed) return [[start, end]];

  const safeDashLength = Math.max(dashLength, MIN_SEGMENT_LENGTH_METERS);
  const safeGapLength = Math.max(gapLength, 0);
  const step = Math.max(
    safeDashLength + safeGapLength,
    MIN_SEGMENT_LENGTH_METERS
  );

  const segments: Array<[Cartesian3, Cartesian3]> = [];
  for (let distance = 0; distance < totalLength; distance += step) {
    const endDistance = Math.min(distance + safeDashLength, totalLength);
    if (endDistance - distance <= MIN_SEGMENT_LENGTH_METERS * 0.5) continue;
    const t0 = distance / totalLength;
    const t1 = endDistance / totalLength;
    segments.push([
      Cartesian3.lerp(start, end, t0, new Cartesian3()),
      Cartesian3.lerp(start, end, t1, new Cartesian3()),
    ]);
  }
  return segments;
};

const createAttachedLine = (
  scene: Scene,
  line: CesiumEdgeLineRenderModel
): { destroy: () => void } => {
  const segments = buildLineSegments(
    line.start,
    line.end,
    line.dashed ?? false,
    DEFAULT_DASH_LENGTH_METERS,
    DEFAULT_GAP_LENGTH_METERS
  );
  if (segments.length === 0) {
    return { destroy: () => undefined };
  }

  const collection = new PolylineCollection();
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

  scene.primitives.add(collection);
  scene.requestRender();

  return {
    destroy: () => {
      if (!isValidScene(scene)) return;
      scene.primitives.remove(collection);
      scene.requestRender();
    },
  };
};

export const useCesiumEdgeVisualizer = (
  scene: Scene | null,
  lines: readonly CesiumEdgeLineRenderModel[],
  { enabled = true }: CesiumEdgeVisualizerOptions = {}
) => {
  const lineRefs = useRef<Record<string, { destroy: () => void }>>({});
  const warnedAboutGeographicPathRef = useRef(false);

  useEffect(() => {
    if (!scene) return;

    destroyLineVisualizerMap(lineRefs);

    if (!enabled || lines.length === 0) {
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
      return;
    }

    const hasGeographicPathLine = lines.some(
      (line) => line.lineType === LINE_TYPE_GEOGRAPHIC
    );
    if (hasGeographicPathLine && !warnedAboutGeographicPathRef.current) {
      console.warn(
        "[annotations/cesium] Geographic edge line paths are not implemented yet; rendering them as Cartesian lines."
      );
      warnedAboutGeographicPathRef.current = true;
    }

    lines.forEach((line) => {
      const lineType = line.lineType ?? LINE_TYPE_CARTESIAN;
      // Geographic line rendering is intentionally not implemented yet.
      // All scene lines still use straight Cartesian segments for now.
      void lineType;
      lineRefs.current[line.id] = createAttachedLine(scene, line);
    });

    scene.requestRender();

    return () => {
      destroyLineVisualizerMap(lineRefs);
      if (!scene || scene.isDestroyed()) return;
      scene.requestRender();
    };
  }, [enabled, lines, scene]);

  useEffect(
    () => () => {
      destroyLineVisualizerMap(lineRefs);
    },
    []
  );
};

export default useCesiumEdgeVisualizer;
