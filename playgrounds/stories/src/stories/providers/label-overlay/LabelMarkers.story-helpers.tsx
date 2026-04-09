import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { DraggableDebugAnchor } from "@carma-commons/interaction/drag";
import { createScreenPointSvgLineVisualizers } from "@carma-commons/svg";
import {
  PREVIEW_LINE_LABEL_BACKGROUND_STYLE,
  PREVIEW_LINE_LABEL_THEME,
  PILLBUTTON_LABEL_MARKER_RESIZE_MODE,
  PILLBUTTON_BADGE_POSITIONS,
  PillbuttonLabelMarker,
  PointLabel,
  PointLabelMarker,
  POINT_LABEL_ATTACH,
  type PillbuttonBadgePosition,
  type PointLabelAttach,
  type PointLabelStyleProps,
} from "@carma-providers/label-overlay";
import { MINUS_PI_OVER_FOUR } from "@carma-commons/math";
import type { CssPixelPosition } from "@carma-units";

import { CenteredStoryFrame } from "../../common/ui/centered-story-frame";
import "../../../../../../libraries/mapping/annotations/runtime-v2/src/lib/interaction/preview-line-label.css";
export type LabelMarkersStoryArgs = PointLabelStyleProps & {
  content: ReactNode;
  compactContent?: ReactNode;
  markerContent?: ReactNode;
  badgeSlot?: PillboxStoryBadgeSlot;
  showDebugAnchors?: boolean;
  pageBackgroundMode?: LabelStoryBackgroundMode;
  badgeContent?: ReactNode;
  badgeBackgroundColor?: string;
  badgeTextColor?: string;
  badgeOutlineColor?: string;
  badgeStrokeWidth?: number;
};

export const LABEL_STORY_BACKGROUND_MODES = {
  PLAIN: "plain",
  SLATE: "slate",
  CHECKERBOARD: "checkerboard",
} as const;

export type LabelStoryBackgroundMode =
  (typeof LABEL_STORY_BACKGROUND_MODES)[keyof typeof LABEL_STORY_BACKGROUND_MODES];

const PILLBOX_STORY_BADGE_SLOTS = {
  NONE: "none",
  LEFT: PILLBUTTON_BADGE_POSITIONS.LEFT,
  RIGHT: PILLBUTTON_BADGE_POSITIONS.RIGHT,
} as const;

type PillboxStoryBadgeSlot =
  (typeof PILLBOX_STORY_BADGE_SLOTS)[keyof typeof PILLBOX_STORY_BADGE_SLOTS];

type DraggableAnchorKind = PointLabelAttach;

const toCssPixelPosition = (x: number, y: number): CssPixelPosition => ({
  x: x as CssPixelPosition["x"],
  y: y as CssPixelPosition["y"],
});

const LABEL_MARKERS_FONT_FAMILY =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const pageStyle: CSSProperties = {
  userSelect: "text",
};

const sectionStyle: CSSProperties = {
  marginBottom: 24,
  minWidth: 0,
};

const sectionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, max-content))",
  gap: 28,
  alignItems: "start",
  justifyContent: "center",
};

const sectionTitleStyle: CSSProperties = {
  marginBottom: 10,
  fontSize: 14,
  fontWeight: 600,
  color: "#334155",
};

const rowListStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  background: "transparent",
};

const rowStyle: CSSProperties = {
  borderBottom: "1px solid rgba(148, 163, 184, 0.25)",
};

const rowLabelStyle: CSSProperties = {
  width: 240,
  textAlign: "left",
  whiteSpace: "nowrap",
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.3,
  padding: "5px 12px 5px 0",
  verticalAlign: "middle",
};

const rowGraphicStyle: CSSProperties = {
  position: "relative",
  minWidth: 0,
  height: 34,
  overflow: "visible",
  padding: "3px 0",
  verticalAlign: "middle",
};

const tableHeaderCellStyle: CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "#475569",
  padding: "0 0 8px",
};

const anchorStyle: CSSProperties = {
  position: "absolute",
  left: 24,
  top: "50%",
  transform: "translateY(-50%)",
};

const AnchorHairlineDebug = ({ visible }: { visible: boolean }) => {
  if (!visible) {
    return null;
  }

  const hairlinePx =
    typeof window !== "undefined" && window.devicePixelRatio > 0
      ? 1 / window.devicePixelRatio
      : 1;

  return (
    <>
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 16,
          height: hairlinePx,
          transform: "translate(-8px, -50%)",
          background: "rgba(59, 130, 246, 0.55)",
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: hairlinePx,
          height: 16,
          transform: "translate(-50%, -8px)",
          background: "rgba(59, 130, 246, 0.55)",
          pointerEvents: "none",
        }}
      />
    </>
  );
};

const pointLabelBaseStyles: CSSProperties = {
  padding: "2px 4px",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  userSelect: "none",
  pointerEvents: "none",
  margin: 0,
};

const noopMouseEventHandler = () => undefined;
const noopHoverHandler = () => undefined;

const makeSharedStyleProps = (
  args: LabelMarkersStoryArgs
): PointLabelStyleProps => ({
  fontSize: args.fontSize,
  fontFamily: args.fontFamily,
  fontWeight: args.fontWeight,
  textColor: args.textColor,
  textBackgroundColor: args.textBackgroundColor,
  selectedBackgroundColor: args.selectedBackgroundColor,
  hoverBackgroundColor: args.hoverBackgroundColor,
  lineColor: args.lineColor,
  lineWidth: args.lineWidth,
  markerSize: args.markerSize,
  markerStrokeWidth: args.badgeStrokeWidth ?? args.markerStrokeWidth,
  stemStartDistance: args.stemStartDistance,
  markerBackgroundColor:
    args.badgeBackgroundColor ?? args.markerBackgroundColor,
  markerTextColor: args.badgeTextColor ?? args.markerTextColor,
  labelDistance: args.labelDistance,
});

