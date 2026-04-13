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
    transparent: string;
    components: {
      direct: string;
      vertical: string;
      horizontal: string;
    };
    componentLabelAccents: {
      direct: string;
      vertical: string;
      horizontal: string;
    };
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
      transparent: "rgba(0, 0, 0, 0)",
      components: {
        direct: "rgba(255, 255, 255, 1)",
        vertical: "rgba(111, 168, 255, 0.96)",
        horizontal: "rgba(188, 194, 102, 0.95)",
      },
      componentLabelAccents: {
        direct: "rgba(255, 255, 255, 0.34)",
        vertical: "rgba(111, 168, 255, 0.54)",
        horizontal: "rgba(188, 194, 102, 0.5)",
      },
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
