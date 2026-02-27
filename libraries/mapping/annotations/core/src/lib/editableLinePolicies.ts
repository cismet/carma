export type SurfaceType = "roof" | "facade" | "terrain" | "footprint";

export type PlanarPolygonGroupLike = {
  id: string;
  closed: boolean;
  surfaceType?: SurfaceType;
  edgeRelationIds: readonly string[];
};

export const EDITABLE_LINE_MEASUREMENT_KINDS = [
  "polyline",
  "area",
  "planar",
  "vertical",
] as const;

export type EditableLineMeasurementKind =
  (typeof EDITABLE_LINE_MEASUREMENT_KINDS)[number];

export type EditableLineRelationIdsByKind = Readonly<
  Record<EditableLineMeasurementKind, ReadonlySet<string>>
>;

const createEditableLineRelationIdsByKind = (): Record<
  EditableLineMeasurementKind,
  Set<string>
> => ({
  polyline: new Set<string>(),
  area: new Set<string>(),
  planar: new Set<string>(),
  vertical: new Set<string>(),
});

const resolveEditableLineMeasurementKind = (
  group: Pick<PlanarPolygonGroupLike, "closed" | "surfaceType">
): EditableLineMeasurementKind => {
  if (!group.closed) {
    return "polyline";
  }

  const surfaceType = group.surfaceType ?? "roof";
  if (surfaceType === "facade") {
    return "vertical";
  }
  if (surfaceType === "roof") {
    return "planar";
  }
  return "area";
};

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
  const relationSurfaceTypes = new Map<
    string,
    Set<"roof" | "facade" | "terrain" | "footprint">
  >();

  planarPolygonGroups.forEach((group) => {
    const surfaceType = (group.surfaceType ?? "roof") as
      | "roof"
      | "facade"
      | "terrain"
      | "footprint";
    group.edgeRelationIds.forEach((edgeRelationId) => {
      if (!edgeRelationId) return;
      relationUsageCount.set(
        edgeRelationId,
        (relationUsageCount.get(edgeRelationId) ?? 0) + 1
      );
      const surfaceTypes = relationSurfaceTypes.get(edgeRelationId);
      if (surfaceTypes) {
        surfaceTypes.add(surfaceType);
        return;
      }
      relationSurfaceTypes.set(edgeRelationId, new Set([surfaceType]));
    });
  });

  const sharedRoofEdgeIds = new Set<string>();
  relationUsageCount.forEach((count, edgeRelationId) => {
    const surfaceTypes = relationSurfaceTypes.get(edgeRelationId);
    if (!surfaceTypes) return;
    if (count >= 2 && surfaceTypes.size === 1 && surfaceTypes.has("roof")) {
      sharedRoofEdgeIds.add(edgeRelationId);
    }
  });

  return sharedRoofEdgeIds;
};
