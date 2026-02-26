import type { MouseEvent as ReactMouseEvent } from "react";

import type { MeasurementEntry } from "@carma-mapping/engines/cesium/measurements";

export type DistanceLineVisibilityKind =
  | "direct"
  | "vertical"
  | "horizontal"
  | "components";

export type RelationMetricEditKind = "vertical" | "horizontal" | "direct";

export type PointRelationRow = {
  relatedPointId: string;
  relationId: string;
  label: string;
  elevation: number;
  horizontalDistance: number;
  distance: number;
  isReference: boolean;
  isImplicitReferenceRow: boolean;
  lineVisibility: {
    vertical: boolean;
    horizontal: boolean;
    direct: boolean;
  };
};

export type LivePreviewPointGeometry = {
  latitude: number;
  longitude: number;
  height: number;
};

export type LivePreviewDistanceRow = {
  label: string;
  elevation: number;
  horizontalDistance: number;
  distance: number;
};

export type ElevationInputSharedProps = {
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  step: number;
  precision: number;
  controls: boolean;
  changeOnWheel: boolean;
  onPressEnter: () => void;
  decimalSeparator: string;
  size: "small";
  className: string;
};

export type RelationMetricInputSharedProps = {
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  step: number;
  precision: number;
  controls: boolean;
  changeOnWheel: boolean;
  onPressEnter: () => void;
  decimalSeparator: string;
  size: "small";
  className: string;
};

export type RelativeElevationContentProps = {
  isRelativeElevationEditActive: boolean;
  relativeElevationValue: number;
  stopEventPropagation: (event: ReactMouseEvent<HTMLElement>) => void;
  elevationInputSharedProps: ElevationInputSharedProps;
  relativeElevationInputWidthPx: number;
  handleElevationInputChange: (value: number | null) => void;
  stopElevationEditMode: (e?: ReactMouseEvent | MouseEvent) => void;
  startRelativeElevationEditMode: (e?: ReactMouseEvent | MouseEvent) => void;
};

export type PointDistanceCommonProps = RelativeElevationContentProps & {
  currentMeasurement?: MeasurementEntry;
  livePreviewPointGeometryWGS84: LivePreviewPointGeometry | null;
};

export type DistanceContentProps = PointDistanceCommonProps & {
  isLivePreview: boolean;
  hasActiveDistancePreviewAnchor: boolean;
  livePreviewDistanceRow: LivePreviewDistanceRow | null;
  isReferencePointWithoutEdges: boolean;
  pointRelationRows: PointRelationRow[];
  relationMetricEdit: {
    relatedPointId: string;
    kind: RelationMetricEditKind;
  } | null;
  relationMetricInputSharedProps: RelationMetricInputSharedProps;
  handleRelationMetricValueChange: (
    relatedPointId: string,
    kind: RelationMetricEditKind,
    value: number | null
  ) => void;
  stopRelationMetricEditMode: (e?: ReactMouseEvent | MouseEvent) => void;
  startRelationMetricEditMode: (
    relatedPointId: string,
    kind: RelationMetricEditKind,
    e?: ReactMouseEvent | MouseEvent
  ) => void;
  toggleDistanceRelationLineVisibilityByKind: (
    relationId: string,
    kind: DistanceLineVisibilityKind,
    e?: ReactMouseEvent | MouseEvent
  ) => void;
  addDistanceRelationForCurrentPoint: (
    relatedPointId: string,
    e?: ReactMouseEvent | MouseEvent
  ) => void;
  removeDistanceRelationById: (
    relationId: string,
    e?: ReactMouseEvent | MouseEvent
  ) => void;
};
