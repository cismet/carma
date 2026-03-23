import {
  createViewStateVisualizerPrimitive,
  type ViewStateVisualizerCueKey,
  type ViewStateVisualizerDisplayOptions,
  type ViewStateVisualizerLabelAnchors,
  type ViewStateVisualizerPrimitive,
  type ViewStateVisualizerSpecification,
} from "@carma-mapping/engines/three/primitives";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

const DEFAULT_CUE_OPTIONS: Record<
  ViewStateVisualizerCueKey,
  {
    label: ReactNode;
    color: string;
  }
> = {
  bearing: { label: "b", color: "#22d3ee" },
  pitch: { label: "p", color: "#f59e0b" },
  range: { label: "r", color: "#64748b" },
  altitude: { label: "ℎ", color: "#94a3b8" },
  east: { label: "E", color: "#dc2626" },
  north: { label: "N", color: "#16a34a" },
  up: { label: "U", color: "#2563eb" },
  imageX: { label: "x", color: "#dc2626" },
  imageY: { label: "y", color: "#2563eb" },
};

export type ViewStateVisualizerCueOption = {
  label?: ReactNode;
  color?: string;
};

export type ViewStateVisualizerCueOptions = Partial<
  Record<ViewStateVisualizerCueKey, ViewStateVisualizerCueOption>
>;

export type ViewStateVisualizerProps = {
  specification: ViewStateVisualizerSpecification;
  displayOptions?: ViewStateVisualizerDisplayOptions;
  /** Called when the user drags the camera cube to change bearing/pitch (radians). */
  onPoseChange?: (bearing: number, pitch: number) => void;
  width?: number;
  height?: number;
  cueOptions?: ViewStateVisualizerCueOptions;
  bearingLabel?: ReactNode;
  pitchLabel?: ReactNode;
  rangeLabel?: ReactNode;
  altitudeLabel?: ReactNode;
  eastLabel?: ReactNode;
  northLabel?: ReactNode;
  upLabel?: ReactNode;
  imageXLabel?: ReactNode;
  imageYLabel?: ReactNode;
  style?: CSSProperties;
};