const InlineRow = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <tr style={rowStyle}>
    <td style={rowLabelStyle}>{label}</td>
    <td style={rowGraphicStyle}>{children}</td>
  </tr>
);

const pillboxDemoViewportStyle: CSSProperties = {
  position: "relative",
  minWidth: 420,
  height: 56,
  overflow: "visible",
};

const pillboxDemoStageStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "visible",
};

const representativeLineLabelViewportStyle: CSSProperties = {
  position: "relative",
  minWidth: 420,
  height: 48,
  overflow: "visible",
};

const readStoryBackground = (
  mode: LabelStoryBackgroundMode | undefined
): string => {
  if (mode === LABEL_STORY_BACKGROUND_MODES.SLATE) {
    return "#e5e7eb";
  }

  if (mode === LABEL_STORY_BACKGROUND_MODES.CHECKERBOARD) {
    return [
      "linear-gradient(45deg, rgba(148,163,184,0.14) 25%, transparent 25%)",
      "linear-gradient(-45deg, rgba(148,163,184,0.14) 25%, transparent 25%)",
      "linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.14) 75%)",
      "linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.14) 75%)",
      "#f8fafc",
    ].join(", ");
  }

  return "#f8fafc";
};

const readStoryBackgroundStyle = (
  mode: LabelStoryBackgroundMode | undefined
): CSSProperties | undefined =>
  mode === LABEL_STORY_BACKGROUND_MODES.CHECKERBOARD
    ? {
        backgroundSize: "24px 24px",
        backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
      }
    : undefined;

const resolveBadgePositionFromSlot = (
  badgeSlot: PillboxStoryBadgeSlot | undefined
): PillbuttonBadgePosition | undefined =>
  badgeSlot === PILLBOX_STORY_BADGE_SLOTS.NONE ? undefined : badgeSlot;

type AnchorPoint = { x: number; y: number };
type AnchorPointMap = Record<DraggableAnchorKind, AnchorPoint>;

const areAnchorPointsEqual = (
  current: AnchorPointMap,
  next: AnchorPointMap
): boolean =>
  (Object.keys(current) as DraggableAnchorKind[]).every(
    (anchorKind) =>
      current[anchorKind].x === next[anchorKind].x &&
      current[anchorKind].y === next[anchorKind].y
  );

const PillboxOnlyAnchorDemo = ({
  pointId,
  content,
  badgeContent,
  badgePosition,
  backgroundColor,
  sharedStyleProps,
  showDebugAnchors,
  styleOverrides,
  badgeOutlineColor,
  labelAttach = POINT_LABEL_ATTACH.CENTER,
}: {
  pointId: string;
  content: ReactNode;
  badgeContent?: ReactNode;
  badgePosition?: PillbuttonBadgePosition;
  backgroundColor: string;
  sharedStyleProps: PointLabelStyleProps;
  showDebugAnchors: boolean;
  styleOverrides?: Partial<PointLabelStyleProps>;
  badgeOutlineColor?: string;
  labelAttach?: PointLabelAttach;
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [labelPosition, setLabelPosition] = useState({ x: 156, y: 40 });
  const [anchorPoints, setAnchorPoints] = useState<AnchorPointMap>({
    left: { x: 148, y: 40 },
    center: { x: 156, y: 40 },
    right: { x: 164, y: 40 },
  });

  useLayoutEffect(() => {
    const stageElement = stageRef.current;
    if (!stageElement) {
      return;
    }

    let animationFrameId = 0;
    let resizeObserver: ResizeObserver | null = null;

    const readAnchors = () => {
      const pillElement = stageElement.querySelector(
        `[data-point-label-id="${pointId}"]`
      ) as HTMLElement | null;
      const contentElement = pillElement?.querySelector(
        "[data-pillbutton-content='true']"
      ) as HTMLElement | null;
      if (!pillElement || !contentElement) {
        return;
      }

      const stageRect = stageElement.getBoundingClientRect();
      const contentRect = contentElement.getBoundingClientRect();
      const capRadius = contentRect.height * 0.5;
      const top = contentRect.top - stageRect.top;
      const left = contentRect.left - stageRect.left;
      const width = contentRect.width;
      const centerY = top + capRadius;
      const nextAnchorPoints: AnchorPointMap = {
        left: { x: left + capRadius, y: centerY },
        center: { x: left + width * 0.5, y: centerY },
        right: { x: left + width - capRadius, y: centerY },
      };

      setAnchorPoints((current) =>
        areAnchorPointsEqual(current, nextAnchorPoints)
          ? current
          : nextAnchorPoints
      );
    };

    const connect = () => {
      const pillElement = stageElement.querySelector(
        `[data-point-label-id="${pointId}"]`
      ) as HTMLElement | null;
      const contentElement = pillElement?.querySelector(
        "[data-pillbutton-content='true']"
      ) as HTMLElement | null;

      if (!pillElement || !contentElement) {
        animationFrameId = window.requestAnimationFrame(connect);
        return;
      }

      readAnchors();
      resizeObserver = new ResizeObserver(() => readAnchors());
      resizeObserver.observe(stageElement);
      resizeObserver.observe(pillElement);
      resizeObserver.observe(contentElement);
    };

    connect();

    return () => {
      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
      }
      resizeObserver?.disconnect();
    };
  }, [
    backgroundColor,
    badgeContent,
    badgePosition,
    content,
    labelAttach,
    pointId,
    sharedStyleProps,
  ]);

  const toAnchorPosition = (
    anchorKind: DraggableAnchorKind
  ): CssPixelPosition =>
    toCssPixelPosition(anchorPoints[anchorKind].x, anchorPoints[anchorKind].y);

  const effectiveStyleProps = { ...sharedStyleProps, ...styleOverrides };
  const badgeBorderStyle = effectiveStyleProps.compactBorderless
    ? "none"
    : `${Math.max(effectiveStyleProps.markerStrokeWidth ?? 1, 1)}px solid ${
        badgeOutlineColor ?? "rgba(255, 255, 255, 0.96)"
      }`;

  return (
    <div style={pillboxDemoViewportStyle}>
      <div ref={stageRef} style={pillboxDemoStageStyle}>
        <PillbuttonLabelMarker
          pointId={pointId}
          labelAttach={labelAttach}
          labelOffsetX={labelPosition.x}
          labelOffsetY={labelPosition.y}
          baseStyles={pointLabelBaseStyles}
          labelBorderStyle={badgeBorderStyle}
          fontSize={effectiveStyleProps.fontSize ?? "12px"}
          fontFamily={
            effectiveStyleProps.fontFamily ?? LABEL_MARKERS_FONT_FAMILY
          }
          fontWeight={effectiveStyleProps.fontWeight ?? "400"}
          backgroundColor={backgroundColor}
          textColor={effectiveStyleProps.textColor ?? "#0f172a"}
          pointerEvents="auto"
          cursor="default"
          collapse={false}
          markerContent={badgeContent}
          markerBackgroundColor={effectiveStyleProps.markerBackgroundColor}
          markerTextColor={effectiveStyleProps.markerTextColor}
          badgeOptions={{
            position: badgePosition,
            compactBorderless: effectiveStyleProps.compactBorderless ?? false,
            fullBorder: false,
            solidBorderStyle: "none",
            anchorAtSemicircleCenter: true,
          }}
          motionOptions={{
            resizeMode: PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE,
          }}
          content={content}
          onClick={noopMouseEventHandler}
          onDoubleClick={noopMouseEventHandler}
          onMouseDown={noopMouseEventHandler}
          onMouseUp={noopMouseEventHandler}
          onMouseEnter={noopHoverHandler}
          onMouseLeave={noopHoverHandler}
        />
        {showDebugAnchors
          ? (Object.keys(anchorPoints) as DraggableAnchorKind[]).map(
              (anchorKind) => (
                <DraggableDebugAnchor
                  key={`${pointId}-${anchorKind}`}
                  anchorId={`${pointId}-${anchorKind}`}
                  position={toAnchorPosition(anchorKind)}
                  color="#ffffff"
                  containerRef={stageRef}
                  zIndex={4}
                  blendMode="difference"
                  onChange={(nextPosition) => {
                    const pointerX = Number(nextPosition.x);
                    const pointerY = Number(nextPosition.y);
                    const currentAnchor = anchorPoints[anchorKind];

                    setLabelPosition((current) => ({
                      x: current.x + (pointerX - currentAnchor.x),
                      y: current.y + (pointerY - currentAnchor.y),
                    }));
                  }}
                />
              )
            )
          : null}
      </div>
    </div>
  );
};

