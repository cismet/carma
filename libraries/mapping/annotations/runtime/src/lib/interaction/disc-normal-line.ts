import { color as parseCssColor } from "d3-color";
import { Vector3, type Matrix4 } from "three";

import type {
  AnnotationEngine,
  AnnotationSceneLineCollection,
} from "../engine";
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

  const clear = () => {
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
      const halfLength =
        Math.max(disc.lineLengthMeters, MIN_NORMAL_LINE_LENGTH_METERS) / 2;
      applyLineRuntime(runtime, [
        new Vector3(0, 0, -halfLength).applyMatrix4(disc.modelMatrix),
        new Vector3(0, 0, halfLength).applyMatrix4(disc.modelMatrix),
      ]);
      visible = true;
    },
    clear,
    hide: () => runtime?.line.setVisible(false),
    restore: () => runtime?.line.setVisible(visible),
    destroy: () => {
      collection?.destroy();
      collection = null;
      runtime = null;
    },
  };
};
