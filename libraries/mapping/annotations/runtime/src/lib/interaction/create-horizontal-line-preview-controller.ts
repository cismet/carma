import { Matrix4, type Vector3 } from "three";
import {
  createOrientedDiscMatrix,
  getEllipsoidalUpDirectionAtAnchor,
  getSignedVector3DistanceToPlane,
  projectVector3OntoPlane,
} from "@carma-mapping/annotations/core";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationRingMaterialPreset,
  type AnnotationSceneLineCollection,
  type AnnotationScenePrimitiveHandle,
} from "../engine";
import { pointPreviewRingVisualDefaults } from "../config/point-preview-visual-defaults";
import {
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  annotationOverlayDefaults,
  type AuthoringLineRuntime,
} from "./authoring-visual-runtime";

const MIN_HORIZONTAL_LINE_PREVIEW_RADIUS_METERS = 1e-3;
const DEFAULT_HORIZONTAL_LINE_PREVIEW_PLANE_TOLERANCE_METERS = 0.2;
const DEFAULT_HORIZONTAL_LINE_PREVIEW_MAX_LENGTH_METERS = 200;

export type HorizontalLinePreviewState = {
  anchorECEF: Vector3;
  targetECEF: Vector3;
};

export type HorizontalLinePreviewController = {
  setState: (
    state: HorizontalLinePreviewState | null,
    requestRender?: boolean
  ) => void;
  clear: (requestRender?: boolean) => void;
  destroy: () => void;
};

export type HorizontalLinePreviewControllerOptions = {
  id: string;
  colorCss: string;
  opacity?: number;
  materialPreset?: AnnotationRingMaterialPreset;
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
  engine: AnnotationEngine,
  {
    id,
    colorCss,
    opacity,
    materialPreset = pointPreviewRingVisualDefaults.materialPreset,
    invalidLineColorCss = annotationOverlayDefaults.verticalLineColor,
    planePlacementToleranceMeters,
    maxLengthMeters,
  }: HorizontalLinePreviewControllerOptions
): HorizontalLinePreviewController => {
  const resolvedOpacity = resolveOpacity(opacity);
  const resolvedPlanePlacementToleranceMeters =
    resolvePlanePlacementToleranceMeters(planePlacementToleranceMeters);
  const resolvedMaxLengthMeters = resolveMaxLengthMeters(maxLengthMeters);
  const previewDiscModelMatrix = new Matrix4();
  let previewDisc: AnnotationScenePrimitiveHandle | null = null;
  let invalidLineCollection: AnnotationSceneLineCollection | null = null;
  let invalidNormalLine: AuthoringLineRuntime | null = null;

  const requestSceneRender = (requestRender = true) => {
    if (requestRender && isValidAnnotationEngine(engine)) {
      engine.requestRender();
    }
  };

  const ensurePreviewDisc = (): AnnotationScenePrimitiveHandle => {
    if (previewDisc) {
      return previewDisc;
    }

    const nextDisc = engine.createDisc({
      id,
      radius: 1,
      color: colorCss,
      opacity: resolvedOpacity,
      materialPreset,
      segments: 64,
      modelMatrix: previewDiscModelMatrix,
    });
    nextDisc.setVisible(false);
    previewDisc = nextDisc;
    return nextDisc;
  };

  const ensureInvalidNormalLine = (): AuthoringLineRuntime => {
    if (invalidNormalLine) {
      return invalidNormalLine;
    }

    if (!invalidLineCollection) {
      invalidLineCollection = createLineCollection(engine);
    }

    invalidNormalLine = createLineRuntime(
      invalidLineCollection,
      `${id}-invalid-plane-normal`,
      invalidLineColorCss,
      {
        width: annotationOverlayDefaults.lineStrokeWidthPx,
      }
    );
    return invalidNormalLine;
  };

  const clearInvalidNormalLine = () => {
    if (invalidNormalLine) {
      clearLineRuntime(invalidNormalLine);
    }
  };

  const clear = (requestRender = true) => {
    if (previewDisc) {
      previewDisc.setVisible(false);
    }
    clearInvalidNormalLine();
    requestSceneRender(requestRender);
  };

  return {
    setState: (state, requestRender = true) => {
      if (!state || !isValidAnnotationEngine(engine)) {
        clear(requestRender);
        return;
      }

      const horizontalNormal = getEllipsoidalUpDirectionAtAnchor(
        state.anchorECEF
      );
      const targetOnHorizontalPlane = projectVector3OntoPlane(
        state.targetECEF,
        state.anchorECEF,
        horizontalNormal
      );
      const planeDistanceMeters = Math.abs(
        getSignedVector3DistanceToPlane(
          state.targetECEF,
          state.anchorECEF,
          horizontalNormal
        )
      );
      const radiusMeters = state.anchorECEF.distanceTo(targetOnHorizontalPlane);

      if (!Number.isFinite(radiusMeters)) {
        clear(requestRender);
        return;
      }

      const displayRadiusMeters = Math.min(
        radiusMeters,
        resolvedMaxLengthMeters
      );
      if (displayRadiusMeters < MIN_HORIZONTAL_LINE_PREVIEW_RADIUS_METERS) {
        if (previewDisc) {
          previewDisc.setVisible(false);
        }
      } else {
        const activeDisc = ensurePreviewDisc();
        activeDisc.setVisible(true);
        activeDisc.setModelMatrix(
          createOrientedDiscMatrix(
            state.anchorECEF,
            horizontalNormal,
            displayRadiusMeters,
            previewDiscModelMatrix
          )
        );
      }

      if (planeDistanceMeters > resolvedPlanePlacementToleranceMeters) {
        applyLineRuntime(ensureInvalidNormalLine(), [
          targetOnHorizontalPlane,
          state.targetECEF,
        ]);
        requestSceneRender(requestRender);
        return;
      }

      clearInvalidNormalLine();
      requestSceneRender(requestRender);
    },
    clear,
    destroy: () => {
      previewDisc?.destroy();
      previewDisc = null;
      invalidLineCollection?.destroy();
      invalidLineCollection = null;
      invalidNormalLine = null;
    },
  };
};
