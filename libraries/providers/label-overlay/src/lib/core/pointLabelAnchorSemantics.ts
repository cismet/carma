export const POINT_LABEL_ANCHOR_KIND = {
  POINT: "point",
  POV: "pov",
  AREA_CENTROID: "area-centroid",
} as const;

export type PointLabelAnchorKind =
  (typeof POINT_LABEL_ANCHOR_KIND)[keyof typeof POINT_LABEL_ANCHOR_KIND];

export const POINT_LABEL_OCCLUSION_MODE = {
  AUTO: "auto",
  ALWAYS: "always",
  NEVER: "never",
} as const;

export type PointLabelOcclusionMode =
  (typeof POINT_LABEL_OCCLUSION_MODE)[keyof typeof POINT_LABEL_OCCLUSION_MODE];

export type PointLabelAnchorSemantics = {
  anchorKind?: PointLabelAnchorKind;
  occlusionMode?: PointLabelOcclusionMode;
};

export const shouldMountPointLabelAtAnchor = ({
  anchorKind = POINT_LABEL_ANCHOR_KIND.POINT,
}: Pick<PointLabelAnchorSemantics, "anchorKind">): boolean =>
  anchorKind === POINT_LABEL_ANCHOR_KIND.AREA_CENTROID;

export const resolvePointLabelOcclusionMode = ({
  anchorKind = POINT_LABEL_ANCHOR_KIND.POINT,
  occlusionMode = POINT_LABEL_OCCLUSION_MODE.AUTO,
}: PointLabelAnchorSemantics): PointLabelOcclusionMode => {
  if (occlusionMode !== POINT_LABEL_OCCLUSION_MODE.AUTO) {
    return occlusionMode;
  }

  return shouldMountPointLabelAtAnchor({ anchorKind })
    ? POINT_LABEL_OCCLUSION_MODE.NEVER
    : POINT_LABEL_OCCLUSION_MODE.ALWAYS;
};

export const shouldTestPointLabelOcclusion = (
  semantics: PointLabelAnchorSemantics
): boolean =>
  resolvePointLabelOcclusionMode(semantics) ===
  POINT_LABEL_OCCLUSION_MODE.ALWAYS;
