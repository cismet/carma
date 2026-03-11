export const LINE_TYPE_CARTESIAN = "cartesian" as const;
export const LINE_TYPE_GEOGRAPHIC = "geographic" as const;

export const LINE_TYPES = [LINE_TYPE_CARTESIAN, LINE_TYPE_GEOGRAPHIC] as const;

export type LineType = (typeof LINE_TYPES)[number];
