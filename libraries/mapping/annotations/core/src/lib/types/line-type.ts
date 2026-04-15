export const LINE_TYPES = {
  CARTESIAN: "cartesian",
  GEOGRAPHIC: "geographic",
} as const;

export const LINE_TYPE_CARTESIAN = LINE_TYPES.CARTESIAN;
export const LINE_TYPE_GEOGRAPHIC = LINE_TYPES.GEOGRAPHIC;

export type LineType = (typeof LINE_TYPES)[keyof typeof LINE_TYPES];
