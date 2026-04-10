import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { DraggableDebugAnchor } from "@carma-commons/interaction/drag";
import {
  PILLBUTTON_BADGE_POSITIONS,
  PillbuttonLabelMarker,
  PointLabel,
  POINT_LABEL_ATTACH,
  resolvePillbuttonLabelMarkerLocalAnchorPoints,
  type PillbuttonBadgePosition,
  type PointLabelAttach,
  type PointLabelStyleProps,
} from "@carma-providers/label-overlay";
import { MINUS_PI_OVER_FOUR } from "@carma-commons/math";
import { annotationTypographyDefaults } from "@carma-mapping/annotations/runtime-v2";
import type { CssPixelPosition } from "@carma-units";
import {
  PREVIEW_LINE_LABEL_BACKGROUND_STYLE,
  PREVIEW_LINE_LABEL_THEME,
} from "../../../../../../libraries/mapping/annotations/runtime-v2/src/lib/config/previewLineLabelVisualDefaults";
import barmenBackgroundUrl from "./assets/barmen-background.png";

import { CenteredStoryFrame } from "../../common/ui/centered-story-frame";
import "../../../../../../libraries/mapping/annotations/runtime-v2/src/lib/interaction/annotation-overlay-line-label.css";
export type LabelMarkersStoryArgs = {
  content: ReactNode;
  badgeContent?: ReactNode;
  badgeSlot?: PillboxStoryBadgeSlot;
  debugAnchors?: boolean;
  storyBackground?: LabelStoryBackgroundMode;
  pageBackgroundMode?: LabelStoryBackgroundMode;
  labelTextColor?: string;
  labelBackgroundColor?: string;
  badgeFillColor?: string;
  badgeTextColor?: string;
  badgeBorderColor?: string;
  badgeBorderWidth?: number;
  badgeBorderless?: boolean;
};

type QualitativePillColorScheme = {
  id: string;
  label: string;
  content: ReactNode;
  badgeContent: ReactNode;
  labelBackgroundColor: string;
  badgeBackgroundColor: string;
  lineColor: string;
};

