import {
  DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS,
  createViewStateVisualizerPrimitive,
  mergeViewStateVisualizerDisplayOptions,
  mergeViewStateVisualizerOverviewOptions,
  mergeViewStateVisualizerVisualizedOptions,
  type ResolvedViewStateVisualizerDisplayOptions,
  type ViewStateVisualizerCueKey,
  type ViewStateVisualizerDisplayOptions,
  type ViewStateVisualizerInput,
  type ViewStateVisualizerLabelAnchors,
  type ViewStateVisualizerOverviewOptions,
  type ViewStateVisualizerPrimitive,
  type ViewStateVisualizerVisualizedOptions,
} from "@carma-mapping/engines/three/primitives";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

const DEFAULT_CUE_LABELS: Record<ViewStateVisualizerCueKey, ReactNode> = {
  bearing: "b",
  pitch: "p",
  range: "r",
  altitude: "ℎ",
  east: "E",
  north: "N",
  up: "U",
  cameraForward: "Z",
  cameraRight: "X",
  cameraUp: "Y",
  imageX: "x",
  imageY: "y",
};

export type ViewStateVisualizerCueOption = {
  label?: ReactNode;
  color?: string;
};

export type ViewStateVisualizerCueOptions = Partial<
  Record<ViewStateVisualizerCueKey, ViewStateVisualizerCueOption>
>;

export type ViewStateVisualizerProps = {
  viewState: ViewStateVisualizerInput;
  overviewOptions?: ViewStateVisualizerOverviewOptions;
  interactive?: boolean;
  visualizedOptions?: ViewStateVisualizerVisualizedOptions;
  displayOptions?: ViewStateVisualizerDisplayOptions;
  activeCameraIndex?: number;
  /** Called when the user drags the camera cube to change bearing/pitch (radians). */
  onPoseChange?: (bearing: number, pitch: number) => void;
  /** Called when the user drags any camera cube in a multi-camera visualizer. */
  onCameraPoseChange?: (
    cameraIndex: number,
    bearing: number,
    pitch: number
  ) => void;
  onCameraPoseDragStateChange?: (dragging: boolean) => void;
  onOrbitDragStateChange?: (dragging: boolean) => void;
  onActiveCameraChange?: (cameraIndex: number) => void;
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
  cameraForwardLabel?: ReactNode;
  cameraRightLabel?: ReactNode;
  cameraUpLabel?: ReactNode;
  imageXLabel?: ReactNode;
  imageYLabel?: ReactNode;
  style?: CSSProperties;
};

