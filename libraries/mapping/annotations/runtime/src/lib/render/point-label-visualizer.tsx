import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  applyPointLabelOverlayState,
  getPointLabelOverlayContentSignature,
  readPointLabelOverlayDomRefs,
  renderPointLabelOverlayContent,
  useLabelOverlay,
  type PointLabelOverlayDomRefs,
} from "@carma-providers/label-overlay";

import {
  annotationLineLabelDefaults,
  resolveAnnotationLineLabelSurfaceBlendMode,
  type AnnotationLineLabelOptions,
} from "../config/annotation-line-label-options";
import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import type { LiveAnnotationAnchors } from "../interaction/live-annotation-anchors";
import {
  RUNTIME_POINT_LABEL_RENDER_STYLE,
  type RuntimePointLabelRenderModel,
} from "./annotation-render-models";
import type { AreaLabelFit } from "./area-label-fit";
import { computePointLabelOverlayStates } from "./compute-point-label-overlay-states";
import {
  AREA_LABEL_OCCLUDED_OPACITY,
  applyLineBlendPointLabelOverlayState,
  getLineBlendPointLabelContentSignature,
  measureAreaLabelGlyphs,
  type AreaLabelSize,
} from "./line-blend-point-label";
import {
  buildPointLabelOverlayRenderState,
  createEmptyLabelOverlayState,
  getPointLabelOverlayId,
  type PointLabelOverlayState,
} from "./point-label-overlay-state";
import { TEXT_OVERLAY_AREA_LABEL_STYLE, TextOverlay } from "./text-overlay";
import {
  useOverlayStateCache,
  type OverlayStateComputeContext,
} from "./use-overlay-state-cache";

const isDomRefsConnected = (domRefs: PointLabelOverlayDomRefs) =>
  domRefs.stem.isConnected &&
  domRefs.stemLine.isConnected &&
  domRefs.labelRoot.isConnected &&
  domRefs.pointLabelRoot.isConnected;

