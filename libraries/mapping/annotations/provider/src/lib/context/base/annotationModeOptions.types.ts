export const PLANAR_TOOL_CREATION_MODE_POLYLINE = "polyline" as const;
export const PLANAR_TOOL_CREATION_MODE_POLYGON = "polygon" as const;

const PLANAR_TOOL_CREATION_MODES = [
  PLANAR_TOOL_CREATION_MODE_POLYLINE,
  PLANAR_TOOL_CREATION_MODE_POLYGON,
] as const;

export type PlanarToolCreationMode =
  (typeof PLANAR_TOOL_CREATION_MODES)[number];
