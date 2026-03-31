import { clamp } from "@carma/math";
import {
  COMPASS_NEEDLE_PITCH_LIMIT_EASINGS,
  createCompassNeedleController,
  createCompassNeedleElement,
  readCompassNeedlePitchLimitEasing,
  readCompassNeedleVisualPitchDeg,
} from "@carma-mapping/engines-interop/navigation-controls";
import type { Meta, StoryObj } from "@storybook/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

type CompassNeedleStoryArgs = {
  headingDeg: number;
  pitchDeg: number;
  sizePx: number;
  northColor: string;
  neutralColor: string;
  pitchLimitStartDeg: number;
  maxVisualPitchDeg: number;
  pitchLimitEasing: (typeof COMPASS_NEEDLE_PITCH_LIMIT_EASINGS)[keyof typeof COMPASS_NEEDLE_PITCH_LIMIT_EASINGS];
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startHeadingDeg: number;
  startPitchDeg: number;
};

type NeedleOrientationDeg = {
  headingDeg: number;
  pitchDeg: number;
};

const GRAPH_WIDTH_PX = 320;
const GRAPH_HEIGHT_PX = 180;
const GRAPH_MARGIN = {
  top: 8,
  right: 10,
  bottom: 24,
  left: 34,
} as const;

const PAGE_STYLE: CSSProperties = {
  width: "100%",
  padding: 16,
  background: "#f8fafc",
};

const CONTENT_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
  maxWidth: 900,
};

const PREVIEW_ROW_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 24,
  alignItems: "flex-start",
};

const PREVIEW_STAGE_STYLE: CSSProperties = {
  position: "relative",
  display: "grid",
  placeItems: "center",
  width: "min(100%, 420px)",
  aspectRatio: "1",
};

const STAGE_GUIDE_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

const HORIZON_STYLE: CSSProperties = {
  position: "absolute",
  left: "15%",
  right: "15%",
  top: "50%",
  height: "1px",
  background: "#cbd5e1",
};

const NORTH_MARKER_STYLE: CSSProperties = {
  position: "absolute",
  top: "10%",
  left: "50%",
  width: "2px",
  height: "10%",
  background: "#0f172a",
  transform: "translateX(-50%)",
};

const NEEDLE_SHELL_STYLE = (sizePx: number): CSSProperties => ({
  position: "relative",
  width: `${sizePx}px`,
  height: `${sizePx}px`,
  borderRadius: "999px",
  border: "1px solid #cbd5e1",
  background: "#fff",
  cursor: "grab",
  userSelect: "none",
  touchAction: "none",
});

const NEEDLE_MOUNT_STYLE: CSSProperties = {
  position: "absolute",
  inset: "14%",
  display: "grid",
  placeItems: "center",
  transformStyle: "preserve-3d",
};

const OUTPUT_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  minWidth: 260,
};

const TABLE_STYLE: CSSProperties = {
  borderCollapse: "collapse",
  fontSize: 12,
  color: "#0f172a",
};

const TABLE_CELL_STYLE: CSSProperties = {
  padding: "4px 10px 4px 0",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  verticalAlign: "top",
};

const TABLE_VALUE_STYLE: CSSProperties = {
  ...TABLE_CELL_STYLE,
  paddingRight: 0,
  fontVariantNumeric: "tabular-nums",
};

const CAPTION_STYLE: CSSProperties = {
  margin: 0,
  color: "#475569",
  fontSize: 12,
  lineHeight: 1.5,
  maxWidth: 420,
};

