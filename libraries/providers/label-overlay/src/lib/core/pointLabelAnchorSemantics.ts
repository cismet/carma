export type PointLabelAnchorKind = "point" | "pov" | "area-centroid";

export type PointLabelOcclusionMode = "auto" | "always" | "never";

export type PointLabelAnchorSemantics = {
  anchorKind?: PointLabelAnchorKind;
  occlusionMode?: PointLabelOcclusionMode;
};

export const resolvePointLabelOcclusionMode = ({
  anchorKind = "point",
  occlusionMode = "auto",
}: PointLabelAnchorSemantics): PointLabelOcclusionMode => {
  if (occlusionMode !== "auto") {
    return occlusionMode;
  }

  return anchorKind === "area-centroid" ? "never" : "always";
};

export const shouldTestPointLabelOcclusion = (
  semantics: PointLabelAnchorSemantics
): boolean => resolvePointLabelOcclusionMode(semantics) === "always";
