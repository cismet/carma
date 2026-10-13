import { useEffect, type MutableRefObject } from "react";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import {
  createPointQueryIndicatorController,
  type PointQueryIndicatorController,
} from "../interaction/create-point-query-indicator-controller";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import type { AnnotationReferenceObjectSizingOptions } from "../config/annotation-reference-object-sizing";
import type {
  AnnotationToolAuthoringContext,
  AnnotationToolAuthoringController,
  AnnotationToolPlugin,
  PointQueryPickResult,
} from "../registry";
import type { AnnotationNode } from "../store";
import { ANNOTATIONS_HOST_DEFAULTS } from "./annotations-host-defaults";

/** Controller refs and latest sample the authoring host shares between its effects and the hover handler. */
type PointQueryVisualRefs = {
  indicatorControllerRef: MutableRefObject<PointQueryIndicatorController | null>;
  authoringControllerRef: MutableRefObject<AnnotationToolAuthoringController | null>;
  latestPickResultRef: MutableRefObject<PointQueryPickResult | null>;
  pointQueryEnabledRef: MutableRefObject<boolean>;
};

/**
 * Owns the point-query indicator (the disc under the cursor): recreated when
 * the engine or sizing changes, restored from the latest sample, and switched
 * with the point-query state.
 */
export const usePointQueryIndicator = ({
  engine,
  referenceObjectSizing,
  lineLabelOptions,
  pointQueryEnabled,
  refs: { indicatorControllerRef, latestPickResultRef, pointQueryEnabledRef },
  resolveHoveredPointQueryNodeRef,
}: {
  engine: AnnotationEngine | null;
  referenceObjectSizing: AnnotationReferenceObjectSizingOptions;
  lineLabelOptions?: PartialAnnotationLineLabelOptions;
  pointQueryEnabled: boolean;
  refs: Pick<
    PointQueryVisualRefs,
    "indicatorControllerRef" | "latestPickResultRef" | "pointQueryEnabledRef"
  >;
  resolveHoveredPointQueryNodeRef: MutableRefObject<
    () => AnnotationNode | null
  >;
}) => {
  const sceneLineLabelOptions =
    engine?.capabilities.pointQueryDiscInScene === true
      ? lineLabelOptions
      : undefined;
  const pointQueryDiscSizing =
    engine?.capabilities.pointQueryDiscInScene === true
      ? referenceObjectSizing.pointQueryDiscSizing
      : undefined;
  useEffect(() => {
    indicatorControllerRef.current?.destroy();
    const nextController = createPointQueryIndicatorController(engine, {
      radius: referenceObjectSizing.worldRadiusMeters,
      scalingMode: referenceObjectSizing.scalingMode,
      targetScreenRadiusCssPx: referenceObjectSizing.targetScreenRadiusCssPx,
      resizeWorldRadiusToScreenTarget:
        referenceObjectSizing.resizeWorldRadiusToScreenTarget,
      discResizeStepFactor: referenceObjectSizing.resizeStepFactor,
      quantizeStepWorldRadius: referenceObjectSizing.quantizeWorldRadius,
      showNormalLine: true,
      lineLabelOptions: sceneLineLabelOptions,
      pointQueryDiscSizing,
      tangentDiscVisualizerTrailSampleCount:
        ANNOTATIONS_HOST_DEFAULTS.pointQuery.discSmoothingSampleCount,
      tangentDiscVisualizerSmoothingWindowMs:
        ANNOTATIONS_HOST_DEFAULTS.pointQuery.discSmoothingWindowMs,
      tangentDiscVisualizerWeightDecayGamma:
        ANNOTATIONS_HOST_DEFAULTS.pointQuery.discSmoothingWeightDecayGamma,
    });
    indicatorControllerRef.current = nextController;
    nextController?.setEnabled(pointQueryEnabledRef.current);
    if (pointQueryEnabledRef.current && latestPickResultRef.current) {
      nextController?.setPreview({
        pointECEF: latestPickResultRef.current.pointECEF,
        surfaceNormalECEF: latestPickResultRef.current.surfaceNormalECEF,
        lockToPreviewPoint: resolveHoveredPointQueryNodeRef.current() !== null,
      });
    } else {
      nextController?.clearPreview();
    }

    return () => {
      indicatorControllerRef.current?.destroy();
      indicatorControllerRef.current = null;
    };
  }, [
    referenceObjectSizing.quantizeWorldRadius,
    referenceObjectSizing.resizeWorldRadiusToScreenTarget,
    referenceObjectSizing.resizeStepFactor,
    referenceObjectSizing.scalingMode,
    referenceObjectSizing.targetScreenRadiusCssPx,
    referenceObjectSizing.worldRadiusMeters,
    engine,
    sceneLineLabelOptions,
    pointQueryDiscSizing,
  ]);

  useEffect(() => {
    indicatorControllerRef.current?.setEnabled(pointQueryEnabled);
  }, [pointQueryEnabled]);
};

/** Owns the authoring controller of the active tool plugin and keeps it in step with the point-query state. */
export const useActiveAuthoringController = ({
  engine,
  activePlugin,
  context,
  pointQueryEnabled,
  refs: { authoringControllerRef, latestPickResultRef, pointQueryEnabledRef },
}: {
  engine: AnnotationEngine | null;
  activePlugin: AnnotationToolPlugin | null;
  context: Omit<AnnotationToolAuthoringContext, "engine" | "requestRender">;
  pointQueryEnabled: boolean;
  refs: Pick<
    PointQueryVisualRefs,
    "authoringControllerRef" | "latestPickResultRef" | "pointQueryEnabledRef"
  >;
}) => {
  const {
    annotationsStore,
    drafts,
    labelOverlay,
    formatOptions,
    lineLabelOptions,
  } = context;

  useEffect(() => {
    authoringControllerRef.current?.destroy();
    const nextController =
      activePlugin?.authoringVisuals?.createController({
        engine,
        annotationsStore,
        drafts,
        labelOverlay,
        requestRender: () => {
          if (isValidAnnotationEngine(engine)) {
            engine.requestRender();
          }
        },
        formatOptions,
        lineLabelOptions,
      } satisfies AnnotationToolAuthoringContext) ?? null;
    authoringControllerRef.current = nextController;
    nextController?.setEnabled(pointQueryEnabledRef.current);
    nextController?.setPointQueryPickResult(
      pointQueryEnabledRef.current ? latestPickResultRef.current : null
    );

    return () => {
      authoringControllerRef.current?.destroy();
      authoringControllerRef.current = null;
    };
  }, [
    activePlugin,
    annotationsStore,
    drafts,
    engine,
    formatOptions,
    labelOverlay,
    lineLabelOptions,
  ]);

  useEffect(() => {
    authoringControllerRef.current?.setEnabled(pointQueryEnabled);
    if (!pointQueryEnabled) {
      authoringControllerRef.current?.setPointQueryPickResult(null);
    }
  }, [pointQueryEnabled]);
};
