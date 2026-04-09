import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { Meta, StoryObj } from "@storybook/react";
import { useArgs } from "@storybook/preview-api";
import {
  ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX,
  ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX,
  ResponsiveStatusBar,
} from "@carma-commons/ui/components";
import {
  CROSSHAIR_CURSOR_STYLES,
  type CrosshairCursorStyle,
} from "@carma-mapping/annotations/runtime-v2";

import { createCursorRateDiagnosticsController } from "./create-cursor-rate-diagnostics-controller";
import {
  CursorOverlayGeometryLayers,
  CURSOR_RENDER_MODES,
  type CursorRenderMode,
} from "./cursor-story-shared";

const NATIVE_CURSOR_STYLE_OPTIONS = [
  "auto",
  "default",
  "none",
  "help",
  "pointer",
  "wait",
  "cell",
  "crosshair",
  "text",
  "vertical-text",
  "alias",
  "copy",
  "move",
  "not-allowed",
  "grab",
  "grabbing",
  "e-resize",
  "n-resize",
  "ne-resize",
  "nw-resize",
  "s-resize",
  "se-resize",
  "sw-resize",
  "w-resize",
  "ew-resize",
  "ns-resize",
  "nesw-resize",
  "nwse-resize",
  "col-resize",
  "row-resize",
  "zoom-in",
  "zoom-out",
] as const;

type NativeCursorStyle = (typeof NATIVE_CURSOR_STYLE_OPTIONS)[number];

type CursorRateDiagnosticsStoryProps = {
  showTopGraphPlotting: boolean;
  showCustomCursorPreset: boolean;
  customCursorRenderMode: CursorRenderMode;
  customCursorStyle: CrosshairCursorStyle;
  hideNativeCursor: boolean;
  nativeCursorStyle: NativeCursorStyle;
  showPointerMove: boolean;
  showPointerRawUpdate: boolean;
  showCoalesced: boolean;
  showDistinctPosition: boolean;
  showPaintedPosition: boolean;
  showMouseMove: boolean;
  showAnimationFrame: boolean;
  showTouchMove: boolean;
  showTouchStart: boolean;
  showTouchEnd: boolean;
  showTouchForceChange: boolean;
};

type CursorRateDiagnosticsSandboxProps = CursorRateDiagnosticsStoryProps & {
  onNativeCursorStyleCommit?: (cursorStyle: NativeCursorStyle) => void;
};

const NATIVE_CURSOR_STYLE_TOKENS: Record<NativeCursorStyle, string> = {
  auto: "A",
  default: "↖",
  none: "Ø",
  help: "?",
  pointer: "☞",
  wait: "…",
  cell: "+",
  crosshair: "✚",
  text: "I",
  "vertical-text": "I|",
  alias: "↗",
  copy: "C+",
  move: "✥",
  "not-allowed": "⊘",
  grab: "G",
  grabbing: "g",
  "e-resize": "E",
  "n-resize": "N",
  "ne-resize": "NE",
  "nw-resize": "NW",
  "s-resize": "S",
  "se-resize": "SE",
  "sw-resize": "SW",
  "w-resize": "W",
  "ew-resize": "EW",
  "ns-resize": "NS",
  "nesw-resize": "/",
  "nwse-resize": "\\",
  "col-resize": "||",
  "row-resize": "=",
  "zoom-in": "+",
  "zoom-out": "-",
};

const SURFACE_STYLE = {
  position: "relative" as const,
  width: "100%",
  height: "100vh",
  background: "#f8fafc",
  userSelect: "none" as const,
  overflow: "hidden" as const,
};

const STATUS_BAR_HEIGHT_PX = 24;

const CHART_STYLE = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: STATUS_BAR_HEIGHT_PX,
  bottom: 0,
};

const STATUS_BAR_STYLE: CSSProperties = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  pointerEvents: "none" as const,
  zIndex: 2,
};

const ROW_LABELS_STYLE = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: STATUS_BAR_HEIGHT_PX,
  bottom: 0,
  pointerEvents: "none" as const,
  zIndex: 2,
};

const NATIVE_CURSOR_GRID_PANEL_STYLE: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  height: "33vh",
  zIndex: 3,
  pointerEvents: "none",
  padding: "8px",
  display: "flex",
  alignItems: "flex-end",
};

