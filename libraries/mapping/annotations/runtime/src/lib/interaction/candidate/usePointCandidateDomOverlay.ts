import { useEffect, useRef } from "react";

import {
  Cartesian3,
  SceneTransforms,
  defined,
  type Scene,
} from "@carma-cesium";
import { formatLengthMeters, LENGTH_UNIT_MODE } from "@carma-units";

const PREVIEW_ROOT_SELECTOR = '[data-annotation-cursor-root="true"]';
const PREVIEW_LAYER_ID = "annotation-candidate-preview-layer";
const PREVIEW_PILL_ID = "annotation-candidate-preview-pill";
const PREVIEW_STEM_ID = "annotation-candidate-preview-stem";
const PREVIEW_PILL_OFFSET_X_PX = 24;
const PREVIEW_PILL_OFFSET_Y_PX = -18;
const PREVIEW_STEM_THICKNESS_PX = 2;

const ELEVATION_NEUTRAL_THRESHOLD_METERS = 0.03;
const ELEVATION_GLYPH_UP = "↥";
const ELEVATION_GLYPH_DOWN = "↧";

const formatMeters = (value: number): string =>
  formatLengthMeters(value, {
    locale: "de-DE",
    unitMode: LENGTH_UNIT_MODE.METERS,
  });

const formatCandidateElevationText = (
  pointHeightMeters: number,
  referenceElevation: number,
  hasReferenceElevation: boolean
): string => {
  if (!hasReferenceElevation) {
    return formatMeters(pointHeightMeters);
  }

  const elevationDelta = pointHeightMeters - referenceElevation;
  const elevationText = formatMeters(elevationDelta);
  if (Math.abs(elevationDelta) < ELEVATION_NEUTRAL_THRESHOLD_METERS) {
    return elevationText;
  }

  return `${elevationText} ${
    elevationDelta > 0 ? ELEVATION_GLYPH_UP : ELEVATION_GLYPH_DOWN
  }`;
};

const applyStyles = (
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
) => {
  Object.assign(element.style, styles);
};

const resolvePreviewContainer = (scene: Scene) => {
  const explicitRoot = scene.canvas.closest(PREVIEW_ROOT_SELECTOR);
  if (explicitRoot instanceof HTMLElement) {
    return explicitRoot;
  }

  const widgetContainer = scene.canvas.parentElement?.parentElement;
  if (widgetContainer instanceof HTMLElement) {
    return widgetContainer;
  }

  return scene.canvas.parentElement;
};

const createPreviewPill = () => {
  const element = document.createElement("div");
  element.id = PREVIEW_PILL_ID;
  applyStyles(element, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    padding: "4px 9px",
    borderRadius: "999px",
    border: "1px solid rgba(255, 255, 255, 0.82)",
    background:
      "linear-gradient(180deg, rgba(24, 27, 33, 0.96), rgba(9, 11, 15, 0.96))",
    color: "rgba(255, 255, 255, 0.98)",
    fontSize: "12px",
    fontWeight: "600",
    lineHeight: "1",
    whiteSpace: "nowrap",
    transform: "translate(-100%, -50%)",
    boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.22), 0 4px 14px rgba(0, 0, 0, 0.36)",
    pointerEvents: "none",
    willChange: "transform",
  });
  return element;
};

const createPreviewStem = () => {
  const element = document.createElement("div");
  element.id = PREVIEW_STEM_ID;
  applyStyles(element, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    height: `${PREVIEW_STEM_THICKNESS_PX}px`,
    transformOrigin: "0 50%",
    background:
      "repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.92) 0 5px, rgba(255, 255, 255, 0.18) 5px 10px)",
    borderRadius: `${PREVIEW_STEM_THICKNESS_PX}px`,
    pointerEvents: "none",
    willChange: "transform,width",
  });
  return element;
};

const hidePreviewElements = (...elements: HTMLElement[]) => {
  elements.forEach((element) => {
    element.style.display = "none";
  });
};

export type PointCandidateDomOverlayOptions = {
  labelLayoutConfig?: unknown;
  renderDomVisuals?: boolean;
};

export type PointCandidateDomOverlayCandidate = {
  pointECEF?: Cartesian3 | null;
  verticalOffsetAnchorECEF?: Cartesian3 | null;
  previewDistanceMeters?: number;
  referenceElevation?: number;
  hasReferenceElevation?: boolean;
  suppressLabelOverlay?: boolean;
} | null;

