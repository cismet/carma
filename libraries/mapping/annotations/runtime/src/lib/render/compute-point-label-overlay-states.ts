import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import { Vector3 } from "three";
import type { CssPixelPosition, Radians } from "@carma-units";
import {
  computePointLabelLayout,
  shouldTestPointLabelOcclusion,
  type LayoutPointInput,
  type PointLabelLayoutResult,
} from "@carma-providers/label-overlay";

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import type { LiveAnnotationAnchors } from "../interaction/live-annotation-anchors";
import {
  RUNTIME_AREA_LABEL_FIT_ROLE,
  resolveRuntimeOverlayDistanceZIndex,
  type RuntimePointLabelRenderModel,
} from "./annotation-render-models";
import { resolveAreaLabelFit, type AreaLabelFit } from "./area-label-fit";
import { estimateAreaLabelSize, type AreaLabelSize } from "./area-label-size";
import {
  resolveEffectivePointLabelCoordinateCandidate,
  resolveLiveLabelCoordinate,
} from "./point-label-coordinates";
import {
  createEmptyLabelOverlayState,
  pointLabelVisualizerDefaults,
  type PointLabelOverlayState,
} from "./point-label-overlay-state";
import {
  computeOverlayVisibilityState,
  type OverlayVisibilityState,
} from "./overlay-visibility.shared";

const EMPTY_LAYOUT_RESULT: PointLabelLayoutResult = {
  placements: {},
  hiddenByLayout: new Set<string>(),
  collapsedToCompact: new Set<string>(),
};

const cameraPositionScratch = new Vector3();

const toLayoutText = (value: unknown, fallback = ""): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;

/** Whether each area's value fits inside its projected outline, once per area; the inside text and the outside pill both read the verdict. */
const resolveAreaLabelFits = ({
  engine,
  labels,
  areaLabelSizeById,
  areaLabelFitByKey,
}: {
  engine: AnnotationEngine;
  labels: readonly RuntimePointLabelRenderModel[];
  areaLabelSizeById: ReadonlyMap<string, AreaLabelSize>;
  areaLabelFitByKey: Map<string, AreaLabelFit>;
}) => {
  const areaLabelFits = new Map<string, AreaLabelFit>();

  labels.forEach((label) => {
    if (label.areaFit?.role !== RUNTIME_AREA_LABEL_FIT_ROLE.INSIDE) return;

    const polygon: CssPixelPosition[] = [];
    for (const corner of label.areaFit.outline) {
      const screen = engine.worldToScreen(ecefFromGeographicCoordinate(corner));
      if (!screen) break;
      polygon.push({ x: screen.x, y: screen.y } as CssPixelPosition);
    }
    const size =
      areaLabelSizeById.get(label.id) ?? estimateAreaLabelSize(label.content);
    const fit = resolveAreaLabelFit({
      polygon: polygon.length === label.areaFit.outline.length ? polygon : null,
      width: size.width,
      height: size.height,
      previous: areaLabelFitByKey.get(label.areaFit.key),
    });
    areaLabelFits.set(label.areaFit.key, fit);
    areaLabelFitByKey.set(label.areaFit.key, fit);
  });

  return areaLabelFits;
};

/** The inside text shows where the area's value fits; the outside pill shows where it does not. */
const applyAreaFitToVisibility = (
  label: RuntimePointLabelRenderModel,
  state: OverlayVisibilityState,
  areaLabelFits: ReadonlyMap<string, AreaLabelFit>
): OverlayVisibilityState => {
  if (!label.areaFit) {
    return state;
  }

  const areaFit = areaLabelFits.get(label.areaFit.key);
  if (label.areaFit.role === RUNTIME_AREA_LABEL_FIT_ROLE.INSIDE) {
    return areaFit?.fits && areaFit.position
      ? { ...state, screenPosition: areaFit.position }
      : { ...state, isHidden: true };
  }

  return areaFit?.fits ? { ...state, isHidden: true } : state;
};

