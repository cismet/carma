import { useMemo, type CSSProperties } from "react";

import type { Meta, StoryObj } from "@storybook/react";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  buildCrosshairCursorDataUrl,
  CROSSHAIR_CURSOR_DESIGN_SIZE_SERIES_PX,
  CROSSHAIR_CURSOR_STYLES,
  resolveCrosshairCursorRasterMetrics,
  type CrosshairCursorStyle,
} from "@carma-mapping/annotations/runtime-v2";

type CursorDesignStoryProps = {
  style: CrosshairCursorStyle;
  primaryColor: string;
  secondaryColor: string;
  animateFigureEight: boolean;
  figureEightDurationMs: number;
  figureEightRadiusPx: number;
};

const FIGURE_EIGHT_KEYFRAMES = `
@keyframes cursor-figure-eight {
  0%, 50%, 100% { transform: translate(-50%, -50%) translate(0px, 0px); }
  12.5% { transform: translate(-50%, -50%) translate(var(--fx), var(--fy)); }
  25% { transform: translate(-50%, -50%) translate(calc(var(--fx) * 2), 0px); }
  37.5% { transform: translate(-50%, -50%) translate(var(--fx), calc(var(--fy) * -1)); }
  62.5% { transform: translate(-50%, -50%) translate(calc(var(--fx) * -1), var(--fy)); }
  75% { transform: translate(-50%, -50%) translate(calc(var(--fx) * -2), 0px); }
  87.5% { transform: translate(-50%, -50%) translate(calc(var(--fx) * -1), calc(var(--fy) * -1)); }
}
`;

const PAGE_STYLE: CSSProperties = {
  minHeight: "100vh",
  background:
    "linear-gradient(180deg, #e2e8f0 0%, #f8fafc 22%, #e5e7eb 100%)",
};

const STATUS_BAR_STYLE: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 12,
  padding: 12,
  minHeight: "calc(100vh - 24px)",
  boxSizing: "border-box",
};

const CARD_STYLE: CSSProperties = {
  position: "relative",
  minHeight: 360,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const CARD_LABEL_STYLE: CSSProperties = {
  position: "absolute",
  top: 10,
  left: 10,
  zIndex: 2,
  font: '600 12px/1.2 "IBM Plex Sans", "Segoe UI", sans-serif',
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#0f172a",
  textShadow:
    "0 0 2px rgba(255,255,255,0.95), 0 0 8px rgba(255,255,255,0.85)",
};

const PREVIEW_ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  alignItems: "stretch",
  gap: 8,
  padding: "36px 12px 12px",
  flex: 1,
};

const PREVIEW_CELL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: 280,
  gap: 12,
};

const SCALE_LABEL_STYLE: CSSProperties = {
  font: '600 11px/1 "IBM Plex Mono", "SFMono-Regular", monospace',
  letterSpacing: "0.04em",
  color: "#0f172a",
  background: "rgba(255,255,255,0.7)",
  padding: "4px 6px",
};

const PREVIEW_STACK_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "space-evenly",
  flex: 1,
  width: "100%",
};

const TRACK_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  flex: 1,
  minHeight: 56,
};

const createCardBackgrounds = (): Array<{
  id: string;
  label: string;
  style: CSSProperties;
}> => [
  {
    id: "grayscale-ramp",
    label: "Greyscale Ramp",
    style: {
      background:
        "linear-gradient(180deg, #020617 0%, #334155 18%, #94a3b8 45%, #e2e8f0 72%, #ffffff 100%)",
    },
  },
  {
    id: "half-checkerboard",
    label: "Half Checkerboard",
    style: {
      backgroundImage: [
        "linear-gradient(180deg, rgba(248,250,252,0) 0 50%, rgba(15,23,42,0.08) 50% 100%)",
        "linear-gradient(45deg, rgba(15,23,42,0.16) 25%, transparent 25%, transparent 75%, rgba(15,23,42,0.16) 75%)",
        "linear-gradient(45deg, rgba(15,23,42,0.16) 25%, transparent 25%, transparent 75%, rgba(15,23,42,0.16) 75%)",
        "linear-gradient(90deg, #ffffff 0%, #cbd5e1 100%)",
      ].join(","),
      backgroundSize: "100% 100%, 24px 24px, 24px 24px, 100% 100%",
      backgroundPosition: "0 0, 0 0, 12px 12px, 0 0",
    },
  },
  {
    id: "soft-paper",
    label: "Soft Paper",
    style: {
      background:
        "radial-gradient(circle at 18% 16%, rgba(255,255,255,0.95), rgba(255,255,255,0) 28%), linear-gradient(225deg, #f7efe0 0%, #e7d8bb 52%, #cbb28b 100%)",
    },
  },
  {
    id: "night-panel",
    label: "Night Panel",
    style: {
      background:
        "radial-gradient(circle at 80% 20%, rgba(96,165,250,0.22), rgba(96,165,250,0) 26%), linear-gradient(270deg, #0f172a 0%, #111827 42%, #1f2937 100%)",
    },
  },
];

