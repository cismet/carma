import type { Vector3 } from "three";

import { annotationOverlayDefaults } from "../config/annotation-overlay-defaults";
import type {
  AnnotationEngine,
  AnnotationSceneLineCollection,
  AnnotationSceneLineHandle,
} from "@carma-mapping/annotations/core";

export type AuthoringLineRuntime = {
  line: AnnotationSceneLineHandle;
  colorCss: string;
  width: number;
  ruler?: boolean;
  occludedDashed?: boolean;
  halo?: boolean;
};

export const createLineCollection = (
  engine: AnnotationEngine
): AnnotationSceneLineCollection => engine.createLineCollection();

export const createLineRuntime = (
  collection: AnnotationSceneLineCollection,
  id: string,
  colorCss: string,
  options?: {
    width?: number;
    /** The draft draws like the finished measurement: metres along the line. */
    ruler?: boolean;
    /** The engine draws the hidden part dashed on top, see `occludedLinesInScene`. */
    occludedDashed?: boolean;
    /** A darkening halo beside the line; default true. */
    halo?: boolean;
  }
): AuthoringLineRuntime => {
  const width = options?.width ?? annotationOverlayDefaults.lineStrokeWidthPx;
  const ruler = options?.ruler === true;
  const occludedDashed = options?.occludedDashed === true;
  const halo = options?.halo !== false;
  return {
    line: collection.addLine({
      id,
      positions: [],
      color: colorCss,
      width,
      ruler,
      occludedDashed,
      halo,
      visible: false,
    }),
    colorCss,
    width,
    ruler,
    occludedDashed,
    halo,
  };
};

export const setLineRuntimeColor = (
  lineRuntime: AuthoringLineRuntime,
  colorCss: string
) => {
  if (lineRuntime.colorCss === colorCss) {
    return;
  }

  lineRuntime.line.setStyle({
    color: colorCss,
    width: lineRuntime.width,
    ruler: lineRuntime.ruler,
    occludedDashed: lineRuntime.occludedDashed,
    halo: lineRuntime.halo,
  });
  lineRuntime.colorCss = colorCss;
};

export const clearLineRuntime = (lineRuntime: AuthoringLineRuntime) => {
  lineRuntime.line.setVisible(false);
};

export const applyLineRuntime = (
  lineRuntime: AuthoringLineRuntime,
  positions: readonly Vector3[]
) => {
  lineRuntime.line.setPositions(positions);
  lineRuntime.line.setVisible(positions.length >= 2);
};