export const LABEL_STORY_BACKGROUND_MODES = {
  PLAIN: "plain",
  SLATE: "slate",
  CHECKERBOARD: "checkerboard",
  URBAN: "urban",
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
type DragSession = {
  anchorKind: DraggableAnchorKind;
  anchorStartPosition: AnchorPoint;
  labelStartPosition: AnchorPoint;
};
type LabelDragSession = {
  pointerStartPosition: AnchorPoint;
  labelStartPosition: AnchorPoint;
};

const toCssPixelPosition = (x: number, y: number): CssPixelPosition => ({
  x: x as CssPixelPosition["x"],
  y: y as CssPixelPosition["y"],
});

const LABEL_MARKERS_FONT_FAMILY = annotationTypographyDefaults.fontFamily;
const REPRESENTATIVE_CONTENT_FONT_WEIGHT = 400;
const REPRESENTATIVE_BADGE_FONT_WEIGHT =
  annotationTypographyDefaults.badgeFontWeight;
const REPRESENTATIVE_TEXT_COLOR = "rgba(248, 250, 252, 0.98)";

const REPRESENTATIVE_DEFAULT_COLOR_SCHEME: QualitativePillColorScheme = {
  id: "cobalt",
  label: "Kobalt · Referenz",
  content: "NHN 179,27 m",
  badgeContent: "8",
  labelBackgroundColor: "rgba(30, 64, 175, 0.78)",
  badgeBackgroundColor: "rgba(30, 58, 138, 0.98)",
  lineColor: "rgba(147, 197, 253, 0.88)",
};

const REPRESENTATIVE_SELECTED_COLOR_SCHEME = {
  labelBackgroundColor: "rgba(8, 47, 73, 0.9)",
  hoverBackgroundColor: "rgba(14, 116, 144, 0.82)",
  lineColor: "rgba(125, 211, 252, 0.94)",
} as const;

const REPRESENTATIVE_QUALITATIVE_COLOR_SCHEMES: readonly QualitativePillColorScheme[] =
  [
    REPRESENTATIVE_DEFAULT_COLOR_SCHEME,
    {
      id: "teal",
      label: "Teal · Status",
      content: "24,41 m über Bezugspunkt",
      badgeContent: "A",
      labelBackgroundColor: "rgba(15, 118, 110, 0.78)",
      badgeBackgroundColor: "rgba(17, 94, 89, 0.98)",
      lineColor: "rgba(94, 234, 212, 0.86)",
    },
    {
      id: "violet",
      label: "Violett · Analyse",
      content: "relative Höhe über Bezugspunkt",
      badgeContent: "B",
      labelBackgroundColor: "rgba(109, 40, 217, 0.78)",
      badgeBackgroundColor: "rgba(91, 33, 182, 0.98)",
      lineColor: "rgba(196, 181, 253, 0.88)",
    },
    {
      id: "amber",
      label: "Amber · Hinweis",
      content: "temporäre Referenzhöhe",
      badgeContent: "C",
      labelBackgroundColor: "rgba(146, 64, 14, 0.8)",
      badgeBackgroundColor: "rgba(120, 53, 15, 0.98)",
      lineColor: "rgba(251, 191, 36, 0.88)",
    },
    {
      id: "rose",
      label: "Rose · Prüfung",
      content: "Prüfung erforderlich",
      badgeContent: "D",
      labelBackgroundColor: "rgba(190, 24, 93, 0.78)",
      badgeBackgroundColor: "rgba(157, 23, 77, 0.98)",
      lineColor: "rgba(251, 113, 133, 0.88)",
    },
  ] as const;

export const REPRESENTATIVE_CASES_STORY_ARGS: Partial<LabelMarkersStoryArgs> = {
  labelTextColor: REPRESENTATIVE_TEXT_COLOR,
  labelBackgroundColor: REPRESENTATIVE_DEFAULT_COLOR_SCHEME.labelBackgroundColor,
  badgeFillColor: REPRESENTATIVE_DEFAULT_COLOR_SCHEME.badgeBackgroundColor,
  badgeTextColor: REPRESENTATIVE_TEXT_COLOR,
  badgeBorderColor: REPRESENTATIVE_DEFAULT_COLOR_SCHEME.badgeBackgroundColor,
  badgeBorderWidth: 1,
};

const STORY_SECTION_COLUMN_WIDTH = 352;
const STORY_SECTION_GAP = 24;
const MAX_STORY_SECTION_COLUMNS = 4;
const STORY_ROW_PREVIEW_WIDTH = 240;

const pageStyle: CSSProperties = {
  userSelect: "text",
};

const sectionStyle: CSSProperties = {
  marginBottom: 0,
  minWidth: 0,
  width: "100%",
  maxWidth: "100%",
};

const sectionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${STORY_SECTION_COLUMN_WIDTH}px), ${STORY_SECTION_COLUMN_WIDTH}px))`,
  gap: STORY_SECTION_GAP,
  alignItems: "start",
  justifyContent: "center",
  width: "100%",
  maxWidth: 1120,
  margin: "0 auto",
};

const compactSectionStackStyle: CSSProperties = {
  display: "flex",
  gap: STORY_SECTION_GAP,
  alignItems: "start",
  justifyContent: "center",
  width: "100%",
  maxWidth: 1120,
  margin: "0 auto",
};

const compactSectionColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: STORY_SECTION_GAP,
  width: STORY_SECTION_COLUMN_WIDTH,
  maxWidth: "100%",
  minWidth: 0,
};

const compactSectionSingleColumnStyle: CSSProperties = {
  ...compactSectionColumnStyle,
  width: `min(100%, ${STORY_SECTION_COLUMN_WIDTH}px)`,
};

const sectionTitleStyle: CSSProperties = {
  marginBottom: 10,
  fontSize: 14,
  fontWeight: 600,
  color: "#334155",
};

const rowListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: "100%",
  background: "transparent",
};

const rowStyle: CSSProperties = {
  borderBottom: "1px solid rgba(148, 163, 184, 0.25)",
};

const readStorySectionColumnCount = (containerWidth: number): number => {
  if (containerWidth <= 0) {
    return 1;
  }

  return Math.max(
    1,
    Math.min(
      MAX_STORY_SECTION_COLUMNS,
      Math.floor(
        (containerWidth + STORY_SECTION_GAP) /
          (STORY_SECTION_COLUMN_WIDTH + STORY_SECTION_GAP)
      )
    )
  );
};

const distributeItemsByEstimatedHeight = <T,>(
  items: readonly T[],
  columnCount: number,
  estimateHeight: (item: T) => number
): T[][] => {
  if (columnCount <= 1) {
    return [Array.from(items)];
  }

  const columns = Array.from({ length: columnCount }, () => [] as T[]);
  const columnHeights = Array.from({ length: columnCount }, () => 0);

  items.forEach((item) => {
    const nextColumnIndex = columnHeights.reduce(
      (bestIndex, currentHeight, currentIndex, heights) =>
        currentHeight < heights[bestIndex] ? currentIndex : bestIndex,
      0
    );

    columns[nextColumnIndex].push(item);
    columnHeights[nextColumnIndex] += estimateHeight(item);
  });

  return columns;
};

const useMeasuredWidth = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const readWidth = () => {
      setWidth(element.getBoundingClientRect().width);
    };

    readWidth();

    const resizeObserver = new ResizeObserver(() => {
      readWidth();
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return { containerRef, width };
};

const rowCellStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minWidth: 0,
  padding: "5px 0",
};

const rowLabelStyle: CSSProperties = {
  textAlign: "left",
  flex: "1 1 auto",
  minWidth: 0,
  whiteSpace: "normal",
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.3,
  padding: 0,
};

const rowGraphicStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  justifyContent: "flex-end",
  flex: "0 0 auto",
  minWidth: 0,
  maxWidth: "100%",
  height: 34,
  overflow: "visible",
  padding: "3px 0",
  marginLeft: "auto",
  whiteSpace: "nowrap",
};

const FIXED_ROW_GRAPHIC_STYLE: CSSProperties = {
  width: STORY_ROW_PREVIEW_WIDTH,
  maxWidth: "100%",
};

const compactRowLabelStyle: CSSProperties = {
  whiteSpace: "normal",
  fontSize: 12,
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums lining-nums",
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
  padding: "0 10px 0 0",
};

const compactRowGraphicStyle: CSSProperties = {
  height: 30,
  padding: "2px 0",
};

const sectionMetaStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  lineHeight: 1.35,
  color: "#64748b",
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

const LABEL_BACKDROP_FILTER = "blur(6px) brightness(1.06) saturate(0.88)";

const pointLabelBaseStyles: CSSProperties = {
  padding: "2px 4px",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  userSelect: "none",
  pointerEvents: "none",
  margin: 0,
  backdropFilter: LABEL_BACKDROP_FILTER,
  WebkitBackdropFilter: LABEL_BACKDROP_FILTER,
};

const noopMouseEventHandler = () => undefined;
const noopHoverHandler = () => undefined;

const makeSharedStyleProps = (
  args: LabelMarkersStoryArgs
): PointLabelStyleProps => ({
  fontSize: `${annotationTypographyDefaults.rootFontSizePx}px`,
  fontFamily: annotationTypographyDefaults.fontFamily,
  fontWeight: REPRESENTATIVE_CONTENT_FONT_WEIGHT,
  textColor: args.labelTextColor,
  textBackgroundColor: args.labelBackgroundColor,
  selectedBackgroundColor:
    REPRESENTATIVE_SELECTED_COLOR_SCHEME.labelBackgroundColor,
  hoverBackgroundColor: REPRESENTATIVE_SELECTED_COLOR_SCHEME.hoverBackgroundColor,
  lineColor: REPRESENTATIVE_DEFAULT_COLOR_SCHEME.lineColor,
  lineWidth: 1,
  markerSize: 10,
  markerStrokeWidth: args.badgeBorderWidth ?? 1,
  stemStartDistance: 5,
  markerBackgroundColor: args.badgeFillColor,
  markerTextColor: args.badgeTextColor,
  labelDistance: 20,
});

const InlineRow = ({
  label,
  children,
  labelStyle,
  graphicStyle,
  cellStyle,
}: {
  label: string;
  children: ReactNode;
  labelStyle?: CSSProperties;
  graphicStyle?: CSSProperties;
  cellStyle?: CSSProperties;
}) => (
  <div style={rowStyle}>
    <div style={{ ...rowCellStyle, ...cellStyle }}>
      <div style={{ ...rowLabelStyle, ...labelStyle }}>{label}</div>
      <div style={{ ...rowGraphicStyle, ...graphicStyle }}>{children}</div>
    </div>
  </div>
);

const pillboxDemoViewportStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  minWidth: 0,
  height: 44,
  overflow: "visible",
};

const DEFAULT_PILLBOX_LABEL_POSITION: AnchorPoint = {
  x: 12,
  y: 22,
};

const LEFT_ALIGNED_PILLBOX_LABEL_POSITION: AnchorPoint = {
  x: 12,
  y: 22,
};

const representativeLineLabelViewportStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: 48,
  overflow: "visible",
};

const LABEL_COMPONENT_ROW_LABEL_STYLE: CSSProperties = {
  ...compactRowLabelStyle,
  flex: "0 1 auto",
};
const LABEL_COMPONENT_ROW_CELL_STYLE: CSSProperties = {
  alignItems: "center",
};
const LABEL_COMPONENT_INLINE_ROW_GRAPHIC_STYLE: CSSProperties = {
  position: "static",
  display: "block",
  flex: "0 0 auto",
  width: "auto",
  maxWidth: "100%",
  minWidth: 0,
  height: "auto",
  minHeight: 0,
  padding: 0,
  lineHeight: 1,
  textAlign: "right",
  whiteSpace: "nowrap",
};
const REPRESENTATIVE_ROW_GRAPHIC_STYLE: CSSProperties = {
  ...FIXED_ROW_GRAPHIC_STYLE,
  height: 44,
};
const LINE_LABEL_ROW_GRAPHIC_STYLE: CSSProperties = {
  ...FIXED_ROW_GRAPHIC_STYLE,
  height: 48,
};
const LABEL_COMPONENT_VIEWPORT_STYLE: CSSProperties = {
  minWidth: 0,
  width: "100%",
  display: "block",
  height: 44,
};

const INLINE_PILL_LABEL_BASE_STYLES: CSSProperties = {
  ...pointLabelBaseStyles,
  padding: 0,
};

const resolveStoryBackgroundMode = (
  args: LabelMarkersStoryArgs,
  fallback: LabelStoryBackgroundMode
): LabelStoryBackgroundMode =>
  args.storyBackground ?? args.pageBackgroundMode ?? fallback;

const readStaticAnchorHostStyle = (
  labelAttach: PointLabelAttach
): CSSProperties =>
  labelAttach === POINT_LABEL_ATTACH.CENTER
    ? {
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      }
    : labelAttach === POINT_LABEL_ATTACH.RIGHT
    ? {
        position: "absolute",
        right: 12,
        top: "50%",
        transform: "translateY(-50%)",
      }
    : {
        position: "absolute",
        left: 12,
        top: "50%",
        transform: "translateY(-50%)",
      };

export const readStoryBackground = (
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

  if (mode === LABEL_STORY_BACKGROUND_MODES.URBAN) {
    return `linear-gradient(180deg, rgba(248, 250, 252, 0.08), rgba(241, 245, 249, 0.16)), url(${barmenBackgroundUrl})`;
  }

  return "#f8fafc";
};

export const readStoryBackgroundStyle = (
  mode: LabelStoryBackgroundMode | undefined
): CSSProperties | undefined =>
  mode === LABEL_STORY_BACKGROUND_MODES.CHECKERBOARD
    ? {
        backgroundSize: "24px 24px",
        backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
      }
    : mode === LABEL_STORY_BACKGROUND_MODES.URBAN
    ? {
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
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

const DraggablePillbuttonLabelDemo = ({
  pointId,
  content,
  badgeContent,
  badgePosition,
  backgroundColor,
  sharedStyleProps,
  showDebugAnchors,
  styleOverrides,
  badgeBorderColor,
  labelAttach = POINT_LABEL_ATTACH.CENTER,
  initialLabelPosition = DEFAULT_PILLBOX_LABEL_POSITION,
  viewportStyle,
  alignPreviewRight = false,
  previewRightInsetPx = 0,
}: {
  pointId: string;
  content: ReactNode;
  badgeContent?: ReactNode;
  badgePosition?: PillbuttonBadgePosition;
  backgroundColor: string;
  sharedStyleProps: PointLabelStyleProps;
  showDebugAnchors: boolean;
  styleOverrides?: Partial<PointLabelStyleProps>;
  badgeBorderColor?: string;
  labelAttach?: PointLabelAttach;
  initialLabelPosition?: AnchorPoint;
  viewportStyle?: CSSProperties;
  alignPreviewRight?: boolean;
  previewRightInsetPx?: number;
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [labelPosition, setLabelPosition] = useState(initialLabelPosition);
  const [anchorPoints, setAnchorPoints] = useState<AnchorPointMap>({
    left: { x: 148, y: 40 },
    center: { x: 156, y: 40 },
    right: { x: 164, y: 40 },
  });
  const labelPositionRef = useRef(labelPosition);
  const anchorPointsRef = useRef(anchorPoints);
  const dragSessionRef = useRef<DragSession | null>(null);
  const labelDragSessionRef = useRef<LabelDragSession | null>(null);

  useEffect(() => {
    labelPositionRef.current = labelPosition;
  }, [labelPosition]);

  useEffect(() => {
    anchorPointsRef.current = anchorPoints;
  }, [anchorPoints]);

  useEffect(() => {
    setLabelPosition(initialLabelPosition);
    labelPositionRef.current = initialLabelPosition;
    dragSessionRef.current = null;
    labelDragSessionRef.current = null;
  }, [initialLabelPosition]);

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
      if (!pillElement) {
        return;
      }

      const stageRect = stageElement.getBoundingClientRect();
      const pillRect = pillElement.getBoundingClientRect();

      if (
        alignPreviewRight &&
        dragSessionRef.current === null &&
        labelDragSessionRef.current === null
      ) {
        const currentRightPx = pillRect.right - stageRect.left;
        const targetRightPx = stageRect.width - previewRightInsetPx;
        const deltaPx = targetRightPx - currentRightPx;

        if (Math.abs(deltaPx) > 0.5) {
          const nextLabelPosition = {
            x: labelPositionRef.current.x + deltaPx,
            y: labelPositionRef.current.y,
          };

          labelPositionRef.current = nextLabelPosition;
          setLabelPosition(nextLabelPosition);
          return;
        }
      }

      const top = pillRect.top - stageRect.top;
      const left = pillRect.left - stageRect.left;
      const localAnchors = resolvePillbuttonLabelMarkerLocalAnchorPoints({
        heightPx: pillRect.height,
        widthPx: pillRect.width,
      });
      const nextAnchorPoints: AnchorPointMap = {
        left: {
          x: left + localAnchors.left.x,
          y: top + localAnchors.left.y,
        },
        center: {
          x: left + localAnchors.center.x,
          y: top + localAnchors.center.y,
        },
        right: {
          x: left + localAnchors.right.x,
          y: top + localAnchors.right.y,
        },
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

      if (!pillElement) {
        animationFrameId = window.requestAnimationFrame(connect);
        return;
      }

      readAnchors();
      resizeObserver = new ResizeObserver(() => readAnchors());
      resizeObserver.observe(stageElement);
      resizeObserver.observe(pillElement);
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
    alignPreviewRight,
    labelAttach,
    pointId,
    previewRightInsetPx,
    sharedStyleProps,
  ]);

  const toAnchorPosition = (
    anchorKind: DraggableAnchorKind
  ): CssPixelPosition =>
    toCssPixelPosition(anchorPoints[anchorKind].x, anchorPoints[anchorKind].y);

  const handleAnchorDragStart = (anchorKind: DraggableAnchorKind) => {
    dragSessionRef.current = {
      anchorKind,
      anchorStartPosition: anchorPointsRef.current[anchorKind],
      labelStartPosition: labelPositionRef.current,
    };
  };

  const handleAnchorDragChange = (
    anchorKind: DraggableAnchorKind,
    nextPosition: CssPixelPosition
  ) => {
    const activeSession =
      dragSessionRef.current?.anchorKind === anchorKind
        ? dragSessionRef.current
        : {
            anchorKind,
            anchorStartPosition: anchorPointsRef.current[anchorKind],
            labelStartPosition: labelPositionRef.current,
          };

    const nextLabelPosition = {
      x:
        activeSession.labelStartPosition.x +
        (Number(nextPosition.x) - activeSession.anchorStartPosition.x),
      y:
        activeSession.labelStartPosition.y +
        (Number(nextPosition.y) - activeSession.anchorStartPosition.y),
    };

    dragSessionRef.current = activeSession;
    labelPositionRef.current = nextLabelPosition;
    setLabelPosition(nextLabelPosition);
  };

  const handleAnchorDragEnd = () => {
    dragSessionRef.current = null;
  };

  const handleLabelDragMove = useCallback((event: MouseEvent) => {
    const activeSession = labelDragSessionRef.current;
    if (!activeSession) {
      return;
    }

    const nextLabelPosition = {
      x:
        activeSession.labelStartPosition.x +
        (event.clientX - activeSession.pointerStartPosition.x),
      y:
        activeSession.labelStartPosition.y +
        (event.clientY - activeSession.pointerStartPosition.y),
    };

    labelPositionRef.current = nextLabelPosition;
    setLabelPosition(nextLabelPosition);
  }, []);

  const handleLabelDragEnd = useCallback(() => {
    labelDragSessionRef.current = null;
    if (typeof window === "undefined") {
      return;
    }
    window.removeEventListener("mousemove", handleLabelDragMove);
    window.removeEventListener("mouseup", handleLabelDragEnd);
  }, [handleLabelDragMove]);

  useEffect(
    () => () => {
      handleLabelDragEnd();
    },
    [handleLabelDragEnd]
  );

  const handleLabelDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    labelDragSessionRef.current = {
      pointerStartPosition: {
        x: event.clientX,
        y: event.clientY,
      },
      labelStartPosition: labelPositionRef.current,
    };

    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("mousemove", handleLabelDragMove);
    window.addEventListener("mouseup", handleLabelDragEnd);
  };

  const effectiveStyleProps = { ...sharedStyleProps, ...styleOverrides };
  const badgeBorderStyle = `${Math.max(
    effectiveStyleProps.markerStrokeWidth ?? 1,
    1
  )}px solid ${badgeBorderColor ?? "rgba(126, 126, 126, 0.96)"}`;

  return (
    <div style={{ ...pillboxDemoViewportStyle, ...viewportStyle }}>
      <div
        ref={stageRef}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "visible",
        }}
      >
        <PillbuttonLabelMarker
          pointId={pointId}
          attach={labelAttach}
          offsetX={labelPosition.x}
          offsetY={labelPosition.y}
          containerStyle={{
            ...pointLabelBaseStyles,
            border: badgeBorderStyle,
            fontSize: effectiveStyleProps.fontSize ?? "12px",
            fontFamily:
              effectiveStyleProps.fontFamily ?? LABEL_MARKERS_FONT_FAMILY,
            fontWeight:
              effectiveStyleProps.fontWeight ?? REPRESENTATIVE_CONTENT_FONT_WEIGHT,
            backgroundColor,
            color: effectiveStyleProps.textColor ?? "#0f172a",
            pointerEvents: "auto",
            cursor: "grab",
          }}
          badgeStyle={{
            backgroundColor: effectiveStyleProps.markerBackgroundColor,
            color: effectiveStyleProps.markerTextColor,
          }}
          badgeContent={badgeContent}
          badgePosition={badgePosition}
          content={content}
          onClick={noopMouseEventHandler}
          onDoubleClick={noopMouseEventHandler}
          onMouseDown={handleLabelDragStart}
          onMouseUp={handleLabelDragEnd}
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
                  onDragStart={() => handleAnchorDragStart(anchorKind)}
                  onChange={(nextPosition) =>
                    handleAnchorDragChange(anchorKind, nextPosition)
                  }
                  onDragEnd={handleAnchorDragEnd}
                />
              )
            )
          : null}
      </div>
    </div>
  );
};

const StaticAnchoredPillbuttonLabelDemo = ({
  pointId,
  content,
  badgeContent,
  badgePosition,
  backgroundColor,
  sharedStyleProps,
  styleOverrides,
  badgeBorderColor,
  labelAttach = POINT_LABEL_ATTACH.LEFT,
  collapse = false,
  showDebugAnchors = false,
  viewportStyle,
}: {
  pointId: string;
  content: ReactNode;
  badgeContent?: ReactNode;
  badgePosition?: PillbuttonBadgePosition;
  backgroundColor: string;
  sharedStyleProps: PointLabelStyleProps;
  styleOverrides?: Partial<PointLabelStyleProps>;
  badgeBorderColor?: string;
  labelAttach?: PointLabelAttach;
  collapse?: boolean;
  showDebugAnchors?: boolean;
  viewportStyle?: CSSProperties;
}) => {
  const effectiveStyleProps = { ...sharedStyleProps, ...styleOverrides };
  const badgeBorderStyle = `${Math.max(
    effectiveStyleProps.markerStrokeWidth ?? 1,
    1
  )}px solid ${badgeBorderColor ?? "rgba(126, 126, 126, 0.96)"}`;

  const anchorHostStyle = readStaticAnchorHostStyle(labelAttach);

  return (
    <div style={{ ...pillboxDemoViewportStyle, ...viewportStyle }}>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div style={anchorHostStyle}>
          <AnchorHairlineDebug visible={showDebugAnchors} />
          <PillbuttonLabelMarker
            pointId={pointId}
            attach={labelAttach}
            offsetX={0}
            offsetY={0}
            containerStyle={{
              ...pointLabelBaseStyles,
              border: badgeBorderStyle,
              fontSize: effectiveStyleProps.fontSize ?? "12px",
              fontFamily:
                effectiveStyleProps.fontFamily ?? LABEL_MARKERS_FONT_FAMILY,
              fontWeight: effectiveStyleProps.fontWeight ?? "400",
              backgroundColor,
              color: effectiveStyleProps.textColor ?? "#0f172a",
              pointerEvents: "auto",
              cursor: "default",
            }}
            badgeStyle={{
              backgroundColor: effectiveStyleProps.markerBackgroundColor,
              color: effectiveStyleProps.markerTextColor,
              fontWeight: REPRESENTATIVE_BADGE_FONT_WEIGHT,
            }}
            badgeContent={badgeContent}
            badgePosition={badgePosition}
            content={collapse ? undefined : content}
            onClick={noopMouseEventHandler}
            onDoubleClick={noopMouseEventHandler}
            onMouseDown={noopMouseEventHandler}
            onMouseUp={noopMouseEventHandler}
            onMouseEnter={noopHoverHandler}
            onMouseLeave={noopHoverHandler}
          />
        </div>
      </div>
    </div>
  );
};

const InlinePillbuttonLabelDemo = ({
  pointId,
  content,
  badgeContent,
  badgePosition,
  backgroundColor,
  sharedStyleProps,
  styleOverrides,
  badgeBorderColor,
}: {
  pointId: string;
  content: ReactNode;
  badgeContent?: ReactNode;
  badgePosition?: PillbuttonBadgePosition;
  backgroundColor: string;
  sharedStyleProps: PointLabelStyleProps;
  styleOverrides?: Partial<PointLabelStyleProps>;
  badgeBorderColor?: string;
}) => {
  const effectiveStyleProps = { ...sharedStyleProps, ...styleOverrides };
  const badgeBorderStyle = `${Math.max(
    effectiveStyleProps.markerStrokeWidth ?? 1,
    1
  )}px solid ${badgeBorderColor ?? "rgba(126, 126, 126, 0.96)"}`;

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        overflow: "visible",
      }}
    >
      <PillbuttonLabelMarker
        pointId={pointId}
        attach={POINT_LABEL_ATTACH.LEFT}
        containerStyle={{
          ...INLINE_PILL_LABEL_BASE_STYLES,
          border: badgeBorderStyle,
          fontSize: effectiveStyleProps.fontSize ?? "12px",
          fontFamily: effectiveStyleProps.fontFamily ?? LABEL_MARKERS_FONT_FAMILY,
          fontWeight:
            effectiveStyleProps.fontWeight ?? REPRESENTATIVE_CONTENT_FONT_WEIGHT,
          backgroundColor,
          color: effectiveStyleProps.textColor ?? "#0f172a",
          pointerEvents: "auto",
          cursor: "default",
        }}
        badgeStyle={{
          backgroundColor: effectiveStyleProps.markerBackgroundColor,
          color: effectiveStyleProps.markerTextColor,
          fontWeight: REPRESENTATIVE_BADGE_FONT_WEIGHT,
        }}
        badgeContent={badgeContent}
        badgePosition={badgePosition}
        content={content}
        onClick={noopMouseEventHandler}
        onDoubleClick={noopMouseEventHandler}
        onMouseDown={noopMouseEventHandler}
        onMouseUp={noopMouseEventHandler}
        onMouseEnter={noopHoverHandler}
        onMouseLeave={noopHoverHandler}
      />
    </span>
  );
};

const StaticPointLabelPreview = ({
  pointId,
  content,
  badgeContent,
  pitch,
  selected,
  isOccluded,
  hideLabelAndStem,
  hideMarker,
  labelAttach,
  collapse,
  sharedStyleProps,
  showDebugAnchors,
}: {
  pointId: string;
  content: ReactNode;
  badgeContent?: ReactNode;
  pitch: number;
  selected: boolean;
  isOccluded: boolean;
  hideLabelAndStem: boolean;
  hideMarker: boolean;
  labelAttach: PointLabelAttach;
  collapse: boolean;
  sharedStyleProps?: PointLabelStyleProps;
  showDebugAnchors: boolean;
}) => (
  <div style={pillboxDemoViewportStyle}>
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ ...anchorStyle, top: "54%" }}>
        <AnchorHairlineDebug visible={showDebugAnchors} />
        <PointLabel
          pointId={pointId}
          content={content}
          badgeContent={badgeContent}
          pitch={pitch}
          selected={selected}
          isOccluded={isOccluded}
          hideLabelAndStem={hideLabelAndStem}
          hideMarker={hideMarker}
          labelAttach={labelAttach}
          collapse={collapse}
          {...(sharedStyleProps ?? {})}
        />
      </div>
    </div>
  </div>
);

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
      className="carma-annotation-overlay-line-label"
      data-annotation-overlay-line-label-theme={
        PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK
      }
      style={
        {
          position: "absolute",
          left: 160,
          top: "50%",
          display: "block",
          transform: "translate(-50%, -50%)",
          "--carma-annotation-overlay-line-label-font-family":
            LABEL_MARKERS_FONT_FAMILY,
          "--carma-annotation-overlay-line-label-font-size": "14px",
          "--carma-annotation-overlay-line-label-font-weight": "500",
        } as CSSProperties
      }
    >
      <span className="carma-annotation-overlay-line-label__frame">
        {blur ? (
          <span
            className="carma-annotation-overlay-line-label__backdrop"
            data-annotation-overlay-line-label-background-style={
              PREVIEW_LINE_LABEL_BACKGROUND_STYLE.SOFT_RECT_FADE
            }
          />
        ) : null}
        <span
          className="carma-annotation-overlay-line-label__text"
          style={{ fontSize: 14 }}
        >
          {text}
        </span>
      </span>
    </div>
  </div>
);

export const RepresentativeCasesStory = (args: LabelMarkersStoryArgs) => {
  const sharedStyleProps = makeSharedStyleProps(args);
  const showDebugAnchors = args.debugAnchors === true;
  const pageBackgroundMode = resolveStoryBackgroundMode(
    args,
    LABEL_STORY_BACKGROUND_MODES.PLAIN
  );
  const statusValues = [
    `content ${String(args.content)}`,
    `badge ${String(args.badgeContent ?? "7")}`,
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
          <div style={sectionTitleStyle}>attach · collapse · text</div>
          <div style={rowListStyle}>
            {(
              [
                {
                  id: "label-left",
                  label: "attach left",
                  attach: POINT_LABEL_ATTACH.LEFT,
                  content: "14,92 m",
                  collapse: false,
                },
                {
                  id: "label-center",
                  label: "attach center",
                  attach: POINT_LABEL_ATTACH.CENTER,
                  content: "392.5px screen distance",
                  collapse: false,
                },
                {
                  id: "label-right-selected",
                  label: "attach right · selected",
                  attach: POINT_LABEL_ATTACH.RIGHT,
                  content: "selected",
                  collapse: false,
                },
                {
                  id: "label-collapsed",
                  label: "collapsed compact",
                  attach: POINT_LABEL_ATTACH.LEFT,
                  content: "14,92 m",
                  collapse: true,
                  markerContent: args.badgeContent ?? "7",
                },
              ] as const
            ).map((entry) => (
              <InlineRow
                key={entry.id}
                label={entry.label}
                graphicStyle={REPRESENTATIVE_ROW_GRAPHIC_STYLE}
              >
                <StaticAnchoredPillbuttonLabelDemo
                  pointId={`pill-${entry.id}`}
                  content={entry.content}
                  badgeContent={entry.markerContent}
                  backgroundColor={
                    sharedStyleProps.textBackgroundColor ??
                    REPRESENTATIVE_DEFAULT_COLOR_SCHEME.labelBackgroundColor
                  }
                  sharedStyleProps={sharedStyleProps}
                  badgeBorderColor={
                    args.badgeBorderColor ??
                    REPRESENTATIVE_DEFAULT_COLOR_SCHEME.badgeBackgroundColor
                  }
                  labelAttach={entry.attach}
                  collapse={entry.collapse}
                  showDebugAnchors={showDebugAnchors}
                  viewportStyle={LABEL_COMPONENT_VIEWPORT_STYLE}
                />
              </InlineRow>
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>attach · badge side · text</div>
          <div style={rowListStyle}>
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
                  label: "wide badge left · long",
                  attach: POINT_LABEL_ATTACH.LEFT,
                  badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
                  content: "relative Höhe über Bezugspunkt",
                  markerContent: "33333",
                },
                {
                  id: "slot-right-wide-badge",
                  label: "wide badge right · long",
                  attach: POINT_LABEL_ATTACH.RIGHT,
                  badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
                  content: "relative Höhe über Bezugspunkt",
                  markerContent: "33333",
                },
              ] as const
            ).map((entry) => (
              <InlineRow
                key={entry.id}
                label={entry.label}
                graphicStyle={REPRESENTATIVE_ROW_GRAPHIC_STYLE}
              >
                <StaticAnchoredPillbuttonLabelDemo
                  pointId={`pill-variant-${entry.id}`}
                  content={entry.content}
                  badgeContent={entry.markerContent}
                  badgePosition={entry.badgePosition}
                  backgroundColor={
                    sharedStyleProps.textBackgroundColor ??
                    REPRESENTATIVE_DEFAULT_COLOR_SCHEME.labelBackgroundColor
                  }
                  sharedStyleProps={sharedStyleProps}
                  badgeBorderColor={
                    args.badgeBorderColor ??
                    REPRESENTATIVE_DEFAULT_COLOR_SCHEME.badgeBackgroundColor
                  }
                  labelAttach={entry.attach}
                  showDebugAnchors={showDebugAnchors}
                  viewportStyle={LABEL_COMPONENT_VIEWPORT_STYLE}
                />
              </InlineRow>
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>
            qualitative hues · selected highlight reserved
          </div>
          <div style={sectionMetaStyle}>
            five coherent dark measurement hues with white text; badge and label share the same hue family, while the selected state keeps a separate highlight palette.
          </div>
          <div style={rowListStyle}>
            {REPRESENTATIVE_QUALITATIVE_COLOR_SCHEMES.map((scheme) => (
              <InlineRow
                key={scheme.id}
                label={scheme.label}
                graphicStyle={REPRESENTATIVE_ROW_GRAPHIC_STYLE}
              >
                <StaticAnchoredPillbuttonLabelDemo
                  pointId={`pill-scheme-${scheme.id}`}
                  content={scheme.content}
                  badgeContent={scheme.badgeContent}
                  backgroundColor={scheme.labelBackgroundColor}
                  sharedStyleProps={{
                    ...sharedStyleProps,
                    textColor: REPRESENTATIVE_TEXT_COLOR,
                    textBackgroundColor: scheme.labelBackgroundColor,
                    markerBackgroundColor: scheme.badgeBackgroundColor,
                    markerTextColor: REPRESENTATIVE_TEXT_COLOR,
                    lineColor: scheme.lineColor,
                  }}
                  badgeBorderColor={scheme.badgeBackgroundColor}
                  labelAttach={POINT_LABEL_ATTACH.LEFT}
                  showDebugAnchors={showDebugAnchors}
                  viewportStyle={LABEL_COMPONENT_VIEWPORT_STYLE}
                />
              </InlineRow>
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>line label · backdrop</div>
          <div style={rowListStyle}>
            <InlineRow
              label="text only"
              graphicStyle={LINE_LABEL_ROW_GRAPHIC_STYLE}
            >
              <RepresentativeLineLabelDemo text="168,00 m" blur={false} />
            </InlineRow>
            <InlineRow
              label="blur backdrop"
              graphicStyle={LINE_LABEL_ROW_GRAPHIC_STYLE}
            >
              <RepresentativeLineLabelDemo text="168,00 m" blur />
            </InlineRow>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleStyle}>combined defaults</div>
          <div style={rowListStyle}>
            {(
              [
                {
                  id: "combined-default",
                  label: "default",
                  selected: false,
                  isOccluded: false,
                  collapse: true,
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
                  pitch: MINUS_PI_OVER_FOUR,
                  labelAttach: "left" as PointLabelAttach,
                  hideMarker: false,
                  hideLabelAndStem: false,
                },
              ] as const
            ).map((entry) => (
              <InlineRow
                key={entry.id}
                label={entry.label}
                graphicStyle={REPRESENTATIVE_ROW_GRAPHIC_STYLE}
              >
                <StaticPointLabelPreview
                  pointId={entry.id}
                  content={args.content}
                  badgeContent={args.badgeContent}
                  pitch={entry.pitch}
                  selected={entry.selected}
                  isOccluded={entry.isOccluded}
                  hideLabelAndStem={entry.hideLabelAndStem}
                  hideMarker={entry.hideMarker}
                  labelAttach={entry.labelAttach}
                  collapse={entry.collapse}
                  showDebugAnchors={showDebugAnchors}
                />
              </InlineRow>
            ))}
          </div>
        </section>
      </div>
    </CenteredStoryFrame>
  );
};

export const PillboxOnlyStory = (args: LabelMarkersStoryArgs) => {
  const sharedStyleProps = makeSharedStyleProps(args);
  const showDebugAnchors = args.debugAnchors === true;
  const { containerRef: sectionLayoutRef, width: sectionLayoutWidth } =
    useMeasuredWidth();
  const pageBackgroundMode = resolveStoryBackgroundMode(
    args,
    LABEL_STORY_BACKGROUND_MODES.PLAIN
  );
  const badgeSlot = args.badgeSlot ?? PILLBOX_STORY_BADGE_SLOTS.LEFT;
  const sharedBadgeContent =
    badgeSlot === PILLBOX_STORY_BADGE_SLOTS.NONE
      ? undefined
      : args.badgeContent ?? "7";
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

  type LabelComponentBadgeMode = "inherit" | "fixed" | "off";
  type LabelComponentRow = {
    id: string;
    label: string;
    content: ReactNode;
    backgroundColor: string;
    badgeMode?: LabelComponentBadgeMode;
    badgeContent?: ReactNode;
    badgePosition?: PillbuttonBadgePosition;
    styleOverrides?: Partial<PointLabelStyleProps>;
    sharedStyleOverrides?: Partial<PointLabelStyleProps>;
    labelAttach?: PointLabelAttach;
    initialLabelPosition?: AnchorPoint;
  };
  type LabelComponentSection = {
    id: string;
    title: string;
    lockedSummary: string;
    rows: readonly LabelComponentRow[];
    defaultBadgeMode: LabelComponentBadgeMode;
    defaultLabelAttach?: PointLabelAttach;
    defaultInitialLabelPosition?: AnchorPoint;
    sharedStyleOverrides?: Partial<PointLabelStyleProps>;
  };

  const sections: readonly LabelComponentSection[] = [
    {
      id: "controlled-baseline",
      title: "control-driven baseline",
      lockedSummary:
        "locked: only row intent; rest follows current controls for content, slot, colors, debug and page background.",
      defaultBadgeMode: "inherit",
      defaultLabelAttach: POINT_LABEL_ATTACH.LEFT,
      defaultInitialLabelPosition: LEFT_ALIGNED_PILLBOX_LABEL_POSITION,
      rows: [
        {
          id: "controlled-pill",
          label: "pill only",
          content: args.content,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          badgeMode: "off",
        },
        {
          id: "controlled-badge",
          label: "badge from controls",
          content: args.content,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
        },
        {
          id: "controlled-borderless",
          label: "borderless from controls",
          content: args.content,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
        },
      ],
    },
    {
      id: "compact-scale-mixes",
      title: "locked compact scales",
      lockedSummary:
        "locked: badge off, attach left, scale presets; rest keeps the active control palette.",
      defaultBadgeMode: "off",
      defaultLabelAttach: POINT_LABEL_ATTACH.LEFT,
      defaultInitialLabelPosition: LEFT_ALIGNED_PILLBOX_LABEL_POSITION,
      rows: [
        {
          id: "pillbox-xs",
          label: "xs",
          content: "7 m",
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          styleOverrides: { fontSize: "10px", fontWeight: "500" },
        },
        {
          id: "pillbox-md",
          label: "md",
          content: args.content,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
        },
        {
          id: "pillbox-lg",
          label: "lg",
          content: "392.5px screen distance",
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          styleOverrides: { fontSize: "16px", fontWeight: "600" },
        },
      ],
    },
    {
      id: "locked-badge-mixes",
      title: "locked badge/status",
      lockedSummary:
        "locked: badge text, badge side and status surface combinations; rest still follows the global controls where not overridden.",
      defaultBadgeMode: "fixed",
      defaultLabelAttach: POINT_LABEL_ATTACH.LEFT,
      defaultInitialLabelPosition: LEFT_ALIGNED_PILLBOX_LABEL_POSITION,
      rows: [
        {
          id: "pillbox-badge-left-ops",
          label: "ops left",
          content: "distance 14.92 m",
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          badgeContent: "ops",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
        },
        {
          id: "pillbox-badge-right-bus",
          label: "bus right",
          content: "station west",
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          badgeContent: "bus",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
        },
        {
          id: "pillbox-badge-emergency",
          label: "alert contrast",
          content: "temporary stop moved to lane B",
          backgroundColor: "rgba(255, 248, 204, 0.82)",
          badgeContent: "alert",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
          sharedStyleOverrides: {
            markerBackgroundColor: "rgba(185, 28, 28, 0.94)",
            markerTextColor: "#fff7ed",
          },
        },
        {
          id: "pillbox-badge-borderless",
          label: "borderless chip",
          content: "platform south",
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          badgeContent: "train",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
        },
      ],
    },
    {
      id: "locked-extended-mixes",
      title: "locked extended mixes",
      lockedSummary:
        "locked: long copy, wider badge words and representative content/badge pairings so growth behavior stays visible independent of controls.",
      defaultBadgeMode: "fixed",
      defaultLabelAttach: POINT_LABEL_ATTACH.LEFT,
      defaultInitialLabelPosition: LEFT_ALIGNED_PILLBOX_LABEL_POSITION,
      rows: [
        {
          id: "pillbox-extended-route-summary",
          label: "route summary",
          content: "route 602 to Rathaus",
          badgeContent: "route",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
        },
        {
          id: "pillbox-extended-service-alert",
          label: "service window",
          content: "maintenance until 18:30",
          badgeContent: "maintenance",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
          backgroundColor: "rgba(255, 248, 204, 0.82)",
        },
        {
          id: "pillbox-extended-accessibility",
          label: "accessibility",
          content: "barrier-free entrance",
          badgeContent: "accessible",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
        },
        {
          id: "pillbox-extended-platform-guidance",
          label: "platform guidance",
          content: "continue at platform 4",
          badgeContent: "platform 4",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
        },
        {
          id: "pillbox-extended-vertical-metric",
          label: "elevation metric",
          content: "NHN 179.274 m ref.",
          badgeContent: "delta +24.8 m",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          styleOverrides: { fontSize: "10px", fontWeight: "500" },
        },
        {
          id: "pillbox-extended-selected",
          label: "selected large",
          content: "selected cluster label",
          badgeContent: "12",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          styleOverrides: { fontSize: "16px", fontWeight: "600" },
        },
      ],
    },
    {
      id: "annotation-typography",
      title: "locked annotation typography",
      lockedSummary:
        "locked: font family, size, weight and opacity mirror the Annotation/Typography story classes so the same type palette can be checked directly on label pills.",
      defaultBadgeMode: "off",
      defaultLabelAttach: POINT_LABEL_ATTACH.LEFT,
      defaultInitialLabelPosition: LEFT_ALIGNED_PILLBOX_LABEL_POSITION,
      sharedStyleOverrides: {
        fontFamily: annotationTypographyDefaults.fontFamily,
      },
      rows: [
        {
          id: "pillbox-typography-heading",
          label: "Heading",
          content: "Punktmessung 3",
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          sharedStyleOverrides: {
            textColor: "rgba(17, 24, 39, 0.9)",
          },
          styleOverrides: {
            fontSize: `${annotationTypographyDefaults.headingFontSizePx}px`,
            fontWeight: annotationTypographyDefaults.headingFontWeight,
          },
        },
        {
          id: "pillbox-typography-root-medium",
          label: "Root / Medium",
          content: "NHN 179,27 m",
          badgeMode: "fixed",
          badgeContent: "8",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          sharedStyleOverrides: {
            textColor: "rgba(17, 24, 39, 1)",
            markerTextColor: "rgba(17, 24, 39, 1)",
          },
          styleOverrides: {
            fontSize: `${annotationTypographyDefaults.rootFontSizePx}px`,
            fontWeight: annotationTypographyDefaults.badgeFontWeight,
          },
        },
        {
          id: "pillbox-typography-root-regular",
          label: "Root / Regular",
          content: "24,41 m relative Höhe über Bezugspunkt",
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          sharedStyleOverrides: {
            textColor: "rgba(17, 24, 39, 1)",
          },
          styleOverrides: {
            fontSize: `${annotationTypographyDefaults.rootFontSizePx}px`,
            fontWeight: "400",
          },
        },
        {
          id: "pillbox-typography-support-semibold",
          label: "Support / Semibold",
          content: "Punktmessung · Referenzhöhe",
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          sharedStyleOverrides: {
            textColor: "rgba(71, 85, 105, 0.8)",
          },
          styleOverrides: {
            fontSize: `${annotationTypographyDefaults.supportFontSizePx}px`,
            fontWeight: annotationTypographyDefaults.sectionTitleFontWeight,
          },
        },
        {
          id: "pillbox-typography-support-subtitle",
          label: "Support / Subtitle",
          content: "51,272102°N 7,200488°O • NHN 179,27 m",
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          sharedStyleOverrides: {
            textColor: "rgba(17, 24, 39, 0.5)",
          },
          styleOverrides: {
            fontSize: `${annotationTypographyDefaults.supportFontSizePx}px`,
            fontWeight: "600",
          },
        },
        {
          id: "pillbox-typography-support-regular",
          label: "Support / Regular",
          content: "3 von 20 Messungen",
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          sharedStyleOverrides: {
            textColor: "rgba(17, 24, 39, 1)",
          },
          styleOverrides: {
            fontSize: `${annotationTypographyDefaults.supportFontSizePx}px`,
            fontWeight: "400",
          },
        },
        {
          id: "pillbox-typography-border-root",
          label: "Root · full border",
          content: "NHN 179,27 m",
          badgeMode: "fixed",
          badgeContent: "8",
          badgePosition: PILLBUTTON_BADGE_POSITIONS.LEFT,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          sharedStyleOverrides: {
            textColor: "rgba(17, 24, 39, 1)",
            markerTextColor: "rgba(17, 24, 39, 1)",
          },
          styleOverrides: {
            fontSize: `${annotationTypographyDefaults.rootFontSizePx}px`,
            fontWeight: annotationTypographyDefaults.badgeFontWeight,
          },
        },
        {
          id: "pillbox-typography-border-support",
          label: "Support · full border",
          content: "Punktmessung · Referenzhöhe",
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          sharedStyleOverrides: {
            textColor: "rgba(71, 85, 105, 0.8)",
          },
          styleOverrides: {
            fontSize: `${annotationTypographyDefaults.supportFontSizePx}px`,
            fontWeight: annotationTypographyDefaults.sectionTitleFontWeight,
          },
        },
      ],
    },
    {
      id: "anchor-reference",
      title: "left and right badge",
      lockedSummary: "locked: badge side; content follows active controls.",
      defaultBadgeMode: "inherit",
      defaultLabelAttach: POINT_LABEL_ATTACH.LEFT,
      defaultInitialLabelPosition: LEFT_ALIGNED_PILLBOX_LABEL_POSITION,
      rows: [
        {
          id: "pillbox-anchor-left-aligned",
          label: "badge left",
          content: args.content,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
        },
        {
          id: "pillbox-anchor-right-aligned",
          label: "badge right",
          content: args.content,
          backgroundColor:
            sharedStyleProps.textBackgroundColor ?? "rgba(255, 255, 255, 0.62)",
          badgeMode: "fixed",
          badgeContent: sharedBadgeContent,
          badgePosition: PILLBUTTON_BADGE_POSITIONS.RIGHT,
        },
      ],
    },
  ];

  const estimateSectionHeight = (section: LabelComponentSection): number =>
    88 + section.rows.length * 48;

  const sectionColumns = distributeItemsByEstimatedHeight(
    sections,
    readStorySectionColumnCount(sectionLayoutWidth),
    estimateSectionHeight
  );

  const renderSection = (section: LabelComponentSection) => (
    <section key={section.id} style={sectionStyle}>
      <div style={sectionTitleStyle}>{section.title}</div>
      <div style={sectionMetaStyle}>{section.lockedSummary}</div>
      <div style={rowListStyle}>
        {section.rows.map((row) => {
          const badgeMode = row.badgeMode ?? section.defaultBadgeMode;
          const badgeContent =
            badgeMode === "off"
              ? undefined
              : badgeMode === "inherit"
              ? badgeSlot === PILLBOX_STORY_BADGE_SLOTS.NONE
                ? undefined
                : sharedBadgeContent
              : row.badgeContent;
          const badgePosition =
            badgeMode === "off"
              ? undefined
              : badgeMode === "inherit"
              ? badgeSlot === PILLBOX_STORY_BADGE_SLOTS.NONE
                ? undefined
                : sharedBadgePosition
              : row.badgePosition;

          return (
            <InlineRow
              key={row.id}
              label={row.label}
              cellStyle={LABEL_COMPONENT_ROW_CELL_STYLE}
              labelStyle={LABEL_COMPONENT_ROW_LABEL_STYLE}
              graphicStyle={LABEL_COMPONENT_INLINE_ROW_GRAPHIC_STYLE}
            >
              <InlinePillbuttonLabelDemo
                pointId={row.id}
                content={row.content}
                badgeContent={badgeContent}
                badgePosition={badgePosition}
                backgroundColor={row.backgroundColor}
                sharedStyleProps={{
                  ...sharedStyleProps,
                  ...section.sharedStyleOverrides,
                  ...row.sharedStyleOverrides,
                }}
                styleOverrides={row.styleOverrides}
                badgeBorderColor={args.badgeBorderColor}
              />
            </InlineRow>
          );
        })}
      </div>
    </section>
  );

  return (
    <CenteredStoryFrame
      label="label component"
      values={statusValues}
      contentStyle={pageStyle}
      background={readStoryBackground(pageBackgroundMode)}
      backgroundStyle={readStoryBackgroundStyle(pageBackgroundMode)}
    >
      <div ref={sectionLayoutRef} style={compactSectionStackStyle}>
        {sectionColumns.map((column, columnIndex) => (
          <div
            key={`label-component-column-${columnIndex}`}
            style={
              sectionColumns.length === 1
                ? compactSectionSingleColumnStyle
                : compactSectionColumnStyle
            }
          >
            {column.map(renderSection)}
          </div>
        ))}
      </div>
    </CenteredStoryFrame>
  );
};

export const LabelBackgroundsStory = (args: LabelMarkersStoryArgs) => {
  const sharedStyleProps = makeSharedStyleProps(args);
  const showDebugAnchors = args.debugAnchors === true;
  const pageBackgroundMode = resolveStoryBackgroundMode(
    args,
    LABEL_STORY_BACKGROUND_MODES.URBAN
  );

  return (
    <CenteredStoryFrame
      label="label backgrounds"
      values={[
        `bg ${pageBackgroundMode}`,
        `debug ${showDebugAnchors ? "on" : "off"}`,
      ]}
      contentStyle={pageStyle}
      background={readStoryBackground(pageBackgroundMode)}
      backgroundStyle={readStoryBackgroundStyle(pageBackgroundMode)}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          minHeight: 460,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 32,
            right: 32,
            top: 112,
            borderTop: "1px dashed rgba(71, 85, 105, 0.38)",
          }}
        />
        <div
          className="carma-annotation-overlay-line-label"
          data-annotation-overlay-line-label-theme={
            PREVIEW_LINE_LABEL_THEME.BRIGHT_ON_DARK
          }
          style={
            {
              position: "absolute",
              left: "50%",
              top: 112,
              display: "block",
              transform: "translate(-50%, -50%)",
              "--carma-annotation-overlay-line-label-font-family":
                annotationTypographyDefaults.fontFamily,
              "--carma-annotation-overlay-line-label-font-size": `${annotationTypographyDefaults.rootFontSizePx}px`,
              "--carma-annotation-overlay-line-label-font-weight": `${annotationTypographyDefaults.lineLabelFontWeight}`,
            } as CSSProperties
          }
        >
          <span className="carma-annotation-overlay-line-label__frame">
            <span
              className="carma-annotation-overlay-line-label__backdrop"
              data-annotation-overlay-line-label-background-style={
                PREVIEW_LINE_LABEL_BACKGROUND_STYLE.SOFT_RECT_FADE
              }
            />
            <span
              className="carma-annotation-overlay-line-label__text"
              style={{ fontSize: annotationTypographyDefaults.rootFontSizePx }}
            >
              168,00 m
            </span>
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            left: 32,
            right: 32,
            top: 328,
            borderTop: "1px dashed rgba(71, 85, 105, 0.28)",
          }}
        />
        <div style={{ position: "absolute", left: 56, top: 316 }}>
          <DraggablePillbuttonLabelDemo
            pointId="label-background-left"
            content="NHN 179,27 m"
            badgeContent="8"
            badgePosition={PILLBUTTON_BADGE_POSITIONS.LEFT}
            backgroundColor="rgba(255, 255, 255, 0.72)"
            sharedStyleProps={{
              ...sharedStyleProps,
              markerBackgroundColor: "rgba(24, 24, 27, 0.86)",
            }}
            showDebugAnchors={showDebugAnchors}
            badgeBorderColor={args.badgeBorderColor}
            labelAttach={POINT_LABEL_ATTACH.LEFT}
            initialLabelPosition={{ x: 64, y: 28 }}
          />
        </div>
        <div style={{ position: "absolute", right: 72, top: 216 }}>
          <DraggablePillbuttonLabelDemo
            pointId="label-background-right"
            content="24,41 m über Bezugspunkt"
            badgeContent="11111"
            badgePosition={PILLBUTTON_BADGE_POSITIONS.RIGHT}
            backgroundColor="rgba(255, 248, 204, 0.74)"
            sharedStyleProps={{
              ...sharedStyleProps,
              markerBackgroundColor: "rgba(252, 211, 77, 0.96)",
              markerTextColor: "#111827",
            }}
            showDebugAnchors={showDebugAnchors}
            badgeBorderColor={args.badgeBorderColor}
            labelAttach={POINT_LABEL_ATTACH.RIGHT}
            initialLabelPosition={{ x: 284, y: 28 }}
          />
        </div>
      </div>
    </CenteredStoryFrame>
  );
};

export const LABEL_MARKERS_DEFAULT_ARGS: LabelMarkersStoryArgs = {
  content: "14,92 m",
  badgeContent: "7",
  badgeSlot: PILLBOX_STORY_BADGE_SLOTS.LEFT,
  labelTextColor: "#0f172a",
  labelBackgroundColor: "rgba(255, 255, 255, 0.62)",
  badgeFillColor: "rgba(30, 58, 138, 0.98)",
  badgeTextColor: "#f8fafc",
  badgeBorderColor: "rgba(126, 126, 126, 0.96)",
  badgeBorderWidth: 1,
  badgeBorderless: false,
  debugAnchors: false,
  storyBackground: LABEL_STORY_BACKGROUND_MODES.PLAIN,
};

export const LABEL_MARKERS_ARG_TYPES = {
  storyBackground: {
    name: "background",
    control: { type: "inline-radio" },
    options: Object.values(LABEL_STORY_BACKGROUND_MODES),
    table: { category: "Story / Canvas" },
  },
  debugAnchors: {
    name: "debug anchors",
    control: { type: "boolean" },
    table: { category: "Story / Debug" },
  },
  badgeSlot: {
    name: "badge side",
    control: { type: "inline-radio" },
    options: Object.values(PILLBOX_STORY_BADGE_SLOTS),
    table: { category: "Component / Badge" },
  },
  labelTextColor: {
    name: "text color",
    control: { type: "color" },
    table: { category: "Component / Label" },
  },
  labelBackgroundColor: {
    name: "fill color",
    control: { type: "color" },
    table: { category: "Component / Label" },
  },
  badgeFillColor: {
    name: "fill color",
    control: { type: "color" },
    table: { category: "Component / Badge" },
  },
  badgeBorderColor: {
    name: "border color",
    control: { type: "color" },
    table: { category: "Component / Badge" },
  },
  badgeTextColor: {
    name: "text color",
    control: { type: "color" },
    table: { category: "Component / Badge" },
  },
  badgeBorderWidth: {
    name: "border width",
    control: { type: "range", min: 1, max: 4, step: 1 },
    table: { category: "Component / Badge" },
  },
  badgeBorderless: {
    name: "borderless",
    control: { type: "boolean" },
    table: { category: "Component / Badge" },
  },
  badgeContent: {
    name: "badge text",
    control: { type: "text" },
    table: { category: "Component / Badge" },
  },
  content: {
    name: "label text",
    control: { type: "text" },
    table: { category: "Component / Label" },
  },
};

export const LABEL_MARKERS_PARAMETERS = {};