export const ViewStateVisualizer = ({
  viewState,
  overviewOptions,
  interactive = false,
  visualizedOptions,
  displayOptions,
  activeCameraIndex = 0,
  onPoseChange,
  onCameraPoseChange,
  onCameraPoseDragStateChange,
  onOrbitDragStateChange,
  onActiveCameraChange,
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
  cameraForwardLabel = "Z",
  cameraRightLabel = "X",
  cameraUpLabel = "Y",
  imageXLabel = "x",
  imageYLabel = "y",
  style,
}: ViewStateVisualizerProps) => {
  const resolvedWidth = Math.max(1, Math.floor(width));
  const resolvedHeight = Math.max(1, Math.floor(height));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const primitiveRef = useRef<ViewStateVisualizerPrimitive | null>(null);
  const onPoseChangeRef = useRef(onPoseChange);
  const onCameraPoseChangeRef = useRef(onCameraPoseChange);
  const onCameraPoseDragStateChangeRef = useRef(onCameraPoseDragStateChange);
  const onOrbitDragStateChangeRef = useRef(onOrbitDragStateChange);
  const onActiveCameraChangeRef = useRef(onActiveCameraChange);
  const resolvedDisplayOptionsRef =
    useRef<ResolvedViewStateVisualizerDisplayOptions>(
      mergeViewStateVisualizerDisplayOptions(displayOptions)
    );
  const resolvedOverviewOptionsRef = useRef(
    mergeViewStateVisualizerOverviewOptions(overviewOptions)
  );
  const resolvedVisualizedOptionsRef = useRef(
    mergeViewStateVisualizerVisualizedOptions(visualizedOptions)
  );
  onPoseChangeRef.current = onPoseChange;
  onCameraPoseChangeRef.current = onCameraPoseChange;
  onCameraPoseDragStateChangeRef.current = onCameraPoseDragStateChange;
  onOrbitDragStateChangeRef.current = onOrbitDragStateChange;
  onActiveCameraChangeRef.current = onActiveCameraChange;

  const defaultLabelAnchors = useMemo<ViewStateVisualizerLabelAnchors>(
    () => ({
      bearing: { leftPx: resolvedWidth * 0.5, topPx: resolvedHeight * 0.3 },
      pitch: { leftPx: resolvedWidth * 0.62, topPx: resolvedHeight * 0.54 },
      range: { leftPx: resolvedWidth * 0.36, topPx: resolvedHeight * 0.42 },
      altitude: {
        leftPx: resolvedWidth * 0.5,
        topPx: resolvedHeight * 0.76,
      },
      east: { leftPx: resolvedWidth * 0.72, topPx: resolvedHeight * 0.58 },
      north: { leftPx: resolvedWidth * 0.5, topPx: resolvedHeight * 0.72 },
      up: { leftPx: resolvedWidth * 0.5, topPx: resolvedHeight * 0.24 },
      cameraForward: {
        leftPx: resolvedWidth * 0.42,
        topPx: resolvedHeight * 0.38,
      },
      cameraRight: {
        leftPx: resolvedWidth * 0.68,
        topPx: resolvedHeight * 0.38,
      },
      cameraUp: { leftPx: resolvedWidth * 0.56, topPx: resolvedHeight * 0.22 },
      imageX: { leftPx: resolvedWidth * 0.72, topPx: resolvedHeight * 0.46 },
      imageY: { leftPx: resolvedWidth * 0.6, topPx: resolvedHeight * 0.3 },
    }),
    [resolvedHeight, resolvedWidth]
  );
  const labelAnchorsRef =
    useRef<ViewStateVisualizerLabelAnchors>(defaultLabelAnchors);
  const labelElementRefs = useRef<
    Partial<Record<ViewStateVisualizerCueKey, HTMLSpanElement | null>>
  >({});

  const resolvedDisplayOptions = useMemo(
    () => mergeViewStateVisualizerDisplayOptions(displayOptions),
    [displayOptions]
  ) satisfies ResolvedViewStateVisualizerDisplayOptions;
  const resolvedOverviewOptions = useMemo(
    () => mergeViewStateVisualizerOverviewOptions(overviewOptions),
    [overviewOptions]
  );
  const resolvedVisualizedOptions = useMemo(
    () => mergeViewStateVisualizerVisualizedOptions(visualizedOptions),
    [visualizedOptions]
  );

  const showAxisLabels = resolvedDisplayOptions.labels.showAxes;
  const showAngleLabels = resolvedDisplayOptions.labels.showAngles;
  const showImagePlaneLabels = resolvedDisplayOptions.labels.showImagePlane;
  const showAxes = resolvedDisplayOptions.worldAxes.show;
  const showAngleArcs = resolvedDisplayOptions.angleCues.show;
  const showImagePlane = resolvedDisplayOptions.cameraView.imagePlane.show;
  const showImagePlaneAxes = resolvedDisplayOptions.cameraView.axes.show;
  const showAltitudeStem = resolvedDisplayOptions.altitude.show;
  const showVisibleAngleLabels = showAngleLabels && showAngleArcs;
  const showVisibleAltitudeLabel = showAngleLabels && showAltitudeStem;
  const showVisibleAxisLabels = showAxisLabels && showAxes;
  const showVisibleImagePlaneLabels =
    showImagePlaneLabels && showImagePlane && showImagePlaneAxes;
  const labelFontSizePx = resolvedDisplayOptions.labels.fontSizePx;
  const resolvedCueOptions = useMemo(
    () => ({
      bearing: {
        label:
          cueOptions?.bearing?.label ??
          bearingLabel ??
          DEFAULT_CUE_LABELS.bearing,
        color:
          cueOptions?.bearing?.color ??
          DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.bearing,
      },
      pitch: {
        label:
          cueOptions?.pitch?.label ?? pitchLabel ?? DEFAULT_CUE_LABELS.pitch,
        color:
          cueOptions?.pitch?.color ??
          DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.pitch,
      },
      range: {
        label:
          cueOptions?.range?.label ?? rangeLabel ?? DEFAULT_CUE_LABELS.range,
        color:
          cueOptions?.range?.color ??
          DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.range,
      },
      altitude: {
        label:
          cueOptions?.altitude?.label ??
          altitudeLabel ??
          DEFAULT_CUE_LABELS.altitude,
        color:
          cueOptions?.altitude?.color ??
          DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.altitude,
      },
      east: {
        label: cueOptions?.east?.label ?? eastLabel ?? DEFAULT_CUE_LABELS.east,
        color:
          cueOptions?.east?.color ??
          DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.east,
      },
      north: {
        label:
          cueOptions?.north?.label ?? northLabel ?? DEFAULT_CUE_LABELS.north,
        color:
          cueOptions?.north?.color ??
          DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.north,
      },
      up: {
        label: cueOptions?.up?.label ?? upLabel ?? DEFAULT_CUE_LABELS.up,
        color:
          cueOptions?.up?.color ?? DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.up,
      },
      cameraForward: {
        label:
          cueOptions?.cameraForward?.label ??
          cameraForwardLabel ??
          DEFAULT_CUE_LABELS.cameraForward,
        color:
          cueOptions?.cameraForward?.color ??
          DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.cameraForward,
      },
      cameraRight: {
        label:
          cueOptions?.cameraRight?.label ??
          cameraRightLabel ??
          DEFAULT_CUE_LABELS.cameraRight,
        color:
          cueOptions?.cameraRight?.color ??
          DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.cameraRight,
      },
      cameraUp: {
        label:
          cueOptions?.cameraUp?.label ??
          cameraUpLabel ??
          DEFAULT_CUE_LABELS.cameraUp,
        color:
          cueOptions?.cameraUp?.color ??
          DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.cameraUp,
      },
      imageX: {
        label:
          cueOptions?.imageX?.label ?? imageXLabel ?? DEFAULT_CUE_LABELS.imageX,
        color:
          cueOptions?.imageX?.color ??
          DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.imageX,
      },
      imageY: {
        label:
          cueOptions?.imageY?.label ?? imageYLabel ?? DEFAULT_CUE_LABELS.imageY,
        color:
          cueOptions?.imageY?.color ??
          DEFAULT_VIEW_STATE_VISUALIZER_CUE_COLORS.imageY,
      },
    }),
    [
      altitudeLabel,
      bearingLabel,
      cueOptions,
      eastLabel,
      cameraForwardLabel,
      cameraRightLabel,
      cameraUpLabel,
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
  const resolvedDisplayOptionsWithCueColors = useMemo(
    () => ({
      ...resolvedDisplayOptions,
      cueColors: {
        ...resolvedDisplayOptions.cueColors,
        bearing: resolvedCueOptions.bearing.color,
        pitch: resolvedCueOptions.pitch.color,
        range: resolvedCueOptions.range.color,
        altitude: resolvedCueOptions.altitude.color,
        east: resolvedCueOptions.east.color,
        north: resolvedCueOptions.north.color,
        up: resolvedCueOptions.up.color,
        cameraForward: resolvedCueOptions.cameraForward.color,
        cameraRight: resolvedCueOptions.cameraRight.color,
        cameraUp: resolvedCueOptions.cameraUp.color,
        imageX: resolvedCueOptions.imageX.color,
        imageY: resolvedCueOptions.imageY.color,
      },
    }),
    [resolvedCueOptions, resolvedDisplayOptions]
  ) satisfies ResolvedViewStateVisualizerDisplayOptions;

  resolvedDisplayOptionsRef.current = resolvedDisplayOptionsWithCueColors;
  resolvedOverviewOptionsRef.current = resolvedOverviewOptions;
  resolvedVisualizedOptionsRef.current = resolvedVisualizedOptions;

  const formatCssPx = (value: number) => `${value.toFixed(1)}px`;
  const readDefaultLabelPosition = (key: ViewStateVisualizerCueKey) => {
    const anchor = defaultLabelAnchors[key];
    return {
      left: formatCssPx(anchor.leftPx),
      top: formatCssPx(anchor.topPx),
    };
  };

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

      element.style.left = formatCssPx(leftPx);
      element.style.top = formatCssPx(topPx);
    };

    setPosition("bearing", anchors.bearing.leftPx, anchors.bearing.topPx);
    setPosition("pitch", anchors.pitch.leftPx, anchors.pitch.topPx);
    setPosition("range", anchors.range.leftPx, anchors.range.topPx);
    setPosition("altitude", anchors.altitude.leftPx, anchors.altitude.topPx);
    setPosition("east", anchors.east.leftPx, anchors.east.topPx);
    setPosition("north", anchors.north.leftPx, anchors.north.topPx);
    setPosition("up", anchors.up.leftPx, anchors.up.topPx);
    setPosition(
      "cameraForward",
      anchors.cameraForward.leftPx,
      anchors.cameraForward.topPx
    );
    setPosition(
      "cameraRight",
      anchors.cameraRight.leftPx,
      anchors.cameraRight.topPx
    );
    setPosition("cameraUp", anchors.cameraUp.leftPx, anchors.cameraUp.topPx);
    setPosition("imageX", anchors.imageX.leftPx, anchors.imageX.topPx);
    setPosition("imageY", anchors.imageY.leftPx, anchors.imageY.topPx);
  };

  useLayoutEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;

    const anchors = primitive.resize({
      widthPx: resolvedWidth,
      heightPx: resolvedHeight,
    });
    if (anchors) {
      applyLabelAnchors(anchors);
    }
  }, [resolvedHeight, resolvedWidth]);

  useLayoutEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;

    applyLabelAnchors(primitive.update(viewState));
  }, [viewState]);

  useLayoutEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;

    const anchors = primitive.setOverview(resolvedOverviewOptions);
    if (anchors) {
      applyLabelAnchors(anchors);
    }
  }, [resolvedOverviewOptions]);

  useLayoutEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;

    const anchors = primitive.setVisualized(resolvedVisualizedOptions);
    if (anchors) {
      applyLabelAnchors(anchors);
    }
  }, [resolvedVisualizedOptions]);

  useLayoutEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;

    const anchors = primitive.setDisplay(resolvedDisplayOptionsWithCueColors);
    if (anchors) {
      applyLabelAnchors(anchors);
    }
  }, [resolvedDisplayOptionsWithCueColors]);

  useLayoutEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;

    primitive.setInteractive(interactive);
  }, [interactive]);

  useLayoutEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;

    const anchors = primitive.setActiveCameraIndex(activeCameraIndex);
    if (anchors) {
      applyLabelAnchors(anchors);
    }
  }, [activeCameraIndex]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    primitiveRef.current = createViewStateVisualizerPrimitive(
      canvas,
      viewState,
      {
        size: { widthPx: resolvedWidth, heightPx: resolvedHeight },
        overview: resolvedOverviewOptionsRef.current,
        interactive,
        visualized: resolvedVisualizedOptionsRef.current,
        display: resolvedDisplayOptionsRef.current,
        activeCameraIndex,
        onInteraction: applyLabelAnchors,
        onPoseChange: (bearing, pitch) =>
          onPoseChangeRef.current?.(bearing, pitch),
        onCameraPoseChange: (cameraIndex, bearing, pitch) =>
          onCameraPoseChangeRef.current?.(cameraIndex, bearing, pitch),
        onCameraPoseDragStateChange: (dragging) =>
          onCameraPoseDragStateChangeRef.current?.(dragging),
        onOrbitDragStateChange: (dragging) =>
          onOrbitDragStateChangeRef.current?.(dragging),
        onActiveCameraChange: (cameraIndex) =>
          onActiveCameraChangeRef.current?.(cameraIndex),
      }
    );

    applyLabelAnchors(
      primitiveRef.current.readLabelAnchors() ?? labelAnchorsRef.current
    );

    return () => {
      primitiveRef.current?.dispose();
      primitiveRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    applyLabelAnchors(labelAnchorsRef.current);
  }, [resolvedHeight, resolvedWidth]);

  const bindLabelRef =
    (key: ViewStateVisualizerCueKey) => (element: HTMLSpanElement | null) => {
      labelElementRefs.current[key] = element;
      if (element) {
        const anchors = labelAnchorsRef.current[key];
        element.style.left = formatCssPx(anchors.leftPx);
        element.style.top = formatCssPx(anchors.topPx);
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
        width={resolvedWidth}
        height={resolvedHeight}
        style={{
          width: resolvedWidth,
          height: resolvedHeight,
          display: "block",
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
                ...readDefaultLabelPosition("bearing"),
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
                ...readDefaultLabelPosition("pitch"),
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
                ...readDefaultLabelPosition("range"),
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
              ...readDefaultLabelPosition("altitude"),
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
                ...readDefaultLabelPosition("east"),
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
                ...readDefaultLabelPosition("north"),
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
                ...readDefaultLabelPosition("up"),
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
              ref={bindLabelRef("cameraForward")}
              style={{
                position: "absolute",
                ...readDefaultLabelPosition("cameraForward"),
                fontWeight: 700,
                color: resolvedCueOptions.cameraForward.color,
                transform: "translate(-50%, -50%)",
              }}
            >
              {resolvedCueOptions.cameraForward.label}
            </span>
            <span
              ref={bindLabelRef("cameraRight")}
              style={{
                position: "absolute",
                ...readDefaultLabelPosition("cameraRight"),
                fontWeight: 700,
                color: resolvedCueOptions.cameraRight.color,
                transform: "translate(-50%, -50%)",
              }}
            >
              {resolvedCueOptions.cameraRight.label}
            </span>
            <span
              ref={bindLabelRef("cameraUp")}
              style={{
                position: "absolute",
                ...readDefaultLabelPosition("cameraUp"),
                fontWeight: 700,
                color: resolvedCueOptions.cameraUp.color,
                transform: "translate(-50%, -50%)",
              }}
            >
              {resolvedCueOptions.cameraUp.label}
            </span>
            <span
              ref={bindLabelRef("imageX")}
              style={{
                position: "absolute",
                ...readDefaultLabelPosition("imageX"),
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
                ...readDefaultLabelPosition("imageY"),
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
