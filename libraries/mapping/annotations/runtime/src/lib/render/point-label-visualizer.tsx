import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import type { CssPixelPosition } from "@carma-units";
import { Cartesian3, SceneTransforms, defined } from "@carma-cesium";

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
  cartesian3FromGeographicCoordinate,
  geographicCoordinateFromCartesian3,
} from "@carma-mapping/engines/cesium/core";

import { annotationVisualDefaults } from "../config/annotation-visual-defaults";
import type { Scene } from "@carma-cesium";
import {
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

const createEmptyLabelOverlayState = (): PointLabelOverlayState => ({
  canvasPosition: null,
  screenPosition: null,
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
  scene: Scene,
  candidate: RuntimePointLabelCoordinateCandidate
) => {
  const canvasPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    cartesian3FromGeographicCoordinate(candidate.coordinate)
  );

  if (!defined(canvasPosition)) {
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
    ? (liveAnchors.get(candidate.nodeId) as Cartesian3 | undefined)
    : undefined;
  return liveAnchor
    ? geographicCoordinateFromCartesian3(liveAnchor)
    : candidate.coordinate;
};

const resolveEffectivePointLabelCoordinateCandidate = ({
  scene,
  label,
}: {
  scene: Scene | null;
  label: RuntimePointLabelRenderModel;
}): RuntimePointLabelCoordinateCandidate => {
  const candidates = resolvePointLabelCoordinateCandidates(label);
  const fallbackCandidate = candidates[0] ?? {
    coordinate: label.coordinate,
    nodeId: label.nodeId,
  };

  if (
    !scene ||
    scene.isDestroyed() ||
    !label.coordinateSelection ||
    candidates.length <= 1
  ) {
    return fallbackCandidate;
  }

  const projectedCandidates = candidates
    .map((candidate) => resolvePointLabelCoordinateProjection(scene, candidate))
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
  scene: Scene | null,
  labels: readonly RuntimePointLabelRenderModel[],
  liveAnchors: LiveAnnotationAnchors,
  isInPreviewNodeLink?: (nodeId?: string) => boolean,
  overlayIdPrefix: string = "runtime-point-label",
  areaLabelLineOptions: AnnotationLineLabelOptions = annotationLineLabelDefaults
) => {
  const {
    addLabelOverlayElement,
    removeLabelOverlayElement,
    updateLabelOverlayElement,
    updatePositions,
  } = useLabelOverlay();
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
  const hadLiveAnchorsRef = useRef(false);

  useEffect(() => {
    labelsRef.current = labels;
    stateCacheRef.current = {
      frameKey: null,
      sceneSnapshot: null,
      statesById: stateCacheRef.current.statesById,
    };
    updatePositions();
    scene?.requestRender();
  }, [isInPreviewNodeLink, labels, scene, updatePositions]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
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
      scene.requestRender();
    };

    const removeMoveStartListener = scene.camera.moveStart.addEventListener(
      handleCameraMoveStart
    );
    const removeMoveEndListener =
      scene.camera.moveEnd.addEventListener(handleCameraMoveEnd);

    return () => {
      isCameraMovingRef.current = false;
      removeMoveStartListener?.();
      removeMoveEndListener?.();
    };
  }, [scene, updatePositions]);

  const computeStatesById = useCallback(() => {
    const nextStatesById = new Map<string, PointLabelOverlayState>();

    if (!scene || scene.isDestroyed()) {
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
      isCameraMovingRef.current || liveAnchors.size > 0;
    const freezeLayoutDuringActiveMove =
      !preserveOcclusionDuringCameraMove &&
      labelsRef.current.some(
        (label) =>
          label.hideLabelAndStem !== true &&
          isInPreviewNodeLink?.(label.nodeId) === true
      );
    const activeMoveGizmoLabelIdSet = new Set<string>();
    const viewportWidth = Math.max(1, scene.canvas.clientWidth);
    const viewportHeight = Math.max(1, scene.canvas.clientHeight);
    const cameraPitch =
      typeof scene.camera.pitch === "number" ? scene.camera.pitch : 0;

    labelsRef.current.forEach((label, index) => {
      const isActiveMoveGizmoLabel =
        label.hideLabelAndStem !== true &&
        isInPreviewNodeLink?.(label.nodeId) === true;
      if (isActiveMoveGizmoLabel) {
        activeMoveGizmoLabelIdSet.add(label.id);
      }

      const effectiveCoordinateCandidate =
        resolveEffectivePointLabelCoordinateCandidate({
          scene,
          label,
        });
      const effectiveCoordinate = resolveLiveLabelCoordinate(
        effectiveCoordinateCandidate,
        liveAnchors
      );
      const computedBaseState = computeOverlayVisibilityState({
        scene,
        coordinate: effectiveCoordinate,
        shouldTestOcclusion:
          !preserveOcclusionDuringCameraMove &&
          shouldTestPointLabelOcclusion({
            anchorKind: label.anchorKind,
            occlusionMode: label.occlusionMode,
          }),
      });
      const baseState = preserveOcclusionDuringCameraMove
        ? {
            ...computedBaseState,
            isOccluded: previousStatesById.get(label.id)?.isOccluded ?? false,
          }
        : computedBaseState;
      const cameraDistanceMeters = Cartesian3.distance(
        scene.camera.positionWC,
        cartesian3FromGeographicCoordinate(effectiveCoordinate)
      );
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
  }, [isInPreviewNodeLink, liveAnchors, scene]);

  const resolveLabelOverlayState = useCallback(
    (labelId: string) => {
      const frameKey = getSceneFrameKey(scene);
      if (stateCacheRef.current.frameKey !== frameKey) {
        const sceneSnapshot = captureOverlayVisibilitySceneSnapshot(scene);
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
    [computeStatesById, liveAnchors, scene]
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
            return applyLineBlendPointLabelOverlayState({
              elementDiv,
              state: renderState,
            });
          }

          const domRefs = resolveOverlayDomRefs(label.id, elementDiv);
          if (!domRefs) {
            return false;
          }
          return applyPointLabelOverlayState({
            elementDiv,
            domRefs,
            state: renderState,
          });
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

      if (previousLabelIdsRef.current.has(label.id)) {
        updateLabelOverlayElement(overlayId, {
          ...overlayElementUpdate,
          contentKey: nextContentSignature,
          content: overlayElementContent,
        });
        return;
      }

      didMutateOverlayElements = true;
      overlayDomRefsByIdRef.current.delete(label.id);

      addLabelOverlayElement({
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
      scene?.requestRender();
    }
  }, [
    addLabelOverlayElement,
    normalizedLabels,
    overlayIdPrefix,
    areaLabelLineOptions,
    removeLabelOverlayElement,
    resolveLabelOverlayState,
    resolveOverlayDomRefs,
    scene,
    updateLabelOverlayElement,
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
