import {
  createViewStateVisualizerPrimitive,
  type ViewStateVisualizerDisplayOptions,
  type ViewStateVisualizerLabelAnchors,
  type ViewStateVisualizerPrimitive,
  type ViewStateVisualizerSpecification,
} from "@carma-mapping/engines/three/primitives";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const RANGE_LABEL_COLOR = "#64748b";
const ALTITUDE_LABEL_COLOR = "#94a3b8";
const HEADING_LABEL_COLOR = "#22d3ee";
const PITCH_LABEL_COLOR = "#f59e0b";

export type ViewStateVisualizerProps = {
  specification: ViewStateVisualizerSpecification;
  displayOptions?: ViewStateVisualizerDisplayOptions;
  /** Called when the user drags the camera cube to change heading/pitch (radians). */
  onPoseChange?: (heading: number, pitch: number) => void;
  width?: number;
  height?: number;
  headingLabel?: ReactNode;
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
  headingLabel = "h",
  pitchLabel = "p",
  rangeLabel = "r",
  altitudeLabel = "e",
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
  onPoseChangeRef.current = onPoseChange;

  const [labelAnchors, setLabelAnchors] = useState<ViewStateVisualizerLabelAnchors>({
    heading: { leftPx: squareSize * 0.5, topPx: squareSize * 0.3 },
    pitch: { leftPx: squareSize * 0.62, topPx: squareSize * 0.54 },
    range: { leftPx: squareSize * 0.36, topPx: squareSize * 0.42 },
    altitude: { leftPx: squareSize * 0.5, topPx: squareSize * 0.76 },
    east: { leftPx: squareSize * 0.72, topPx: squareSize * 0.58 },
    north: { leftPx: squareSize * 0.5, topPx: squareSize * 0.72 },
    up: { leftPx: squareSize * 0.5, topPx: squareSize * 0.24 },
    imageX: { leftPx: squareSize * 0.72, topPx: squareSize * 0.46 },
    imageY: { leftPx: squareSize * 0.6, topPx: squareSize * 0.3 },
  });

  const showAxisLabels = displayOptions?.showAxisLabels ?? true;
  const showAngleLabels = displayOptions?.showAngleLabels ?? true;
  const showImagePlaneLabels = displayOptions?.showImagePlaneLabels ?? true;
  const labelFontSizePx = displayOptions?.labelFontSizePx ?? 11;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    primitiveRef.current = createViewStateVisualizerPrimitive(canvas, {
      size: { widthPx: squareSize, heightPx: squareSize },
      display: displayOptions,
      onInteraction: setLabelAnchors,
      onPoseChange: (heading, pitch) => onPoseChangeRef.current?.(heading, pitch),
    });

    return () => {
      primitiveRef.current?.dispose();
      primitiveRef.current = null;
    };
  }, [squareSize]);

  useEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;

    primitive.resize({ widthPx: squareSize, heightPx: squareSize });
    setLabelAnchors(primitive.update(specification));
  }, [specification, squareSize]);

  useEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive || !displayOptions) return;

    const anchors = primitive.setDisplay(displayOptions);
    if (anchors) setLabelAnchors(anchors);
  }, [displayOptions]);

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
        {showAngleLabels && (
          <>
            <span
              style={{
                position: "absolute",
                left: `${(squareOffsetLeft + labelAnchors.heading.leftPx).toFixed(1)}px`,
                top: `${(squareOffsetTop + labelAnchors.heading.topPx).toFixed(1)}px`,
                fontWeight: 700,
                color: HEADING_LABEL_COLOR,
                transform: "translate(-50%, -50%)",
              }}
            >
              {headingLabel}
            </span>
            <span
              style={{
                position: "absolute",
                left: `${(squareOffsetLeft + labelAnchors.pitch.leftPx).toFixed(1)}px`,
                top: `${(squareOffsetTop + labelAnchors.pitch.topPx).toFixed(1)}px`,
                fontWeight: 700,
                color: PITCH_LABEL_COLOR,
                transform: "translate(-50%, -50%)",
              }}
            >
              {pitchLabel}
            </span>
            <span
              style={{
                position: "absolute",
                left: `${(squareOffsetLeft + labelAnchors.range.leftPx).toFixed(1)}px`,
                top: `${(squareOffsetTop + labelAnchors.range.topPx).toFixed(1)}px`,
                fontWeight: 700,
                color: RANGE_LABEL_COLOR,
                transform: "translate(-50%, -50%)",
              }}
            >
              {rangeLabel}
            </span>
            <span
              style={{
                position: "absolute",
                left: `${(squareOffsetLeft + labelAnchors.altitude.leftPx).toFixed(1)}px`,
                top: `${(squareOffsetTop + labelAnchors.altitude.topPx).toFixed(1)}px`,
                fontWeight: 700,
                color: ALTITUDE_LABEL_COLOR,
                transform: "translate(-50%, -50%)",
              }}
            >
              {altitudeLabel}
            </span>
          </>
        )}
        {showAxisLabels && (
          <>
            <span
              style={{
                position: "absolute",
                left: `${(squareOffsetLeft + labelAnchors.east.leftPx).toFixed(1)}px`,
                top: `${(squareOffsetTop + labelAnchors.east.topPx).toFixed(1)}px`,
                fontWeight: 700,
                color: "#dc2626",
                transform: "translate(0, -50%)",
              }}
            >
              {eastLabel}
            </span>
            <span
              style={{
                position: "absolute",
                left: `${(squareOffsetLeft + labelAnchors.north.leftPx).toFixed(1)}px`,
                top: `${(squareOffsetTop + labelAnchors.north.topPx).toFixed(1)}px`,
                fontWeight: 700,
                color: "#16a34a",
                transform: "translate(-50%, -50%)",
              }}
            >
              {northLabel}
            </span>
            <span
              style={{
                position: "absolute",
                left: `${(squareOffsetLeft + labelAnchors.up.leftPx).toFixed(1)}px`,
                top: `${(squareOffsetTop + labelAnchors.up.topPx).toFixed(1)}px`,
                fontWeight: 700,
                color: "#2563eb",
                transform: "translate(-50%, -100%)",
              }}
            >
              {upLabel}
            </span>
          </>
        )}
        {showImagePlaneLabels && (
          <>
            <span
              style={{
                position: "absolute",
                left: `${(squareOffsetLeft + labelAnchors.imageX.leftPx).toFixed(1)}px`,
                top: `${(squareOffsetTop + labelAnchors.imageX.topPx).toFixed(1)}px`,
                fontWeight: 700,
                color: "#7c3aed",
                transform: "translate(-50%, -50%)",
              }}
            >
              {imageXLabel}
            </span>
            <span
              style={{
                position: "absolute",
                left: `${(squareOffsetLeft + labelAnchors.imageY.leftPx).toFixed(1)}px`,
                top: `${(squareOffsetTop + labelAnchors.imageY.topPx).toFixed(1)}px`,
                fontWeight: 700,
                color: "#15803d",
                transform: "translate(-50%, -50%)",
              }}
            >
              {imageYLabel}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default ViewStateVisualizer;
