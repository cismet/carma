import { useEffect, useRef } from "react";

import {
  LINE_TYPE_CARTESIAN,
  LINE_TYPE_GEOGRAPHIC,
  type LineType,
} from "@carma-mapping/annotations/core";
import {
  BoundingSphere,
  Cartesian3,
  Color,
  Material,
  PolylineCollection,
  type Scene,
} from "@carma-cesium";
import { isValidScene } from "@carma-mapping/engines/cesium/core";
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
    try {
      lineVisualizer.destroy();
    } catch (error) {
      // Cesium objects can already be destroyed during scene teardown.
      console.warn(
        "[annotations/cesium] Ignoring edge visualizer destroy error.",
        error
      );
    }
  });
  lineRefs.current = {};
};

const DEFAULT_DASH_LENGTH_METERS = 1.5;
const DEFAULT_GAP_LENGTH_METERS = 1.5;
const DEFAULT_DASH_LENGTH_PX = 6;
const DEFAULT_GAP_LENGTH_PX = 8;
const MIN_SEGMENT_LENGTH_METERS = 0.01;

const estimateMetersPerPixel = (
  scene: Scene,
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
  if (totalLength <= MIN_SEGMENT_LENGTH_METERS) return [];
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
      if (endDistance - distance <= MIN_SEGMENT_LENGTH_METERS * 0.5) continue;
      const t0 = distance / totalLength;
      const t1 = endDistance / totalLength;
      segments.push([
        Cartesian3.lerp(start, end, t0, new Cartesian3()),
        Cartesian3.lerp(start, end, t1, new Cartesian3()),
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
    const t0 = startDistance / totalLength;
    const t1 = endDistance / totalLength;
    segments.push([
      Cartesian3.lerp(start, end, t0, new Cartesian3()),
      Cartesian3.lerp(start, end, t1, new Cartesian3()),
    ]);
  };

  // Solid cap from anchor to ensure center-anchored round endpoints.
  pushSegment(0, safeCapLength);

  const dashedStart = safeCapLength;
  const dashedEnd = totalLength - safeCapLength;
  for (let distance = dashedStart; distance < dashedEnd; distance += step) {
    const endDistance = Math.min(distance + safeDashLength, dashedEnd);
    if (endDistance - distance <= MIN_SEGMENT_LENGTH_METERS * 0.5) continue;
    const t0 = distance / totalLength;
    const t1 = endDistance / totalLength;
    segments.push([
      Cartesian3.lerp(start, end, t0, new Cartesian3()),
      Cartesian3.lerp(start, end, t1, new Cartesian3()),
    ]);
  }

  // Solid cap into the target anchor.
  pushSegment(dashedEnd, totalLength);

  return segments;
};

const createAttachedLine = (
  scene: Scene,
  line: CesiumEdgeLineRenderModel
): { destroy: () => void } => {
  const metersPerPixel = estimateMetersPerPixel(scene, line.start, line.end);
  const dashLengthMeters =
    line.dashed ?? false
      ? Math.max(
          DEFAULT_DASH_LENGTH_PX * metersPerPixel,
          MIN_SEGMENT_LENGTH_METERS
        )
      : DEFAULT_DASH_LENGTH_METERS;
  const gapLengthMeters =
    line.dashed ?? false
      ? Math.max(DEFAULT_GAP_LENGTH_PX * metersPerPixel, 0)
      : DEFAULT_GAP_LENGTH_METERS;
  const capLengthMeters =
    line.dashed ?? false
      ? Math.max(
          line.strokeWidth * metersPerPixel,
          MIN_SEGMENT_LENGTH_METERS * 2
        )
      : 0;

  const segments = buildLineSegments(
    line.start,
    line.end,
    line.dashed ?? false,
    dashLengthMeters,
    gapLengthMeters,
    capLengthMeters
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
      const primitives = scene.primitives as
        | {
            remove?: (primitive: unknown) => boolean;
            contains?: (primitive: unknown) => boolean;
            isDestroyed?: () => boolean;
          }
        | undefined;
      if (
        typeof primitives?.isDestroyed === "function" &&
        primitives.isDestroyed()
      ) {
        return;
      }
      if (
        typeof collection.isDestroyed === "function" &&
        collection.isDestroyed()
      ) {
        return;
      }

      try {
        const canRemove =
          typeof primitives?.contains === "function"
            ? primitives.contains(collection)
            : true;
        if (canRemove && typeof primitives?.remove === "function") {
          primitives.remove(collection);
        }
      } catch (error) {
        console.warn(
          "[annotations/cesium] Ignoring edge visualizer remove error.",
          error
        );
      }
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
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
    let rafId: number | null = null;

    const syncLines = () => {
      if (!isValidScene(scene)) {
        return;
      }

      destroyLineVisualizerMap(lineRefs);

      if (!enabled || lines.length === 0) {
        scene.requestRender();
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
    };

    const scheduleSyncLines = () => {
      if (rafId !== null) {
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        syncLines();
      });
    };

    syncLines();
    const hasDashedLines = lines.some((line) => line.dashed);
    const removeCameraChangedListener = hasDashedLines
      ? scene.camera.changed.addEventListener(scheduleSyncLines)
      : undefined;

    return () => {
      removeCameraChangedListener?.();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
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