const GRAPH_LABEL_STYLE: CSSProperties = {
  fill: "#475569",
  fontSize: 11,
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const normalizeHeadingDeg = (headingDeg: number) => {
  const normalizedHeadingDeg = ((((headingDeg + 180) % 360) + 360) % 360) - 180;
  return normalizedHeadingDeg === -180 ? 180 : normalizedHeadingDeg;
};

const formatDeg = (value: number) => `${value.toFixed(1)}°`;

const readPitchCurvePath = ({
  pitchLimitStartDeg,
  maxVisualPitchDeg,
  pitchLimitEasing,
}: Pick<
  CompassNeedleStoryArgs,
  "pitchLimitStartDeg" | "maxVisualPitchDeg" | "pitchLimitEasing"
>) => {
  const innerWidth = GRAPH_WIDTH_PX - GRAPH_MARGIN.left - GRAPH_MARGIN.right;
  const innerHeight = GRAPH_HEIGHT_PX - GRAPH_MARGIN.top - GRAPH_MARGIN.bottom;
  const easing = readCompassNeedlePitchLimitEasing(pitchLimitEasing);
  const points: string[] = [];

  for (let inputPitchDeg = 0; inputPitchDeg <= 90; inputPitchDeg += 1) {
    const visualPitchDeg = readCompassNeedleVisualPitchDeg(inputPitchDeg, {
      startPitchDeg: pitchLimitStartDeg,
      maxVisualPitchDeg,
      easing,
    });
    const x =
      GRAPH_MARGIN.left + (inputPitchDeg / 90) * Math.max(innerWidth, 1);
    const y =
      GRAPH_MARGIN.top +
      innerHeight -
      (visualPitchDeg / 90) * Math.max(innerHeight, 1);
    points.push(`${inputPitchDeg === 0 ? "M" : "L"} ${x} ${y}`);
  }

  return points.join(" ");
};

const PitchMappingGraphic = ({
  inputPitchDeg,
  visualPitchDeg,
  pitchLimitStartDeg,
  maxVisualPitchDeg,
  pitchLimitEasing,
}: {
  inputPitchDeg: number;
  visualPitchDeg: number;
  pitchLimitStartDeg: number;
  maxVisualPitchDeg: number;
  pitchLimitEasing: CompassNeedleStoryArgs["pitchLimitEasing"];
}) => {
  const innerWidth = GRAPH_WIDTH_PX - GRAPH_MARGIN.left - GRAPH_MARGIN.right;
  const innerHeight = GRAPH_HEIGHT_PX - GRAPH_MARGIN.top - GRAPH_MARGIN.bottom;
  const curvePath = useMemo(
    () =>
      readPitchCurvePath({
        pitchLimitStartDeg,
        maxVisualPitchDeg,
        pitchLimitEasing,
      }),
    [maxVisualPitchDeg, pitchLimitEasing, pitchLimitStartDeg]
  );

  const readX = (pitchDeg: number) =>
    GRAPH_MARGIN.left + (pitchDeg / 90) * Math.max(innerWidth, 1);
  const readY = (pitchDeg: number) =>
    GRAPH_MARGIN.top + innerHeight - (pitchDeg / 90) * Math.max(innerHeight, 1);

  const currentX = readX(inputPitchDeg);
  const currentY = readY(visualPitchDeg);

  return (
    <svg
      aria-label="Needle pitch mapping"
      width={GRAPH_WIDTH_PX}
      height={GRAPH_HEIGHT_PX}
      viewBox={`0 0 ${GRAPH_WIDTH_PX} ${GRAPH_HEIGHT_PX}`}
    >
      <line
        x1={GRAPH_MARGIN.left}
        x2={GRAPH_MARGIN.left}
        y1={GRAPH_MARGIN.top}
        y2={GRAPH_MARGIN.top + innerHeight}
        stroke="#94a3b8"
        strokeWidth={1}
      />
      <line
        x1={GRAPH_MARGIN.left}
        x2={GRAPH_MARGIN.left + innerWidth}
        y1={GRAPH_MARGIN.top + innerHeight}
        y2={GRAPH_MARGIN.top + innerHeight}
        stroke="#94a3b8"
        strokeWidth={1}
      />
      <line
        x1={readX(0)}
        x2={readX(90)}
        y1={readY(0)}
        y2={readY(90)}
        stroke="#cbd5e1"
        strokeDasharray="4 4"
        strokeWidth={1}
      />
      <line
        x1={readX(pitchLimitStartDeg)}
        x2={readX(pitchLimitStartDeg)}
        y1={GRAPH_MARGIN.top}
        y2={GRAPH_MARGIN.top + innerHeight}
        stroke="#cbd5e1"
        strokeDasharray="4 4"
        strokeWidth={1}
      />
      <line
        x1={GRAPH_MARGIN.left}
        x2={GRAPH_MARGIN.left + innerWidth}
        y1={readY(maxVisualPitchDeg)}
        y2={readY(maxVisualPitchDeg)}
        stroke="#cbd5e1"
        strokeDasharray="4 4"
        strokeWidth={1}
      />
      <path d={curvePath} fill="none" stroke="#0f172a" strokeWidth={2} />
      <line
        x1={currentX}
        x2={currentX}
        y1={GRAPH_MARGIN.top + innerHeight}
        y2={currentY}
        stroke="#0f172a"
        strokeWidth={1}
        opacity={0.24}
      />
      <line
        x1={GRAPH_MARGIN.left}
        x2={currentX}
        y1={currentY}
        y2={currentY}
        stroke="#0f172a"
        strokeWidth={1}
        opacity={0.24}
      />
      <circle cx={currentX} cy={currentY} r={4} fill="#0f172a" />
      <text
        x={GRAPH_MARGIN.left}
        y={GRAPH_MARGIN.top - 2}
        style={GRAPH_LABEL_STYLE}
      >
        visual pitch
      </text>
      <text
        x={GRAPH_MARGIN.left + innerWidth}
        y={GRAPH_HEIGHT_PX - 4}
        textAnchor="end"
        style={GRAPH_LABEL_STYLE}
      >
        input pitch
      </text>
      <text
        x={readX(pitchLimitStartDeg) - 4}
        y={GRAPH_MARGIN.top + 12}
        textAnchor="end"
        style={GRAPH_LABEL_STYLE}
      >
        start
      </text>
      <text
        x={GRAPH_MARGIN.left + innerWidth - 4}
        y={readY(maxVisualPitchDeg) - 6}
        textAnchor="end"
        style={GRAPH_LABEL_STYLE}
      >
        max visual
      </text>
      <text
        x={GRAPH_MARGIN.left - 6}
        y={readY(0) + 4}
        textAnchor="end"
        style={GRAPH_LABEL_STYLE}
      >
        0°
      </text>
      <text
        x={GRAPH_MARGIN.left - 6}
        y={readY(45) + 4}
        textAnchor="end"
        style={GRAPH_LABEL_STYLE}
      >
        45°
      </text>
      <text
        x={GRAPH_MARGIN.left - 6}
        y={readY(90) + 4}
        textAnchor="end"
        style={GRAPH_LABEL_STYLE}
      >
        90°
      </text>
      <text x={readX(0)} y={GRAPH_HEIGHT_PX - 4} style={GRAPH_LABEL_STYLE}>
        0°
      </text>
      <text
        x={readX(45)}
        y={GRAPH_HEIGHT_PX - 4}
        textAnchor="middle"
        style={GRAPH_LABEL_STYLE}
      >
        45°
      </text>
      <text
        x={readX(90)}
        y={GRAPH_HEIGHT_PX - 4}
        textAnchor="end"
        style={GRAPH_LABEL_STYLE}
      >
        90°
      </text>
    </svg>
  );
};

const CompassNeedlePreview = ({
  headingDeg,
  pitchDeg,
  sizePx,
  northColor,
  neutralColor,
  pitchLimitStartDeg,
  maxVisualPitchDeg,
  pitchLimitEasing,
  onOrientationChange,
}: CompassNeedleStoryArgs & {
  onOrientationChange: (orientation: NeedleOrientationDeg) => void;
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ReturnType<
    typeof createCompassNeedleController
  > | null>(null);
  const callbackRef = useRef(onOrientationChange);
  const orientationRef = useRef<NeedleOrientationDeg>({
    headingDeg,
    pitchDeg,
  });
  const dragStateRef = useRef<DragState | null>(null);

  callbackRef.current = onOrientationChange;

  const setOrientation = (nextOrientation: NeedleOrientationDeg) => {
    orientationRef.current = nextOrientation;
    controllerRef.current?.setOrientation(nextOrientation);
    callbackRef.current(nextOrientation);
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const needleOptions = {
      northColor,
      neutralColor,
      pitchLimit: {
        startPitchDeg: pitchLimitStartDeg,
        maxVisualPitchDeg,
        easing: readCompassNeedlePitchLimitEasing(pitchLimitEasing),
      },
    } as const;

    const needle = createCompassNeedleElement(needleOptions);
    mount.replaceChildren(needle);

    const controller = createCompassNeedleController(needle, needleOptions);
    controllerRef.current = controller;
    controller.setOrientation(orientationRef.current);

    return () => {
      controller.destroy();
      controllerRef.current = null;
      mount.replaceChildren();
    };
  }, [
    maxVisualPitchDeg,
    neutralColor,
    northColor,
    pitchLimitEasing,
    pitchLimitStartDeg,
  ]);

  useEffect(() => {
    setOrientation({
      headingDeg,
      pitchDeg,
    });
    // The callback is intentionally routed through callbackRef to avoid
    // re-seeding the imperative controller on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headingDeg, pitchDeg]);

  const endDrag = () => {
    dragStateRef.current = null;

    if (shellRef.current) {
      shellRef.current.style.cursor = "grab";
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startHeadingDeg: orientationRef.current.headingDeg,
      startPitchDeg: orientationRef.current.pitchDeg,
    };
    shellRef.current?.setPointerCapture(event.pointerId);

    if (shellRef.current) {
      shellRef.current.style.cursor = "grabbing";
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextHeadingDeg = normalizeHeadingDeg(
      dragState.startHeadingDeg + (event.clientX - dragState.startX) * 0.8
    );
    const nextPitchDeg = clamp(
      dragState.startPitchDeg - (event.clientY - dragState.startY) * 0.35,
      0,
      90
    );

    setOrientation({
      headingDeg: nextHeadingDeg,
      pitchDeg: nextPitchDeg,
    });
  };

  return (
    <div style={PREVIEW_STAGE_STYLE}>
      <div style={STAGE_GUIDE_STYLE}>
        <div style={HORIZON_STYLE} />
        <div style={NORTH_MARKER_STYLE} />
      </div>
      <div
        ref={shellRef}
        style={NEEDLE_SHELL_STYLE(sizePx)}
        onLostPointerCapture={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
      >
        <div ref={mountRef} style={NEEDLE_MOUNT_STYLE} />
      </div>
    </div>
  );
};

const CompassNeedleStory = (args: CompassNeedleStoryArgs) => {
  const [liveOrientation, setLiveOrientation] = useState<NeedleOrientationDeg>({
    headingDeg: args.headingDeg,
    pitchDeg: args.pitchDeg,
  });

  useEffect(() => {
    setLiveOrientation({
      headingDeg: args.headingDeg,
      pitchDeg: args.pitchDeg,
    });
  }, [args.headingDeg, args.pitchDeg]);

  const visualPitchDeg = useMemo(
    () =>
      readCompassNeedleVisualPitchDeg(liveOrientation.pitchDeg, {
        startPitchDeg: args.pitchLimitStartDeg,
        maxVisualPitchDeg: args.maxVisualPitchDeg,
        easing: readCompassNeedlePitchLimitEasing(args.pitchLimitEasing),
      }),
    [
      args.maxVisualPitchDeg,
      args.pitchLimitEasing,
      args.pitchLimitStartDeg,
      liveOrientation.pitchDeg,
    ]
  );

  return (
    <div style={PAGE_STYLE}>
      <div style={CONTENT_STYLE}>
        <div style={PREVIEW_ROW_STYLE}>
          <CompassNeedlePreview
            {...args}
            onOrientationChange={setLiveOrientation}
          />
          <div style={OUTPUT_STYLE}>
            <table style={TABLE_STYLE}>
              <tbody>
                <tr>
                  <th scope="row" style={TABLE_CELL_STYLE}>
                    heading
                  </th>
                  <td style={TABLE_VALUE_STYLE}>
                    {formatDeg(liveOrientation.headingDeg)}
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={TABLE_CELL_STYLE}>
                    input pitch
                  </th>
                  <td style={TABLE_VALUE_STYLE}>
                    {formatDeg(liveOrientation.pitchDeg)}
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={TABLE_CELL_STYLE}>
                    visual pitch
                  </th>
                  <td style={TABLE_VALUE_STYLE}>{formatDeg(visualPitchDeg)}</td>
                </tr>
                <tr>
                  <th scope="row" style={TABLE_CELL_STYLE}>
                    limit start
                  </th>
                  <td style={TABLE_VALUE_STYLE}>
                    {formatDeg(args.pitchLimitStartDeg)}
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={TABLE_CELL_STYLE}>
                    max visual
                  </th>
                  <td style={TABLE_VALUE_STYLE}>
                    {formatDeg(args.maxVisualPitchDeg)}
                  </td>
                </tr>
              </tbody>
            </table>
            <PitchMappingGraphic
              inputPitchDeg={liveOrientation.pitchDeg}
              visualPitchDeg={visualPitchDeg}
              pitchLimitStartDeg={args.pitchLimitStartDeg}
              maxVisualPitchDeg={args.maxVisualPitchDeg}
              pitchLimitEasing={args.pitchLimitEasing}
            />
            <p style={CAPTION_STYLE}>
              Drag inside the dial to update heading and input pitch. The table
              and curve show the raw input pitch separately from the visually
              limited pitch used by the rendered needle.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const meta = {
  title: "Mapping Components/Controls",
  component: CompassNeedleStory,
  parameters: {
    layout: "padded",
  },
  args: {
    headingDeg: 35,
    pitchDeg: 59,
    sizePx: 220,
    northColor: "#0f172a",
    neutralColor: "#cbd5e1",
    pitchLimitStartDeg: 45,
    maxVisualPitchDeg: 70,
    pitchLimitEasing: COMPASS_NEEDLE_PITCH_LIMIT_EASINGS.SINUSOIDAL_OUT,
  },
  argTypes: {
    headingDeg: {
      control: { type: "range", min: -180, max: 180, step: 1 },
    },
    pitchDeg: {
      control: { type: "range", min: 0, max: 90, step: 1 },
      description: "MapLibre-style pitch: 0 = nadir, 90 = horizon",
    },
    sizePx: {
      control: { type: "range", min: 96, max: 320, step: 4 },
    },
    northColor: {
      control: "color",
    },
    neutralColor: {
      control: "color",
    },
    pitchLimitStartDeg: {
      control: { type: "range", min: 0, max: 90, step: 1 },
    },
    maxVisualPitchDeg: {
      control: { type: "range", min: 0, max: 89, step: 1 },
    },
    pitchLimitEasing: {
      control: "select",
      options: Object.values(COMPASS_NEEDLE_PITCH_LIMIT_EASINGS),
    },
  },
} satisfies Meta<typeof CompassNeedleStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CompassNeedle: Story = {};
