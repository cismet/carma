import { Vector3, type Matrix4 } from "three";
import { buildCirclePoints } from "@carma-commons/math";
import { AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX } from "@carma-mapping/gizmo/core";

import type {
  AnnotationEngine,
  AnnotationSceneLineCollection,
} from "@carma-mapping/annotations/core";
import {
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  setLineRuntimeColor,
  type AuthoringLineRuntime,
} from "./authoring-line-runtime";

export type DiscRimLine = {
  /** Draws the rim of the unit disc that `modelMatrix` places. */
  apply: (modelMatrix: Matrix4, colorCss: string) => void;
  clear: () => void;
  destroy: () => void;
};

/**
 * The outer rim of a disc in the scene, like the gizmo disc outline: solid
 * where it is visible, dotted where meshes or terrain are nearer. Needs an
 * engine that draws occluded lines in the scene.
 */
export const createDiscRimLine = (
  engine: AnnotationEngine,
  id: string,
  segments: number
): DiscRimLine => {
  const unitRim = buildCirclePoints(1, segments).map(
    ({ x, y }) => new Vector3(x, y, 0)
  );
  if (unitRim.length > 0) unitRim.push(unitRim[0]!.clone());
  let collection: AnnotationSceneLineCollection | null = null;
  let runtime: AuthoringLineRuntime | null = null;

  return {
    apply: (modelMatrix, colorCss) => {
      collection ??= createLineCollection(engine);
      runtime ??= createLineRuntime(collection, id, colorCss, {
        width: AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
        occludedDashed: true,
        halo: false,
      });
      setLineRuntimeColor(runtime, colorCss);
      applyLineRuntime(
        runtime,
        unitRim.map((point) => point.clone().applyMatrix4(modelMatrix))
      );
    },
    clear: () => {
      if (runtime) clearLineRuntime(runtime);
    },
    destroy: () => {
      collection?.destroy();
      collection = null;
      runtime = null;
    },
  };
};
