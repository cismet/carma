import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import {
  ANNOTATION_OVERLAY_GROUP,
  resolveAnnotationOverlayContainer,
  type AnnotationOverlayGroup,
} from "./annotation-overlay-mount";

export const applyStyles = (
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
) => {
  Object.assign(element.style, styles);
};

export const createAnnotationOverlayLayer = (
  engine: AnnotationEngine,
  layerId: string,
  group: AnnotationOverlayGroup = ANNOTATION_OVERLAY_GROUP.LABEL
) => {
  const container = resolveAnnotationOverlayContainer(engine, group);
  if (!container) {
    return null;
  }

  const overlayLayer = document.createElement("div");
  overlayLayer.id = layerId;
  overlayLayer.dataset.annotationOverlayLayer = "true";
  applyStyles(overlayLayer, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
    userSelect: "none",
    webkitUserSelect: "none",
    zIndex: "auto",
  });
  container.appendChild(overlayLayer);
  return overlayLayer;
};

export const createAnnotationOverlayLayers = (
  engine: AnnotationEngine,
  layerIdByGroup: Partial<Record<AnnotationOverlayGroup, string>>
): Partial<Record<AnnotationOverlayGroup, HTMLDivElement | null>> =>
  Object.fromEntries(
    Object.entries(layerIdByGroup).map(([group, layerId]) => [
      group,
      layerId
        ? createAnnotationOverlayLayer(
            engine,
            layerId,
            group as AnnotationOverlayGroup
          )
        : null,
    ])
  ) as Partial<Record<AnnotationOverlayGroup, HTMLDivElement | null>>;

export const destroyAnnotationOverlayLayer = (
  overlayLayer: HTMLElement | null
) => {
  overlayLayer?.remove();
};
