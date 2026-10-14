import { Vector3 } from "three";
import { buildCirclePoints } from "@carma-commons/math";
import type { CssPixels } from "@carma-units";
import { AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX } from "@carma-mapping/gizmo/core";
import type {
  AnnotationEngine,
  AnnotationSceneLineCollection,
  AnnotationSceneLineHandle,
} from "@carma-mapping/annotations/core";

/** Shared query/edit pixel reticle, using the regular line renderer and its halo. */
export const createScreenCircleLine = (
  engine: AnnotationEngine,
  id: string,
  { diameterCssPx, halo }: { diameterCssPx: CssPixels; halo: boolean }
) => {
  const circle = buildCirclePoints(Math.max(0, diameterCssPx) / 2, 24);
  let collection: AnnotationSceneLineCollection | null = null;
  let line: AnnotationSceneLineHandle | null = null;
  let color: string | null = null;
  const clear = () => line?.setVisible(false);
  return {
    apply: (center: Vector3 | null, colorCss: string) => {
      if (!center || diameterCssPx <= 0 || engine.isDestroyed()) {
        clear();
        return;
      }
      const screen = engine.worldToScreen(center);
      const normal =
        engine.getCameraPose()?.directionECEF.clone() ??
        engine.getCameraPositionECEF()?.sub(center).normalize();
      if (!screen || !normal) {
        clear();
        return;
      }
      const positions: Vector3[] = [];
      for (const offset of circle) {
        const ray = engine.getPickRay({
          x: screen.x + offset.x,
          y: screen.y + offset.y,
        });
        const denominator = ray?.direction.dot(normal) ?? 0;
        if (!ray || Math.abs(denominator) < 1e-8) {
          clear();
          return;
        }
        const distance =
          center.clone().sub(ray.origin).dot(normal) / denominator;
        if (!Number.isFinite(distance) || distance < 0) {
          clear();
          return;
        }
        positions.push(
          ray.origin.clone().addScaledVector(ray.direction, distance)
        );
      }
      if (positions.length > 0) positions.push(positions[0]!.clone());
      collection ??= engine.createLineCollection();
      line ??= collection.addLine({
        id,
        positions,
        color: colorCss,
        width: AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
        overlay: true,
        overlayHalo: halo,
        halo,
        visible: false,
      });
      if (color !== colorCss) {
        line.setStyle({
          color: colorCss,
          width: AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
          overlay: true,
          overlayHalo: halo,
          halo,
        });
        color = colorCss;
      }
      line.setPositions(positions);
      line.setVisible(true);
    },
    clear,
    destroy: () => {
      collection?.destroy();
      collection = null;
      line = null;
      color = null;
    },
  };
};
