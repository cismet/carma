import type { PlanarPolygonGroup } from "@carma-mapping/engines/cesium/measurements";
import {
  SPATIAL_MARKUP_KIND_AREA,
  SPATIAL_MARKUP_KIND_PLANAR,
  SPATIAL_MARKUP_KIND_POLYLINE,
  SPATIAL_MARKUP_KIND_VERTICAL,
} from "../../types/measurementKindRegistry";
import type {
  MeasurementSlotActions,
  PolygonPolylineMeasurementSlotsInput,
} from "./getCarmaMeasurementInfoBoxSlots";

type GetPlanarMeasurementSlotsInputParams = {
  polylineGroups: ReadonlyArray<PlanarPolygonGroup>;
  areaPolygonGroups: ReadonlyArray<PlanarPolygonGroup>;
  planarSurfacePolygonGroups: ReadonlyArray<PlanarPolygonGroup>;
  verticalPolygonGroups: ReadonlyArray<PlanarPolygonGroup>;
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  actions: MeasurementSlotActions;
};

export type PlanarMeasurementSlotsInputResult = {
  slotsInput: PolygonPolylineMeasurementSlotsInput | null;
  planarGroup: PlanarPolygonGroup | null;
};

const getPlanarKind = (
  group: PlanarPolygonGroup
): PolygonPolylineMeasurementSlotsInput["kind"] => {
  if (!group.closed || (group.measurementKind ?? "polyline") === "polyline") {
    return SPATIAL_MARKUP_KIND_POLYLINE;
  }
  const surfaceType = group.surfaceType ?? "roof";
  if (surfaceType === "facade") return SPATIAL_MARKUP_KIND_VERTICAL;
  if (surfaceType === "roof") return SPATIAL_MARKUP_KIND_PLANAR;
  return SPATIAL_MARKUP_KIND_AREA;
};

const getSurfaceTypeLabel = (group: PlanarPolygonGroup): string => {
  const kind = getPlanarKind(group);
  if (kind === SPATIAL_MARKUP_KIND_POLYLINE) return "Polygonzug";
  if (kind === SPATIAL_MARKUP_KIND_VERTICAL) return "Fassade";
  if (kind === SPATIAL_MARKUP_KIND_PLANAR) return "Dach";
  if ((group.surfaceType ?? "footprint") === "terrain") return "Gelände";
  return "Grundriss";
};

export const getPlanarMeasurementSlotsInput = ({
  polylineGroups,
  areaPolygonGroups,
  planarSurfacePolygonGroups,
  verticalPolygonGroups,
  selectedPlanarPolygonGroupId,
  activePlanarPolygonGroupId,
  actions,
}: GetPlanarMeasurementSlotsInputParams): PlanarMeasurementSlotsInputResult => {
  const planarPolygonGroups = [
    ...polylineGroups,
    ...areaPolygonGroups,
    ...planarSurfacePolygonGroups,
    ...verticalPolygonGroups,
  ];
  const focusedGroupId =
    activePlanarPolygonGroupId ?? selectedPlanarPolygonGroupId;
  const planarGroup =
    (focusedGroupId
      ? planarPolygonGroups.find((group) => group.id === focusedGroupId)
      : null) ?? null;

  if (!planarGroup) {
    return {
      slotsInput: null,
      planarGroup: null,
    };
  }

  const sameKindGroups =
    getPlanarKind(planarGroup) === SPATIAL_MARKUP_KIND_POLYLINE
      ? polylineGroups
      : getPlanarKind(planarGroup) === SPATIAL_MARKUP_KIND_AREA
      ? areaPolygonGroups
      : getPlanarKind(planarGroup) === SPATIAL_MARKUP_KIND_PLANAR
      ? planarSurfacePolygonGroups
      : verticalPolygonGroups;
  const order =
    Math.max(
      0,
      sameKindGroups.findIndex((group) => group.id === planarGroup.id)
    ) + 1;

  return {
    planarGroup,
    slotsInput: {
      kind: getPlanarKind(planarGroup),
      groupId: planarGroup.id,
      name: planarGroup.name,
      order,
      totalLengthMeters: planarGroup.perimeterMeters ?? 0,
      areaSquareMeters: planarGroup.areaSquareMeters,
      bearingDeg: planarGroup.bearingDeg,
      surfaceTypeLabel: getSurfaceTypeLabel(planarGroup),
      actions,
    },
  };
};
