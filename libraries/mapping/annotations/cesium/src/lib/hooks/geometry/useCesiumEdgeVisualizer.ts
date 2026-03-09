import { useEffect, useRef } from "react";

import { Color, type Scene } from "@carma/cesium";
import {
  LINE_TYPE_CARTESIAN,
  LINE_TYPE_GEOGRAPHIC,
  type LineType,
} from "@carma-mapping/annotations/core";
import {
  createLineVisualizer,
  type LineVisualizer,
} from "@carma-mapping/engines/cesium/legacy";

type CesiumEdgeLineRenderModel = {
  id: string;
  start: Parameters<typeof createLineVisualizer>[1]["start"];
  end: Parameters<typeof createLineVisualizer>[1]["end"];
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  lineType?: LineType;
};

export type CesiumEdgeVisualizerOptions = {
  enabled?: boolean;
};

const destroyLineVisualizerMap = (lineRefs: {
  current: Record<string, LineVisualizer>;
}) => {
  Object.values(lineRefs.current).forEach((lineVisualizer) => {
    lineVisualizer.destroy();
  });
  lineRefs.current = {};
};

export const useCesiumEdgeVisualizer = (
  scene: Scene | null,
  lines: readonly CesiumEdgeLineRenderModel[],
  { enabled = true }: CesiumEdgeVisualizerOptions = {}
) => {
  const lineRefs = useRef<Record<string, LineVisualizer>>({});
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

      const lineVisualizer = createLineVisualizer(line.id, {
        start: line.start,
        end: line.end,
        color: Color.fromCssColorString(line.stroke),
        width: line.strokeWidth,
        dashed: line.dashed ?? false,
      });
      lineRefs.current[line.id] = lineVisualizer;
      lineVisualizer.attach(scene, () => scene.requestRender());
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
