import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { CssPixelPosition } from "@carma/units/types";
import {
  createScreenPointSvgLineVisualizers,
  LabelOverlayProvider,
  computePolygonSegmentLabelPlacements,
  type PolygonSegmentLabelSide,
  type PolygonSegmentLabelWindingOrder,
  useLineVisualizers,
} from "@carma-providers/label-overlay";

const frameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minHeight: 560,
  overflow: "hidden",
  background: "#fff",
};

const crosshairStyle: CSSProperties = {
  position: "absolute",
  width: 20,
  height: 20,
  transform: "translate(-50%, -50%)",
  border: "none",
  outline: "none",
  backgroundColor: "transparent",
  cursor: "none",
  touchAction: "none",
  padding: 0,
  zIndex: 20,
};

const toCssPixelPosition = (x: number, y: number): CssPixelPosition => ({
  x: x as CssPixelPosition["x"],
  y: y as CssPixelPosition["y"],
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const useContainerSize = (containerRef: RefObject<HTMLDivElement | null>) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = () => {
      setSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => {
        window.removeEventListener("resize", updateSize);
      };
    }

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  return size;
};

type DraggableCrosshairProps = {
  anchorId: string;
  position: CssPixelPosition;
  color: string;
  containerRef: RefObject<HTMLDivElement | null>;
  onChange: (nextPosition: CssPixelPosition) => void;
};

const DraggableCrosshair = ({
  anchorId,
  position,
  color,
  containerRef,
  onChange,
}: DraggableCrosshairProps) => {
  const isDraggingRef = useRef(false);
  const previousDocumentCursorRef = useRef<string | null>(null);
  const hairlinePx =
    typeof window !== "undefined" && window.devicePixelRatio > 0
      ? 1 / window.devicePixelRatio
      : 1;

  const hideNativeCursor = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    if (previousDocumentCursorRef.current === null) {
      previousDocumentCursorRef.current = root.style.cursor ?? "";
    }
    root.style.cursor = "none";
  }, []);

  const restoreNativeCursor = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (previousDocumentCursorRef.current === null) {
      return;
    }
    document.documentElement.style.cursor = previousDocumentCursorRef.current;
    previousDocumentCursorRef.current = null;
  }, []);

  useEffect(
    () => () => {
      restoreNativeCursor();
    },
    [restoreNativeCursor]
  );

  const updateFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const bounds = container.getBoundingClientRect();
      const nextX = clamp(event.clientX - bounds.left, 0, bounds.width);
      const nextY = clamp(event.clientY - bounds.top, 0, bounds.height);
      onChange(toCssPixelPosition(nextX, nextY));
    },
    [containerRef, onChange]
  );

  return (
    <button
      type="button"
      aria-label={`${anchorId} anchor`}
      onPointerDown={(event) => {
        isDraggingRef.current = true;
        hideNativeCursor();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (!isDraggingRef.current) {
          return;
        }
        updateFromPointer(event);
      }}
      onPointerUp={(event) => {
        isDraggingRef.current = false;
        restoreNativeCursor();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        isDraggingRef.current = false;
        restoreNativeCursor();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onLostPointerCapture={() => {
        isDraggingRef.current = false;
        restoreNativeCursor();
      }}
      style={{
        ...crosshairStyle,
        left: position.x,
        top: position.y,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          width: hairlinePx,
          height: "100%",
          transform: "translateX(-50%)",
          backgroundColor: color,
          opacity: 0.5,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 0,
          top: "50%",
          width: "100%",
          height: hairlinePx,
          transform: "translateY(-50%)",
          backgroundColor: color,
          opacity: 0.5,
        }}
      />
    </button>
  );
};

const LabelAnchorAngleDebug = ({
  placement,
  color,
}: {
  placement: { textX: number; textY: number; angleDeg: number } | null;
  color: string;
}) => {
  const hairlinePx =
    typeof window !== "undefined" && window.devicePixelRatio > 0
      ? 1 / window.devicePixelRatio
      : 1;
  if (!placement) {
    return null;
  }

  const angleLengthPx = 64;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: placement.textX,
          top: placement.textY,
          width: 16,
          height: 16,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          zIndex: 18,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: hairlinePx,
            height: "100%",
            transform: "translateX(-50%)",
            backgroundColor: color,
            opacity: 0.6,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            width: "100%",
            height: hairlinePx,
            transform: "translateY(-50%)",
            backgroundColor: color,
            opacity: 0.6,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: placement.textX,
          top: placement.textY,
          width: angleLengthPx,
          height: hairlinePx,
          transform: `translateY(-50%) rotate(${placement.angleDeg}deg)`,
          transformOrigin: "0 50%",
          backgroundColor: color,
          opacity: 0.7,
          pointerEvents: "none",
          zIndex: 18,
        }}
      />
    </>
  );
};

