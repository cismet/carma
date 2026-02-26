export type PolygonSurfaceTypeOption =
  | "roof"
  | "facade"
  | "terrain"
  | "footprint";

export const POLYGON_SURFACE_TYPE_OPTIONS: Array<{
  value: PolygonSurfaceTypeOption;
  label: string;
}> = [
  { value: "roof", label: "Dachfläche" },
  { value: "facade", label: "Fassadenfläche" },
  { value: "terrain", label: "Gelände" },
  { value: "footprint", label: "Grundriss" },
];

export const PURE_LABEL_MIN_FONT_SIZE_PX = 10;
export const PURE_LABEL_MAX_FONT_SIZE_PX = 48;
export const PURE_LABEL_FONT_SIZE_STEP_PX = 1;
export const PURE_LABEL_DEFAULT_FONT_SIZE_PX = 12;
export const PURE_LABEL_DEFAULT_BACKGROUND_COLOR = "rgba(200, 200, 200, 0.7)";
export const PURE_LABEL_DEFAULT_TEXT_COLOR = "#000000";

export type PureLabelColorStyleId =
  | "neutral"
  | "sunset"
  | "sky"
  | "mint"
  | "rose";

export const PURE_LABEL_COLOR_STYLE_OPTIONS: Array<{
  value: PureLabelColorStyleId;
  label: string;
  backgroundColor: string;
  textColor: string;
}> = [
  {
    value: "neutral",
    label: "Neutral",
    backgroundColor: "rgba(200, 200, 200, 0.7)",
    textColor: "#111111",
  },
  {
    value: "sunset",
    label: "Sonnenlicht",
    backgroundColor: "rgba(255, 214, 140, 0.78)",
    textColor: "#2c1b00",
  },
  {
    value: "sky",
    label: "Himmel",
    backgroundColor: "rgba(176, 223, 255, 0.78)",
    textColor: "#06233a",
  },
  {
    value: "mint",
    label: "Mint",
    backgroundColor: "rgba(186, 239, 214, 0.78)",
    textColor: "#05361f",
  },
  {
    value: "rose",
    label: "Rose",
    backgroundColor: "rgba(255, 204, 214, 0.78)",
    textColor: "#3b0712",
  },
];