const RepresentativeLineLabelDemo = ({
  text,
  blur,
}: {
  text: string;
  blur: boolean;
}) => (
  <div style={representativeLineLabelViewportStyle}>
    <div
      style={{
        position: "absolute",
        left: 24,
        right: 24,
        top: "50%",
        borderTop: "1px dashed rgba(100, 116, 139, 0.42)",
        transform: "translateY(-50%)",
      }}
    />
    <div
      className="carma-preview-line-label"
      data-preview-line-label-theme={PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK}
      style={
        {
          position: "absolute",
          left: 160,
          top: "50%",
          display: "block",
          transform: "translate(-50%, -50%)",
          "--carma-preview-line-label-font-family": LABEL_MARKERS_FONT_FAMILY,
          "--carma-preview-line-label-font-weight": "500",
        } as CSSProperties
      }
    >
      <span className="carma-preview-line-label__frame">
        {blur ? (
          <span
            className="carma-preview-line-label__backdrop"
            data-preview-line-label-background-style={
              PREVIEW_LINE_LABEL_BACKGROUND_STYLE.SOFT_RECT_FADE
            }
          />
        ) : null}
        <span
          className="carma-preview-line-label__text"
          style={{ fontSize: 14 }}
        >
          {text}
        </span>
      </span>
    </div>
  </div>
);

