import type { CSSProperties } from "react";

const CONTROL_SURFACE_BACKGROUND = "#fff";
const CONTROL_FONT_FAMILY = "Helvetica Neue, Arial, Helvetica, sans-serif";
// Stack levels inside the ControlLayoutCanvas, which is sealed by
// `isolation: isolate` (see ControlLayoutCanvas.tsx). Because the canvas is its
// own stacking context, these numbers never leak out to the page (e.g. they
// cannot collide with geoportal's oblique overlay at z-index 1500) and only
// rank against each other AND against whatever the app renders as its map.
//
// They must therefore clear the internal z-index ceiling of the map library
// living inside the canvas. react-cismap (used by all topicmap apps) paints its
// own chrome at roughly 600-1000, so `mapControls` must sit ABOVE that, hence
// 1000/2000 rather than 1/2. Plain Cesium/Leaflet divs (geoportal) sit low and
// don't need it, but the high values are harmless there thanks to the isolation.
//
// Do NOT lower these back to 1/2: it silently re-buries the controls (gazetteer,
// zoom, info box) under react-cismap's UI in every topicmap app.
const CONTROL_CANVAS_STACK_LEVELS = {
  mapContent: 0,
  mapControls: 1000,
  secondaryViews: 2000,
} as const;

const controlMetrics = {
  edgeInset: "0.75rem",
  contentInsetLeft: "0.5625rem",
  headerInsetOffset: "0.25rem",
  controlGroupGap: "0.625rem",
  bottomControlsColumnGap: "0.0625rem",
  bottomControlsRowGap: "0.25rem",
  topControlsMaxHeightOffset: "8rem",
  topCenterInlineInset: "2rem",
  centerSurfacePaddingBlock: "0.3125rem",
  centerSurfacePaddingInline: "0.25rem",
  controlButtonSize: "34px",
  controlButtonBorderWidth: "2px",
  controlButtonGroupSeamBorderWidth: "1px",
  controlButtonBorderRadius: "0.25rem",
  controlButtonFontSize: "1.125rem",
  defaultFontSize: "0.75rem",
  topCenterFontSize: "0.875rem",
} as const;

const controlLayoutOptions = {
  mapContentZIndex: CONTROL_CANVAS_STACK_LEVELS.mapContent,
  controlLayerZIndex: CONTROL_CANVAS_STACK_LEVELS.mapControls,
  secondaryViewLayerZIndex: CONTROL_CANVAS_STACK_LEVELS.secondaryViews,
  defaultFontFamily: CONTROL_FONT_FAMILY,
  ...controlMetrics,
} as const;

const controlButtonOptions = {
  foregroundColor: "#111827",
  groupSeamBorderWidth: controlMetrics.controlButtonGroupSeamBorderWidth,
  root: {
    width: controlMetrics.controlButtonSize,
    height: controlMetrics.controlButtonSize,
    fontSize: controlMetrics.controlButtonFontSize,
    backgroundColor: CONTROL_SURFACE_BACKGROUND,
    border: `${controlMetrics.controlButtonBorderWidth} solid rgba(0, 0, 0, .3)`,
    borderRadius: controlMetrics.controlButtonBorderRadius,
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-evenly",
  },
  enabled: {
    cursor: "pointer",
    useVisualFilter: false,
    visualFilter: "",
    contentOpacity: 1,
  },
  disabled: {
    cursor: "not-allowed",
    useVisualFilter: true,
    visualFilter: "grayscale(100%) brightness(120%)",
    contentOpacity: 0.5,
  },
  content: {
    height: "auto",
    display: "flex",
    alignItems: "center",
  },
} as const;

