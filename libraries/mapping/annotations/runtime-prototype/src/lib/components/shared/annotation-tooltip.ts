import type { TooltipProps } from "antd";

export const ANNOTATION_TOOLTIP_Z_INDEX = 2500;
const ANNOTATION_TOOLTIP_CONTAINER_ID = "carma-annotation-tooltip-container";

const ensureAnnotationTooltipContainer = (
  ownerDocument: Document
): HTMLElement => {
  const existing = ownerDocument.getElementById(
    ANNOTATION_TOOLTIP_CONTAINER_ID
  );
  if (existing) {
    return existing;
  }

  const container = ownerDocument.createElement("div");
  container.id = ANNOTATION_TOOLTIP_CONTAINER_ID;
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.style.zIndex = `${ANNOTATION_TOOLTIP_Z_INDEX}`;
  ownerDocument.body.appendChild(container);
  return container;
};

export const annotationTooltipProps: Pick<
  TooltipProps,
  "getPopupContainer" | "placement" | "zIndex"
> = {
  placement: "top",
  zIndex: ANNOTATION_TOOLTIP_Z_INDEX,
  getPopupContainer: (triggerNode) =>
    ensureAnnotationTooltipContainer(triggerNode?.ownerDocument ?? document),
};
