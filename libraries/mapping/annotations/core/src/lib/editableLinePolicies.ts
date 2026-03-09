import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_POLYLINE,
  type AnnotationType,
} from "./types/annotationTypes";
import type { PlanarPolygonSourceKind } from "./types/planarTypes";

export type PlanarPolygonGroupLike = {
  id: string;
  measurementKind: PlanarPolygonSourceKind;
  edgeRelationIds: readonly string[];
};

export const EDITABLE_LINE_MEASUREMENT_KINDS = [
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
] as const;

export type EditableLineMeasurementKind = Extract<
  (typeof EDITABLE_LINE_MEASUREMENT_KINDS)[number],
  AnnotationType
>;

export type EditableLineRelationIdsByKind = Readonly<
  Record<EditableLineMeasurementKind, ReadonlySet<string>>
>;

const createEditableLineRelationIdsByKind = (): Record<
  EditableLineMeasurementKind,
  Set<string>
> => ({
  [ANNOTATION_TYPE_POLYLINE]: new Set<string>(),
  [ANNOTATION_TYPE_AREA_GROUND]: new Set<string>(),
  [ANNOTATION_TYPE_AREA_PLANAR]: new Set<string>(),
  [ANNOTATION_TYPE_AREA_VERTICAL]: new Set<string>(),
});

const resolveEditableLineMeasurementKind = (
  group: Pick<PlanarPolygonGroupLike, "measurementKind">
): EditableLineMeasurementKind => group.measurementKind;

export const getSplitMarkerRelationIdsByKind = (
  planarPolygonGroups: readonly PlanarPolygonGroupLike[]
): EditableLineRelationIdsByKind => {
  const byKind = createEditableLineRelationIdsByKind();
  planarPolygonGroups.forEach((group) => {
    const measurementKind = resolveEditableLineMeasurementKind(group);
    group.edgeRelationIds.forEach((edgeRelationId) => {
      if (!edgeRelationId) return;
      byKind[measurementKind].add(edgeRelationId);
    });
  });
  return byKind;
};

export const getSplitMarkerRelationIds = (
  planarPolygonGroups: readonly PlanarPolygonGroupLike[]
): ReadonlySet<string> => {
  const byKind = getSplitMarkerRelationIdsByKind(planarPolygonGroups);
  const allRelationIds = new Set<string>();
  EDITABLE_LINE_MEASUREMENT_KINDS.forEach((measurementKind) => {
    byKind[measurementKind].forEach((relationId) => {
      allRelationIds.add(relationId);
    });
  });
  return allRelationIds;
};

export const getSplitMarkerRelationIdsForGroups = (
  planarPolygonGroups: readonly PlanarPolygonGroupLike[],
  groupIds: ReadonlySet<string>
): ReadonlySet<string> => {
  if (groupIds.size === 0) return new Set<string>();
  const relationIds = new Set<string>();
  planarPolygonGroups.forEach((group) => {
    if (!groupIds.has(group.id)) return;
    group.edgeRelationIds.forEach((relationId) => {
      if (!relationId) return;
      relationIds.add(relationId);
    });
  });
  return relationIds;
};

export const getSplitMarkerRelationIdsByKindForGroups = (
  planarPolygonGroups: readonly PlanarPolygonGroupLike[],
  groupIds: ReadonlySet<string>
): EditableLineRelationIdsByKind => {
  if (groupIds.size === 0) {
    return createEditableLineRelationIdsByKind();
  }
  const byKind = createEditableLineRelationIdsByKind();
  planarPolygonGroups.forEach((group) => {
    if (!groupIds.has(group.id)) return;
    const measurementKind = resolveEditableLineMeasurementKind(group);
    group.edgeRelationIds.forEach((relationId) => {
      if (!relationId) return;
      byKind[measurementKind].add(relationId);
    });
  });
  return byKind;
};

export const getRoofSharedEdgeRelationIds = (
  planarPolygonGroups: readonly PlanarPolygonGroupLike[]
): ReadonlySet<string> => {
  const relationUsageCount = new Map<string, number>();
  const relationMeasurementKinds = new Map<string, Set<AnnotationType>>();

  planarPolygonGroups.forEach((group) => {
    const measurementKind = resolveEditableLineMeasurementKind(group);
    group.edgeRelationIds.forEach((edgeRelationId) => {
      if (!edgeRelationId) return;
      relationUsageCount.set(
        edgeRelationId,
        (relationUsageCount.get(edgeRelationId) ?? 0) + 1
      );
      const measurementKinds = relationMeasurementKinds.get(edgeRelationId);
      if (measurementKinds) {
        measurementKinds.add(measurementKind);
        return;
      }
      relationMeasurementKinds.set(edgeRelationId, new Set([measurementKind]));
    });
  });

  const sharedRoofEdgeIds = new Set<string>();
  relationUsageCount.forEach((count, edgeRelationId) => {
    const measurementKinds = relationMeasurementKinds.get(edgeRelationId);
    if (!measurementKinds) return;
    if (
      count >= 2 &&
      measurementKinds.size === 1 &&
      measurementKinds.has(ANNOTATION_TYPE_AREA_PLANAR)
    ) {
      sharedRoofEdgeIds.add(edgeRelationId);
    }
  });

  return sharedRoofEdgeIds;
};
