export type RuntimeEdgeVisualStyle = {
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
};

export type RuntimePointMarkerVisualStyle = {
  pixelSize: number;
  fill: string;
  outline: string;
  outlineWidth: number;
};

export type RuntimeMeasurementVisualDefaults = {
  colors: {
    neutral: string;
    accent: string;
    preview: string;
    surface: string;
  };
  sizes: {
    edgeStrokeWidth: number;
    selectedEdgeStrokeWidth: number;
    pointPixelSize: number;
    selectedPointPixelSize: number;
    previewPointPixelSize: number;
    pointOutlineWidth: number;
  };
};

export const runtimeMeasurementVisualDefaults: RuntimeMeasurementVisualDefaults =
  {
    colors: {
      neutral: "rgba(255, 255, 255, 1)",
      accent: "rgba(255, 255, 255, 1)",
      preview: "rgba(255, 255, 255, 0.9)",
      surface: "rgba(255, 255, 255, 0.92)",
    },
    sizes: {
      edgeStrokeWidth: 1,
      selectedEdgeStrokeWidth: 1,
      pointPixelSize: 10,
      selectedPointPixelSize: 10,
      previewPointPixelSize: 10,
      pointOutlineWidth: 1,
    },
  };
