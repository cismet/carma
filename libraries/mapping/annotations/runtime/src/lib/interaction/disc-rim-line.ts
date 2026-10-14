import { Vector3, type Matrix4 } from "three";
import { buildCirclePoints } from "@carma-commons/math";
import { AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX } from "@carma-mapping/gizmo/core";

import type {
  AnnotationEngine,
  AnnotationSceneLineCollection,
  AnnotationSceneLineHandle,
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
  apply: (
    modelMatrix: Matrix4,
    colorCss: string,
    options?: { normalRadiusMeters?: number }
  ) => void;
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
  segments: number,
  { innerRadiusRatio = 0 }: { innerRadiusRatio?: number } = {}
): DiscRimLine => {
  const unitRim = buildCirclePoints(1, segments).map(
    ({ x, y }) => new Vector3(x, y, 0)
  );
  if (unitRim.length > 0) unitRim.push(unitRim[0]!.clone());
  const crosshairPoints = [new Vector3(1, 0, 0), new Vector3(0, 1, 0)].flatMap(
    (axis) =>
      [-1, 1].flatMap((sign) => [
        axis.clone().multiplyScalar(innerRadiusRatio * 0.5 * sign),
        axis.clone().multiplyScalar(innerRadiusRatio * 0.94 * sign),
      ])
  );
  let crosshair: AnnotationSceneLineHandle | null = null;
  let crosshairColor: string | null = null;
  let collection: AnnotationSceneLineCollection | null = null;
  let runtime: AuthoringLineRuntime | null = null;

  return {
    apply: (modelMatrix, colorCss, { normalRadiusMeters = 0 } = {}) => {
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
      if (innerRadiusRatio > 0) {
        crosshair ??= collection.addLine({
          id: `${id}-crosshair`,
          color: colorCss,
          width: AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
          segmentPairs: true,
          occludedDashed: true,
          halo: false,
          visible: false,
        });
        if (crosshairColor !== colorCss) {
          crosshair.setStyle({
            color: colorCss,
            width: AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
            occludedDashed: true,
            halo: false,
          });
          crosshairColor = colorCss;
        }
        // XY is scaled by the disc matrix, while its normal Z remains in metres.
        const normalPoints =
          normalRadiusMeters > 0
            ? [-1, 1].flatMap((sign) => [
                new Vector3(
                  0,
                  0,
                  normalRadiusMeters * innerRadiusRatio * 0.5 * sign
                ),
                new Vector3(
                  0,
                  0,
                  normalRadiusMeters * innerRadiusRatio * 0.94 * sign
                ),
              ])
            : [];
        crosshair.setPositions(
          [...crosshairPoints, ...normalPoints].map((point) =>
            point.clone().applyMatrix4(modelMatrix)
          )
        );
        crosshair.setVisible(true);
      }
    },
    clear: () => {
      if (runtime) clearLineRuntime(runtime);
      crosshair?.setVisible(false);
    },
    destroy: () => {
      collection?.destroy();
      collection = null;
      runtime = null;
      crosshair = null;
      crosshairColor = null;
    },
  };
};
