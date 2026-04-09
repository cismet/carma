import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CssPixelPosition } from "@carma-units";
import { Cartesian3, SceneTransforms, defined } from "@carma-cesium";

import {
  PointLabel,
  computePointLabelLayout,
  estimatePillCapRadiusPx,
  resolvePointLabelLayoutConfig,
  resolveSegmentEndOutsideCircle,
  resolveSegmentEndOutsideHorizontalCapsule,
  shouldTestPointLabelOcclusion,
  useLabelOverlay,
  type LayoutPointInput,
  type LabelOverlayElement,
  type PointLabelAttach,
  type PointLabelLayoutResult,
} from "@carma-providers/label-overlay";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";

import type { RuntimeScene } from "../types/runtimeScene.types";
import {
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
  resolveRuntimeOverlayDistanceZIndex,
  type RuntimePointLabelCoordinateCandidate,
  type RuntimePointLabelRenderModel,
} from "./measurementRenderModels";
import {
  areRuntimeOverlayVisibilitySceneSnapshotsEqual,
  captureRuntimeOverlayVisibilitySceneSnapshot,
  computeRuntimeOverlayVisibilityState,
  getSceneFrameKey,
  type RuntimeOverlayVisibilitySceneSnapshot,
  type RuntimeOverlayVisibilityState,
} from "./runtimeOverlayVisibility.shared";

const NODE_LABEL_LAYOUT_CONFIG = resolvePointLabelLayoutConfig(undefined);
const DEFAULT_LABEL_MARKER_PIXEL_SIZE = 10;
const NOOP_OVERLAY_CLICK_HANDLER = () => undefined;

const EMPTY_LAYOUT_RESULT: PointLabelLayoutResult = {
  placements: {},
  hiddenByLayout: new Set<string>(),
  collapsedToCompact: new Set<string>(),
};

type RuntimePointLabelVisualizerProps = {
  scene: RuntimeScene | null;
  labels: readonly RuntimePointLabelRenderModel[];
  blockLabelInteractions?: boolean;
};

type RuntimePointLabelOverlayState = RuntimeOverlayVisibilityState & {
  hiddenByLayout: boolean;
  angleRad: number;
  distance: number;
  attach: PointLabelAttach;
  zIndex: number;
};

type RuntimePointLabelOverlayDomRefs = {
  stem: HTMLDivElement;
  stemLine: HTMLDivElement;
  labelRoot: HTMLDivElement;
  pillBadge: HTMLSpanElement | null;
  pillContent: HTMLSpanElement | null;
  pointLabelRoot: HTMLDivElement;
};

const toLayoutText = (value: unknown, fallback = ""): string => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return fallback;
};

const isNotNull = <T,>(value: T | null): value is T => value !== null;

const getPointLabelOverlayId = (labelId: string) =>
  `runtime-point-label-${labelId}`;

const getEffectiveCompactContent = (label: RuntimePointLabelRenderModel) =>
  label.markerPixelSize !== undefined
    ? label.compactContent ?? label.content
    : label.compactContent;

const getPointLabelContentKey = (
  label: RuntimePointLabelRenderModel,
  blockLabelInteractions: boolean,
  effectiveCompactContent: RuntimePointLabelRenderModel["compactContent"]
): string =>
  [
    label.id,
    `${label.selected ?? false}`,
    `${label.hideMarker ?? false}`,
    `${label.hideLabelAndStem ?? false}`,
    `${label.markerPixelSize ?? ""}`,
    `${label.fontSize ?? ""}`,
    `${label.fontFamily ?? ""}`,
    `${label.fontWeight ?? ""}`,
    `${label.textBackgroundColor ?? ""}`,
    `${label.textColor ?? ""}`,
    `${label.markerBackgroundColor ?? ""}`,
    `${label.markerTextColor ?? ""}`,
    `${label.labelStyle ?? ""}`,
    `${label.collapse ?? false}`,
    `${label.forceCollapse ?? false}`,
    `${label.coordinateSelection ?? ""}`,
    `${label.coordinateCandidates?.length ?? 0}`,
    String(label.content),
    String(label.markerContent ?? ""),
    String(effectiveCompactContent ?? ""),
    `${blockLabelInteractions}`,
    `${Boolean(label.onDoubleClick)}`,
  ].join(":");

