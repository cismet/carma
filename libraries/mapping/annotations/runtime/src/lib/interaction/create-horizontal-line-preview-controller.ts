import { Cartesian3, Color } from "@carma-cesium";
import type { Primitive, Scene } from "@carma-cesium";
import {
  createDisc,
  createOrientedDiscModelMatrix,
  getEllipsoidalUpDirectionAtAnchor,
  getSignedCartesian3DistanceToPlane,
  isValidScene,
  projectCartesian3PointOntoPlane,
  safeRemovePrimitive,
  type RingMaterialPreset,
} from "@carma-mapping/engines/cesium/core";

import { pointPreviewRingVisualDefaults } from "../config/point-preview-visual-defaults";
import {
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  destroyLineCollection,
  previewControllerDefaults,
  type PreviewLineRuntime,
} from "./authoring-visual-runtime";

const MIN_HORIZONTAL_LINE_PREVIEW_RADIUS_METERS = 1e-3;
const DEFAULT_HORIZONTAL_LINE_PREVIEW_PLANE_TOLERANCE_METERS = 0.2;
const DEFAULT_HORIZONTAL_LINE_PREVIEW_MAX_LENGTH_METERS = 200;

export type HorizontalLinePreviewState = {
  anchorECEF: Cartesian3;
  targetECEF: Cartesian3;
};

export type HorizontalLinePreviewController = {
  setState: (state: HorizontalLinePreviewState | null) => void;
  clear: () => void;
  destroy: () => void;
};

export type HorizontalLinePreviewControllerOptions = {
  id: string;
  colorCss: string;
  opacity?: number;
  materialPreset?: RingMaterialPreset;
  invalidLineColorCss?: string;
  planePlacementToleranceMeters?: number | null;
  maxLengthMeters?: number | null;
};

const resolveOpacity = (opacity: number | undefined) =>
  Math.min(
    Math.max(
      typeof opacity === "number" && Number.isFinite(opacity)
        ? opacity
        : pointPreviewRingVisualDefaults.alpha,
      0
    ),
    1
  );

const resolvePlanePlacementToleranceMeters = (
  toleranceMeters: number | null | undefined
) =>
  Math.max(
    0,
    typeof toleranceMeters === "number" && Number.isFinite(toleranceMeters)
      ? toleranceMeters
      : DEFAULT_HORIZONTAL_LINE_PREVIEW_PLANE_TOLERANCE_METERS
  );

const resolveMaxLengthMeters = (maxLengthMeters: number | null | undefined) =>
  Math.max(
    0,
    typeof maxLengthMeters === "number" && Number.isFinite(maxLengthMeters)
      ? maxLengthMeters
      : DEFAULT_HORIZONTAL_LINE_PREVIEW_MAX_LENGTH_METERS
  );

export const createHorizontalLinePreviewController = (
  scene: Scene,
  {
    id,
    colorCss,
    opacity,
    materialPreset = pointPreviewRingVisualDefaults.materialPreset,
    invalidLineColorCss = previewControllerDefaults.verticalLineColor,
    planePlacementToleranceMeters,
    maxLengthMeters,
  }: HorizontalLinePreviewControllerOptions
): HorizontalLinePreviewController => {
  const resolvedOpacity = resolveOpacity(opacity);
  const resolvedPlanePlacementToleranceMeters =
    resolvePlanePlacementToleranceMeters(planePlacementToleranceMeters);
  const resolvedMaxLengthMeters = resolveMaxLengthMeters(maxLengthMeters);
  const discColor =
    Color.fromCssColorString(colorCss)?.withAlpha(resolvedOpacity) ??
    Color.WHITE.withAlpha(resolvedOpacity);
  let previewDisc: Primitive | null = null;
  let invalidLineCollection: ReturnType<typeof createLineCollection> | null =
    null;
  let invalidNormalLine: PreviewLineRuntime | null = null;

  const requestRender = () => {
    if (isValidScene(scene)) {
      scene.requestRender();
    }
  };

  const ensurePreviewDisc = (): Primitive => {
    if (previewDisc) {
      return previewDisc;
    }

    const nextDisc = createDisc(id, {
      radius: 1,
      color: discColor,
      opacity: discColor.alpha,
      asynchronous: false,
      materialPreset,
      segments: 64,
    });
    nextDisc.show = false;
    scene.primitives.add(nextDisc);
    previewDisc = nextDisc;
    return nextDisc;
  };

  const ensureInvalidNormalLine = (): PreviewLineRuntime => {
    if (invalidNormalLine) {
      return invalidNormalLine;
    }

    if (!invalidLineCollection) {
      invalidLineCollection = createLineCollection(scene);
    }

    invalidNormalLine = createLineRuntime(
      invalidLineCollection,
      `${id}-invalid-plane-normal`,
      invalidLineColorCss,
      {
        width: previewControllerDefaults.lineStrokeWidthPx,
      }
    );
    return invalidNormalLine;
  };

  const clearInvalidNormalLine = () => {
    if (invalidNormalLine) {
      clearLineRuntime(invalidNormalLine);
    }
  };

  const clear = () => {
    if (previewDisc) {
      previewDisc.show = false;
    }
    clearInvalidNormalLine();
    requestRender();
  };

  return {
    setState: (state) => {
      if (!state || !isValidScene(scene)) {
        clear();
        return;
      }

      const horizontalNormal = getEllipsoidalUpDirectionAtAnchor(
        state.anchorECEF
      );
      const targetOnHorizontalPlane = projectCartesian3PointOntoPlane(
        state.targetECEF,
        state.anchorECEF,
        horizontalNormal
      );
      const planeDistanceMeters = Math.abs(
        getSignedCartesian3DistanceToPlane(
          state.targetECEF,
          state.anchorECEF,
          horizontalNormal
        )
      );
      const radiusMeters = Cartesian3.distance(
        state.anchorECEF,
        targetOnHorizontalPlane
      );

      if (!Number.isFinite(radiusMeters)) {
        clear();
        return;
      }

      const displayRadiusMeters = Math.min(
        radiusMeters,
        resolvedMaxLengthMeters
      );
      if (displayRadiusMeters < MIN_HORIZONTAL_LINE_PREVIEW_RADIUS_METERS) {
        if (previewDisc) {
          previewDisc.show = false;
        }
      } else {
        const activeDisc = ensurePreviewDisc();
        activeDisc.show = true;
        activeDisc.modelMatrix = createOrientedDiscModelMatrix(
          state.anchorECEF,
          horizontalNormal,
          displayRadiusMeters,
          activeDisc.modelMatrix
        );
      }

      if (planeDistanceMeters > resolvedPlanePlacementToleranceMeters) {
        applyLineRuntime(ensureInvalidNormalLine(), [
          targetOnHorizontalPlane,
          state.targetECEF,
        ]);
        requestRender();
        return;
      }

      clearInvalidNormalLine();
      requestRender();
    },
    clear,
    destroy: () => {
      safeRemovePrimitive(scene, previewDisc);
      previewDisc = null;
      destroyLineCollection(scene, invalidLineCollection);
      invalidLineCollection = null;
      invalidNormalLine = null;
    },
  };
};
