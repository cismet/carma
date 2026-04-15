import { COLORS_HEX } from "@carma-commons/utils";
import { rgb } from "d3-color";

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

const neutralWhite = rgb(COLORS_HEX.NEUTRAL_WHITE);
const neutralWhitePreview = rgb(COLORS_HEX.NEUTRAL_WHITE);
const neutralWhiteSurface = rgb(COLORS_HEX.NEUTRAL_WHITE);
const neutralWhiteComponentLabelAccent = rgb(COLORS_HEX.NEUTRAL_WHITE);

neutralWhitePreview.opacity = 0.9;
neutralWhiteSurface.opacity = 0.92;
neutralWhiteComponentLabelAccent.opacity = 0.34;

export const runtimeMeasurementVisualDefaults: RuntimeMeasurementVisualDefaults =
  {
    colors: {
      neutral: neutralWhite.toString(),
      accent: neutralWhite.toString(),
      preview: neutralWhitePreview.toString(),
      surface: neutralWhiteSurface.toString(),
      transparent: "rgba(0, 0, 0, 0)",
      components: {
        direct: neutralWhite.toString(),
        vertical: "rgba(111, 168, 255, 0.96)",
        horizontal: "rgba(188, 194, 102, 0.95)",
      },
      componentLabelAccents: {
        direct: neutralWhiteComponentLabelAccent.toString(),
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
