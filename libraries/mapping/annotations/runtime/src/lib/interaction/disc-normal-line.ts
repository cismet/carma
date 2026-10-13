import { color as parseCssColor } from "d3-color";
import { Matrix4, Vector3 } from "three";

import type { Meters } from "@carma-units";
import {
  AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
  DISC_OUTLINE_COLOR,
  ENU_UP_AXIS_COLOR,
} from "@carma-mapping/gizmo/core";
import { createConeArrowMatrix } from "../engine/gizmo/engine-point-move-gizmo-cone";
import type {
  AnnotationScenePrimitiveHandle,
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

const MIN_NORMAL_LINE_LENGTH_METERS = 0.1;

/** The CSS colour with the opacity baked in, as the line style carries no alpha. */
export const resolveCssColorWithAlpha = (
  colorCss: string,
  opacity: number
): string => {
  const parsedColor = parseCssColor(colorCss) ?? parseCssColor("white");
  if (!parsedColor) {
    return `rgba(255,255,255,${opacity})`;
  }

  const { r, g, b } = parsedColor.rgb();
  return `rgba(${[r, g, b].map(Math.round).join(",")},${opacity})`;
};

export type DiscNormalLine = {
  /** Draws the line along the disc normal, or hides it when `disc` is null. */
  apply: (
    disc: {
      modelMatrix: Matrix4;
      lineLengthMeters: number;
      colorCss: string;
      /** A positive normal starting away from the centre, for the scene sampler. */
      startOffsetMeters?: Meters;
    } | null
  ) => void;
  clear: () => void;
  /** Hides the line without forgetting whether `restore` shows it again. */
  hide: () => void;
  restore: () => void;
  destroy: () => void;
};

export const createDiscNormalLine = (
  engine: AnnotationEngine,
  id: string
): DiscNormalLine => {
  let collection: AnnotationSceneLineCollection | null = null;
  let runtime: AuthoringLineRuntime | null = null;
  let visible = false;
  let arrow: AnnotationScenePrimitiveHandle | null = null;
  let arrowVisible = false;
  const arrowMatrix = new Matrix4();

  const clear = () => {
    arrow?.setVisible(false);
    arrowVisible = false;
    if (runtime) {
      clearLineRuntime(runtime);
      visible = false;
    }
  };

  return {
    apply: (disc) => {
      if (!disc) {
        clear();
        return;
      }

      collection ??= createLineCollection(engine);
      runtime ??= createLineRuntime(collection, id, disc.colorCss);
      setLineRuntimeColor(runtime, disc.colorCss);
      // The disc model matrix carries its local Z axis, the normal, into world space.
      const positiveNormal = disc.startOffsetMeters !== undefined;
      const halfLength = positiveNormal
        ? Math.max(disc.lineLengthMeters, Number.EPSILON) / 2
        : Math.max(disc.lineLengthMeters, MIN_NORMAL_LINE_LENGTH_METERS) / 2;
      const headHeight =
        positiveNormal && engine.createCone ? halfLength * 0.2 : 0;
      const end = halfLength - headHeight;
      applyLineRuntime(runtime, [
        new Vector3(0, 0, disc.startOffsetMeters ?? -halfLength).applyMatrix4(
          disc.modelMatrix
        ),
        new Vector3(0, 0, end).applyMatrix4(disc.modelMatrix),
      ]);
      arrowVisible = positiveNormal && typeof engine.createCone === "function";
      if (arrowVisible) {
        const side = new Vector3(),
          across = new Vector3(),
          direction = new Vector3();
        disc.modelMatrix.extractBasis(side, across, direction);
        const baseCenter = new Vector3(0, 0, end).applyMatrix4(
          disc.modelMatrix
        );
        createConeArrowMatrix(
          {
            baseCenter,
            apex: new Vector3(0, 0, halfLength).applyMatrix4(disc.modelMatrix),
            direction: direction.normalize(),
            side: side.normalize(),
            across: across.normalize(),
            radius: halfLength * 0.09,
            height: headHeight,
            baseFacesCamera: false,
          },
          arrowMatrix
        );
        arrow ??= engine.createCone!({
          id: `${id}-arrow`,
          color: ENU_UP_AXIS_COLOR,
          outlineColor: DISC_OUTLINE_COLOR,
          outlineWidth: AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
          modelMatrix: arrowMatrix,
        });
        arrow.setModelMatrix(arrowMatrix);
      }
      arrow?.setVisible(arrowVisible);
      visible = true;
    },
    clear,
    hide: () => {
      runtime?.line.setVisible(false);
      arrow?.setVisible(false);
    },
    restore: () => {
      runtime?.line.setVisible(visible);
      arrow?.setVisible(arrowVisible);
    },
    destroy: () => {
      collection?.destroy();
      arrow?.destroy();
      arrow = null;
      arrowVisible = false;
      collection = null;
      runtime = null;
    },
  };
};
