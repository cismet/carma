import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CssPixelPosition } from "@carma-units";

import {
  PointLabel,
  computePointLabelLayout,
  estimatePillCapRadiusPx,
  resolvePointLabelLayoutConfig,
  resolveSegmentEndOutsideCircle,
  shouldTestPointLabelOcclusion,
  useLabelOverlay,
  type LayoutPointInput,
  type LabelOverlayElement,
  type PointLabelAttach,
  type PointLabelLayoutResult,
} from "@carma-providers/label-overlay";

import type { RuntimeScene } from "../types/runtimeScene.types";
import type { RuntimePointLabelRenderModel } from "./measurementRenderModels";
import {
  computeRuntimeOverlayVisibilityState,
  getSceneFrameKey,
  type RuntimeOverlayVisibilityState,
} from "./runtimeOverlayVisibility.shared";

const NODE_LABEL_LAYOUT_CONFIG = resolvePointLabelLayoutConfig(undefined);
const POINT_LABEL_OVERLAY_Z_INDEX = 20;
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
};

type RuntimePointLabelOverlayDomRefs = {
  stem: HTMLDivElement;
  stemLine: HTMLDivElement;
  labelRoot: HTMLDivElement;
  pointLabelRoot: HTMLDivElement;
};

const toLayoutText = (value: unknown, fallback = ""): string => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return fallback;
};

const getPointLabelOverlayId = (labelId: string) =>
  `runtime-point-label-${labelId}`;

const getEffectiveCompactContent = (
  label: RuntimePointLabelRenderModel
) =>
  label.markerPixelSize !== undefined
    ? (label.compactContent ?? label.content)
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
    String(label.content),
    String(label.markerContent ?? ""),
    String(effectiveCompactContent ?? ""),
    `${blockLabelInteractions}`,
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
  pillCapRadiusPx: number
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

  return getAttachTransform(attach);
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
});

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
    statesById: Map<string, RuntimePointLabelOverlayState>;
  }>({
    frameKey: null,
    statesById: new Map(),
  });

  useEffect(() => {
    labelsRef.current = labels;
    stateCacheRef.current = {
      frameKey: null,
      statesById: new Map(),
    };
    updatePositions();
    scene?.requestRender();
  }, [labels, scene, updatePositions]);

  const computeStatesById = useCallback(() => {
    const nextStatesById = new Map<string, RuntimePointLabelOverlayState>();

    if (!scene || scene.isDestroyed()) {
      return nextStatesById;
    }

    const layoutInputs: LayoutPointInput[] = [];
    const baseStatesById = new Map<string, RuntimeOverlayVisibilityState>();
    const viewportWidth = Math.max(1, scene.canvas.clientWidth);
    const viewportHeight = Math.max(1, scene.canvas.clientHeight);
    const cameraPitch =
      typeof scene.camera.pitch === "number" ? scene.camera.pitch : 0;

    labelsRef.current.forEach((label, index) => {
      const baseState = computeRuntimeOverlayVisibilityState({
        scene,
        coordinate: label.coordinate,
        shouldTestOcclusion: shouldTestPointLabelOcclusion({
          anchorKind: label.anchorKind,
          occlusionMode: label.occlusionMode,
        }),
      });
      baseStatesById.set(label.id, baseState);

      if (!baseState.screenPosition || baseState.isHidden || label.hideLabelAndStem) {
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
      });
    });

    return nextStatesById;
  }, [scene]);

  const resolveLabelOverlayState = useCallback(
    (labelId: string) => {
      const frameKey = getSceneFrameKey(scene);
      if (stateCacheRef.current.frameKey !== frameKey) {
        stateCacheRef.current = {
          frameKey,
          statesById: computeStatesById(),
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
        zIndex: POINT_LABEL_OVERLAY_Z_INDEX,
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

          const domRefs = resolveOverlayDomRefs(label.id, elementDiv);
          if (!domRefs) {
            return false;
          }

          const { stem, stemLine, labelRoot, pointLabelRoot } = domRefs;

          const dx = Math.cos(overlayState.angleRad) * overlayState.distance;
          const dy = Math.sin(overlayState.angleRad) * overlayState.distance;
          const markerRadius = label.hideMarker
            ? 0
            : (label.markerPixelSize ?? DEFAULT_LABEL_MARKER_PIXEL_SIZE) / 2;
          const parsedFontSizePx = Number.parseFloat(label.fontSize ?? "12px");
          const pillCapRadiusPx =
            overlayState.attach === "center"
              ? 0
              : estimatePillCapRadiusPx(parsedFontSizePx);
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
            pillCapRadiusPx > 0
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
            ? getPillAnchorTransform(overlayState.attach, pillCapRadiusPx)
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
            markerSize={label.markerPixelSize ?? DEFAULT_LABEL_MARKER_PIXEL_SIZE}
            stemStartDistance={
              label.hideMarker
                ? 0
                : (label.markerPixelSize ?? DEFAULT_LABEL_MARKER_PIXEL_SIZE) /
                  2
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
            onLongPress={
              blockLabelInteractions ? undefined : label.onLongPress
            }
            longPressDurationMs={label.longPressDurationMs}
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