const resolveSimpleLineLabelPlacement = ({
  start,
  end,
  offsetPx = 14,
}: {
  start: CssPixelPosition;
  end: CssPixelPosition;
  offsetPx?: number;
}) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.0001) {
    return null;
  }

  const midX = (start.x + end.x) * 0.5;
  const midY = (start.y + end.y) * 0.5;
  const normalX = -dy / length;
  const normalY = dx / length;
  const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const normalizedAngle = ((rawAngleDeg % 360) + 360) % 360;
  const angleDeg =
    normalizedAngle > 90 && normalizedAngle < 270
      ? (normalizedAngle + 180) % 360
      : normalizedAngle;

  return {
    textX: midX + normalX * offsetPx,
    textY: midY + normalY * offsetPx,
    angleDeg,
  };
};

const TrianglePlacementToggle = ({
  a,
  b,
  c,
  sidePreference,
  windingOrder,
  onToggleSidePreference,
}: {
  a: CssPixelPosition;
  b: CssPixelPosition;
  c: CssPixelPosition;
  sidePreference: PolygonSegmentLabelSide;
  windingOrder: PolygonSegmentLabelWindingOrder;
  onToggleSidePreference: () => void;
}) => {
  const pointList = `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`;

  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 16,
      }}
    >
      <polygon
        points={pointList}
        fill={
          sidePreference === "outside"
            ? "rgba(15, 23, 42, 0.06)"
            : "rgba(16, 185, 129, 0.09)"
        }
        stroke={sidePreference === "outside" ? "#334155" : "#047857"}
        strokeWidth={1}
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "pointer" }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleSidePreference();
        }}
      />
      <text
        x={(a.x + b.x + c.x) / 3}
        y={(a.y + b.y + c.y) / 3}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#111827"
        fontSize={12}
        fontFamily="monospace"
        pointerEvents="none"
      >
        {`${windingOrder.toUpperCase()} • ${sidePreference}`}
      </text>
    </svg>
  );
};

const SingleLineLabelDebugOverlay = ({
  containerRef,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
}) => {
  const { width: containerWidth, height: containerHeight } =
    useContainerSize(containerRef);
  const resolvedWidth = containerWidth > 0 ? containerWidth : 1280;
  const resolvedHeight = containerHeight > 0 ? containerHeight : 720;

  const defaults = useMemo(
    () => ({
      start: toCssPixelPosition(resolvedWidth * 0.24, resolvedHeight * 0.44),
      end: toCssPixelPosition(resolvedWidth * 0.76, resolvedHeight * 0.56),
    }),
    [resolvedHeight, resolvedWidth]
  );

  const [start, setStart] = useState<CssPixelPosition>(defaults.start);
  const [end, setEnd] = useState<CssPixelPosition>(defaults.end);

  useEffect(() => {
    setStart(defaults.start);
    setEnd(defaults.end);
  }, [defaults]);

  const labelPlacement = useMemo(
    () => resolveSimpleLineLabelPlacement({ start, end, offsetPx: 14 }),
    [end, start]
  );

  const lines = useMemo(
    () => [
      ...createScreenPointSvgLineVisualizers({
        id: "single-line-label-debug",
        start,
        end,
        stroke: "rgba(30, 64, 175, 0.95)",
        strokeWidth: 10,
        dashed: true,
        capStyle: "round",
        dashLengthRatio: 1.2,
        dashGapRatio: 1.5,
        labelText: "single line",
        labelColor: "#111827",
        labelStroke: "rgba(255, 255, 255, 0.98)",
        labelFontSize: 14,
        labelFontFamily: "monospace",
        labelOffsetPx: 14,
      }),
    ],
    [end, start]
  );

  useLineVisualizers(lines, true);

  return (
    <>
      <LabelAnchorAngleDebug
        placement={labelPlacement}
        color="rgba(220, 38, 38, 0.95)"
      />
      <DraggableCrosshair
        anchorId="single-line-debug-start"
        position={start}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setStart}
      />
      <DraggableCrosshair
        anchorId="single-line-debug-end"
        position={end}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setEnd}
      />
    </>
  );
};