const CursorDesignSandbox = ({
  style,
  primaryColor,
  secondaryColor,
  animateFigureEight,
  figureEightDurationMs,
  figureEightRadiusPx,
}: CursorDesignStoryProps) => {
  const backgrounds = useMemo(() => createCardBackgrounds(), []);
  const cursorRasterMetrics = useMemo(
    () =>
      resolveCrosshairCursorRasterMetrics({
        style,
      }),
    [style]
  );
  const previewEntries = useMemo(
    () =>
      CROSSHAIR_CURSOR_DESIGN_SIZE_SERIES_PX.map((sizePx) => ({
        sizePx,
        dataUrl: buildCrosshairCursorDataUrl({
          style,
          primaryColor,
          secondaryColor,
          sizePx,
        }),
      })),
    [style, primaryColor, secondaryColor]
  );

  return (
    <div style={PAGE_STYLE}>
      <style>{FIGURE_EIGHT_KEYFRAMES}</style>
      <div style={STATUS_BAR_STYLE}>
        <ResponsiveStatusBar
          label="cursor design"
          values={[
            `auto ${cursorRasterMetrics.sizePx}px`,
            `anchor ${cursorRasterMetrics.anchorPx}px`,
            `series ${CROSSHAIR_CURSOR_DESIGN_SIZE_SERIES_PX.join(" ")}`,
            `style ${style}`,
          ]}
          tone="dark"
        />
      </div>
      <div style={GRID_STYLE}>
        {backgrounds.map((background, backgroundIndex) => (
          <section
            key={background.id}
            style={{
              ...CARD_STYLE,
              ...background.style,
            }}
          >
            <div style={CARD_LABEL_STYLE}>{background.label}</div>
            <div style={PREVIEW_ROW_STYLE}>
              {previewEntries.map(({ sizePx, dataUrl }) => {
                const previewSizePx = sizePx;
                return (
                  <div key={sizePx} style={PREVIEW_CELL_STYLE}>
                    <div style={PREVIEW_STACK_STYLE}>
                      {[0, 1, 2].map((previewIndex) => {
                        const animationDelayMs = Math.round(
                          (figureEightDurationMs / 3) * previewIndex +
                            (figureEightDurationMs / Math.max(backgrounds.length, 1)) *
                              backgroundIndex
                        );
                        const orbitStyle = {
                          "--fx": `${figureEightRadiusPx}px`,
                          "--fy": `${Math.max(
                            1,
                            Math.round(figureEightRadiusPx * 0.62)
                          )}px`,
                        } as CSSProperties;
                        return (
                          <div key={previewIndex} style={TRACK_STYLE}>
                            <div
                              style={{
                                ...orbitStyle,
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                width: previewSizePx,
                                height: previewSizePx,
                                animationName: animateFigureEight
                                  ? "cursor-figure-eight"
                                  : undefined,
                                animationDuration: `${figureEightDurationMs}ms`,
                                animationTimingFunction: "ease-in-out",
                                animationIterationCount: "infinite",
                                animationDelay: `-${animationDelayMs}ms`,
                              }}
                            >
                              <img
                                alt={`Crosshair cursor preview ${sizePx}px`}
                                src={dataUrl}
                                style={{
                                  width: previewSizePx,
                                  height: previewSizePx,
                                  display: "block",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <span style={SCALE_LABEL_STYLE}>{`${sizePx}px`}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

const meta: Meta<CursorDesignStoryProps> = {
  title: "Annotations/Cursor Design",
  component: CursorDesignSandbox,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    style: {
      control: { type: "inline-radio" },
      options: [
        CROSSHAIR_CURSOR_STYLES.DEFAULT,
        CROSSHAIR_CURSOR_STYLES.SIMPLE_HAIRLINE,
      ],
      table: { category: "Cursor" },
    },
    primaryColor: {
      control: { type: "color" },
      table: { category: "Cursor" },
    },
    secondaryColor: {
      control: { type: "color" },
      table: { category: "Cursor" },
    },
    animateFigureEight: {
      control: { type: "boolean" },
      table: { category: "Animation" },
    },
    figureEightDurationMs: {
      control: { type: "range", min: 300, max: 6000, step: 50 },
      table: { category: "Animation" },
    },
    figureEightRadiusPx: {
      control: { type: "range", min: 1, max: 24, step: 1 },
      table: { category: "Animation" },
    },
  },
};

export default meta;

export const CursorDesign: StoryObj<CursorDesignStoryProps> = {
  args: {
    style: CROSSHAIR_CURSOR_STYLES.DEFAULT,
    primaryColor: "#ffffff",
    secondaryColor: "#000000",
    animateFigureEight: true,
    figureEightDurationMs: 1600,
    figureEightRadiusPx: 2,
  },
};
