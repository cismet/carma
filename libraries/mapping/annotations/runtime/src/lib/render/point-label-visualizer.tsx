import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CssPixelPosition } from "@carma-units";
import { Cartesian3, SceneTransforms, defined } from "@carma-cesium";

import {
  applyPointLabelOverlayState,
  computePointLabelLayout,
  getPointLabelOverlayContentSignature,
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
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";

import { measurementVisualDefaults } from "../config/measurement-visual-defaults";
import type { Scene } from "@carma-cesium";
import {
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
  RUNTIME_OVERLAY_DISTANCE_Z_INDEX,
  resolveRuntimeOverlayDistanceZIndex,
  type RuntimePointLabelCoordinateCandidate,
  type RuntimePointLabelRenderModel,
} from "./measurement-render-models";
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
  markerOutlineWidth: measurementVisualDefaults.sizes.pointOutlineWidth,
  stemColor: measurementVisualDefaults.colors.surface,
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
  blockLabelInteractions: boolean = false,
  isInPreviewNodeLink?: (nodeId?: string) => boolean,
  overlayIdPrefix: string = "runtime-point-label"
) => {
  const {
    addLabelOverlayElement,
    removeLabelOverlayElement,
    updateLabelOverlayElement,
    updatePositions,
  } = useLabelOverlay();
  const labelsRef = useRef(labels);
  const previousLabelIdsRef = useRef<Set<string>>(new Set());
  const overlayDomRefsByIdRef = useRef<
    Map<string, PointLabelOverlayDomRefs>
  >(new Map());
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
    const preserveOcclusionDuringCameraMove = isCameraMovingRef.current;
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
      const computedBaseState = computeOverlayVisibilityState({
        scene,
        coordinate: effectiveCoordinateCandidate.coordinate,
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
        cartesian3FromGeographicCoordinate(
          effectiveCoordinateCandidate.coordinate
        )
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
  }, [isInPreviewNodeLink, scene]);

  const resolveLabelOverlayState = useCallback(
    (labelId: string) => {
      const frameKey = getSceneFrameKey(scene);
      if (stateCacheRef.current.frameKey !== frameKey) {
        const sceneSnapshot =
          captureOverlayVisibilitySceneSnapshot(scene);
        const shouldRecomputeStates =
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
    [computeStatesById, scene]
  );

  const normalizedLabels = useMemo(
    () =>
      labels.filter(
        (label) =>
          !label.hideLabelAndStem ||
          label.allowClickWhenBlocked === true ||
          (Boolean(label.onHoverChange) && label.markerOnlyPointerEvents) ||
          (label.allowLongPressWhenBlocked === true &&
            label.markerOnlyPointerEvents === true)
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
      const clickBlocked =
        blockLabelInteractions && label.allowClickWhenBlocked !== true;
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
          label.markerPixelSize ??
          pointLabelVisualizerDefaults.markerPixelSize,
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
        lineColor:
          label.lineColor ?? pointLabelVisualizerDefaults.stemColor,
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
        onClick: clickBlocked ? undefined : label.onClick,
        onDoubleClick:
          blockLabelInteractions ? undefined : label.onDoubleClick,
        onHoverChange: label.onHoverChange,
        onLongPress:
          blockLabelInteractions && !label.allowLongPressWhenBlocked
            ? undefined
            : label.onLongPress,
        markerOnlyPointerEvents: label.markerOnlyPointerEvents,
        longPressDurationMs: label.longPressDurationMs,
        longPressOnlyOnMarker:
          Boolean(label.onLongPress) && Boolean(label.hideLabelAndStem),
        renderHiddenMarkerInteractionTarget: Boolean(label.onLongPress),
        screenPosition:
          overlayState.isHidden || overlayState.hiddenByLayout
            ? null
            : overlayState.screenPosition,
        angleRad: overlayState.angleRad as PointLabelOverlayRenderState["angleRad"],
        distance: overlayState.distance,
        attach: overlayState.attach,
        isOccluded: overlayState.isOccluded,
        visible: !overlayState.isHidden && !overlayState.hiddenByLayout,
        zIndex: overlayState.zIndex,
      });
      const nextContentSignature = getPointLabelOverlayContentSignature(
        buildOverlayRenderState(
          stateCacheRef.current.statesById.get(label.id) ??
            createEmptyLabelOverlayState()
        )
      );
      nextLabelIds.add(label.id);

      const overlayElementUpdate: Partial<LabelOverlayElement> = {
        zIndex: stateCacheRef.current.statesById.get(label.id)?.zIndex ?? 0,
        updatePosition: (elementDiv: HTMLElement) => {
          const overlayState = resolveLabelOverlayState(label.id);
          const domRefs = resolveOverlayDomRefs(label.id, elementDiv);
          if (!domRefs) {
            return false;
          }

          return applyPointLabelOverlayState({
            elementDiv,
            domRefs,
            state: buildOverlayRenderState(overlayState),
          });
        },
      };

      const overlayElementContent = renderPointLabelOverlayContent(
        buildOverlayRenderState(
          stateCacheRef.current.statesById.get(label.id) ??
            createEmptyLabelOverlayState()
        )
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
    blockLabelInteractions,
    normalizedLabels,
    overlayIdPrefix,
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
