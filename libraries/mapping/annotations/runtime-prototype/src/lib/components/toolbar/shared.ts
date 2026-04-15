import type { CSSProperties } from "react";

export const TOOL_BUTTON_SIZE_PX = 32;
export const ACTIVE_ACCENT_COLOR = "#1677ff";
export const INACTIVE_ICON_COLOR = "#4b5563";
export const LAYER_BUTTON_SHADOW =
  "0 1px 2px rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)";
export const INFOBOX_SURFACE_BG = "rgba(245, 245, 245, 0.8)";
export const INFOBOX_SURFACE_BLUR = "blur(2px)";
export const TOOLBOX_SURFACE_RADIUS_PX = 4;

export const toolButtonStyle = (
  isActive: boolean,
  disabled: boolean = false
): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: TOOL_BUTTON_SIZE_PX,
  height: TOOL_BUTTON_SIZE_PX,
  borderRadius: 8,
  border: isActive ? `1px solid rgba(22, 119, 255, 0.5)` : "1px solid #d1d5db",
  backgroundColor: isActive ? "#ffffff" : "#f9fafb",
  color: isActive ? ACTIVE_ACCENT_COLOR : INACTIVE_ICON_COLOR,
  cursor: disabled ? "not-allowed" : "pointer",
  boxShadow: isActive ? LAYER_BUTTON_SHADOW : "none",
  fontSize: 13,
  transition: "all 0.15s ease",
  flexShrink: 0,
  padding: 0,
  opacity: disabled ? 0.45 : 1,
});

export const optionsContainerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "nowrap",
  width: "max-content",
  maxWidth: "none",
  borderRadius: TOOLBOX_SURFACE_RADIUS_PX,
  backgroundColor: INFOBOX_SURFACE_BG,
  backdropFilter: INFOBOX_SURFACE_BLUR,
  WebkitBackdropFilter: INFOBOX_SURFACE_BLUR,
  padding: "4px 6px",
  boxSizing: "border-box",
};

export const optionsLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#4b5563",
  whiteSpace: "nowrap",
};

export const pointManualStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  fontSize: 10,
  color: "#6b7280",
  lineHeight: 1.3,
};

export const primaryToolbarSurfaceStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  gap: 6,
  alignItems: "center",
  flexWrap: "nowrap",
  padding: "4px 6px",
  borderRadius: TOOLBOX_SURFACE_RADIUS_PX,
  backgroundColor: INFOBOX_SURFACE_BG,
  backdropFilter: INFOBOX_SURFACE_BLUR,
  WebkitBackdropFilter: INFOBOX_SURFACE_BLUR,
  width: "max-content",
  maxWidth: "none",
  boxSizing: "border-box",
};