export const usePointCandidateDomOverlay = (
  scene: Scene | null,
  candidate: PointCandidateDomOverlayCandidate = null,
  {
    labelLayoutConfig: _labelLayoutConfig,
    renderDomVisuals = true,
  }: PointCandidateDomOverlayOptions = {}
) => {
  const candidatePointRef = useRef<Cartesian3 | null>(null);
  const candidateVerticalOffsetAnchorRef = useRef<Cartesian3 | null>(null);
  const previewDistanceMetersRef = useRef<number | undefined>(undefined);
  const referenceElevationRef = useRef(0);
  const hasReferenceElevationRef = useRef(false);
  const suppressLabelOverlayRef = useRef(false);
  const renderDomVisualsRef = useRef(renderDomVisuals);

  candidatePointRef.current = candidate?.pointECEF ?? null;
  candidateVerticalOffsetAnchorRef.current =
    candidate?.verticalOffsetAnchorECEF ?? null;
  previewDistanceMetersRef.current = candidate?.previewDistanceMeters;
  referenceElevationRef.current = candidate?.referenceElevation ?? 0;
  hasReferenceElevationRef.current = candidate?.hasReferenceElevation ?? false;
  suppressLabelOverlayRef.current = candidate?.suppressLabelOverlay ?? false;
  renderDomVisualsRef.current = renderDomVisuals;

  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
      return;
    }

    const container = resolvePreviewContainer(scene);
    if (!container) {
      return;
    }

    const previewLayer = document.createElement("div");
    previewLayer.id = PREVIEW_LAYER_ID;
    applyStyles(previewLayer, {
      position: "absolute",
      inset: "0",
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: "1650",
    });

    const previewPill = createPreviewPill();
    const previewStem = createPreviewStem();
    previewLayer.append(previewStem, previewPill);
    container.appendChild(previewLayer);

    const syncPreviewOverlay = () => {
      if (!renderDomVisualsRef.current || suppressLabelOverlayRef.current) {
        hidePreviewElements(previewPill, previewStem);
        return;
      }

      const pointECEF = candidatePointRef.current;
      if (!pointECEF) {
        hidePreviewElements(previewPill, previewStem);
        return;
      }

      const pointScreenPosition = SceneTransforms.worldToWindowCoordinates(
        scene,
        pointECEF
      );
      if (!defined(pointScreenPosition)) {
        hidePreviewElements(previewPill, previewStem);
        return;
      }

      const previewDistanceMeters = previewDistanceMetersRef.current;
      const pointCartographic =
        scene.globe.ellipsoid.cartesianToCartographic(pointECEF);
      const pointHeightMeters = pointCartographic?.height ?? 0;
      previewPill.textContent =
        previewDistanceMeters !== undefined
          ? formatMeters(previewDistanceMeters)
          : formatCandidateElevationText(
              pointHeightMeters,
              referenceElevationRef.current,
              hasReferenceElevationRef.current
            );

      previewPill.style.display = "block";
      previewPill.style.transform = `translate(${Math.round(
        pointScreenPosition.x - PREVIEW_PILL_OFFSET_X_PX
      )}px, ${Math.round(
        pointScreenPosition.y + PREVIEW_PILL_OFFSET_Y_PX
      )}px) translate(-100%, -50%)`;

      const anchorECEF = candidateVerticalOffsetAnchorRef.current;
      if (!anchorECEF) {
        previewStem.style.display = "none";
        return;
      }

      const anchorScreenPosition = SceneTransforms.worldToWindowCoordinates(
        scene,
        anchorECEF
      );
      if (!defined(anchorScreenPosition)) {
        previewStem.style.display = "none";
        return;
      }

      const deltaX = pointScreenPosition.x - anchorScreenPosition.x;
      const deltaY = pointScreenPosition.y - anchorScreenPosition.y;
      const distancePx = Math.hypot(deltaX, deltaY);
      if (!Number.isFinite(distancePx) || distancePx < 1) {
        previewStem.style.display = "none";
        return;
      }

      previewStem.style.display = "block";
      previewStem.style.width = `${distancePx}px`;
      previewStem.style.transform = `translate(${Math.round(
        anchorScreenPosition.x
      )}px, ${Math.round(anchorScreenPosition.y)}px) rotate(${Math.atan2(
        deltaY,
        deltaX
      )}rad)`;
    };

    const removePreRenderListener =
      scene.preRender.addEventListener(syncPreviewOverlay);
    syncPreviewOverlay();

    return () => {
      removePreRenderListener?.();
      previewLayer.remove();
    };
  }, [scene]);
};