const getAttachTransform = (attach: PointLabelAttach): string => {
  if (attach === "left") {
    return "translate(0%, -50%)";
  }

  if (attach === "right") {
    return "translate(-100%, -50%)";
  }

  return "translate(-50%, -50%)";
};

const getPillAnchorTransform = (
  attach: PointLabelAttach,
  pillCapRadiusPx: number,
  compactCenterOffsetPx: number | null
): string => {
  if (attach === "left") {
    return pillCapRadiusPx > 0
      ? `translate(${-pillCapRadiusPx}px, -50%)`
      : getAttachTransform(attach);
  }

  if (attach === "right") {
    return pillCapRadiusPx > 0
      ? `translate(calc(-100% + ${pillCapRadiusPx}px), -50%)`
      : getAttachTransform(attach);
  }

  if (compactCenterOffsetPx !== null) {
    return `translate(${-compactCenterOffsetPx}px, -50%)`;
  }

  return getAttachTransform(attach);
};

const syncCompactBadgeMountSide = (
  pillBadge: HTMLSpanElement,
  attach: PointLabelAttach
) => {
  if (attach === "right") {
    pillBadge.style.left = "auto";
    pillBadge.style.right = "0px";
    pillBadge.style.transform = "translate(0, -50%)";
    return;
  }

  pillBadge.style.left = "0px";
  pillBadge.style.right = "auto";
  pillBadge.style.transform = "translate(0, -50%)";
};

