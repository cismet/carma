import { type NodeChainAnnotation } from "../../types/annotationTypes";
import type { Cartesian3Json } from "@carma/cesium";
import { ANNOTATION_TYPE_AREA_VERTICAL } from "../../types/annotationTypes";
import { formatAreaAdaptive } from "../../utils/displayFormatting";

export type AreaLabelText = {
  primaryText: string;
  secondaryText?: string | null;
};

const computePolygonAreaFromVertices = (
  vertices: ReadonlyArray<Cartesian3Json>
) => {
  if (vertices.length < 3) return 0;
  const basePoint = vertices[0];
  if (!basePoint) return 0;

  const subtract = (
    left: Cartesian3Json,
    right: Cartesian3Json
  ): Cartesian3Json => ({
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  });
  const cross = (
    left: Cartesian3Json,
    right: Cartesian3Json
  ): Cartesian3Json => ({
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  });
  const magnitude = (vector: Cartesian3Json) =>
    Math.hypot(vector.x, vector.y, vector.z);

  let area = 0;
  for (let index = 1; index < vertices.length - 1; index += 1) {
    const currentPoint = vertices[index];
    const nextPoint = vertices[index + 1];
    if (!currentPoint || !nextPoint) continue;
    const p1 = subtract(currentPoint, basePoint);
    const p2 = subtract(nextPoint, basePoint);
    area += magnitude(cross(p1, p2)) * 0.5;
  }

  return Math.max(0, area);
};

const resolveDisplayedAreaSquareMeters = (
  group: NodeChainAnnotation,
  previewAreaSquareMeters: number
) => {
  if (!group.closed) {
    return previewAreaSquareMeters;
  }

  const storedAreaSquareMeters = Math.max(0, group.areaSquareMeters ?? 0);
  return storedAreaSquareMeters > 0
    ? storedAreaSquareMeters
    : previewAreaSquareMeters;
};

const buildAreaLabelText = (
  group: NodeChainAnnotation,
  vertices: Cartesian3Json[]
): AreaLabelText => {
  const previewAreaSquareMeters = computePolygonAreaFromVertices(vertices);
  const planarArea = resolveDisplayedAreaSquareMeters(
    group,
    previewAreaSquareMeters
  );
  const isVerticalSurface = group.type === ANNOTATION_TYPE_AREA_VERTICAL;
  const showPreviewAreaSecondary =
    !isVerticalSurface &&
    planarArea > 0 &&
    previewAreaSquareMeters < planarArea * 0.99;

  return {
    primaryText: formatAreaAdaptive(planarArea),
    secondaryText: showPreviewAreaSecondary
      ? `(${formatAreaAdaptive(previewAreaSquareMeters)})`
      : null,
  };
};

export const buildGroundAreaLabelText = (
  group: NodeChainAnnotation,
  vertices: Cartesian3Json[]
): AreaLabelText => buildAreaLabelText(group, vertices);

export const buildPlanarAreaLabelText = (
  group: NodeChainAnnotation,
  vertices: Cartesian3Json[]
): AreaLabelText => buildAreaLabelText(group, vertices);

export const buildVerticalAreaLabelText = (
  group: NodeChainAnnotation
): AreaLabelText => ({
  primaryText: formatAreaAdaptive(Math.max(0, group.areaSquareMeters ?? 0)),
  secondaryText: null,
});