const buildLayoutInput = (
  label: RuntimePointLabelRenderModel,
  index: number,
  anchor: CssPixelPosition
): LayoutPointInput => ({
  id: label.id,
  anchor,
  anchorKind: label.anchorKind,
  text: toLayoutText(label.content),
  compactText: toLayoutText(label.badgeContent, toLayoutText(label.content)),
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

/**
 * Visibility, layout placement and z-index of every point label for the
 * current frame. `areaLabelFitByKey` is updated in place (the fit memory).
 */
export const computePointLabelOverlayStates = ({
  engine,
  labels,
  liveAnchors,
  isInPreviewNodeLink,
  previousStatesById,
  isCameraMoving,
  areaLabelSizeById,
  areaLabelFitByKey,
}: {
  engine: AnnotationEngine | null;
  labels: readonly RuntimePointLabelRenderModel[];
  liveAnchors: LiveAnnotationAnchors;
  isInPreviewNodeLink?: (nodeId?: string) => boolean;
  previousStatesById: ReadonlyMap<string, PointLabelOverlayState>;
  isCameraMoving: boolean;
  areaLabelSizeById: ReadonlyMap<string, AreaLabelSize>;
  areaLabelFitByKey: Map<string, AreaLabelFit>;
}) => {
  const nextStatesById = new Map<string, PointLabelOverlayState>();

  if (!isValidAnnotationEngine(engine)) {
    return nextStatesById;
  }

  const isActiveMoveGizmoLabel = (label: RuntimePointLabelRenderModel) =>
    label.hideLabelAndStem !== true &&
    isInPreviewNodeLink?.(label.nodeId) === true;

  // Reuse occlusion verdicts while the camera moves and during live drags:
  // re-testing runs a pick-pass render per label per frame.
  const preserveOcclusion =
    (isCameraMoving && engine.capabilities.occlusionPerFrame !== true) ||
    liveAnchors.size > 0;
  // Keep the shared label field stable during active node editing so the
  // dragged label can float above its neighbors without re-laying them out.
  const freezeLayout =
    !preserveOcclusion && labels.some(isActiveMoveGizmoLabel);
  const cameraPitchRad = engine.getCameraPitchRad();
  const cameraPositionECEF = engine.getCameraPositionECEF(
    cameraPositionScratch
  );
  const areaLabelFits = resolveAreaLabelFits({
    engine,
    labels,
    areaLabelSizeById,
    areaLabelFitByKey,
  });

  const layoutInputs: LayoutPointInput[] = [];
  const baseStatesById = new Map<string, OverlayVisibilityState>();
  const overlayZIndexById = new Map<string, number>();
  const anchorECEFById = new Map<string, Vector3>();
  const activeMoveGizmoLabelIds = new Set<string>();

  labels.forEach((label, index) => {
    const isActiveMoveGizmo = isActiveMoveGizmoLabel(label);
    if (isActiveMoveGizmo) {
      activeMoveGizmoLabelIds.add(label.id);
    }

    const effectiveCoordinate = resolveLiveLabelCoordinate(
      resolveEffectivePointLabelCoordinateCandidate({ engine, label }),
      liveAnchors
    );
    const computedBaseState = computeOverlayVisibilityState({
      engine,
      coordinate: effectiveCoordinate,
      shouldTestOcclusion:
        !preserveOcclusion &&
        // an area value fades out where its area lies behind something
        (label.areaFit !== undefined ||
          shouldTestPointLabelOcclusion({
            anchorKind: label.anchorKind,
            occlusionMode: label.occlusionMode,
          })),
    });
    const occlusionAwareState = preserveOcclusion
      ? {
          ...computedBaseState,
          isOccluded: previousStatesById.get(label.id)?.isOccluded ?? false,
        }
      : computedBaseState;
    const baseState = applyAreaFitToVisibility(
      label,
      occlusionAwareState,
      areaLabelFits
    );
    const anchorECEF = ecefFromGeographicCoordinate(effectiveCoordinate);
    const cameraDistanceMeters = cameraPositionECEF
      ? cameraPositionECEF.distanceTo(anchorECEF)
      : Number.NaN;
    baseStatesById.set(label.id, baseState);
    anchorECEFById.set(label.id, anchorECEF);
    overlayZIndexById.set(
      label.id,
      isActiveMoveGizmo
        ? pointLabelVisualizerDefaults.activeMoveGizmoLabelZIndex
        : resolveRuntimeOverlayDistanceZIndex(cameraDistanceMeters)
    );

    if (
      !baseState.screenPosition ||
      baseState.isHidden ||
      label.hideLabelAndStem ||
      isActiveMoveGizmo ||
      (freezeLayout && previousStatesById.has(label.id))
    ) {
      return;
    }

    layoutInputs.push(buildLayoutInput(label, index, baseState.screenPosition));
  });

  const layoutResult =
    layoutInputs.length > 0
      ? computePointLabelLayout({
          points: layoutInputs,
          viewportWidth: Math.max(1, engine.canvas.clientWidth),
          viewportHeight: Math.max(1, engine.canvas.clientHeight),
          cameraPitch: typeof cameraPitchRad === "number" ? cameraPitchRad : 0,
          config: pointLabelVisualizerDefaults.layoutConfig,
        })
      : EMPTY_LAYOUT_RESULT;

  labels.forEach((label) => {
    const previousState = previousStatesById.get(label.id);
    const isActiveMoveGizmo = activeMoveGizmoLabelIds.has(label.id);
    const layoutPlacement = layoutResult.placements[label.id];
    const placement = isActiveMoveGizmo
      ? previousState
      : freezeLayout
      ? previousState ?? layoutPlacement
      : layoutPlacement;
    const hiddenByLayout =
      label.hideLabelAndStem || isActiveMoveGizmo
        ? false
        : freezeLayout
        ? previousState?.hiddenByLayout ??
          layoutResult.hiddenByLayout.has(label.id)
        : layoutResult.hiddenByLayout.has(label.id);

    nextStatesById.set(label.id, {
      ...(baseStatesById.get(label.id) ?? createEmptyLabelOverlayState()),
      hiddenByLayout,
      angleRad: (placement?.angleRad ??
        previousState?.angleRad ??
        0) as Radians,
      distance:
        placement?.distance ??
        previousState?.distance ??
        pointLabelVisualizerDefaults.layoutConfig.stemDistance,
      attach: placement?.attach ?? previousState?.attach ?? "center",
      zIndex: overlayZIndexById.get(label.id) ?? 0,
      anchorECEF: anchorECEFById.get(label.id),
    });
  });

  return nextStatesById;
};
