import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Vector3 } from "three";
import type { CssPixelPosition } from "@carma-units";

import {
  applyPointLabelOverlayState,
  computePointLabelLayout,
  getPointLabelOverlayContentSignature,
  POINT_LABEL_ANCHOR_KIND,
  readPointLabelOverlayDomRefs,
  resolvePointLabelLayoutConfig,
  renderPointLabelOverlayContent,
  shouldTestPointLabelOcclusion,
  useLabelOverlay,
  type LayoutPointInput,
  type LabelOverlayElement,
  type PointLabelAttach,
  type PointLabelOverlayDomRefs,
  type PointLabelOverlayRenderState,
  type PointLabelLayoutResult,
} from "@carma-providers/label-overlay";
import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
} from "@carma-mapping/annotations/core";

import { annotationVisualDefaults } from "../config/annotation-visual-defaults";
import { isValidAnnotationEngine, type AnnotationEngine } from "../engine";
import {
  RUNTIME_AREA_LABEL_FIT_ROLE,
  RUNTIME_POINT_LABEL_RENDER_STYLE,
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
  RUNTIME_OVERLAY_DISTANCE_Z_INDEX,
  resolveRuntimeOverlayDistanceZIndex,
  type RuntimePointLabelCoordinateCandidate,
  type RuntimePointLabelRenderModel,
} from "./annotation-render-models";
import {
  annotationLineLabelDefaults,
  resolveAnnotationLineLabelSurfaceBlendMode,
  type AnnotationLineLabelOptions,
} from "../config/annotation-line-label-options";
import { TEXT_OVERLAY_AREA_LABEL_STYLE, TextOverlay } from "./text-overlay";
import {
  resolveAreaLabelFit,
  type AreaLabelFit,
  type ScreenPoint,
} from "./area-label-fit";
import type { LiveAnnotationAnchors } from "../interaction/live-annotation-anchors";
import {
  areOverlayVisibilitySceneSnapshotsEqual,
  captureOverlayVisibilitySceneSnapshot,
  computeOverlayVisibilityState,
  getSceneFrameKey,
  type OverlayVisibilitySceneSnapshot,
  type OverlayVisibilityState,
} from "./overlay-visibility.shared";

const pointLabelVisualizerDefaults = Object.freeze({
  layoutConfig: resolvePointLabelLayoutConfig(undefined),
  markerPixelSize: 10,
  markerOutlineWidth: annotationVisualDefaults.sizes.pointOutlineWidth,
  stemColor: annotationVisualDefaults.colors.surface,
  activeMoveGizmoLabelZIndex: RUNTIME_OVERLAY_DISTANCE_Z_INDEX.MAX + 1,
});

const EMPTY_LAYOUT_RESULT: PointLabelLayoutResult = {
  placements: {},
  hiddenByLayout: new Set<string>(),
  collapsedToCompact: new Set<string>(),
};

type PointLabelOverlayState = OverlayVisibilityState & {
  hiddenByLayout: boolean;
  angleRad: number;
  distance: number;
  attach: PointLabelAttach;
  zIndex: number;
};

const toLayoutText = (value: unknown, fallback = ""): string => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return fallback;
};

const isNotNull = <T,>(value: T | null): value is T => value !== null;

const getPointLabelOverlayId = (overlayIdPrefix: string, labelId: string) =>
  `${overlayIdPrefix}-${labelId}`;

const cameraPositionScratch = new Vector3();

/** An area value whose area lies behind something shows at half strength. */
const AREA_LABEL_OCCLUDED_OPACITY = "0.5";

/** A first guess at an area value's drawn size, before it was ever measured. */
const estimateAreaLabelSize = (content: ReactNode) => {
  const text = typeof content === "string" ? content : String(content ?? "");
  return { width: text.length * 8.5, height: 18 };
};

const createEmptyLabelOverlayState = (): PointLabelOverlayState => ({
  screenPosition: null,
  isInViewport: false,
  isHidden: true,
  isOccluded: false,
  hiddenByLayout: true,
  angleRad: 0,
  distance: pointLabelVisualizerDefaults.layoutConfig.stemDistance,
  attach: "center",
  zIndex: 0,
});

