import {
  Children,
  Fragment,
  createElement,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  DEFAULT_PILL_LABEL_HEIGHT_EM,
  resolvePillLabelHeightPx,
} from "../core/pillConnectorGeometry";
import {
  POINT_LABEL_ATTACH,
  type PointLabelAttach,
} from "../core/pointLabelAttach";
import {
  buildOverlaySoftShadowBoxShadowCss,
  labelOverlayAffordanceDefaults,
} from "../overlayAffordanceDefaults";

export const POINT_LABEL_MARKER_BORDER_COLOR =
  labelOverlayAffordanceDefaults.colors.surfaceMax;

export const labelShellBaseStyles: CSSProperties = {
  padding: "2px 4px",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  userSelect: "none",
  pointerEvents: "none",
  margin: 0,
  backdropFilter: "blur(5px) brightness(0.9) saturate(1.04)",
  WebkitBackdropFilter: "blur(5px) brightness(0.9) saturate(1.04)",
};

export const nodeMarkerBaseStyles: CSSProperties = {
  position: "absolute",
  left: "0px",
  top: "0px",
  transform: "translate(-50%, -50%)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
  boxSizing: "border-box",
  borderRadius: "50%",
  fontVariantNumeric: "tabular-nums lining-nums",
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
  boxShadow: buildOverlaySoftShadowBoxShadowCss(),
};

/** False for nullish and whitespace-only string content. */
export const hasRenderableLabelContent = (node: ReactNode): boolean =>
  node !== null &&
  node !== undefined &&
  (typeof node !== "string" || node.trim().length > 0);

const FALLBACK_FONT_SIZE_PX = 12;

const parseFontSizePx = (fontSize: string): number => {
  const parsed = Number.parseFloat(fontSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_FONT_SIZE_PX;
};

export const resolvePointLabelPillLayoutMetrics = (fontSize: string) => {
  const labelHeightPx = resolvePillLabelHeightPx(
    parseFontSizePx(fontSize),
    DEFAULT_PILL_LABEL_HEIGHT_EM
  );

  return { labelHeightPx, capRadiusPx: labelHeightPx / 2 };
};

export const readPointLabelTransform = (
  labelAttach: PointLabelAttach,
  insetEm: number = 0
): string => {
  if (labelAttach === POINT_LABEL_ATTACH.RIGHT) {
    return insetEm === 0
      ? "translate(-100%, -50%)"
      : `translate(calc(-100% + ${insetEm}em), -50%)`;
  }

  if (labelAttach === POINT_LABEL_ATTACH.CENTER) {
    return "translate(-50%, -50%)";
  }

  return insetEm === 0
    ? "translate(0%, -50%)"
    : `translate(${-insetEm}em, -50%)`;
};

/** Removes the badge text from the start of the label text so the pill does not show it twice. */
export const stripLeadingBadgeFromText = (
  textValue: ReactNode,
  badgeTextValue: ReactNode
): ReactNode => {
  if (typeof badgeTextValue !== "string") return textValue;
  const normalizedBadge = badgeTextValue.trim();
  if (!normalizedBadge) return textValue;

  if (typeof textValue === "string") {
    const normalizedText = textValue.trimStart();
    if (normalizedText === normalizedBadge) return "";
    if (normalizedText.startsWith(`${normalizedBadge} `)) {
      return normalizedText.slice(normalizedBadge.length + 1);
    }
    return textValue;
  }

  const children = Children.toArray(textValue);
  if (children.length === 0) return textValue;

  const first = children[0];
  if (typeof first !== "string") return textValue;
  const trimmedFirst = first.trimStart();

  if (trimmedFirst === normalizedBadge) {
    const remainingChildren = children.slice(1);
    if (remainingChildren.length === 0) return "";
    if (typeof remainingChildren[0] === "string") {
      remainingChildren[0] = (remainingChildren[0] as string).replace(
        /^\s+/,
        ""
      );
    }
    return createElement(Fragment, null, ...remainingChildren);
  }

  if (trimmedFirst.startsWith(`${normalizedBadge} `)) {
    children[0] = trimmedFirst.slice(normalizedBadge.length + 1);
    return createElement(Fragment, null, ...children);
  }

  return textValue;
};