const GeneratedStemPreview = ({
  angleRad,
  anchors,
  lineColor,
  lineWidth,
  isOccluded,
}: {
  angleRad: number;
  anchors: { startDistancePx: number; endDistancePx: number };
  lineColor: string;
  lineWidth: number;
  isOccluded: boolean;
}) => {
  const [line] = createScreenPointSvgLineVisualizers({
    id: "stem-preview",
    start: toCssPixelPosition(anchors.startDistancePx, 0),
    end: toCssPixelPosition(anchors.endDistancePx, 0),
    stroke: lineColor,
    strokeWidth: Math.max(lineWidth, 1),
    dashed: isOccluded,
    capStyle: "round",
    dashLengthRatio: 1,
    dashGapRatio: 1,
  });

  const strokeWidth = Math.max(line.strokeWidth ?? lineWidth, 1);
  const sidePadding = Math.max(strokeWidth * 1.5, 3);
  const minX =
    Math.min(anchors.startDistancePx, anchors.endDistancePx) - sidePadding;
  const maxX =
    Math.max(anchors.startDistancePx, anchors.endDistancePx) + sidePadding;
  const width = Math.max(0.001, maxX - minX);
  const height = Math.max(16, strokeWidth * 4);
  const centerY = height * 0.5;
  const x1 = anchors.startDistancePx - minX;
  const x2 = anchors.endDistancePx - minX;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transformOrigin: "0 0",
        transform: `rotate(${angleRad}rad)`,
        pointerEvents: "none",
      }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{
          position: "absolute",
          left: minX,
          top: -centerY,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        <line
          x1={x1}
          y1={centerY}
          x2={x2}
          y2={centerY}
          stroke={line.stroke ?? lineColor}
          strokeWidth={strokeWidth}
          strokeLinecap={line.strokeLinecap ?? "round"}
          strokeDasharray={line.strokeDasharray ?? "none"}
          strokeDashoffset={line.strokeDashoffset ?? 0}
          opacity={line.opacity ?? 1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};

export const RepresentativeCasesStory = (args: LabelMarkersStoryArgs) => {
  const sharedStyleProps = makeSharedStyleProps(args);
  const showDebugAnchors = args.showDebugAnchors === true;
  const pageBackgroundMode =
    args.pageBackgroundMode ?? LABEL_STORY_BACKGROUND_MODES.PLAIN;
  const labelBorderStyle = `${sharedStyleProps.lineWidth ?? 1}px solid ${
    sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"
  }`;
  const statusValues = [
    `content ${String(args.content)}`,
    `badge ${String(
      args.badgeContent ?? args.compactContent ?? args.markerContent ?? "7"
    )}`,
    `debug ${showDebugAnchors ? "on" : "off"}`,
    `bg ${pageBackgroundMode}`,
  ];

  return (
    <CenteredStoryFrame
      label="representative cases"
      values={statusValues}
      contentStyle={pageStyle}
      background={readStoryBackground(pageBackgroundMode)}
      backgroundStyle={readStoryBackgroundStyle(pageBackgroundMode)}
    >
      <div style={sectionGridStyle}>
        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>
            varying: marker content, size, occlusion
          </div>
          <table style={rowListStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>case</th>
                <th style={tableHeaderCellStyle}>preview</th>
              </tr>
            </thead>
            <tbody>
              <InlineRow label="outline (size 8)">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <PointLabelMarker
                    pointId="node-outline-sm"
                    markerSize={8}
                    markerStrokeWidth={args.markerStrokeWidth ?? 1}
                    isOccluded={false}
                    markerBackgroundColor={
                      args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"
                    }
                    markerTextColor={args.markerTextColor ?? "#111111"}
                    pointerEvents="auto"
                    cursor="pointer"
                    onClick={noopMouseEventHandler}
                    onDoubleClick={noopMouseEventHandler}
                    onMouseDown={noopMouseEventHandler}
                    onMouseUp={noopMouseEventHandler}
                    onMouseEnter={noopHoverHandler}
                    onMouseLeave={noopHoverHandler}
                  />
                </div>
              </InlineRow>
              <InlineRow label="outline (size 16)">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <PointLabelMarker
                    pointId="node-outline-lg"
                    markerSize={16}
                    markerStrokeWidth={args.markerStrokeWidth ?? 1}
                    isOccluded={false}
                    markerBackgroundColor={
                      args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"
                    }
                    markerTextColor={args.markerTextColor ?? "#111111"}
                    pointerEvents="auto"
                    cursor="pointer"
                    onClick={noopMouseEventHandler}
                    onDoubleClick={noopMouseEventHandler}
                    onMouseDown={noopMouseEventHandler}
                    onMouseUp={noopMouseEventHandler}
                    onMouseEnter={noopHoverHandler}
                    onMouseLeave={noopHoverHandler}
                  />
                </div>
              </InlineRow>
              <InlineRow label="badge (7)">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <PointLabelMarker
                    pointId="node-badge-7"
                    markerSize={10}
                    markerStrokeWidth={args.markerStrokeWidth ?? 1}
                    markerContent={args.compactContent ?? "7"}
                    isOccluded={false}
                    markerBackgroundColor={
                      args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"
                    }
                    markerTextColor={args.markerTextColor ?? "#111111"}
                    pointerEvents="auto"
                    cursor="pointer"
                    onClick={noopMouseEventHandler}
                    onDoubleClick={noopMouseEventHandler}
                    onMouseDown={noopMouseEventHandler}
                    onMouseUp={noopMouseEventHandler}
                    onMouseEnter={noopHoverHandler}
                    onMouseLeave={noopHoverHandler}
                  />
                </div>
              </InlineRow>
              <InlineRow label="badge (12)">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <PointLabelMarker
                    pointId="node-badge-12"
                    markerSize={10}
                    markerStrokeWidth={args.markerStrokeWidth ?? 1}
                    markerContent="12"
                    isOccluded={false}
                    markerBackgroundColor={
                      args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"
                    }
                    markerTextColor={args.markerTextColor ?? "#111111"}
                    pointerEvents="auto"
                    cursor="pointer"
                    onClick={noopMouseEventHandler}
                    onDoubleClick={noopMouseEventHandler}
                    onMouseDown={noopMouseEventHandler}
                    onMouseUp={noopMouseEventHandler}
                    onMouseEnter={noopHoverHandler}
                    onMouseLeave={noopHoverHandler}
                  />
                </div>
              </InlineRow>
              <InlineRow label="badge occluded">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <PointLabelMarker
                    pointId="node-badge-occluded"
                    markerSize={10}
                    markerStrokeWidth={args.markerStrokeWidth ?? 1}
                    markerContent={args.compactContent ?? "7"}
                    isOccluded
                    markerBackgroundColor={
                      args.markerBackgroundColor ?? "rgba(200, 200, 200, 0.92)"
                    }
                    markerTextColor={args.markerTextColor ?? "#111111"}
                    pointerEvents="auto"
                    cursor="pointer"
                    onClick={noopMouseEventHandler}
                    onDoubleClick={noopMouseEventHandler}
                    onMouseDown={noopMouseEventHandler}
                    onMouseUp={noopMouseEventHandler}
                    onMouseEnter={noopHoverHandler}
                    onMouseLeave={noopHoverHandler}
                  />
                </div>
              </InlineRow>
            </tbody>
          </table>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>
            varying: stem angle, distances, occlusion
          </div>
          <table style={rowListStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>case</th>
                <th style={tableHeaderCellStyle}>preview</th>
              </tr>
            </thead>
            <tbody>
              <InlineRow label="-90°, start 5, end 36">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <GeneratedStemPreview
                    angleRad={-Math.PI * 0.5}
                    anchors={{ startDistancePx: 5, endDistancePx: 36 }}
                    lineColor={
                      sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"
                    }
                    lineWidth={sharedStyleProps.lineWidth ?? 1}
                    isOccluded={false}
                  />
                </div>
              </InlineRow>
              <InlineRow label="-60°, start 5, end 42">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <GeneratedStemPreview
                    angleRad={-Math.PI / 3}
                    anchors={{ startDistancePx: 5, endDistancePx: 42 }}
                    lineColor={
                      sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"
                    }
                    lineWidth={sharedStyleProps.lineWidth ?? 1}
                    isOccluded={false}
                  />
                </div>
              </InlineRow>
              <InlineRow label="-45°, start 5, end 44">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <GeneratedStemPreview
                    angleRad={-Math.PI * 0.25}
                    anchors={{ startDistancePx: 5, endDistancePx: 44 }}
                    lineColor={
                      sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"
                    }
                    lineWidth={sharedStyleProps.lineWidth ?? 1}
                    isOccluded={false}
                  />
                </div>
              </InlineRow>
              <InlineRow label="-15°, start 8, end 52">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <GeneratedStemPreview
                    angleRad={-Math.PI / 12}
                    anchors={{ startDistancePx: 8, endDistancePx: 52 }}
                    lineColor={
                      sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"
                    }
                    lineWidth={sharedStyleProps.lineWidth ?? 1}
                    isOccluded={false}
                  />
                </div>
              </InlineRow>
              <InlineRow label="0°, start 8, end 52">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <GeneratedStemPreview
                    angleRad={0}
                    anchors={{ startDistancePx: 8, endDistancePx: 52 }}
                    lineColor={
                      sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"
                    }
                    lineWidth={sharedStyleProps.lineWidth ?? 1}
                    isOccluded={false}
                  />
                </div>
              </InlineRow>
              <InlineRow label="+15°, start 8, end 52">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <GeneratedStemPreview
                    angleRad={Math.PI / 12}
                    anchors={{ startDistancePx: 8, endDistancePx: 52 }}
                    lineColor={
                      sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"
                    }
                    lineWidth={sharedStyleProps.lineWidth ?? 1}
                    isOccluded={false}
                  />
                </div>
              </InlineRow>
              <InlineRow label="+45°, start 5, end 60">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <GeneratedStemPreview
                    angleRad={Math.PI * 0.25}
                    anchors={{ startDistancePx: 5, endDistancePx: 60 }}
                    lineColor={
                      sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"
                    }
                    lineWidth={sharedStyleProps.lineWidth ?? 1}
                    isOccluded={false}
                  />
                </div>
              </InlineRow>
              <InlineRow label="+60°, start 5, end 52">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <GeneratedStemPreview
                    angleRad={Math.PI / 3}
                    anchors={{ startDistancePx: 5, endDistancePx: 52 }}
                    lineColor={
                      sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"
                    }
                    lineWidth={sharedStyleProps.lineWidth ?? 1}
                    isOccluded={false}
                  />
                </div>
              </InlineRow>
              <InlineRow label="+90°, occluded">
                <div style={anchorStyle}>
                  <AnchorHairlineDebug visible={showDebugAnchors} />
                  <GeneratedStemPreview
                    angleRad={Math.PI * 0.5}
                    anchors={{ startDistancePx: 5, endDistancePx: 36 }}
                    lineColor={
                      sharedStyleProps.lineColor ?? "rgba(30, 64, 175, 0.95)"
                    }
                    lineWidth={sharedStyleProps.lineWidth ?? 1}
                    isOccluded
                  />
                </div>
              </InlineRow>
            </tbody>
          </table>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>
            varying: attach, collapse, content length
          </div>
          <table style={rowListStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>case</th>
                <th style={tableHeaderCellStyle}>preview</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  {
                    id: "label-left",
                    label: "attach left",
                    attach: POINT_LABEL_ATTACH.LEFT,
                    content: "14,92 m",
                    collapse: false,
                    fullBorder: false,
                    compactBorderless: false,
                  },
                  {
                    id: "label-center",
                    label: "attach center",
                    attach: POINT_LABEL_ATTACH.CENTER,
                    content: "392.5px screen distance",
                    collapse: false,
                    fullBorder: false,
                    compactBorderless: false,
                  },
                  {
                    id: "label-right-selected",
                    label: "attach right (selected)",
                    attach: POINT_LABEL_ATTACH.RIGHT,
                    content: "selected",
                    collapse: false,
                    fullBorder: true,
                    compactBorderless: false,
                    backgroundColor: "rgba(251, 191, 36, 0.95)",
                  },
                  {
                    id: "label-collapsed",
                    label: "collapsed compact",
                    attach: POINT_LABEL_ATTACH.LEFT,
                    content: "14,92 m",
                    collapse: true,
                    fullBorder: false,
                    compactBorderless: false,
                    markerContent: args.compactContent ?? "7",
                  },
                ] as const
              ).map((entry) => (
                <InlineRow key={entry.id} label={entry.label}>
                  <div style={anchorStyle}>
                    <AnchorHairlineDebug visible={showDebugAnchors} />
                    <PillbuttonLabelMarker
                      pointId={`pill-${entry.id}`}
                      labelAttach={entry.attach}
                      labelOffsetX={0}
                      labelOffsetY={0}
                      baseStyles={pointLabelBaseStyles}
                      labelBorderStyle={labelBorderStyle}
                      fontSize={sharedStyleProps.fontSize ?? "12px"}
                      fontFamily={
                        sharedStyleProps.fontFamily ?? LABEL_MARKERS_FONT_FAMILY
                      }
                      fontWeight={sharedStyleProps.fontWeight ?? "400"}
                      backgroundColor={
                        entry.backgroundColor ??
                        sharedStyleProps.textBackgroundColor ??
                        "rgba(255, 255, 255, 0.98)"
                      }
                      textColor={sharedStyleProps.textColor ?? "black"}
                      pointerEvents="auto"
                      cursor="pointer"
                      collapse={entry.collapse}
                      markerContent={entry.markerContent}
                      markerBackgroundColor={
                        sharedStyleProps.markerBackgroundColor
                      }
                      markerTextColor={sharedStyleProps.markerTextColor}
                      badgeOptions={{
                        compactBorderless: entry.compactBorderless,
                        fullBorder: entry.fullBorder,
                        solidBorderStyle: labelBorderStyle,
                      }}
                      motionOptions={{
                        resizeMode: PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE,
                      }}
                      content={entry.content}
                      onClick={noopMouseEventHandler}
                      onDoubleClick={noopMouseEventHandler}
                      onMouseDown={noopMouseEventHandler}
                      onMouseUp={noopMouseEventHandler}
                      onMouseEnter={noopHoverHandler}
                      onMouseLeave={noopHoverHandler}
                    />
                  </div>
                </InlineRow>
              ))}
            </tbody>
          </table>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>
            varying: attach, badge slot, extended content direction
          </div>
          <table style={rowListStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>case</th>
                <th style={tableHeaderCellStyle}>preview</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  {
                    id: "slot-left-attach-left",
                    label: "attach left · badge left",
                    attach: POINT_LABEL_ATTACH.LEFT,
                    badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
                    content: "NHN 179,27 m",
                    markerContent: "8",
                  },
                  {
                    id: "slot-left-attach-right",
                    label: "attach right · badge left",
                    attach: POINT_LABEL_ATTACH.RIGHT,
                    badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
                    content: "NHN 179,27 m",
                    markerContent: "8",
                  },
                  {
                    id: "slot-right-attach-left",
                    label: "attach left · badge right",
                    attach: POINT_LABEL_ATTACH.LEFT,
                    badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
                    content: "24,41 m über Bezugspunkt",
                    markerContent: "11111",
                  },
                  {
                    id: "slot-right-attach-right",
                    label: "attach right · badge right",
                    attach: POINT_LABEL_ATTACH.RIGHT,
                    badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
                    content: "24,41 m über Bezugspunkt",
                    markerContent: "11111",
                  },
                  {
                    id: "slot-left-wide-badge",
                    label: "wide badge left · long text",
                    attach: POINT_LABEL_ATTACH.LEFT,
                    badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
                    content: "relative Höhe über Bezugspunkt",
                    markerContent: "33333",
                  },
                  {
                    id: "slot-right-wide-badge",
                    label: "wide badge right · long text",
                    attach: POINT_LABEL_ATTACH.RIGHT,
                    badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
                    content: "relative Höhe über Bezugspunkt",
                    markerContent: "33333",
                  },
                ] as const
              ).map((entry) => (
                <InlineRow key={entry.id} label={entry.label}>
                  <div style={anchorStyle}>
                    <AnchorHairlineDebug visible={showDebugAnchors} />
                    <PillbuttonLabelMarker
                      pointId={`pill-variant-${entry.id}`}
                      labelAttach={entry.attach}
                      labelOffsetX={0}
                      labelOffsetY={0}
                      baseStyles={pointLabelBaseStyles}
                      labelBorderStyle={labelBorderStyle}
                      fontSize={sharedStyleProps.fontSize ?? "12px"}
                      fontFamily={
                        sharedStyleProps.fontFamily ?? LABEL_MARKERS_FONT_FAMILY
                      }
                      fontWeight={sharedStyleProps.fontWeight ?? "400"}
                      backgroundColor={
                        sharedStyleProps.textBackgroundColor ??
                        "rgba(255, 255, 255, 0.98)"
                      }
                      textColor={sharedStyleProps.textColor ?? "#0f172a"}
                      pointerEvents="auto"
                      cursor="pointer"
                      collapse={false}
                      markerContent={entry.markerContent}
                      markerBackgroundColor={
                        sharedStyleProps.markerBackgroundColor
                      }
                      markerTextColor={sharedStyleProps.markerTextColor}
                      badgeOptions={{
                        position: entry.badgePosition,
                        compactBorderless:
                          sharedStyleProps.compactBorderless ?? false,
                        fullBorder: false,
                        solidBorderStyle: labelBorderStyle,
                        anchorAtSemicircleCenter: true,
                      }}
                      motionOptions={{
                        resizeMode: PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE,
                      }}
                      content={entry.content}
                      onClick={noopMouseEventHandler}
                      onDoubleClick={noopMouseEventHandler}
                      onMouseDown={noopMouseEventHandler}
                      onMouseUp={noopMouseEventHandler}
                      onMouseEnter={noopHoverHandler}
                      onMouseLeave={noopHoverHandler}
                    />
                  </div>
                </InlineRow>
              ))}
            </tbody>
          </table>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>
            varying: line label text vs backdrop blur container
          </div>
          <table style={rowListStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>case</th>
                <th style={tableHeaderCellStyle}>preview</th>
              </tr>
            </thead>
            <tbody>
              <InlineRow label="text only">
                <RepresentativeLineLabelDemo text="168,00 m" blur={false} />
              </InlineRow>
              <InlineRow label="text + blur backdrop">
                <RepresentativeLineLabelDemo text="168,00 m" blur />
              </InlineRow>
            </tbody>
          </table>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>varying: combined defaults</div>
          <table style={rowListStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>case</th>
                <th style={tableHeaderCellStyle}>preview</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  {
                    id: "combined-default",
                    label: "default",
                    selected: false,
                    isOccluded: false,
                    collapse: true,
                    forceCollapse: false,
                    pitch: MINUS_PI_OVER_FOUR,
                    labelAttach: "left" as PointLabelAttach,
                    hideMarker: false,
                    hideLabelAndStem: false,
                  },
                  {
                    id: "combined-selected",
                    label: "selected",
                    selected: true,
                    isOccluded: false,
                    collapse: true,
                    forceCollapse: false,
                    pitch: MINUS_PI_OVER_FOUR,
                    labelAttach: "left" as PointLabelAttach,
                    hideMarker: false,
                    hideLabelAndStem: false,
                  },
                  {
                    id: "combined-occluded",
                    label: "occluded",
                    selected: false,
                    isOccluded: true,
                    collapse: true,
                    forceCollapse: false,
                    pitch: MINUS_PI_OVER_FOUR,
                    labelAttach: "left" as PointLabelAttach,
                    hideMarker: false,
                    hideLabelAndStem: false,
                  },
                ] as const
              ).map((entry) => (
                <InlineRow key={entry.id} label={entry.label}>
                  <div style={{ ...anchorStyle, top: "54%" }}>
                    <AnchorHairlineDebug visible={showDebugAnchors} />
                    <PointLabel
                      pointId={entry.id}
                      content={args.content}
                      compactContent={args.compactContent}
                      pitch={entry.pitch}
                      selected={entry.selected}
                      isOccluded={entry.isOccluded}
                      hideLabelAndStem={entry.hideLabelAndStem}
                      hideMarker={entry.hideMarker}
                      labelAttach={entry.labelAttach}
                      collapse={entry.collapse}
                      forceCollapse={entry.forceCollapse}
                      fullBorder={false}
                      resizeMode={PILLBUTTON_LABEL_MARKER_RESIZE_MODE.NONE}
                      {...sharedStyleProps}
                    />
                  </div>
                </InlineRow>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </CenteredStoryFrame>
  );
};

export const PillboxOnlyStory = (args: LabelMarkersStoryArgs) => {
  const sharedStyleProps = makeSharedStyleProps(args);
  const showDebugAnchors = args.showDebugAnchors === true;
  const pageBackgroundMode =
    args.pageBackgroundMode ?? LABEL_STORY_BACKGROUND_MODES.PLAIN;
  const badgeSlot = args.badgeSlot ?? PILLBOX_STORY_BADGE_SLOTS.LEFT;
  const sharedBadgeContent =
    badgeSlot === PILLBOX_STORY_BADGE_SLOTS.NONE
      ? undefined
      : args.badgeContent ?? args.compactContent ?? args.markerContent ?? "7";
  const sharedBadgePosition = resolveBadgePositionFromSlot(badgeSlot);
  const statusValues = [
    `content ${String(args.content)}`,
    `badge ${
      sharedBadgeContent === undefined ? "off" : String(sharedBadgeContent)
    }`,
    `slot ${badgeSlot}`,
    `debug ${showDebugAnchors ? "on" : "off"}`,
    `bg ${pageBackgroundMode}`,
  ];

  const variants = [
    {
      id: "pillbox-xs",
      label: "pill only · xs",
      content: "7 m",
      backgroundColor:
        sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.98)",
      badgeContent: undefined,
      styleOverrides: { fontSize: "10px", fontWeight: "500" },
    },
    {
      id: "pillbox-md",
      label: "pill only · md",
      content: args.content,
      backgroundColor:
        sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.98)",
      badgeContent: undefined,
    },
    {
      id: "pillbox-lg",
      label: "pill only · lg",
      content: "392.5px screen distance",
      backgroundColor:
        sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.98)",
      badgeContent: undefined,
      styleOverrides: { fontSize: "16px", fontWeight: "600" },
    },
    {
      id: "pillbox-frosted",
      label: "pill only · frosted",
      content: args.content,
      backgroundColor: "rgba(255, 255, 255, 0.72)",
      badgeContent: undefined,
    },
    {
      id: "pillbox-badge",
      label: "pill + badge",
      content: args.content,
      backgroundColor:
        sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.98)",
      badgeContent: sharedBadgeContent,
      badgePosition: sharedBadgePosition,
    },
    {
      id: "pillbox-badge-frosted",
      label: "pill + badge · frosted",
      content: "distance 14.92 m",
      backgroundColor: "rgba(255, 255, 255, 0.72)",
      badgeContent: sharedBadgeContent,
      badgePosition: sharedBadgePosition,
    },
    {
      id: "pillbox-badge-lg",
      label: "pill + badge · lg",
      content: "selected cluster label",
      backgroundColor:
        sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.98)",
      badgeContent: "12",
      badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
      styleOverrides: { fontSize: "16px", fontWeight: "600" },
    },
    {
      id: "pillbox-badge-left-ops",
      label: "badge left · ops",
      content: "distance 14.92 m",
      backgroundColor:
        sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.98)",
      badgeContent: "ops",
      badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
    },
    {
      id: "pillbox-badge-right-warn",
      label: "badge right · warn",
      content: "selected cluster label",
      backgroundColor: "rgba(255, 255, 255, 0.72)",
      badgeContent: "warn",
      badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
    },
    {
      id: "pillbox-badge-right-bus",
      label: "badge right · bus",
      content: "station west",
      backgroundColor:
        sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.98)",
      badgeContent: "bus",
      badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
    },
    {
      id: "pillbox-badge-right-train",
      label: "badge right · train",
      content: "platform south",
      backgroundColor:
        sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.98)",
      badgeContent: "train",
      badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
    },
    {
      id: "pillbox-badge-left-route",
      label: "badge left · route",
      content: "local transfer",
      backgroundColor: "rgba(255, 255, 255, 0.84)",
      badgeContent: "route",
      badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
    },
  ] as const;

  return (
    <CenteredStoryFrame
      label="pillbox label only"
      values={statusValues}
      contentStyle={pageStyle}
      background={readStoryBackground(pageBackgroundMode)}
      backgroundStyle={readStoryBackgroundStyle(pageBackgroundMode)}
    >
      <div style={sectionGridStyle}>
        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>
            draggable label-only variants without stem
          </div>
          <table style={rowListStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>case</th>
                <th style={tableHeaderCellStyle}>preview</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => (
                <InlineRow key={variant.id} label={variant.label}>
                  <PillboxOnlyAnchorDemo
                    pointId={variant.id}
                    content={variant.content}
                    badgeContent={
                      badgeSlot === PILLBOX_STORY_BADGE_SLOTS.NONE
                        ? undefined
                        : variant.badgeContent
                    }
                    badgePosition={
                      badgeSlot === PILLBOX_STORY_BADGE_SLOTS.NONE
                        ? undefined
                        : resolveBadgePositionFromSlot(badgeSlot) ??
                          variant.badgePosition
                    }
                    backgroundColor={variant.backgroundColor}
                    sharedStyleProps={sharedStyleProps}
                    showDebugAnchors={showDebugAnchors}
                    styleOverrides={variant.styleOverrides}
                    badgeOutlineColor={args.badgeOutlineColor}
                    labelAttach={POINT_LABEL_ATTACH.CENTER}
                  />
                </InlineRow>
              ))}
            </tbody>
          </table>
        </section>
        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>
            anchor behavior and debug visibility
          </div>
          <table style={rowListStyle}>
            <thead>
              <tr>
                <th style={tableHeaderCellStyle}>case</th>
                <th style={tableHeaderCellStyle}>preview</th>
              </tr>
            </thead>
            <tbody>
              <InlineRow label="left anchor drag">
                <PillboxOnlyAnchorDemo
                  pointId="pillbox-anchor-left"
                  content={args.content}
                  badgeContent={undefined}
                  backgroundColor={
                    sharedStyleProps.textBackgroundColor ??
                    "rgba(255, 255, 255, 0.98)"
                  }
                  sharedStyleProps={sharedStyleProps}
                  showDebugAnchors
                  badgeOutlineColor={args.badgeOutlineColor}
                  labelAttach={POINT_LABEL_ATTACH.RIGHT}
                />
              </InlineRow>
              <InlineRow label="badge center drag">
                <PillboxOnlyAnchorDemo
                  pointId="pillbox-anchor-center"
                  content={args.content}
                  badgeContent={sharedBadgeContent}
                  badgePosition={sharedBadgePosition}
                  backgroundColor="rgba(255, 255, 255, 0.84)"
                  sharedStyleProps={sharedStyleProps}
                  showDebugAnchors
                  badgeOutlineColor={args.badgeOutlineColor}
                  labelAttach={POINT_LABEL_ATTACH.CENTER}
                />
              </InlineRow>
              <InlineRow label="right anchor drag">
                <PillboxOnlyAnchorDemo
                  pointId="pillbox-anchor-right"
                  content="longer anchored label"
                  badgeContent={undefined}
                  backgroundColor="rgba(255, 255, 255, 0.98)"
                  sharedStyleProps={sharedStyleProps}
                  showDebugAnchors
                  badgeOutlineColor={args.badgeOutlineColor}
                  labelAttach={POINT_LABEL_ATTACH.LEFT}
                />
              </InlineRow>
            </tbody>
          </table>
        </section>
      </div>
    </CenteredStoryFrame>
  );
};