const NATIVE_CURSOR_GRID_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
  gridTemplateRows: "repeat(4, minmax(0, 1fr))",
  gap: "6px",
  background: "rgba(255, 255, 255, 0.86)",
  border: "1px solid rgba(15, 23, 42, 0.2)",
  borderRadius: "8px",
  padding: "8px",
  pointerEvents: "auto",
};

const NATIVE_CURSOR_CELL_STYLE: CSSProperties = {
  border: "1px solid rgba(15, 23, 42, 0.22)",
  borderRadius: "6px",
  background: "rgba(255, 255, 255, 0.96)",
  color: "#0f172a",
  font: "600 10px/1.1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  textAlign: "left",
  padding: "6px 8px",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "4px",
};

const NATIVE_CURSOR_CELL_ACTIVE_STYLE: CSSProperties = {
  borderColor: "#1d4ed8",
  boxShadow: "inset 0 0 0 1px #1d4ed8",
  background: "#eff6ff",
};

const NATIVE_CURSOR_PREVIEW_STYLE: CSSProperties = {
  width: "24px",
  height: "16px",
  border: "1px solid rgba(15, 23, 42, 0.22)",
  borderRadius: "3px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  font: "700 9px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  color: "#0f172a",
  background: "rgba(255,255,255,0.98)",
};

const NATIVE_CURSOR_NAME_STYLE: CSSProperties = {
  font: "600 9px/1.1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  color: "#0f172a",
  whiteSpace: "normal",
  wordBreak: "break-word",
};

const DOM_CURSOR_OVERLAY_SIZE_PX =
  (ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX +
    ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX) *
  2;

const DOM_CURSOR_OVERLAY_STYLE = (
  position: Readonly<{ x: number; y: number }>
): CSSProperties => ({
  position: "absolute",
  left: `${position.x}px`,
  top: `${position.y}px`,
  width: DOM_CURSOR_OVERLAY_SIZE_PX,
  height: DOM_CURSOR_OVERLAY_SIZE_PX,
  transform: "translate(-50%, -50%)",
  pointerEvents: "none",
  zIndex: 4,
});

