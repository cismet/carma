import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import type {
  AnnotationGeographicCoordinate,
  AnnotationEngine,
} from "@carma-mapping/annotations/core";

import {
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  type AuthoringLineRuntime,
} from "./authoring-line-runtime";

export type ProjectionNormalSegment = {
  fromPlaneCoordinate: AnnotationGeographicCoordinate;
  toSampleCoordinate: AnnotationGeographicCoordinate;
};

export type ProjectionNormalController = {
  setSegments: (
    segments: readonly ProjectionNormalSegment[],
    requestRender?: boolean
  ) => void;
  clear: (requestRender?: boolean) => void;
  destroy: () => void;
};

/** Lines from each drafted point to the plane it is projected onto. */
export const createProjectionNormalController = ({
  engine,
  idPrefix,
  colorCss,
  strokeWidth,
}: {
  engine: AnnotationEngine;
  idPrefix: string;
  colorCss: string;
  strokeWidth: number;
}): ProjectionNormalController => {
  const lineCollection = createLineCollection(engine);
  const lines: AuthoringLineRuntime[] = [];

  return {
    setSegments: (segments, requestRender = true) => {
      while (lines.length < segments.length) {
        lines.push(
          createLineRuntime(
            lineCollection,
            `${idPrefix}-projection-normal-${lines.length}`,
            colorCss,
            { width: strokeWidth }
          )
        );
      }
      segments.forEach((segment, index) => {
        applyLineRuntime(lines[index]!, [
          ecefFromGeographicCoordinate(segment.fromPlaneCoordinate),
          ecefFromGeographicCoordinate(segment.toSampleCoordinate),
        ]);
      });
      lines.slice(segments.length).forEach(clearLineRuntime);
      if (requestRender) {
        engine.requestRender();
      }
    },
    clear: (requestRender = true) => {
      lines.forEach(clearLineRuntime);
      if (requestRender) {
        engine.requestRender();
      }
    },
    destroy: () => {
      lineCollection.destroy();
    },
  };
};
