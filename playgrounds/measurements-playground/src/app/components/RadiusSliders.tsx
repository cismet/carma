/**
 * Radius sliders component for query and tolerance radius
 */

import { Slider } from "antd";

type Mode =
  | "features"
  | "coordinates"
  | "coordinatesUnderPointer"
  | "spider"
  | "spiderRocket"
  | "serious";

interface RadiusSlidersProps {
  queryRadius: number;
  toleranceRadius: number;
  mode: Mode | null;
  hasVectorLayer: boolean;
  onQueryRadiusChange: (value: number) => void;
  onToleranceRadiusChange: (value: number) => void;
}

export function RadiusSliders({
  queryRadius,
  toleranceRadius,
  mode,
  hasVectorLayer,
  onQueryRadiusChange,
  onToleranceRadiusChange,
}: RadiusSlidersProps) {
  const showToleranceSlider =
    hasVectorLayer &&
    (mode === "spider" || mode === "spiderRocket" || mode === "serious");

  return (
    <>
      {/* Query Radius Slider */}
      <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "10px" }}>
        <label
          style={{
            fontWeight: "bold",
            fontSize: "14px",
            marginBottom: "8px",
            display: "block",
          }}
        >
          Query Radius: {queryRadius}px
        </label>
        <Slider
          min={5}
          max={200}
          value={queryRadius}
          onChange={(value) => onQueryRadiusChange(value)}
        />
      </div>

      {/* Tolerance Radius Slider - only show for spider, spiderRocket, and serious modes */}
      {showToleranceSlider && (
        <div
          style={{
            borderTop: "1px solid #e0e0e0",
            paddingTop: "10px",
            marginTop: "10px",
          }}
        >
          <label
            style={{
              fontWeight: "bold",
              fontSize: "14px",
              marginBottom: "8px",
              display: "block",
            }}
          >
            Tolerance Radius: {toleranceRadius}px
          </label>
          <Slider
            min={5}
            max={200}
            value={toleranceRadius}
            onChange={(value) => onToleranceRadiusChange(value)}
          />
        </div>
      )}
    </>
  );
}