const CursorRateDiagnosticsSandbox = ({
  showTopGraphPlotting,
  showCustomCursorPreset,
  customCursorRenderMode,
  customCursorStyle,
  hideNativeCursor,
  nativeCursorStyle,
  showPointerMove,
  showPointerRawUpdate,
  showCoalesced,
  showDistinctPosition,
  showPaintedPosition,
  showMouseMove,
  showAnimationFrame,
  showTouchMove,
  showTouchStart,
  showTouchEnd,
  showTouchForceChange,
  onNativeCursorStyleCommit,
}: CursorRateDiagnosticsSandboxProps) => {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const rowLabelsRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<HTMLSpanElement | null>(null);
  const rawSupportRef = useRef<HTMLSpanElement | null>(null);
  const maxRateRef = useRef<HTMLSpanElement | null>(null);
  const controllerRef = useRef<ReturnType<
    typeof createCursorRateDiagnosticsController
  > | null>(null);
  const [hoveredNativeCursorStyle, setHoveredNativeCursorStyle] = useState<
    CursorRateDiagnosticsStoryProps["nativeCursorStyle"] | null
  >(null);
  const [domCursorPosition, setDomCursorPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const effectiveNativeCursorStyle =
    hoveredNativeCursorStyle ?? nativeCursorStyle;
  const showDomCursorOverlay =
    showCustomCursorPreset &&
    customCursorRenderMode === CURSOR_RENDER_MODES.DOM &&
    domCursorPosition !== null;

  const statusValues = useMemo(
    () => [
      <span key="position" ref={positionRef}>
        position idle
      </span>,
      <span key="raw-support" ref={rawSupportRef} />,
      <span key="max-rate" ref={maxRateRef} />,
    ],
    []
  );

  useEffect(() => {
    if (
      hideNativeCursor ||
      (showCustomCursorPreset &&
        customCursorRenderMode === CURSOR_RENDER_MODES.CURSOR_URL)
    ) {
      setHoveredNativeCursorStyle(null);
    }
  }, [customCursorRenderMode, hideNativeCursor, showCustomCursorPreset]);

  useEffect(() => {
    const surfaceElement = surfaceRef.current;
    if (!surfaceElement) {
      return;
    }

    if (hideNativeCursor || showCustomCursorPreset) {
      return;
    }

    surfaceElement.style.cursor = hoveredNativeCursorStyle ?? nativeCursorStyle;
  }, [
    hoveredNativeCursorStyle,
    hideNativeCursor,
    showCustomCursorPreset,
    nativeCursorStyle,
  ]);

  useEffect(() => {
    if (
      !showCustomCursorPreset ||
      customCursorRenderMode !== CURSOR_RENDER_MODES.DOM
    ) {
      setDomCursorPosition(null);
    }
  }, [customCursorRenderMode, showCustomCursorPreset]);

  useEffect(() => {
    if (!surfaceRef.current || !chartRef.current) {
      return;
    }

    controllerRef.current = createCursorRateDiagnosticsController({
      surfaceElement: surfaceRef.current,
      chartElement: chartRef.current,
      rowLabelsElement: rowLabelsRef.current,
      positionElement: positionRef.current,
      rawSupportElement: rawSupportRef.current,
      maxRateElement: maxRateRef.current,
      options: {
        showTopGraphPlotting,
        showCustomCursorPreset,
        customCursorRenderMode,
        customCursorStyle,
        hideNativeCursor,
        nativeCursorStyle,
        showPointerMove,
        showPointerRawUpdate,
        showCoalesced,
        showDistinctPosition,
        showPaintedPosition,
        showMouseMove,
        showAnimationFrame,
        showTouchMove,
        showTouchStart,
        showTouchEnd,
        showTouchForceChange,
      },
    });

    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.updateOptions({
      showTopGraphPlotting,
      showCustomCursorPreset,
      customCursorRenderMode,
      customCursorStyle,
      hideNativeCursor,
      nativeCursorStyle,
      showPointerMove,
      showPointerRawUpdate,
      showCoalesced,
      showDistinctPosition,
      showPaintedPosition,
      showMouseMove,
      showAnimationFrame,
      showTouchMove,
      showTouchStart,
      showTouchEnd,
      showTouchForceChange,
    });
  }, [
    showTopGraphPlotting,
    showCustomCursorPreset,
    customCursorRenderMode,
    customCursorStyle,
    nativeCursorStyle,
    hideNativeCursor,
    showAnimationFrame,
    showCoalesced,
    showDistinctPosition,
    showMouseMove,
    showPaintedPosition,
    showPointerMove,
    showPointerRawUpdate,
    showTouchMove,
    showTouchStart,
    showTouchEnd,
    showTouchForceChange,
  ]);

  const handleSurfacePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (
      !showCustomCursorPreset ||
      customCursorRenderMode !== CURSOR_RENDER_MODES.DOM
    ) {
      return;
    }

    const surfaceElement = surfaceRef.current;
    if (!surfaceElement) {
      return;
    }

    const rect = surfaceElement.getBoundingClientRect();
    setDomCursorPosition({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  const handleSurfacePointerLeave = () => {
    setDomCursorPosition(null);
  };

  return (
    <div
      ref={surfaceRef}
      style={SURFACE_STYLE}
      onPointerMove={handleSurfacePointerMove}
      onPointerLeave={handleSurfacePointerLeave}
    >
      <div style={STATUS_BAR_STYLE}>
        <ResponsiveStatusBar
          label="cursor diagnostics"
          values={statusValues}
          tone="dark"
        />
      </div>
      <div ref={chartRef} style={CHART_STYLE} />
      <div ref={rowLabelsRef} style={ROW_LABELS_STYLE} />
      {showDomCursorOverlay ? (
        <div
          aria-hidden="true"
          style={DOM_CURSOR_OVERLAY_STYLE(domCursorPosition)}
        >
          <CursorOverlayGeometryLayers />
        </div>
      ) : null}
      {!hideNativeCursor ? (
        <div style={NATIVE_CURSOR_GRID_PANEL_STYLE}>
          <div style={NATIVE_CURSOR_GRID_STYLE}>
            {NATIVE_CURSOR_STYLE_OPTIONS.map((cursorStyle) => {
              const isActive = cursorStyle === effectiveNativeCursorStyle;
              return (
                <button
                  key={cursorStyle}
                  type="button"
                  style={{
                    ...NATIVE_CURSOR_CELL_STYLE,
                    ...(isActive ? NATIVE_CURSOR_CELL_ACTIVE_STYLE : null),
                    cursor: cursorStyle,
                  }}
                  onMouseEnter={() => setHoveredNativeCursorStyle(cursorStyle)}
                  onMouseLeave={() => setHoveredNativeCursorStyle(null)}
                  onFocus={() => setHoveredNativeCursorStyle(cursorStyle)}
                  onBlur={() => setHoveredNativeCursorStyle(null)}
                  onClick={() => onNativeCursorStyleCommit?.(cursorStyle)}
                  title={cursorStyle}
                  aria-label={cursorStyle}
                >
                  <span style={NATIVE_CURSOR_PREVIEW_STYLE}>
                    {NATIVE_CURSOR_STYLE_TOKENS[cursorStyle]}
                  </span>
                  <span style={NATIVE_CURSOR_NAME_STYLE}>{cursorStyle}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const meta: Meta<CursorRateDiagnosticsStoryProps> = {
  title: "Annotations/Cursor Diagnostics",
  component: CursorRateDiagnosticsSandbox,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    showTopGraphPlotting: {
      control: { type: "boolean" },
      table: { category: "Plot" },
    },
    showCustomCursorPreset: {
      control: { type: "boolean" },
      table: { category: "Cursor" },
    },
    customCursorRenderMode: {
      control: { type: "inline-radio" },
      options: [CURSOR_RENDER_MODES.DOM, CURSOR_RENDER_MODES.CURSOR_URL],
      table: { category: "Cursor" },
    },
    customCursorStyle: {
      control: false,
      table: { category: "Cursor" },
    },
    hideNativeCursor: {
      control: { type: "boolean" },
      table: { category: "Cursor" },
    },
    nativeCursorStyle: {
      control: false,
      table: { category: "Cursor" },
    },
    showPointerMove: {
      control: { type: "boolean" },
      table: { category: "Pointer" },
    },
    showPointerRawUpdate: {
      control: { type: "boolean" },
      table: { category: "Pointer" },
    },
    showDistinctPosition: {
      control: { type: "boolean" },
      table: { category: "Pointer" },
    },
    showPaintedPosition: {
      control: { type: "boolean" },
      table: { category: "Pointer" },
    },
    showMouseMove: {
      control: { type: "boolean" },
      table: { category: "Mouse" },
    },
    showAnimationFrame: {
      control: { type: "boolean" },
      table: { category: "Plot" },
    },
    showTouchMove: {
      control: { type: "boolean" },
      table: { category: "Touch" },
    },
    showTouchStart: {
      control: { type: "boolean" },
      table: { category: "Touch" },
    },
    showTouchEnd: {
      control: { type: "boolean" },
      table: { category: "Touch" },
    },
    showTouchForceChange: {
      control: { type: "boolean" },
      table: { category: "Touch" },
    },
    showCoalesced: {
      control: { type: "boolean" },
      table: { category: "Pointer" },
    },
  },
};

export default meta;

export const Diagnostics: StoryObj<CursorRateDiagnosticsStoryProps> = {
  render: (args) => {
    const [, updateArgs] = useArgs<CursorRateDiagnosticsStoryProps>();
    return (
      <CursorRateDiagnosticsSandbox
        {...args}
        onNativeCursorStyleCommit={(cursorStyle) => {
          updateArgs({ nativeCursorStyle: cursorStyle });
        }}
      />
    );
  },
  args: {
    showTopGraphPlotting: true,
    showCustomCursorPreset: false,
    customCursorRenderMode: CURSOR_RENDER_MODES.CURSOR_URL,
    customCursorStyle: CROSSHAIR_CURSOR_STYLES.ANNOTATION_PLAYGROUND,
    hideNativeCursor: false,
    nativeCursorStyle: "crosshair",
    showPointerMove: true,
    showPointerRawUpdate: true,
    showCoalesced: true,
    showDistinctPosition: true,
    showPaintedPosition: true,
    showMouseMove: true,
    showAnimationFrame: true,
    showTouchMove: true,
    showTouchStart: true,
    showTouchEnd: true,
    showTouchForceChange: true,
  },
};
