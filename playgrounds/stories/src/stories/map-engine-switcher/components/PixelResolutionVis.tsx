interface PixelResolutionVisProps {
  bufferSize: { width: number; height: number };
  centerPixelResolution: number;
  edgePixelResolution: number;
  cameraElevation: number;
}

export const PixelResolutionVis = ({
  bufferSize,
  centerPixelResolution,
  edgePixelResolution,
  cameraElevation,
}: PixelResolutionVisProps) => {
  // SVG dimensions
  const svgWidth = 120;
  const svgHeight = 90;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;

  // Calculate radius to fit both circle and rectangle in view
  const svgAspect = svgWidth / svgHeight;
  const bufferAspect = bufferSize.width / bufferSize.height;

  const padding = 10;
  let radius: number;
  let rectWidth: number;
  let rectHeight: number;

  if (bufferAspect > svgAspect) {
    // Buffer is wider than SVG - width is limiting factor
    // Circle connects center to middle of left/right edge (horizontal FOV)
    radius = (svgWidth / 2 - padding) / bufferAspect;
    rectWidth = svgWidth - 2 * padding;
    rectHeight = rectWidth / bufferAspect;
  } else {
    // Buffer is taller than SVG - height is limiting factor
    // Circle connects center to middle of top/bottom edge (vertical FOV)
    radius = svgHeight / 2 - padding;
    rectHeight = svgHeight - 2 * padding;
    rectWidth = rectHeight * bufferAspect;
  }

  // For visualization: circle radius should touch the middle of the longer edge
  // This represents what FOV actually defines (angle to edge, not corner)
  const circleRadius =
    bufferAspect > 1
      ? rectWidth / 2 // Wide: radius to left/right edge
      : rectHeight / 2; // Tall: radius to top/bottom edge

  return (
    <div>
      <div
        style={{
          fontSize: "11px",
          color: "#666",
          marginBottom: "8px",
          textAlign: "center",
        }}
      >
        Pixel Resolution
      </div>
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      >
        {/* Rectangle representing viewport */}
        <rect
          x={centerX - rectWidth / 2}
          y={centerY - rectHeight / 2}
          width={rectWidth}
          height={rectHeight}
          fill="none"
          stroke="#d9d9d9"
          strokeWidth="1"
          strokeDasharray="2,2"
        />

        {/* Circle from center to longer edge */}
        <circle
          cx={centerX}
          cy={centerY}
          r={circleRadius}
          fill="none"
          stroke="#722ed1"
          strokeWidth="2"
        />

        {/* Center point - Pc */}
        <circle cx={centerX} cy={centerY} r="2" fill="#1677ff" />

        {/* Radius line - horizontal for wide, vertical for tall */}
        {bufferAspect > 1 ? (
          <>
            <line
              x1={centerX}
              y1={centerY}
              x2={centerX + circleRadius}
              y2={centerY}
              stroke="#722ed1"
              strokeWidth="2"
            />
            {/* Edge point - Pout */}
            <circle
              cx={centerX + circleRadius}
              cy={centerY}
              r="2"
              fill="#722ed1"
            />
            {/* r label on circle */}
            <text
              x={centerX + circleRadius / 2}
              y={centerY - 5}
              fill="#722ed1"
              fontSize="10"
              fontFamily="monospace"
              textAnchor="middle"
            >
              r
            </text>
          </>
        ) : (
          <>
            <line
              x1={centerX}
              y1={centerY}
              x2={centerX}
              y2={centerY - circleRadius}
              stroke="#722ed1"
              strokeWidth="2"
            />
            {/* Edge point - Pout */}
            <circle
              cx={centerX}
              cy={centerY - circleRadius}
              r="2"
              fill="#722ed1"
            />
            {/* r label on circle */}
            <text
              x={centerX + 8}
              y={centerY - circleRadius / 2}
              fill="#722ed1"
              fontSize="10"
              fontFamily="monospace"
              textAnchor="start"
            >
              r
            </text>
          </>
        )}

        {/* C label (center) */}
        <text
          x={centerX}
          y={centerY + (bufferAspect > 1 ? 12 : -8)}
          fill="#1677ff"
          fontSize="8"
          fontFamily="monospace"
          textAnchor="middle"
        >
          C
        </text>

        {/* E label (edge) */}
        <text
          x={bufferAspect > 1 ? centerX + circleRadius : centerX + 12}
          y={bufferAspect > 1 ? centerY + 12 : centerY - circleRadius}
          fill="#722ed1"
          fontSize="8"
          fontFamily="monospace"
          textAnchor={bufferAspect > 1 ? "middle" : "start"}
        >
          E
        </text>
      </svg>
    </div>
  );
};