const PolygonSegmentLabelDebugOverlay = ({
  containerRef,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
}) => {
  const { width: containerWidth, height: containerHeight } =
    useContainerSize(containerRef);
  const resolvedWidth = containerWidth > 0 ? containerWidth : 1280;
  const resolvedHeight = containerHeight > 0 ? containerHeight : 720;

  const defaults = useMemo(
    () => ({
      start: toCssPixelPosition(resolvedWidth * 0.24, resolvedHeight * 0.36),
      end: toCssPixelPosition(resolvedWidth * 0.76, resolvedHeight * 0.46),
      apex: toCssPixelPosition(resolvedWidth * 0.56, resolvedHeight * 0.2),
    }),
    [resolvedHeight, resolvedWidth]
  );

  const [start, setStart] = useState<CssPixelPosition>(defaults.start);
  const [end, setEnd] = useState<CssPixelPosition>(defaults.end);
  const [sidePreference, setSidePreference] =
    useState<PolygonSegmentLabelSide>("outside");

  useEffect(() => {
    setStart(defaults.start);
    setEnd(defaults.end);
    setSidePreference("outside");
  }, [defaults]);

  const primarySegmentLabelPlacement = useMemo(
    () =>
      computePolygonSegmentLabelPlacements({
        polygon: [start, end, defaults.apex],
        closed: true,
        side: sidePreference,
        offsetPx: 72,
        rotationMode: "readable",
        windingPolicy: "respect-input",
      }).find((placement) => placement.segmentIndex === 0) ?? null,
    [defaults.apex, end, sidePreference, start]
  );

  const labelPlacement = useMemo(
    () =>
      primarySegmentLabelPlacement
        ? {
            textX: primarySegmentLabelPlacement.anchor.x,
            textY: primarySegmentLabelPlacement.anchor.y,
            angleDeg: primarySegmentLabelPlacement.rotationDeg,
          }
        : null,
    [primarySegmentLabelPlacement]
  );

  const lines = useMemo(
    () => [
      ...createScreenPointSvgLineVisualizers({
        id: "polygon-segment-label-debug",
        start,
        end,
        stroke: "rgba(30, 64, 175, 0.95)",
        strokeWidth: 10,
        dashed: true,
        capStyle: "round",
        dashLengthRatio: 1.2,
        dashGapRatio: 1.5,
        labelText: `triangle edge (${sidePreference})`,
        labelColor: "#111827",
        labelStroke: "rgba(255, 255, 255, 0.98)",
        labelFontSize: 14,
        labelFontFamily: "monospace",
        labelOffsetPx: 14,
        getLabelOutsideReferencePoint:
          sidePreference === "outside"
            ? () =>
                primarySegmentLabelPlacement?.outsideReferencePoint ?? null
            : undefined,
        getLabelInsideReferencePoint:
          sidePreference === "inside"
            ? () => primarySegmentLabelPlacement?.insideReferencePoint ?? null
            : undefined,
      }),
    ],
    [
      end,
      primarySegmentLabelPlacement?.insideReferencePoint,
      primarySegmentLabelPlacement?.outsideReferencePoint,
      sidePreference,
      start,
    ]
  );

  useLineVisualizers(lines, true);

  return (
    <>
      {primarySegmentLabelPlacement ? (
        <TrianglePlacementToggle
          a={start}
          b={end}
          c={defaults.apex}
          sidePreference={sidePreference}
          windingOrder={primarySegmentLabelPlacement.resolvedWindingOrder}
          onToggleSidePreference={() =>
            setSidePreference((previous) =>
              previous === "outside" ? "inside" : "outside"
            )
          }
        />
      ) : null}
      <LabelAnchorAngleDebug
        placement={labelPlacement}
        color="rgba(220, 38, 38, 0.95)"
      />
      <DraggableCrosshair
        anchorId="polygon-segment-debug-start"
        position={start}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setStart}
      />
      <DraggableCrosshair
        anchorId="polygon-segment-debug-end"
        position={end}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setEnd}
      />
    </>
  );
};

const SingleLineLabelDebugStory = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  return (
    <div ref={rootRef} style={frameStyle}>
      <LabelOverlayProvider containerRef={rootRef}>
        <SingleLineLabelDebugOverlay containerRef={rootRef} />
      </LabelOverlayProvider>
    </div>
  );
};

const PolygonSegmentLabelDebugStory = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  return (
    <div ref={rootRef} style={frameStyle}>
      <LabelOverlayProvider containerRef={rootRef}>
        <PolygonSegmentLabelDebugOverlay containerRef={rootRef} />
      </LabelOverlayProvider>
    </div>
  );
};

const meta: Meta = {
  title: "SVG/Label Placement",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const SingleLine: StoryObj = {
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => <SingleLineLabelDebugStory />,
};

export const PolygonSegment: StoryObj = {
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => <PolygonSegmentLabelDebugStory />,
};
