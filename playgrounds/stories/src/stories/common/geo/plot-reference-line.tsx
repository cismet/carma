import { GEO_STORY_STYLES } from "./geo-story-styles";

export const VerticalPlotReferenceLine = ({
  x,
  topY,
  bottomY,
  label,
  labelY,
  stroke = "#475569",
  strokeDasharray = "4 4",
  strokeWidth = 1,
  opacity = 0.7,
}: {
  x: number;
  topY: number;
  bottomY: number;
  label: string;
  labelY: number;
  stroke?: string;
  strokeDasharray?: string;
  strokeWidth?: number;
  opacity?: number;
}) => (
  <>
    <line
      x1={x}
      x2={x}
      y1={topY}
      y2={bottomY}
      stroke={stroke}
      strokeDasharray={strokeDasharray}
      strokeWidth={strokeWidth}
      opacity={opacity}
    />
    <text
      x={x}
      y={labelY}
      textAnchor="middle"
      fill={stroke}
      style={GEO_STORY_STYLES.text.svg}
    >
      {label}
    </text>
  </>
);