export const LABEL_MARKERS_DEFAULT_ARGS: LabelMarkersStoryArgs = {
  content: "14,92 m",
  compactContent: "7",
  markerContent: "7",
  badgeContent: "7",
  badgeSlot: PILLBOX_STORY_BADGE_SLOTS.LEFT,
  fontSize: "12px",
  fontFamily: LABEL_MARKERS_FONT_FAMILY,
  fontWeight: "500",
  textColor: "#0f172a",
  textBackgroundColor: "rgba(255, 255, 255, 0.98)",
  selectedBackgroundColor: "rgba(251, 191, 36, 0.95)",
  hoverBackgroundColor: "rgba(254, 243, 199, 0.98)",
  lineColor: "rgba(30, 58, 138, 0.98)",
  lineWidth: 1,
  markerSize: 10,
  markerStrokeWidth: 1,
  markerBackgroundColor: "rgba(15, 23, 42, 0.94)",
  markerTextColor: "#f8fafc",
  badgeStrokeWidth: 1,
  badgeOutlineColor: "rgba(255, 255, 255, 0.96)",
  badgeBackgroundColor: "rgba(15, 23, 42, 0.94)",
  badgeTextColor: "#f8fafc",
  stemStartDistance: 5,
  labelDistance: 20,
  compactBorderless: false,
  showDebugAnchors: false,
  pageBackgroundMode: LABEL_STORY_BACKGROUND_MODES.PLAIN,
};

