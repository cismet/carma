import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  applyPointLabelOverlayState,
  getPointLabelOverlayContentSignature,
  readPointLabelOverlayDomRefs,
  renderPointLabelOverlayContent,
  resolvePointLabelStemSegment,
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
import { measureAreaLabelGlyphs, type AreaLabelSize } from "./area-label-size";
import {
  applyLineBlendPointLabelOverlayState,
  getLineBlendPointLabelContentSignature,
} from "./line-blend-point-label";
import type { LabelStemLayout } from "./label-stem-scene-lines";
import {
  buildPointLabelOverlayRenderState,
  createEmptyLabelOverlayState,
  getPointLabelOverlayId,
  pointLabelDrawsMarker,
  resolvePointLabelMarkerMetrics,
  resolvePointLabelOcclusionLook,
  type PointLabelOverlayState,
} from "./point-label-overlay-state";
import { buildLabelMarkerSceneModels } from "./scene-markers/node-marker-scene-models";
import { canDrawHandlesInScene } from "./scene-markers/scene-marker-models";
import { useSceneMarkers } from "./scene-markers/use-scene-markers";
import { TEXT_OVERLAY_AREA_LABEL_STYLE, TextOverlay } from "./text-overlay";
import { useLabelStemSceneLines } from "./use-label-stem-scene-lines";
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
  const {
    setLabelOverlayElement,
    removeLabelOverlayElement,
    invalidatePositions,
    updatePositions,
  } = useLabelOverlay();
  const labelsRef = useRef(labels);
  const previousLabelIdsRef = useRef<Set<string>>(new Set());
  const overlayDomRefsByIdRef = useRef<Map<string, PointLabelOverlayDomRefs>>(
    new Map()
  );
  // Area values: the last fit per area, and the drawn size of each inside text.
  const areaLabelFitByKeyRef = useRef(new Map<string, AreaLabelFit>());
  const areaLabelSizeByIdRef = useRef(new Map<string, AreaLabelSize>());
  // The engine draws node markers and stems; the overlay keeps pills and hit targets.
  const handlesInScene = canDrawHandlesInScene(engine);
  const refreshOverlayPositions = handlesInScene
    ? invalidatePositions
    : updatePositions;
  const stemLayoutByIdRef = useRef(
    new Map<string, Omit<LabelStemLayout, "anchorECEF">>()
  );

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
    updatePositions: refreshOverlayPositions,
    computeStates,
    createEmptyState: createEmptyLabelOverlayState,
  });

  useEffect(() => {
    labelsRef.current = labels;
    invalidate();
    refreshOverlayPositions();
    engine?.requestRender();
  }, [
    engine,
    invalidate,
    isInPreviewNodeLink,
    labels,
    refreshOverlayPositions,
  ]);

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
          markerInScene: handlesInScene,
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
        // the anchor's verdict for pill, stem and (scene) marker alike
        const look = resolvePointLabelOcclusionLook(
          label,
          renderState.isOccluded === true
        );

        if (isLineBlendLabel) {
          const applied = applyLineBlendPointLabelOverlayState({
            elementDiv,
            state: renderState,
          });
          if (label.areaFit) {
            if (applied) {
              elementDiv.style.opacity = `${look.opacity}`;
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
        if (handlesInScene && !renderState.hideLabelAndStem) {
          const segment = appliedPill
            ? resolvePointLabelStemSegment({ domRefs, state: renderState })
            : null;
          if (segment) {
            stemLayoutByIdRef.current.set(label.id, { segment, ...look });
          } else {
            stemLayoutByIdRef.current.delete(label.id);
          }
        }
        if (appliedPill) {
          // the pill fades with its anchor, also while the engine draws the marker
          domRefs.pointLabelRoot.style.opacity = `${look.opacity}`;
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
      stemLayoutByIdRef.current.delete(labelId);
      removeLabelOverlayElement(
        getPointLabelOverlayId(overlayIdPrefix, labelId)
      );
    });

    previousLabelIdsRef.current = nextLabelIds;

    refreshOverlayPositions();
    if (didMutateOverlayElements) {
      engine?.requestRender();
    }
  }, [
    setLabelOverlayElement,
    engine,
    handlesInScene,
    normalizedLabels,
    overlayIdPrefix,
    areaLabelLineOptions,
    readCachedState,
    removeLabelOverlayElement,
    resolveLabelOverlayState,
    resolveOverlayDomRefs,
    refreshOverlayPositions,
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
      stemLayoutByIdRef.current.clear();
    },
    [overlayIdPrefix, removeLabelOverlayElement]
  );

  const readShownState = useCallback(
    (labelId: string) => {
      const state = readCachedState(labelId);
      return state &&
        state.screenPosition &&
        !state.isHidden &&
        !state.hiddenByLayout
        ? state
        : null;
    },
    [readCachedState]
  );
  const sceneHandles = useMemo(() => {
    if (!handlesInScene) return { markers: [], stemLabels: [] };
    const pillLabels = normalizedLabels.filter(
      (label) =>
        label.renderStyle !== RUNTIME_POINT_LABEL_RENDER_STYLE.LINE_BLEND
    );
    return {
      markers: buildLabelMarkerSceneModels(
        pillLabels.filter(pointLabelDrawsMarker).map((label) => ({
          ...label,
          ...resolvePointLabelMarkerMetrics(label),
        })),
        liveAnchors,
        (labelId) => {
          const state = readShownState(labelId);
          return {
            visible: state !== null,
            anchorECEF: state?.anchorECEF,
            isOccluded: state?.isOccluded === true,
          };
        }
      ),
      stemLabels: pillLabels.filter((label) => label.hideLabelAndStem !== true),
    };
  }, [handlesInScene, liveAnchors, normalizedLabels, readShownState]);
  useSceneMarkers(engine, sceneHandles.markers);
  useLabelStemSceneLines(
    handlesInScene ? engine : null,
    sceneHandles.stemLabels,
    (labelId) => {
      const anchorECEF = readShownState(labelId)?.anchorECEF;
      const stem = stemLayoutByIdRef.current.get(labelId);
      return anchorECEF && stem ? { anchorECEF, ...stem } : null;
    }
  );
};