const controlCenterOptions = {
  root: {
    backgroundColor: CONTROL_SURFACE_BACKGROUND,
    border: "none",
    opacity: 0.9,
    width: "100%",
    maxWidth: "100%",
    height: "100%",
    textAlign: "center",
    padding: `${controlMetrics.centerSurfacePaddingBlock} ${controlMetrics.centerSurfacePaddingInline}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-evenly",
  },
} as const;

const safeAreaInsets = {
  top: `max(${controlLayoutOptions.edgeInset}, env(safe-area-inset-top))`,
  bottom: `max(${controlLayoutOptions.edgeInset}, env(safe-area-inset-bottom))`,
  left: `max(${controlLayoutOptions.edgeInset}, env(safe-area-inset-left))`,
  right: `max(${controlLayoutOptions.edgeInset}, env(safe-area-inset-right))`,
} as const;

const topControlGroupStyle: CSSProperties = {
  position: "absolute",
  top: safeAreaInsets.top,
  display: "flex",
  gap: controlLayoutOptions.controlGroupGap,
  zIndex: controlLayoutOptions.controlLayerZIndex,
};

const bottomControlGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  pointerEvents: "auto",
  height: "100%",
  fontFamily: controlLayoutOptions.defaultFontFamily,
  fontSize: controlLayoutOptions.defaultFontSize,
};

const topCenterInlineInsetStyle = {
  left: `calc(${safeAreaInsets.left} + ${controlLayoutOptions.topCenterInlineInset})`,
  right: `calc(${safeAreaInsets.right} + ${controlLayoutOptions.topCenterInlineInset})`,
} as const;

const topSideControlGroupStyle: CSSProperties = {
  ...topControlGroupStyle,
  flexDirection: "column",
  flexWrap: "wrap",
  pointerEvents: "auto",
  maxHeight: `calc(100svh - ${controlLayoutOptions.topControlsMaxHeightOffset})`,
};

// The no-op `transform` is load-bearing: it makes this group its own containing
// block + stacking context, which isolates the dnd-kit coordinate math for the
// geoportal layer bar (rendered into this topcenter slot) from the sibling
// control groups. Without it, dragging a layer button to the far-right end made
// all buttons flicker/jump. The pre-existing left/right-anchored centering had
// no transform, which is what regressed it. Keep a transform here; the exact
// value is irrelevant as long as it is not `none`.
const topCenterControlGroupStyle: CSSProperties = {
  ...topControlGroupStyle,
  ...topCenterInlineInsetStyle,
  transform: "translateZ(0)",
  flexDirection: "row",
  fontSize: controlLayoutOptions.topCenterFontSize,
  zIndex: controlLayoutOptions.secondaryViewLayerZIndex,
  pointerEvents: "none",
};

const bottomContainerStyle: CSSProperties = {
  position: "absolute",
  bottom: safeAreaInsets.bottom,
  left: safeAreaInsets.left,
  right: safeAreaInsets.right,
  display: "flex",
  flexWrap: "wrap-reverse",
  pointerEvents: "none",
  zIndex: controlLayoutOptions.controlLayerZIndex,
  columnGap: controlLayoutOptions.bottomControlsColumnGap,
  rowGap: controlLayoutOptions.bottomControlsRowGap,
};

const controlRendererStyles = {
  topLeft: {
    ...topSideControlGroupStyle,
    left: safeAreaInsets.left,
  },
  topRight: {
    ...topSideControlGroupStyle,
    right: safeAreaInsets.right,
  },
  topCenter: topCenterControlGroupStyle,
  topCenterItem: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    pointerEvents: "none",
  },
  bottomContainer: bottomContainerStyle,
  bottomLeft: {
    ...bottomControlGroupStyle,
    alignItems: "flex-end",
  },
  /**
   * Centred on the map, not centred among its siblings.
   *
   * As a flex child of the bottom row it moved whenever a neighbour appeared or
   * grew — the infobox showing up in the bottom right slid the "centre" to the
   * left. Taking it out of the flow keeps it where the name promises, and the
   * left and right groups lay out as if it were not there.
   */
  bottomCenter: {
    ...bottomControlGroupStyle,
    alignItems: "center",
    // the group is as tall as the bottom row (`height: 100%`), and the row
    // grows with the tallest thing in it — the infobox. Without this the
    // content sits at the top of that stretched box and rides up as the infobox
    // appears; anchored to the end it stays on the bottom edge where it belongs
    justifyContent: "flex-end",
    position: "absolute",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
  },
  bottomRight: {
    ...bottomControlGroupStyle,
    alignItems: "flex-end",
    pointerEvents: "none",
  },
  bottomCenterItem: {
    width: "100%",
  },
} satisfies Record<string, CSSProperties>;

export const DEFAULT_CONTROL_STYLE_OPTIONS = {
  layout: controlLayoutOptions,
  button: controlButtonOptions,
  center: controlCenterOptions,
  renderer: controlRendererStyles,
} as const;
