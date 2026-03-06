export type ReferenceLineLabelKind = "direct" | "vertical" | "horizontal";

export type DistanceRelationLabelVisibilityByKind = Partial<
  Record<ReferenceLineLabelKind, boolean>
>;

export type DirectLineLabelMode = "segment" | "cumulative" | "none";
