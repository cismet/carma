import { formatLengthMeters, LENGTH_UNIT_MODE } from "@carma/units/helpers";

import type { PointDistanceRelation } from "../../types/distanceRelation";
import { REFERENCE_LINE_EPSILON_METERS } from "../../utils/distanceVisualization";
import type {
  DirectLineLabelMode,
  ReferenceLineLabelKind,
} from "./distanceRelationLabel.types";
export type DistanceRelationLabelDisplay = {
  directLabelMode: DirectLineLabelMode;
  directLabelDistanceMeters: number;
  showDirectLabel: boolean;
  showVerticalLabel: boolean;
  showHorizontalLabel: boolean;
  directLabelMinLineLengthPx: number;
  componentLabelMinLineLengthPx: number;
};

export type DistanceRelationEdgeLabelOverlay = {
  labelText?: string;
  labelColor: string;
  labelStroke: string;
  labelFontSize: number;
  labelFontFamily: string;
  labelFontWeight: string;
  labelMinLineLengthPx: number;
  labelRotationMode?: "clockwise";
  labelOffsetPx?: number;
  labelFlippedBaselineOffsetPx?: number;
  labelDominantBaseline?: "alphabetic";
};

export type DistanceRelationEdgeLabelStyleOverrides = Partial<
  Record<
    ReferenceLineLabelKind,
    Partial<
      Omit<
        DistanceRelationEdgeLabelOverlay,
        "labelText" | "labelMinLineLengthPx"
      >
    >
  >
>;

const BASE_EDGE_LABEL_OVERLAY = {
  labelColor: "#000000",
  labelStroke: "rgba(255, 255, 255, 0.95)",
  labelFontSize: 12,
  labelFontFamily: "Arial, sans-serif",
  labelFontWeight: "400",
} satisfies Omit<
  DistanceRelationEdgeLabelOverlay,
  "labelText" | "labelMinLineLengthPx"
>;

const VERTICAL_EDGE_LABEL_OVERLAY = {
  ...BASE_EDGE_LABEL_OVERLAY,
  labelRotationMode: "clockwise",
  labelOffsetPx: 8,
  labelFlippedBaselineOffsetPx: 6,
  labelDominantBaseline: "alphabetic",
} satisfies Omit<
  DistanceRelationEdgeLabelOverlay,
  "labelText" | "labelMinLineLengthPx"
>;

export const getNextDirectLineLabelMode = (
  currentMode: DirectLineLabelMode
): DirectLineLabelMode => {
  if (currentMode === "segment") {
    return "none";
  }

  return "segment";
};

export const resolveDistanceRelationLabelDisplay = ({
  relation,
  segmentDistanceMeters,
  cumulativeDistanceMeters,
  verticalDistanceMeters,
  horizontalDistanceMeters,
  lineLabelMinDistancePx,
  isPolygonEdgeRelation,
  isSelectedOrActiveEdgeRelation,
  isSharedPlanarPolygonEdge,
  isDuplicateVerticalOpposingEdgeRelation,
}: {
  relation: PointDistanceRelation;
  segmentDistanceMeters: number;
  cumulativeDistanceMeters: number;
  verticalDistanceMeters: number;
  horizontalDistanceMeters: number;
  lineLabelMinDistancePx: number;
  isPolygonEdgeRelation: boolean;
  isSelectedOrActiveEdgeRelation: boolean;
  isSharedPlanarPolygonEdge: boolean;
  isDuplicateVerticalOpposingEdgeRelation: boolean;
}): DistanceRelationLabelDisplay => {
  const forceComponentLabelsForSelectedOrActivePolylineEdges =
    isPolygonEdgeRelation && isSelectedOrActiveEdgeRelation;
  const showVerticalLabel =
    (forceComponentLabelsForSelectedOrActivePolylineEdges ||
      (relation.labelVisibilityByKind?.vertical ?? true)) &&
    verticalDistanceMeters > REFERENCE_LINE_EPSILON_METERS;
  const showHorizontalLabel =
    (forceComponentLabelsForSelectedOrActivePolylineEdges ||
      (relation.labelVisibilityByKind?.horizontal ?? true)) &&
    horizontalDistanceMeters > REFERENCE_LINE_EPSILON_METERS;

  const directLabelMode = forceComponentLabelsForSelectedOrActivePolylineEdges
    ? "segment"
    : relation.directLabelMode ?? "segment";
  const directLabelVisibilityEnabled =
    forceComponentLabelsForSelectedOrActivePolylineEdges
      ? true
      : relation.labelVisibilityByKind?.direct ?? true;
  const shouldShowPolygonEdgeLengthLabel =
    !isPolygonEdgeRelation ||
    forceComponentLabelsForSelectedOrActivePolylineEdges ||
    isSelectedOrActiveEdgeRelation;
  const showDirectLabel =
    directLabelVisibilityEnabled &&
    directLabelMode !== "none" &&
    !isSharedPlanarPolygonEdge &&
    shouldShowPolygonEdgeLengthLabel &&
    !isDuplicateVerticalOpposingEdgeRelation;

  return {
    directLabelMode,
    directLabelDistanceMeters:
      directLabelMode === "cumulative"
        ? cumulativeDistanceMeters
        : segmentDistanceMeters,
    showDirectLabel,
    showVerticalLabel,
    showHorizontalLabel,
    directLabelMinLineLengthPx: lineLabelMinDistancePx,
    componentLabelMinLineLengthPx: lineLabelMinDistancePx,
  };
};