const createEmptyLabelOverlayState = (): RuntimePointLabelOverlayState => ({
  canvasPosition: null,
  screenPosition: null,
  isHidden: true,
  isOccluded: false,
  hiddenByLayout: true,
  angleRad: 0,
  distance: NODE_LABEL_LAYOUT_CONFIG.stemDistance,
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
  scene: RuntimeScene,
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
  scene: RuntimeScene | null;
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

export const useRuntimePointLabelVisualizer = ({
  scene,
  labels,
  blockLabelInteractions = false,
}: RuntimePointLabelVisualizerProps) => {
  const {
    addLabelOverlayElement,
    removeLabelOverlayElement,
    updateLabelOverlayElement,
    updatePositions,
  } = useLabelOverlay();
  const labelsRef = useRef(labels);
  const previousSignatureByIdRef = useRef<Map<string, string>>(new Map());
  const overlayDomRefsByIdRef = useRef<
    Map<string, RuntimePointLabelOverlayDomRefs>
  >(new Map());
  const stateCacheRef = useRef<{
    frameKey: number | null;
    sceneSnapshot: RuntimeOverlayVisibilitySceneSnapshot | null;
    statesById: Map<string, RuntimePointLabelOverlayState>;
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
      statesById: new Map(),
    };
    updatePositions();
    scene?.requestRender();
  }, [labels, scene, updatePositions]);

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
    const nextStatesById = new Map<string, RuntimePointLabelOverlayState>();

    if (!scene || scene.isDestroyed()) {
      return nextStatesById;
    }

    const layoutInputs: LayoutPointInput[] = [];
    const baseStatesById = new Map<string, RuntimeOverlayVisibilityState>();
    const overlayZIndexById = new Map<string, number>();
    const previousStatesById = stateCacheRef.current.statesById;
    const viewportWidth = Math.max(1, scene.canvas.clientWidth);
    const viewportHeight = Math.max(1, scene.canvas.clientHeight);
    const cameraPitch =
      typeof scene.camera.pitch === "number" ? scene.camera.pitch : 0;
    const preserveOcclusionDuringCameraMove = isCameraMovingRef.current;

    labelsRef.current.forEach((label, index) => {
      const effectiveCoordinateCandidate =
        resolveEffectivePointLabelCoordinateCandidate({
          scene,
          label,
        });
      const computedBaseState = computeRuntimeOverlayVisibilityState({
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
      overlayZIndexById.set(label.id, overlayZIndex);

      if (
        !baseState.screenPosition ||
        baseState.isHidden ||
        label.hideLabelAndStem
      ) {
        return;
      }

      layoutInputs.push({
        id: label.id,
        anchor: baseState.screenPosition,
        anchorKind: label.anchorKind,
        text: toLayoutText(label.content),
        compactText: toLayoutText(
          label.compactContent ?? label.markerContent,
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
            config: NODE_LABEL_LAYOUT_CONFIG,
          })
        : EMPTY_LAYOUT_RESULT;

    labelsRef.current.forEach((label) => {
      const baseState = baseStatesById.get(label.id);
      const placement = layoutResult.placements[label.id];

      nextStatesById.set(label.id, {
        ...(baseState ?? createEmptyLabelOverlayState()),
        hiddenByLayout:
          Boolean(label.hideLabelAndStem) ||
          layoutResult.hiddenByLayout.has(label.id),
        angleRad: placement?.angleRad ?? 0,
        distance: placement?.distance ?? NODE_LABEL_LAYOUT_CONFIG.stemDistance,
        attach: placement?.attach ?? "center",
        zIndex: overlayZIndexById.get(label.id) ?? 0,
      });
    });

    return nextStatesById;
  }, [scene]);

  const resolveLabelOverlayState = useCallback(
    (labelId: string) => {
      const frameKey = getSceneFrameKey(scene);
      if (stateCacheRef.current.frameKey !== frameKey) {
        const sceneSnapshot =
          captureRuntimeOverlayVisibilitySceneSnapshot(scene);
        const shouldRecomputeStates =
          !areRuntimeOverlayVisibilitySceneSnapshotsEqual(
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
    () => labels.filter((label) => !label.hideLabelAndStem),
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

      const stem = elementDiv.querySelector(
        '[data-point-label-stem="true"]'
      ) as HTMLDivElement | null;
      const stemLine = elementDiv.querySelector(
        '[data-point-label-stem-line="true"]'
      ) as HTMLDivElement | null;
      const labelRoot = elementDiv.querySelector(
        '[data-pillbutton-root="true"], [data-point-label-content-root="true"]'
      ) as HTMLDivElement | null;
      const pillBadge = elementDiv.querySelector(
        '[data-pillbutton-badge="true"]'
      ) as HTMLSpanElement | null;
      const pillContent = elementDiv.querySelector(
        '[data-pillbutton-content="true"]'
      ) as HTMLSpanElement | null;
      const pointLabelRoot = elementDiv.querySelector(
        '[data-point-label-root="true"]'
      ) as HTMLDivElement | null;

      if (!stem || !stemLine || !labelRoot || !pointLabelRoot) {
        return null;
      }

      const nextDomRefs = {
        stem,
        stemLine,
        labelRoot,
        pillBadge,
        pillContent,
        pointLabelRoot,
      } satisfies RuntimePointLabelOverlayDomRefs;
      overlayDomRefsByIdRef.current.set(labelId, nextDomRefs);

      return nextDomRefs;
    },
    []
  );

  useEffect(() => {
    let didMutateOverlayElements = false;
    const nextSignatureById = new Map<string, string>();

    normalizedLabels.forEach((label) => {
      const interactive =
        !blockLabelInteractions && Boolean(label.onClick || label.onLongPress);
      const overlayId = getPointLabelOverlayId(label.id);
      const effectiveCompactContent = getEffectiveCompactContent(label);
      const nextSignature = getPointLabelContentKey(
        label,
        blockLabelInteractions,
        effectiveCompactContent
      );
      nextSignatureById.set(label.id, nextSignature);

      const overlayElementUpdate: Partial<LabelOverlayElement> = {
        zIndex: stateCacheRef.current.statesById.get(label.id)?.zIndex ?? 0,
        onClick: interactive ? NOOP_OVERLAY_CLICK_HANDLER : undefined,
        cursor: interactive ? "pointer" : undefined,
        updatePosition: (elementDiv: HTMLElement) => {
          const overlayState = resolveLabelOverlayState(label.id);
          if (
            !overlayState.screenPosition ||
            overlayState.isHidden ||
            overlayState.hiddenByLayout
          ) {
            return false;
          }

          elementDiv.style.left = `${overlayState.screenPosition.x}px`;
          elementDiv.style.top = `${overlayState.screenPosition.y}px`;
          elementDiv.style.transform = "none";
          elementDiv.style.zIndex = `${overlayState.zIndex}`;

          const domRefs = resolveOverlayDomRefs(label.id, elementDiv);
          if (!domRefs) {
            return false;
          }

          const {
            stem,
            stemLine,
            labelRoot,
            pillBadge,
            pillContent,
            pointLabelRoot,
          } = domRefs;

          if (pillBadge) {
            syncCompactBadgeMountSide(pillBadge, overlayState.attach);
          }

          const dx = Math.cos(overlayState.angleRad) * overlayState.distance;
          const dy = Math.sin(overlayState.angleRad) * overlayState.distance;
          const markerRadius = label.hideMarker
            ? 0
            : (label.markerPixelSize ?? DEFAULT_LABEL_MARKER_PIXEL_SIZE) / 2;
          const parsedFontSizePx = Number.parseFloat(label.fontSize ?? "12px");
          const isCompactOnlyPill = pillBadge !== null && pillContent === null;
          const compactBadgeWidthPx = isCompactOnlyPill
            ? pillBadge.offsetWidth
            : 0;
          const compactBadgeHeightPx = isCompactOnlyPill
            ? pillBadge.offsetHeight
            : 0;
          const compactBadgeCapRadiusPx =
            compactBadgeHeightPx > 0 ? compactBadgeHeightPx / 2 : null;
          const pillCapRadiusPx =
            overlayState.attach === "center"
              ? 0
              : compactBadgeCapRadiusPx ??
                estimatePillCapRadiusPx(parsedFontSizePx);
          const compactCenterOffsetPx =
            overlayState.attach === "center" && compactBadgeWidthPx > 0
              ? compactBadgeWidthPx / 2
              : null;
          const stemStartPoint = {
            x: Math.cos(overlayState.angleRad) * markerRadius,
            y: Math.sin(overlayState.angleRad) * markerRadius,
          } as CssPixelPosition;
          const pillAnchorPoint = {
            x:
              Math.cos(overlayState.angleRad) *
              (overlayState.distance + pillCapRadiusPx),
            y:
              Math.sin(overlayState.angleRad) *
              (overlayState.distance + pillCapRadiusPx),
          } as CssPixelPosition;
          const visibleStemEndPoint =
            compactBadgeWidthPx > 0 && compactBadgeHeightPx > 0
              ? resolveSegmentEndOutsideHorizontalCapsule(
                  stemStartPoint,
                  pillAnchorPoint,
                  overlayState.attach,
                  compactBadgeWidthPx,
                  compactBadgeHeightPx
                )
              : pillCapRadiusPx > 0
              ? resolveSegmentEndOutsideCircle(
                  stemStartPoint,
                  pillAnchorPoint,
                  pillCapRadiusPx
                )
              : {
                  x: dx,
                  y: dy,
                };
          const lineDx = visibleStemEndPoint.x - stemStartPoint.x;
          const lineDy = visibleStemEndPoint.y - stemStartPoint.y;
          const lineLength = Math.max(0, Math.hypot(lineDx, lineDy));
          const lineAngleRad = Math.atan2(lineDy, lineDx);

          stem.style.display = lineLength > 0 ? "block" : "none";
          stem.style.left = `${stemStartPoint.x}px`;
          stem.style.top = `${stemStartPoint.y}px`;
          stem.style.transformOrigin = "0 0";
          stem.style.transform = `rotate(${lineAngleRad}rad)`;
          stemLine.style.width = `${lineLength}px`;
          stemLine.style.borderBottom = `1px ${
            overlayState.isOccluded ? "dashed" : "solid"
          } rgba(255, 255, 255, 1)`;

          labelRoot.style.left = `${pillAnchorPoint.x}px`;
          labelRoot.style.top = `${pillAnchorPoint.y}px`;
          labelRoot.style.transform = labelRoot.hasAttribute(
            "data-pillbutton-root"
          )
            ? getPillAnchorTransform(
                overlayState.attach,
                pillCapRadiusPx,
                compactCenterOffsetPx
              )
            : getAttachTransform(overlayState.attach);
          pointLabelRoot.style.opacity = overlayState.isOccluded ? "0.75" : "1";

          return true;
        },
      };

      if (previousSignatureByIdRef.current.get(label.id) === nextSignature) {
        updateLabelOverlayElement(overlayId, overlayElementUpdate);
        return;
      }

      didMutateOverlayElements = true;
      overlayDomRefsByIdRef.current.delete(label.id);

      addLabelOverlayElement({
        id: overlayId,
        contentKey: nextSignature,
        content: (
          <PointLabel
            pointId={label.id}
            content={label.content}
            selected={label.selected}
            hideLabelAndStem={label.hideLabelAndStem}
            hideMarker={true}
            markerSize={
              label.markerPixelSize ?? DEFAULT_LABEL_MARKER_PIXEL_SIZE
            }
            stemStartDistance={
              label.hideMarker
                ? 0
                : (label.markerPixelSize ?? DEFAULT_LABEL_MARKER_PIXEL_SIZE) / 2
            }
            markerContent={label.markerContent}
            markerBackgroundColor={label.markerBackgroundColor}
            markerTextColor={label.markerTextColor}
            compactContent={effectiveCompactContent}
            labelStyle={label.labelStyle}
            collapse={label.collapse}
            forceCollapse={label.forceCollapse}
            fontSize={label.fontSize}
            fontFamily={label.fontFamily}
            fontWeight={label.fontWeight}
            textBackgroundColor={label.textBackgroundColor}
            textColor={label.textColor}
            onClick={blockLabelInteractions ? undefined : label.onClick}
            onDoubleClick={
              blockLabelInteractions ? undefined : label.onDoubleClick
            }
            onLongPress={blockLabelInteractions ? undefined : label.onLongPress}
            longPressDurationMs={label.longPressDurationMs}
            longPressOnlyOnMarker={Boolean(label.onLongPress)}
            renderHiddenMarkerInteractionTarget={Boolean(label.onLongPress)}
          />
        ),
        ...overlayElementUpdate,
      });
    });

    previousSignatureByIdRef.current.forEach((_, labelId) => {
      if (nextSignatureById.has(labelId)) {
        return;
      }

      didMutateOverlayElements = true;
      overlayDomRefsByIdRef.current.delete(labelId);
      removeLabelOverlayElement(getPointLabelOverlayId(labelId));
    });

    previousSignatureByIdRef.current = nextSignatureById;

    updatePositions();
    if (didMutateOverlayElements) {
      scene?.requestRender();
    }
  }, [
    addLabelOverlayElement,
    blockLabelInteractions,
    normalizedLabels,
    removeLabelOverlayElement,
    resolveLabelOverlayState,
    resolveOverlayDomRefs,
    scene,
    updateLabelOverlayElement,
    updatePositions,
  ]);

  useEffect(
    () => () => {
      previousSignatureByIdRef.current.forEach((_, labelId) => {
        removeLabelOverlayElement(getPointLabelOverlayId(labelId));
      });
      previousSignatureByIdRef.current.clear();
      overlayDomRefsByIdRef.current.clear();
    },
    [removeLabelOverlayElement]
  );
};

export const RuntimePointLabelVisualizer = (
  props: RuntimePointLabelVisualizerProps
) => {
  useRuntimePointLabelVisualizer(props);

  return null;
};
