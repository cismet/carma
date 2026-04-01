import { useMemo } from "react";

import { createSvgLineVisualizers } from "@carma-commons/svg";
import {
  cartesian3FromGeographicCoordinate,
  projectGeographicCoordinateToScreen,
} from "@carma-mapping/engines/cesium/core";
import { useCesiumEdgeVisualizer } from "@carma-mapping/engines/cesium/react/primitives";
import {
  useLineVisualizers,
  type LineVisualizerData,
} from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma-units";

import type { RuntimeScene } from "../types/runtimeScene.types";
import type { RuntimeEdgeRenderModel } from "./measurementRenderModels";
type UseMeasurementPrimitivesVisualizerArgs = {
  scene: RuntimeScene | null;
  edges: readonly RuntimeEdgeRenderModel[];
};

export const useMeasurementPrimitivesVisualizer = ({
  scene,
  edges,
}: UseMeasurementPrimitivesVisualizerArgs) => {
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

  const edgeSceneLines = useMemo(
    () =>
      edgeSegments.map((edge) => ({
        id: edge.id,
        start: cartesian3FromGeographicCoordinate(edge.startCoordinate),
        end: cartesian3FromGeographicCoordinate(edge.endCoordinate),
        stroke: edge.stroke,
        strokeWidth: edge.strokeWidth,
        // Keep Cesium lines solid and reserve dashed styling for the SVG overlay.
        // This keeps 3D rendering cheap while the overlay communicates visibility.
        dashed: false,
      })),
    [edgeSegments]
  );

  useCesiumEdgeVisualizer(scene, edgeSceneLines, {
    enabled: edgeSceneLines.length > 0,
  });

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
              start: { x: start.x, y: start.y } as CssPixelPosition,
              end: { x: end.x, y: end.y } as CssPixelPosition,
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
};