const getLineBlendPointLabelContentSignature = ({
  state,
  lineLabelOptions,
  surfaceBlendMode,
}: {
  state: PointLabelOverlayRenderState;
  lineLabelOptions: AnnotationLineLabelOptions;
  surfaceBlendMode?: CSSProperties["mixBlendMode"];
}) =>
  [
    RUNTIME_POINT_LABEL_RENDER_STYLE.LINE_BLEND,
    getPointLabelOverlayContentSignature(state),
    lineLabelOptions.appearance.themeStyle,
    lineLabelOptions.background.style,
    lineLabelOptions.text.fontFamily,
    lineLabelOptions.text.fontWeight,
    surfaceBlendMode ?? "",
  ].join(":");

const applyLineBlendPointLabelOverlayState = ({
  elementDiv,
  state,
}: {
  elementDiv: HTMLElement;
  state: PointLabelOverlayRenderState;
}) => {
  if (!state.screenPosition || state.visible === false) {
    return false;
  }

  elementDiv.style.left = `${state.screenPosition.x}px`;
  elementDiv.style.top = `${state.screenPosition.y}px`;
  elementDiv.style.transform = "translate(-50%, -50%)";
  elementDiv.style.zIndex = `${state.zIndex ?? 0}`;
  elementDiv.style.opacity = state.isOccluded ? "0.75" : "1";
  return true;
};

const resolvePointLabelCoordinateCandidates = (
  label: RuntimePointLabelRenderModel
): readonly RuntimePointLabelCoordinateCandidate[] =>
  label.coordinateCandidates && label.coordinateCandidates.length > 0
    ? label.coordinateCandidates
    : [
        {
          coordinate: label.coordinate,
          nodeId: label.nodeId,
        },
      ];

const resolvePointLabelCoordinateProjection = (
  engine: AnnotationEngine,
  candidate: RuntimePointLabelCoordinateCandidate
) => {
  const canvasPosition = engine.worldToScreen(
    ecefFromGeographicCoordinate(candidate.coordinate)
  );

  if (canvasPosition === null) {
    return null;
  }

  return {
    candidate,
    x: canvasPosition.x,
    y: canvasPosition.y,
  };
};

// Prefer the live drag anchor (as geographic) over the React-fed coordinate so a
// moved node's label tracks it every frame, like the lines/disc.
const resolveLiveLabelCoordinate = (
  candidate: RuntimePointLabelCoordinateCandidate,
  liveAnchors: LiveAnnotationAnchors
) => {
  const liveAnchor = candidate.nodeId
    ? liveAnchors.get(candidate.nodeId)
    : undefined;
  return liveAnchor
    ? geographicCoordinateFromEcef(liveAnchor)
    : candidate.coordinate;
};