export const LABEL_MARKERS_ARG_TYPES = {
  showDebugAnchors: {
    control: { type: "boolean" },
  },
  pageBackgroundMode: {
    control: { type: "inline-radio" },
    options: Object.values(LABEL_STORY_BACKGROUND_MODES),
  },
  badgeSlot: {
    control: { type: "inline-radio" },
    options: Object.values(PILLBOX_STORY_BADGE_SLOTS),
  },
  fontSize: {
    control: { type: "inline-radio" },
    options: ["10px", "12px", "14px", "16px", "20px", "24px"],
  },
  fontWeight: {
    control: { type: "inline-radio" },
    options: ["400", "500", "600", "700"],
  },
  textColor: {
    control: { type: "color" },
  },
  textBackgroundColor: {
    control: { type: "color" },
  },
  badgeBackgroundColor: {
    control: { type: "color" },
  },
  badgeOutlineColor: {
    control: { type: "color" },
  },
  badgeTextColor: {
    control: { type: "color" },
  },
  badgeStrokeWidth: {
    control: { type: "range", min: 1, max: 4, step: 1 },
  },
  compactBorderless: {
    control: { type: "boolean" },
  },
  badgeContent: {
    control: { type: "text" },
  },
  compactContent: {
    control: { type: "text" },
  },
  content: {
    control: { type: "text" },
  },
};

export const LABEL_MARKERS_PARAMETERS = {
  controls: {
    include: [
      "content",
      "compactContent",
      "badgeContent",
      "badgeSlot",
      "fontSize",
      "fontWeight",
      "textColor",
      "textBackgroundColor",
      "badgeBackgroundColor",
      "badgeOutlineColor",
      "badgeTextColor",
      "badgeStrokeWidth",
      "compactBorderless",
      "showDebugAnchors",
      "pageBackgroundMode",
    ],
  },
};