export const ViewStateVisualizer = ({
  specification,
  displayOptions,
  onPoseChange,
  width = 176,
  height = 176,
  cueOptions,
  bearingLabel = "b",
  pitchLabel = "p",
  rangeLabel = "r",
  altitudeLabel = "ℎ",
  eastLabel = "E",
  northLabel = "N",
  upLabel = "U",
  imageXLabel = "x",
  imageYLabel = "y",
  style,
}: ViewStateVisualizerProps) => {
  const squareSize = Math.min(width, height);
  const squareOffsetLeft = (width - squareSize) * 0.5;
  const squareOffsetTop = (height - squareSize) * 0.5;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const primitiveRef = useRef<ViewStateVisualizerPrimitive | null>(null);
  const onPoseChangeRef = useRef(onPoseChange);
  const resolvedDisplayOptionsRef = useRef<
    ViewStateVisualizerDisplayOptions | undefined
  >(displayOptions);
  onPoseChangeRef.current = onPoseChange;

  const defaultLabelAnchors = useMemo<ViewStateVisualizerLabelAnchors>(
    () => ({
      bearing: { leftPx: squareSize * 0.5, topPx: squareSize * 0.3 },
      pitch: { leftPx: squareSize * 0.62, topPx: squareSize * 0.54 },
      range: { leftPx: squareSize * 0.36, topPx: squareSize * 0.42 },
      altitude: { leftPx: squareSize * 0.5, topPx: squareSize * 0.76 },
      east: { leftPx: squareSize * 0.72, topPx: squareSize * 0.58 },
      north: { leftPx: squareSize * 0.5, topPx: squareSize * 0.72 },
      up: { leftPx: squareSize * 0.5, topPx: squareSize * 0.24 },
      imageX: { leftPx: squareSize * 0.72, topPx: squareSize * 0.46 },
      imageY: { leftPx: squareSize * 0.6, topPx: squareSize * 0.3 },
    }),
    [squareSize]
  );
  const labelAnchorsRef =
    useRef<ViewStateVisualizerLabelAnchors>(defaultLabelAnchors);
  const labelElementRefs = useRef<
    Partial<Record<ViewStateVisualizerCueKey, HTMLSpanElement | null>>
  >({});

  const showAxisLabels = displayOptions?.showAxisLabels ?? true;
  const showAngleLabels = displayOptions?.showAngleLabels ?? true;
  const showImagePlaneLabels = displayOptions?.showImagePlaneLabels ?? true;
  const showAxes = displayOptions?.showAxes ?? true;
  const showAngleArcs = displayOptions?.showAngleArcs ?? true;
  const showImagePlane = displayOptions?.showImagePlane ?? true;
  const showAltitudeStem = displayOptions?.showAltitudeStem ?? true;
  const showVisibleAngleLabels = showAngleLabels && showAngleArcs;
  const showVisibleAltitudeLabel = showAngleLabels && showAltitudeStem;
  const showVisibleAxisLabels = showAxisLabels && showAxes;
  const showVisibleImagePlaneLabels =
    showImagePlaneLabels && showImagePlane && showAxes;
  const labelFontSizePx = displayOptions?.labelFontSizePx ?? 11;
  const resolvedCueOptions = useMemo(
    () => ({
      bearing: {
        label: cueOptions?.bearing?.label ?? bearingLabel,
        color: cueOptions?.bearing?.color ?? DEFAULT_CUE_OPTIONS.bearing.color,
      },
      pitch: {
        label: cueOptions?.pitch?.label ?? pitchLabel,
        color: cueOptions?.pitch?.color ?? DEFAULT_CUE_OPTIONS.pitch.color,
      },
      range: {
        label: cueOptions?.range?.label ?? rangeLabel,
        color: cueOptions?.range?.color ?? DEFAULT_CUE_OPTIONS.range.color,
      },
      altitude: {
        label: cueOptions?.altitude?.label ?? altitudeLabel,
        color:
          cueOptions?.altitude?.color ?? DEFAULT_CUE_OPTIONS.altitude.color,
      },
      east: {
        label: cueOptions?.east?.label ?? eastLabel,
        color: cueOptions?.east?.color ?? DEFAULT_CUE_OPTIONS.east.color,
      },
      north: {
        label: cueOptions?.north?.label ?? northLabel,
        color: cueOptions?.north?.color ?? DEFAULT_CUE_OPTIONS.north.color,
      },
      up: {
        label: cueOptions?.up?.label ?? upLabel,
        color: cueOptions?.up?.color ?? DEFAULT_CUE_OPTIONS.up.color,
      },
      imageX: {
        label: cueOptions?.imageX?.label ?? imageXLabel,
        color: cueOptions?.imageX?.color ?? DEFAULT_CUE_OPTIONS.imageX.color,
      },
      imageY: {
        label: cueOptions?.imageY?.label ?? imageYLabel,
        color: cueOptions?.imageY?.color ?? DEFAULT_CUE_OPTIONS.imageY.color,
      },
    }),
    [
      altitudeLabel,
      bearingLabel,
      cueOptions,
      eastLabel,
      imageXLabel,
      imageYLabel,
      northLabel,
      pitchLabel,
      rangeLabel,
      upLabel,
    ]
  ) satisfies Record<
    ViewStateVisualizerCueKey,
    { label: ReactNode; color: string }
  >;
  const resolvedDisplayOptions = useMemo(
    () => ({
      ...displayOptions,
      cueColors: {
        ...displayOptions?.cueColors,
        bearing: resolvedCueOptions.bearing.color,
        pitch: resolvedCueOptions.pitch.color,
        range: resolvedCueOptions.range.color,
        altitude: resolvedCueOptions.altitude.color,
        east: resolvedCueOptions.east.color,
        north: resolvedCueOptions.north.color,
        up: resolvedCueOptions.up.color,
        imageX: resolvedCueOptions.imageX.color,
        imageY: resolvedCueOptions.imageY.color,
      },
    }),
    [displayOptions, resolvedCueOptions]
  ) satisfies ViewStateVisualizerDisplayOptions;

  resolvedDisplayOptionsRef.current = resolvedDisplayOptions;

  const applyLabelAnchors = (anchors: ViewStateVisualizerLabelAnchors) => {
    labelAnchorsRef.current = anchors;

    const setPosition = (
      key: ViewStateVisualizerCueKey,
      leftPx: number,
      topPx: number
    ) => {
      const element = labelElementRefs.current[key];
      if (!element) {
        return;
      }

      element.style.left = `${(squareOffsetLeft + leftPx).toFixed(1)}px`;
      element.style.top = `${(squareOffsetTop + topPx).toFixed(1)}px`;
    };

    setPosition("bearing", anchors.bearing.leftPx, anchors.bearing.topPx);
    setPosition("pitch", anchors.pitch.leftPx, anchors.pitch.topPx);
    setPosition("range", anchors.range.leftPx, anchors.range.topPx);
    setPosition("altitude", anchors.altitude.leftPx, anchors.altitude.topPx);
    setPosition("east", anchors.east.leftPx, anchors.east.topPx);
    setPosition("north", anchors.north.leftPx, anchors.north.topPx);
    setPosition("up", anchors.up.leftPx, anchors.up.topPx);
    setPosition("imageX", anchors.imageX.leftPx, anchors.imageX.topPx);
    setPosition("imageY", anchors.imageY.leftPx, anchors.imageY.topPx);
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    primitiveRef.current = createViewStateVisualizerPrimitive(canvas, {
      size: { widthPx: squareSize, heightPx: squareSize },
      display: resolvedDisplayOptionsRef.current,
      onInteraction: applyLabelAnchors,
      onPoseChange: (bearing, pitch) =>
        onPoseChangeRef.current?.(bearing, pitch),
    });

    applyLabelAnchors(labelAnchorsRef.current);

    return () => {
      primitiveRef.current?.dispose();
      primitiveRef.current = null;
    };
  }, [squareSize]);

  useLayoutEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;

    primitive.resize({ widthPx: squareSize, heightPx: squareSize });
    applyLabelAnchors(primitive.update(specification));
  }, [specification, squareSize]);

  useLayoutEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive || !resolvedDisplayOptions) return;

    const anchors = primitive.setDisplay(resolvedDisplayOptions);
    if (anchors) {
      applyLabelAnchors(anchors);
    }
  }, [resolvedDisplayOptions]);

  useLayoutEffect(() => {
    applyLabelAnchors(labelAnchorsRef.current);
  }, [squareOffsetLeft, squareOffsetTop, squareSize]);

  const bindLabelRef =
    (key: ViewStateVisualizerCueKey) => (element: HTMLSpanElement | null) => {
      labelElementRefs.current[key] = element;
      if (element) {
        const anchors = labelAnchorsRef.current[key];
        element.style.left = `${(squareOffsetLeft + anchors.leftPx).toFixed(
          1
        )}px`;
        element.style.top = `${(squareOffsetTop + anchors.topPx).toFixed(1)}px`;
      }
    };

  return (
    <div
      style={{
        width,
        height,
        display: "block",
        position: "relative",
        touchAction: "none",
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        width={squareSize}
        height={squareSize}
        style={{
          width: squareSize,
          height: squareSize,
          display: "block",
          position: "absolute",
          left: squareOffsetLeft,
          top: squareOffsetTop,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          fontSize: labelFontSizePx,
          lineHeight: 1.2,
          color: "#0f172a",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {showVisibleAngleLabels && (
          <>
            <span
              ref={bindLabelRef("bearing")}
              style={{
                position: "absolute",
                left: `${(
                  squareOffsetLeft + defaultLabelAnchors.bearing.leftPx
                ).toFixed(1)}px`,
                top: `${(
                  squareOffsetTop + defaultLabelAnchors.bearing.topPx
                ).toFixed(1)}px`,
                fontWeight: 700,
                color: resolvedCueOptions.bearing.color,
                transform: "translate(-50%, -50%)",
              }}
            >
              {resolvedCueOptions.bearing.label}
            </span>
            <span
              ref={bindLabelRef("pitch")}
              style={{
                position: "absolute",
                left: `${(
                  squareOffsetLeft + defaultLabelAnchors.pitch.leftPx
                ).toFixed(1)}px`,
                top: `${(
                  squareOffsetTop + defaultLabelAnchors.pitch.topPx
                ).toFixed(1)}px`,
                fontWeight: 700,
                color: resolvedCueOptions.pitch.color,
                transform: "translate(-50%, -50%)",
              }}
            >
              {resolvedCueOptions.pitch.label}
            </span>
            <span
              ref={bindLabelRef("range")}
              style={{
                position: "absolute",
                left: `${(
                  squareOffsetLeft + defaultLabelAnchors.range.leftPx
                ).toFixed(1)}px`,
                top: `${(
                  squareOffsetTop + defaultLabelAnchors.range.topPx
                ).toFixed(1)}px`,
                fontWeight: 700,
                color: resolvedCueOptions.range.color,
                transform: "translate(-50%, -50%)",
              }}
            >
              {resolvedCueOptions.range.label}
            </span>
          </>
        )}
        {showVisibleAltitudeLabel && (
          <span
            ref={bindLabelRef("altitude")}
            style={{
              position: "absolute",
              left: `${(
                squareOffsetLeft + defaultLabelAnchors.altitude.leftPx
              ).toFixed(1)}px`,
              top: `${(
                squareOffsetTop + defaultLabelAnchors.altitude.topPx
              ).toFixed(1)}px`,
              fontWeight: 700,
              color: resolvedCueOptions.altitude.color,
              transform: "translate(-50%, -50%)",
            }}
          >
            {resolvedCueOptions.altitude.label}
          </span>
        )}
        {showVisibleAxisLabels && (
          <>
            <span
              ref={bindLabelRef("east")}
              style={{
                position: "absolute",
                left: `${(
                  squareOffsetLeft + defaultLabelAnchors.east.leftPx
                ).toFixed(1)}px`,
                top: `${(
                  squareOffsetTop + defaultLabelAnchors.east.topPx
                ).toFixed(1)}px`,
                fontWeight: 700,
                color: resolvedCueOptions.east.color,
                transform: "translate(0, -50%)",
              }}
            >
              {resolvedCueOptions.east.label}
            </span>
            <span
              ref={bindLabelRef("north")}
              style={{
                position: "absolute",
                left: `${(
                  squareOffsetLeft + defaultLabelAnchors.north.leftPx
                ).toFixed(1)}px`,
                top: `${(
                  squareOffsetTop + defaultLabelAnchors.north.topPx
                ).toFixed(1)}px`,
                fontWeight: 700,
                color: resolvedCueOptions.north.color,
                transform: "translate(-50%, -50%)",
              }}
            >
              {resolvedCueOptions.north.label}
            </span>
            <span
              ref={bindLabelRef("up")}
              style={{
                position: "absolute",
                left: `${(
                  squareOffsetLeft + defaultLabelAnchors.up.leftPx
                ).toFixed(1)}px`,
                top: `${(
                  squareOffsetTop + defaultLabelAnchors.up.topPx
                ).toFixed(1)}px`,
                fontWeight: 700,
                color: resolvedCueOptions.up.color,
                transform: "translate(-50%, -100%)",
              }}
            >
              {resolvedCueOptions.up.label}
            </span>
          </>
        )}
        {showVisibleImagePlaneLabels && (
          <>
            <span
              ref={bindLabelRef("imageX")}
              style={{
                position: "absolute",
                left: `${(
                  squareOffsetLeft + defaultLabelAnchors.imageX.leftPx
                ).toFixed(1)}px`,
                top: `${(
                  squareOffsetTop + defaultLabelAnchors.imageX.topPx
                ).toFixed(1)}px`,
                fontWeight: 700,
                color: resolvedCueOptions.imageX.color,
                transform: "translate(-50%, -50%)",
              }}
            >
              {resolvedCueOptions.imageX.label}
            </span>
            <span
              ref={bindLabelRef("imageY")}
              style={{
                position: "absolute",
                left: `${(
                  squareOffsetLeft + defaultLabelAnchors.imageY.leftPx
                ).toFixed(1)}px`,
                top: `${(
                  squareOffsetTop + defaultLabelAnchors.imageY.topPx
                ).toFixed(1)}px`,
                fontWeight: 700,
                color: resolvedCueOptions.imageY.color,
                transform: "translate(-50%, -50%)",
              }}
            >
              {resolvedCueOptions.imageY.label}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default ViewStateVisualizer;
