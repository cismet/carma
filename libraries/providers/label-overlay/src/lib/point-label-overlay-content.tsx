import { PointLabel } from "./components/PointLabel";
import { getOverlayReferenceSignature } from "./overlayReferenceSignature";
import type { PointLabelOverlayRenderState } from "./point-label-overlay-state";

const isInlineTextOverlayContent = (value: unknown): value is string | number =>
  typeof value === "string" || typeof value === "number";

const getInlineTextOverlayContentSignature = (value: unknown) =>
  isInlineTextOverlayContent(value)
    ? `inline-text:${String(value).trim().length > 0 ? "1" : "0"}`
    : getOverlayReferenceSignature(value);

/** Writes inline text straight into the DOM node so text-only changes need no React render. */
export const syncInlineTextOverlayContent = (
  element: HTMLElement | null,
  value: unknown
) => {
  if (!element || !isInlineTextOverlayContent(value)) {
    return;
  }

  const nextTextContent = String(value);
  if (element.textContent !== nextTextContent) {
    element.textContent = nextTextContent;
  }
};

export const resolveEffectiveBadgeContent = (
  state: Pick<
    PointLabelOverlayRenderState,
    "badgeContent" | "content" | "hideMarker"
  >
) =>
  state.hideMarker ? state.badgeContent : state.badgeContent ?? state.content;

/** Changes whenever the rendered React content (not just inline text) must be rebuilt. */
export const getPointLabelOverlayContentSignature = (
  state: PointLabelOverlayRenderState
) => {
  const effectiveBadgeContent = resolveEffectiveBadgeContent(state);

  return [
    state.pointId ?? "",
    `${state.selected ?? false}`,
    `${state.hideMarker ?? false}`,
    `${state.hideLabelAndStem ?? false}`,
    `${state.markerSize ?? ""}`,
    `${state.markerStrokeWidth ?? ""}`,
    `${state.stemStartDistance ?? ""}`,
    `${state.textBackgroundColor ?? ""}`,
    `${state.textColor ?? ""}`,
    `${state.markerBackgroundColor ?? ""}`,
    `${state.markerTextColor ?? ""}`,
    `${state.lineColor ?? ""}`,
    `${state.labelStyle ?? ""}`,
    `${state.collapse ?? false}`,
    `${state.selectedBackgroundColor ?? ""}`,
    `${state.selectedTextColor ?? ""}`,
    `${state.selectedGlowColor ?? ""}`,
    `${state.selectedGlowRadiusPx ?? ""}`,
    `${state.preserveFillOnSelection ?? false}`,
    `${state.hoverBackgroundColor ?? ""}`,
    `${state.textShadow ?? ""}`,
    `${state.fontSize ?? ""}`,
    `${state.fontFamily ?? ""}`,
    `${state.fontWeight ?? ""}`,
    `${state.mixBlendMode ?? ""}`,
    `${state.longPressDurationMs ?? ""}`,
    `${state.markerOnlyPointerEvents ?? false}`,
    `${state.longPressOnlyOnMarker ?? false}`,
    `${state.renderHiddenMarkerInteractionTarget ?? false}`,
    getInlineTextOverlayContentSignature(state.content),
    getInlineTextOverlayContentSignature(effectiveBadgeContent),
    getOverlayReferenceSignature(state.onClick),
    getOverlayReferenceSignature(state.onDoubleClick),
    getOverlayReferenceSignature(state.onHoverChange),
    getOverlayReferenceSignature(state.onLongPress),
  ].join(":");
};

export const renderPointLabelOverlayContent = (
  state: PointLabelOverlayRenderState
) => (
  <PointLabel
    pointId={state.pointId}
    content={state.content}
    selected={state.selected}
    hideLabelAndStem={state.hideLabelAndStem}
    hideMarker={state.hideMarker ?? false}
    markerSize={state.markerSize}
    markerStrokeWidth={state.markerStrokeWidth}
    stemStartDistance={state.stemStartDistance}
    badgeContent={resolveEffectiveBadgeContent(state)}
    markerBackgroundColor={state.markerBackgroundColor}
    markerTextColor={state.markerTextColor}
    mixBlendMode={state.mixBlendMode}
    lineColor={state.lineColor}
    labelStyle={state.labelStyle}
    collapse={state.collapse}
    textBackgroundColor={state.textBackgroundColor}
    textColor={state.textColor}
    selectedBackgroundColor={state.selectedBackgroundColor}
    selectedTextColor={state.selectedTextColor}
    selectedGlowColor={state.selectedGlowColor}
    selectedGlowRadiusPx={state.selectedGlowRadiusPx}
    preserveFillOnSelection={state.preserveFillOnSelection}
    hoverBackgroundColor={state.hoverBackgroundColor}
    textShadow={state.textShadow}
    fontSize={state.fontSize}
    fontFamily={state.fontFamily}
    fontWeight={state.fontWeight}
    markerCursor={state.markerCursor}
    labelCursor={state.labelCursor}
    onClick={state.onClick}
    onDoubleClick={state.onDoubleClick}
    onHoverChange={state.onHoverChange}
    onLongPress={state.onLongPress}
    markerOnlyPointerEvents={state.markerOnlyPointerEvents}
    longPressDurationMs={state.longPressDurationMs}
    longPressOnlyOnMarker={state.longPressOnlyOnMarker}
    renderHiddenMarkerInteractionTarget={
      state.renderHiddenMarkerInteractionTarget
    }
    isOccluded={state.isOccluded}
    labelAngleRad={state.angleRad}
    labelDistance={state.distance}
    labelAttach={state.attach}
  />
);