export const buildDistanceRelationEdgeLabelOverlays = ({
  relation,
  segmentDistanceMeters,
  cumulativeDistanceMeters,
  verticalDistanceMeters,
  horizontalDistanceMeters,
  lineLabelMinDistancePx,
  isPolygonEdgeRelation,
  isSelectedOrActiveEdgeRelation,
  isSharedPlanarPolygonEdge,
  isDuplicateVerticalOpposingEdgeRelation,
  styleOverridesByKind,
}: {
  relation: PointDistanceRelation;
  segmentDistanceMeters: number;
  cumulativeDistanceMeters: number;
  verticalDistanceMeters: number;
  horizontalDistanceMeters: number;
  lineLabelMinDistancePx: number;
  isPolygonEdgeRelation: boolean;
  isSelectedOrActiveEdgeRelation: boolean;
  isSharedPlanarPolygonEdge: boolean;
  isDuplicateVerticalOpposingEdgeRelation: boolean;
  styleOverridesByKind?: DistanceRelationEdgeLabelStyleOverrides;
}): Record<ReferenceLineLabelKind, DistanceRelationEdgeLabelOverlay> => {
  const labelDisplay = resolveDistanceRelationLabelDisplay({
    relation,
    segmentDistanceMeters,
    cumulativeDistanceMeters,
    verticalDistanceMeters,
    horizontalDistanceMeters,
    lineLabelMinDistancePx,
    isPolygonEdgeRelation,
    isSelectedOrActiveEdgeRelation,
    isSharedPlanarPolygonEdge,
    isDuplicateVerticalOpposingEdgeRelation,
  });

  return {
    direct: {
      ...BASE_EDGE_LABEL_OVERLAY,
      ...(styleOverridesByKind?.direct ?? {}),
      labelText: labelDisplay.showDirectLabel
        ? formatLengthMeters(labelDisplay.directLabelDistanceMeters, {
            locale: "de-DE",
            unitMode: LENGTH_UNIT_MODE.METERS,
          })
        : undefined,
      labelMinLineLengthPx: labelDisplay.directLabelMinLineLengthPx,
    },
    vertical: {
      ...VERTICAL_EDGE_LABEL_OVERLAY,
      ...(styleOverridesByKind?.vertical ?? {}),
      labelText: labelDisplay.showVerticalLabel
        ? formatLengthMeters(verticalDistanceMeters, {
            locale: "de-DE",
            unitMode: LENGTH_UNIT_MODE.METERS,
          })
        : undefined,
      labelMinLineLengthPx: labelDisplay.componentLabelMinLineLengthPx,
    },
    horizontal: {
      ...BASE_EDGE_LABEL_OVERLAY,
      ...(styleOverridesByKind?.horizontal ?? {}),
      labelText: labelDisplay.showHorizontalLabel
        ? formatLengthMeters(horizontalDistanceMeters, {
            locale: "de-DE",
            unitMode: LENGTH_UNIT_MODE.METERS,
          })
        : undefined,
      labelMinLineLengthPx: labelDisplay.componentLabelMinLineLengthPx,
    },
  };
};