export const usePointLabelVisualizer = (
  engine: AnnotationEngine | null,
  labels: readonly RuntimePointLabelRenderModel[],
  liveAnchors: LiveAnnotationAnchors,
  isInPreviewNodeLink?: (nodeId?: string) => boolean,
  overlayIdPrefix: string = "runtime-point-label",
  areaLabelLineOptions: AnnotationLineLabelOptions = annotationLineLabelDefaults
) => {
  const { setLabelOverlayElement, removeLabelOverlayElement, updatePositions } =
    useLabelOverlay();
  const labelsRef = useRef(labels);
  const previousLabelIdsRef = useRef<Set<string>>(new Set());
  const overlayDomRefsByIdRef = useRef<Map<string, PointLabelOverlayDomRefs>>(
    new Map()
  );
  // Area values: the last fit per area, and the drawn size of each inside text.
  const areaLabelFitByKeyRef = useRef(new Map<string, AreaLabelFit>());
  const areaLabelSizeByIdRef = useRef(new Map<string, AreaLabelSize>());

  const computeStates = useCallback(
    ({
      previousStatesById,
      isCameraMoving,
    }: OverlayStateComputeContext<PointLabelOverlayState>) =>
      computePointLabelOverlayStates({
        engine,
        labels: labelsRef.current,
        liveAnchors,
        isInPreviewNodeLink,
        previousStatesById,
        isCameraMoving,
        areaLabelSizeById: areaLabelSizeByIdRef.current,
        areaLabelFitByKey: areaLabelFitByKeyRef.current,
      }),
    [engine, isInPreviewNodeLink, liveAnchors]
  );
  const {
    resolveState: resolveLabelOverlayState,
    readCachedState,
    invalidate,
  } = useOverlayStateCache({
    engine,
    liveAnchors,
    updatePositions,
    computeStates,
    createEmptyState: createEmptyLabelOverlayState,
  });

  useEffect(() => {
    labelsRef.current = labels;
    invalidate();
    updatePositions();
    engine?.requestRender();
  }, [engine, invalidate, isInPreviewNodeLink, labels, updatePositions]);

  const normalizedLabels = useMemo(
    () =>
      labels.filter(
        (label) =>
          !label.hideLabelAndStem ||
          (label.markerOnlyPointerEvents === true &&
            (Boolean(label.onClick) ||
              Boolean(label.onHoverChange) ||
              Boolean(label.onLongPress)))
      ),
    [labels]
  );

  const resolveOverlayDomRefs = useCallback(
    (labelId: string, elementDiv: HTMLElement) => {
      const cachedDomRefs = overlayDomRefsByIdRef.current.get(labelId);
      if (cachedDomRefs && isDomRefsConnected(cachedDomRefs)) {
        return cachedDomRefs;
      }

      const nextDomRefs = readPointLabelOverlayDomRefs(elementDiv);
      if (!nextDomRefs) {
        return null;
      }
      overlayDomRefsByIdRef.current.set(labelId, nextDomRefs);

      return nextDomRefs;
    },
    []
  );

  useEffect(() => {
    let didMutateOverlayElements = false;
    const nextLabelIds = new Set<string>();

    normalizedLabels.forEach((label) => {
      const isLineBlendLabel =
        label.renderStyle === RUNTIME_POINT_LABEL_RENDER_STYLE.LINE_BLEND;
      const areaLabelSurfaceBlendMode =
        label.mixBlendMode ??
        resolveAnnotationLineLabelSurfaceBlendMode(areaLabelLineOptions);
      const buildRenderState = (overlayState: PointLabelOverlayState) =>
        buildPointLabelOverlayRenderState({
          label,
          overlayState,
          areaLabelSurfaceBlendMode,
        });
      const currentOverlayRenderState = buildRenderState(
        readCachedState(label.id) ?? createEmptyLabelOverlayState()
      );
      const nextContentSignature = isLineBlendLabel
        ? getLineBlendPointLabelContentSignature({
            state: currentOverlayRenderState,
            lineLabelOptions: areaLabelLineOptions,
            surfaceBlendMode: areaLabelSurfaceBlendMode,
          })
        : getPointLabelOverlayContentSignature(currentOverlayRenderState);
      nextLabelIds.add(label.id);

      const updatePosition = (elementDiv: HTMLElement) => {
        const renderState = buildRenderState(
          resolveLabelOverlayState(label.id)
        );

        if (isLineBlendLabel) {
          const applied = applyLineBlendPointLabelOverlayState({
            elementDiv,
            state: renderState,
          });
          if (label.areaFit) {
            if (applied) {
              elementDiv.style.opacity = renderState.isOccluded
                ? AREA_LABEL_OCCLUDED_OPACITY
                : "1";
            }
            const glyphSize = measureAreaLabelGlyphs(elementDiv);
            if (glyphSize) {
              areaLabelSizeByIdRef.current.set(label.id, glyphSize);
            }
          }
          return applied;
        }

        const domRefs = resolveOverlayDomRefs(label.id, elementDiv);
        if (!domRefs) {
          return false;
        }
        const appliedPill = applyPointLabelOverlayState({
          elementDiv,
          domRefs,
          state: renderState,
        });
        if (label.areaFit && renderState.isOccluded) {
          domRefs.pointLabelRoot.style.opacity = AREA_LABEL_OCCLUDED_OPACITY;
        }
        return appliedPill;
      };

      const overlayElementContent = isLineBlendLabel ? (
        <TextOverlay
          content={currentOverlayRenderState.content}
          selected={currentOverlayRenderState.selected}
          textColor={currentOverlayRenderState.textColor}
          fontSize={currentOverlayRenderState.fontSize}
          styleOptions={TEXT_OVERLAY_AREA_LABEL_STYLE}
          visualOptions={areaLabelLineOptions}
          surfaceBlendMode={areaLabelSurfaceBlendMode}
          onClick={currentOverlayRenderState.onClick}
          onDoubleClick={currentOverlayRenderState.onDoubleClick}
          onLongPress={currentOverlayRenderState.onLongPress}
          longPressDurationMs={currentOverlayRenderState.longPressDurationMs}
        />
      ) : (
        renderPointLabelOverlayContent(currentOverlayRenderState)
      );

      if (!previousLabelIdsRef.current.has(label.id)) {
        didMutateOverlayElements = true;
        overlayDomRefsByIdRef.current.delete(label.id);
      }

      setLabelOverlayElement({
        id: getPointLabelOverlayId(overlayIdPrefix, label.id),
        contentKey: nextContentSignature,
        content: overlayElementContent,
        zIndex: readCachedState(label.id)?.zIndex ?? 0,
        updatePosition,
      });
    });

    previousLabelIdsRef.current.forEach((labelId) => {
      if (nextLabelIds.has(labelId)) {
        return;
      }

      didMutateOverlayElements = true;
      overlayDomRefsByIdRef.current.delete(labelId);
      removeLabelOverlayElement(
        getPointLabelOverlayId(overlayIdPrefix, labelId)
      );
    });

    previousLabelIdsRef.current = nextLabelIds;

    updatePositions();
    if (didMutateOverlayElements) {
      engine?.requestRender();
    }
  }, [
    setLabelOverlayElement,
    engine,
    normalizedLabels,
    overlayIdPrefix,
    areaLabelLineOptions,
    readCachedState,
    removeLabelOverlayElement,
    resolveLabelOverlayState,
    resolveOverlayDomRefs,
    updatePositions,
  ]);

  useEffect(
    () => () => {
      previousLabelIdsRef.current.forEach((labelId) => {
        removeLabelOverlayElement(
          getPointLabelOverlayId(overlayIdPrefix, labelId)
        );
      });
      previousLabelIdsRef.current.clear();
      overlayDomRefsByIdRef.current.clear();
    },
    [overlayIdPrefix, removeLabelOverlayElement]
  );
};