const resolveEffectivePointLabelCoordinateCandidate = ({
  engine,
  label,
}: {
  engine: AnnotationEngine | null;
  label: RuntimePointLabelRenderModel;
}): RuntimePointLabelCoordinateCandidate => {
  const candidates = resolvePointLabelCoordinateCandidates(label);
  const fallbackCandidate = candidates[0] ?? {
    coordinate: label.coordinate,
    nodeId: label.nodeId,
  };

  if (
    !isValidAnnotationEngine(engine) ||
    !label.coordinateSelection ||
    candidates.length <= 1
  ) {
    return fallbackCandidate;
  }

  const projectedCandidates = candidates
    .map((candidate) =>
      resolvePointLabelCoordinateProjection(engine, candidate)
    )
    .filter(isNotNull);

  if (projectedCandidates.length === 0) {
    return fallbackCandidate;
  }

  const sortedCandidates = [...projectedCandidates].sort((left, right) =>
    label.coordinateSelection ===
    RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
      ? left.x - right.x
      : right.x - left.x
  );

  return sortedCandidates[0]?.candidate ?? fallbackCandidate;
};

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
  const stateCacheRef = useRef<{
    frameKey: number | null;
    sceneSnapshot: OverlayVisibilitySceneSnapshot | null;
    statesById: Map<string, PointLabelOverlayState>;
  }>({
    frameKey: null,
    sceneSnapshot: null,
    statesById: new Map(),
  });
  const isCameraMovingRef = useRef(false);
  // Area values: the last fit per area, and the drawn size of each inside text.
  const areaLabelFitByKeyRef = useRef(new Map<string, AreaLabelFit>());
  const areaLabelSizeByIdRef = useRef(
    new Map<string, { width: number; height: number }>()
  );
  const hadLiveAnchorsRef = useRef(false);

  useEffect(() => {
    labelsRef.current = labels;
    stateCacheRef.current = {
      frameKey: null,
      sceneSnapshot: null,
      statesById: stateCacheRef.current.statesById,
    };
    updatePositions();
    engine?.requestRender();
  }, [engine, isInPreviewNodeLink, labels, updatePositions]);

  useEffect(() => {
    if (!isValidAnnotationEngine(engine)) {
      isCameraMovingRef.current = false;
      return;
    }

    const invalidateVisibilityCache = () => {
      stateCacheRef.current = {
        frameKey: null,
        sceneSnapshot: null,
        statesById: stateCacheRef.current.statesById,
      };
    };

    const handleCameraMoveStart = () => {
      isCameraMovingRef.current = true;
      invalidateVisibilityCache();
    };

    const handleCameraMoveEnd = () => {
      isCameraMovingRef.current = false;
      invalidateVisibilityCache();
      updatePositions();
      engine.requestRender();
    };

    const removeCameraMoveListeners = engine.subscribeCameraMove({
      onMoveStart: handleCameraMoveStart,
      onMoveEnd: handleCameraMoveEnd,
    });

    return () => {
      isCameraMovingRef.current = false;
      removeCameraMoveListeners();
    };
  }, [engine, updatePositions]);

  const computeStatesById = useCallback(() => {
    const nextStatesById = new Map<string, PointLabelOverlayState>();

    if (!isValidAnnotationEngine(engine)) {
      return nextStatesById;
    }

    const layoutInputs: LayoutPointInput[] = [];
    const baseStatesById = new Map<string, OverlayVisibilityState>();
    const overlayZIndexById = new Map<string, number>();
    const previousStatesById = stateCacheRef.current.statesById;
    // Keep the shared label field stable during active node editing so the
    // dragged label can float above its neighbors without re-laying them out.
    // Also reuse occlusion verdicts during live drags: re-testing runs a
    // pick-pass render per label per frame.
    const preserveOcclusionDuringCameraMove =
      (isCameraMovingRef.current &&
        engine?.capabilities.occlusionPerFrame !== true) ||
      liveAnchors.size > 0;
    const freezeLayoutDuringActiveMove =
      !preserveOcclusionDuringCameraMove &&
      labelsRef.current.some(
        (label) =>
          label.hideLabelAndStem !== true &&
          isInPreviewNodeLink?.(label.nodeId) === true
      );
    const activeMoveGizmoLabelIdSet = new Set<string>();
    const viewportWidth = Math.max(1, engine.canvas.clientWidth);
    const viewportHeight = Math.max(1, engine.canvas.clientHeight);
    const cameraPitchRad = engine.getCameraPitchRad();
    const cameraPitch = typeof cameraPitchRad === "number" ? cameraPitchRad : 0;
    const cameraPositionECEF = engine.getCameraPositionECEF(
      cameraPositionScratch
    );

    // Whether each area's value fits inside its projected outline, once per
    // area; the inside text and the outside pill of the area read the verdict.
    const areaLabelFits = new Map<string, AreaLabelFit>();
    labelsRef.current.forEach((label) => {
      if (label.areaFit?.role !== RUNTIME_AREA_LABEL_FIT_ROLE.INSIDE) return;
      const polygon: ScreenPoint[] = [];
      for (const corner of label.areaFit.outline) {
        const screen = engine.worldToScreen(
          ecefFromGeographicCoordinate(corner)
        );
        if (!screen) break;
        polygon.push({ x: screen.x, y: screen.y });
      }
      const size =
        areaLabelSizeByIdRef.current.get(label.id) ??
        estimateAreaLabelSize(label.content);
      const fit = resolveAreaLabelFit({
        polygon:
          polygon.length === label.areaFit.outline.length ? polygon : null,
        width: size.width,
        height: size.height,
        previous: areaLabelFitByKeyRef.current.get(label.areaFit.key),
      });
      areaLabelFits.set(label.areaFit.key, fit);
      areaLabelFitByKeyRef.current.set(label.areaFit.key, fit);
    });

    labelsRef.current.forEach((label, index) => {
      const isActiveMoveGizmoLabel =
        label.hideLabelAndStem !== true &&
        isInPreviewNodeLink?.(label.nodeId) === true;
      if (isActiveMoveGizmoLabel) {
        activeMoveGizmoLabelIdSet.add(label.id);
      }

      const effectiveCoordinateCandidate =
        resolveEffectivePointLabelCoordinateCandidate({
          engine,
          label,
        });
      const effectiveCoordinate = resolveLiveLabelCoordinate(
        effectiveCoordinateCandidate,
        liveAnchors
      );
      const computedBaseState = computeOverlayVisibilityState({
        engine,
        coordinate: effectiveCoordinate,
        shouldTestOcclusion:
          !preserveOcclusionDuringCameraMove &&
          // an area value fades out where its area lies behind something
          (label.areaFit !== undefined ||
            shouldTestPointLabelOcclusion({
              anchorKind: label.anchorKind,
              occlusionMode: label.occlusionMode,
            })),
      });
      const occlusionAwareState = preserveOcclusionDuringCameraMove
        ? {
            ...computedBaseState,
            isOccluded: previousStatesById.get(label.id)?.isOccluded ?? false,
          }
        : computedBaseState;
      const areaFit = label.areaFit
        ? areaLabelFits.get(label.areaFit.key)
        : undefined;
      const baseState: OverlayVisibilityState = !label.areaFit
        ? occlusionAwareState
        : label.areaFit.role === RUNTIME_AREA_LABEL_FIT_ROLE.INSIDE
        ? areaFit?.fits && areaFit.position
          ? {
              ...occlusionAwareState,
              screenPosition:
                areaFit.position as OverlayVisibilityState["screenPosition"],
            }
          : { ...occlusionAwareState, isHidden: true }
        : areaFit?.fits
        ? { ...occlusionAwareState, isHidden: true }
        : occlusionAwareState;
      const cameraDistanceMeters = cameraPositionECEF
        ? cameraPositionECEF.distanceTo(
            ecefFromGeographicCoordinate(effectiveCoordinate)
          )
        : Number.NaN;
      const overlayZIndex =
        resolveRuntimeOverlayDistanceZIndex(cameraDistanceMeters);
      baseStatesById.set(label.id, baseState);
      overlayZIndexById.set(
        label.id,
        isActiveMoveGizmoLabel
          ? pointLabelVisualizerDefaults.activeMoveGizmoLabelZIndex
          : overlayZIndex
      );

      if (
        !baseState.screenPosition ||
        baseState.isHidden ||
        label.hideLabelAndStem
      ) {
        return;
      }

      if (
        isActiveMoveGizmoLabel ||
        (freezeLayoutDuringActiveMove && previousStatesById.has(label.id))
      ) {
        return;
      }

      layoutInputs.push({
        id: label.id,
        anchor: baseState.screenPosition,
        anchorKind: label.anchorKind,
        text: toLayoutText(label.content),
        compactText: toLayoutText(
          label.badgeContent,
          toLayoutText(label.content)
        ),
        index,
        ...(label.preferredAttach !== undefined
          ? {
              lockPreferredPlacement: true,
              preferredAttach: label.preferredAttach,
            }
          : {}),
        ...(label.selected
          ? {
              layoutPriority: Number.MAX_SAFE_INTEGER,
              lockPreferredPlacement: true,
            }
          : {}),
      });
    });

    const layoutResult =
      layoutInputs.length > 0
        ? computePointLabelLayout({
            points: layoutInputs,
            viewportWidth,
            viewportHeight,
            cameraPitch,
            config: pointLabelVisualizerDefaults.layoutConfig,
          })
        : EMPTY_LAYOUT_RESULT;

    labelsRef.current.forEach((label) => {
      const baseState = baseStatesById.get(label.id);
      const previousState = previousStatesById.get(label.id);
      const isActiveMoveGizmoLabel = activeMoveGizmoLabelIdSet.has(label.id);
      const placement = isActiveMoveGizmoLabel
        ? previousState
        : freezeLayoutDuringActiveMove
        ? previousState ?? layoutResult.placements[label.id]
        : layoutResult.placements[label.id];
      const hiddenByLayout =
        label.hideLabelAndStem || isActiveMoveGizmoLabel
          ? false
          : freezeLayoutDuringActiveMove
          ? previousState?.hiddenByLayout ??
            layoutResult.hiddenByLayout.has(label.id)
          : layoutResult.hiddenByLayout.has(label.id);

      nextStatesById.set(label.id, {
        ...(baseState ?? createEmptyLabelOverlayState()),
        hiddenByLayout,
        angleRad: placement?.angleRad ?? previousState?.angleRad ?? 0,
        distance:
          placement?.distance ??
          previousState?.distance ??
          pointLabelVisualizerDefaults.layoutConfig.stemDistance,
        attach: placement?.attach ?? previousState?.attach ?? "center",
        zIndex: overlayZIndexById.get(label.id) ?? 0,
      });
    });

    return nextStatesById;
  }, [engine, isInPreviewNodeLink, liveAnchors]);

  const resolveLabelOverlayState = useCallback(
    (labelId: string) => {
      const frameKey = getSceneFrameKey(engine);
      if (stateCacheRef.current.frameKey !== frameKey) {
        const sceneSnapshot = captureOverlayVisibilitySceneSnapshot(engine);
        // Live drag anchors move the node while the camera is static (equal
        // snapshot), so force a recompute then or the label freezes. Also force it
        // on the settle frame (anchors just cleared, e.g. closing an edit) so the
        // committed position/visibility is restored without a camera move.
        const liveAnchorsActive = liveAnchors.size > 0;
        const justSettled = hadLiveAnchorsRef.current && !liveAnchorsActive;
        hadLiveAnchorsRef.current = liveAnchorsActive;
        const shouldRecomputeStates =
          liveAnchorsActive ||
          justSettled ||
          !areOverlayVisibilitySceneSnapshotsEqual(
            stateCacheRef.current.sceneSnapshot,
            sceneSnapshot
          );

        stateCacheRef.current = shouldRecomputeStates
          ? {
              frameKey,
              sceneSnapshot,
              statesById: computeStatesById(),
            }
          : {
              frameKey,
              sceneSnapshot,
              statesById: stateCacheRef.current.statesById,
            };
      }

      return (
        stateCacheRef.current.statesById.get(labelId) ??
        createEmptyLabelOverlayState()
      );
    },
    [computeStatesById, engine, liveAnchors]
  );

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
      if (
        cachedDomRefs &&
        cachedDomRefs.stem.isConnected &&
        cachedDomRefs.stemLine.isConnected &&
        cachedDomRefs.labelRoot.isConnected &&
        cachedDomRefs.pointLabelRoot.isConnected
      ) {
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
      const overlayId = getPointLabelOverlayId(overlayIdPrefix, label.id);
      const buildOverlayRenderState = (
        overlayState: PointLabelOverlayState
      ): PointLabelOverlayRenderState => ({
        pointId: label.id,
        content: label.content,
        badgeContent: label.badgeContent,
        selected: label.selected,
        hideLabelAndStem: label.hideLabelAndStem,
        hideMarker: label.hideMarker ?? false,
        markerSize:
          label.markerPixelSize ?? pointLabelVisualizerDefaults.markerPixelSize,
        markerStrokeWidth:
          label.markerOutlineWidth ??
          pointLabelVisualizerDefaults.markerOutlineWidth,
        stemStartDistance:
          label.stemStartDistance ??
          (label.hideMarker
            ? 0
            : (label.markerPixelSize ??
                pointLabelVisualizerDefaults.markerPixelSize) /
                2 +
              (label.markerOutlineWidth ??
                pointLabelVisualizerDefaults.markerOutlineWidth) /
                2),
        markerBackgroundColor: label.markerBackgroundColor,
        markerTextColor: label.markerTextColor,
        lineColor: label.lineColor ?? pointLabelVisualizerDefaults.stemColor,
        labelStyle: label.labelStyle,
        collapse: label.collapse,
        textBackgroundColor: label.textBackgroundColor,
        textColor: label.textColor,
        selectedBackgroundColor: label.selectedBackgroundColor,
        selectedTextColor: label.selectedTextColor,
        selectedGlowColor: label.selectedGlowColor,
        selectedGlowRadiusPx: label.selectedGlowRadiusPx,
        preserveFillOnSelection: label.preserveFillOnSelection,
        hoverBackgroundColor: label.hoverBackgroundColor,
        textShadow: label.textShadow,
        fontSize: label.fontSize,
        fontFamily: label.fontFamily,
        fontWeight: label.fontWeight,
        mixBlendMode:
          label.mixBlendMode ??
          (label.anchorKind === POINT_LABEL_ANCHOR_KIND.AREA_CENTROID
            ? areaLabelSurfaceBlendMode
            : undefined),
        onClick: label.onClick,
        onDoubleClick: label.onDoubleClick,
        onHoverChange: label.onHoverChange,
        onLongPress: label.onLongPress,
        markerOnlyPointerEvents: label.markerOnlyPointerEvents,
        longPressDurationMs: label.longPressDurationMs,
        longPressOnlyOnMarker:
          Boolean(label.onLongPress) && Boolean(label.hideLabelAndStem),
        renderHiddenMarkerInteractionTarget: Boolean(
          label.onLongPress && label.markerOnlyPointerEvents === true
        ),
        screenPosition:
          overlayState.isHidden || overlayState.hiddenByLayout
            ? null
            : overlayState.screenPosition,
        angleRad:
          overlayState.angleRad as PointLabelOverlayRenderState["angleRad"],
        distance: overlayState.distance,
        attach: overlayState.attach,
        isOccluded: overlayState.isOccluded,
        visible: !overlayState.isHidden && !overlayState.hiddenByLayout,
        zIndex: overlayState.zIndex,
      });
      const currentOverlayRenderState = buildOverlayRenderState(
        stateCacheRef.current.statesById.get(label.id) ??
          createEmptyLabelOverlayState()
      );
      const nextContentSignature = isLineBlendLabel
        ? getLineBlendPointLabelContentSignature({
            state: currentOverlayRenderState,
            lineLabelOptions: areaLabelLineOptions,
            surfaceBlendMode: areaLabelSurfaceBlendMode,
          })
        : getPointLabelOverlayContentSignature(currentOverlayRenderState);
      nextLabelIds.add(label.id);

      const overlayElementUpdate: Partial<LabelOverlayElement> = {
        zIndex: stateCacheRef.current.statesById.get(label.id)?.zIndex ?? 0,
        updatePosition: (elementDiv: HTMLElement) => {
          const overlayState = resolveLabelOverlayState(label.id);
          const renderState = buildOverlayRenderState(overlayState);

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
              // the glyphs only: the text's padding, halo and backdrop may
              // reach over the area's edges
              const text = elementDiv.firstElementChild as HTMLElement | null;
              if (text && text.offsetWidth > 0) {
                const style = getComputedStyle(text);
                const width =
                  text.offsetWidth -
                  parseFloat(style.paddingLeft) -
                  parseFloat(style.paddingRight);
                const height =
                  text.offsetHeight -
                  parseFloat(style.paddingTop) -
                  parseFloat(style.paddingBottom);
                if (width > 0 && height > 0) {
                  areaLabelSizeByIdRef.current.set(label.id, { width, height });
                }
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
        },
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
        id: overlayId,
        contentKey: nextContentSignature,
        content: overlayElementContent,
        ...overlayElementUpdate,
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
