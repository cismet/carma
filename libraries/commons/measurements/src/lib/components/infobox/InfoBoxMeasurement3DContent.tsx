import type { MouseEvent as ReactMouseEvent } from "react";

import type { MeasurementEntry } from "@carma-mapping/engines/cesium/measurements";
import {
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_POINT,
} from "../../types/measurementKindRegistry";
import type { PolylineSegmentLineMode } from "../../types/measurementTypes";

import type { InfoBoxMeasurementViewType } from "./InfoBoxMeasurement3D.types";
import type {
  PolygonSurfaceTypeOption,
  PureLabelColorStyleId,
} from "./InfoBoxMeasurement3D.config";
import type {
  DistanceLineVisibilityKind,
  ElevationInputSharedProps,
  LivePreviewDistanceRow,
  LivePreviewPointGeometry,
  PointRelationRow,
  RelationMetricEditKind,
  RelationMetricInputSharedProps,
} from "./InfoBoxMeasurement3DPointDistance.types";
import { InfoBoxMeasurement3DDistanceContent } from "./InfoBoxMeasurement3DDistanceContent";
import { InfoBoxMeasurement3DPointContent } from "./InfoBoxMeasurement3DPointContent";
import { InfoBoxMeasurement3DPolygonContent } from "./InfoBoxMeasurement3DPolygonContent";
import { InfoBoxMeasurement3DPureLabelContent } from "./InfoBoxMeasurement3DPureLabelContent";

type PureLabelAppearance = {
  fontSizePx: number;
  backgroundColor: string;
  textColor: string;
};

type InfoBoxMeasurement3DContentProps = {
  isPlanarPolygonMeasurementView: boolean;
  selectedPolylineSummary: {
    segmentCount: number;
    totalLengthMeters: number;
    meanSegmentLengthMeters: number;
    totalAbsoluteElevationChangeMeters: number;
    startEndElevationDeltaMeters: number;
    ascentMeters: number;
    descentMeters: number;
  } | null;
  selectedPolylineSegmentLineMode: PolylineSegmentLineMode;
  updateSelectedPolylineSegmentLineMode: (
    nextMode: PolylineSegmentLineMode
  ) => void;
  stopEventPropagation: (event: ReactMouseEvent<HTMLElement>) => void;
  selectedPolygonSurfaceTypeValue: PolygonSurfaceTypeOption;
  polygonSurfaceTypeOptions: Array<{
    value: PolygonSurfaceTypeOption;
    label: string;
  }>;
  updateSelectedPolygonSurfaceType: (
    nextType: PolygonSurfaceTypeOption
  ) => void;
  showSurfaceAreaForType: boolean;
  showHorizontalAreaForType: boolean;
  selectedConnectedPlanarPolygonTotalAreaSquareMeters: number;
  selectedPolygonHorizontalAreaSquareMeters: number;
  selectedPolygonCircumferenceSummary: {
    planarMeters: number;
    threeDMeters: number;
  };
  formatSignificant: (value: number, significantDigits?: number) => string;
  selectedConnectedPlanarPolygonCount: number;
  selectedConnectedRoofAverageSlopeDeg: number | null;
  selectedConnectedRoofSlopeLabels: string[];
  selectedPolygonTiltInfo: {
    tiltDeg: number;
    slopePercentText: string;
    normalDirectionText: string;
  };
  selectedPolygonVertexLabels: string[];
  isPureLabelLivePreview: boolean;
  hasActiveDistancePreviewAnchor: boolean;
  livePreviewDistanceRow: LivePreviewDistanceRow | null;
  livePreviewPointGeometryWGS84: LivePreviewPointGeometry | null;
  currentMeasurement?: MeasurementEntry;
  measurementViewType: InfoBoxMeasurementViewType;
  pureLabelAppearance: PureLabelAppearance | null;
  selectedPureLabelColorStyleId: PureLabelColorStyleId | undefined;
  pureLabelDefaultFontSizePx: number;
  pureLabelMinFontSizePx: number;
  pureLabelMaxFontSizePx: number;
  pureLabelFontSizeStepPx: number;
  pureLabelColorStyleOptions: Array<{
    value: PureLabelColorStyleId;
    label: string;
  }>;
  adjustCurrentPureLabelFontSize: (deltaPx: number) => void;
  handlePureLabelColorStyleChange: (styleId: PureLabelColorStyleId) => void;
  isReferencePointWithoutEdges: boolean;
  pointRelationRows: PointRelationRow[];
  isRelativeElevationEditActive: boolean;
  relativeElevationValue: number;
  elevationInputSharedProps: ElevationInputSharedProps;
  relativeElevationInputWidthPx: number;
  handleElevationInputChange: (value: number | null) => void;
  stopElevationEditMode: (e?: ReactMouseEvent | MouseEvent) => void;
  startRelativeElevationEditMode: (e?: ReactMouseEvent | MouseEvent) => void;
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

export const InfoBoxMeasurement3DContent = ({
  isPlanarPolygonMeasurementView,
  selectedPolylineSummary,
  selectedPolylineSegmentLineMode,
  updateSelectedPolylineSegmentLineMode,
  stopEventPropagation,
  selectedPolygonSurfaceTypeValue,
  polygonSurfaceTypeOptions,
  updateSelectedPolygonSurfaceType,
  showSurfaceAreaForType,
  showHorizontalAreaForType,
  selectedConnectedPlanarPolygonTotalAreaSquareMeters,
  selectedPolygonHorizontalAreaSquareMeters,
  selectedPolygonCircumferenceSummary,
  formatSignificant,
  selectedConnectedPlanarPolygonCount,
  selectedConnectedRoofAverageSlopeDeg,
  selectedConnectedRoofSlopeLabels,
  selectedPolygonTiltInfo,
  selectedPolygonVertexLabels,
  isPureLabelLivePreview,
  hasActiveDistancePreviewAnchor,
  livePreviewDistanceRow,
  livePreviewPointGeometryWGS84,
  currentMeasurement,
  measurementViewType,
  pureLabelAppearance,
  selectedPureLabelColorStyleId,
  pureLabelDefaultFontSizePx,
  pureLabelMinFontSizePx,
  pureLabelMaxFontSizePx,
  pureLabelFontSizeStepPx,
  pureLabelColorStyleOptions,
  adjustCurrentPureLabelFontSize,
  handlePureLabelColorStyleChange,
  isReferencePointWithoutEdges,
  pointRelationRows,
  isRelativeElevationEditActive,
  relativeElevationValue,
  elevationInputSharedProps,
  relativeElevationInputWidthPx,
  handleElevationInputChange,
  stopElevationEditMode,
  startRelativeElevationEditMode,
  relationMetricEdit,
  relationMetricInputSharedProps,
  handleRelationMetricValueChange,
  stopRelationMetricEditMode,
  startRelationMetricEditMode,
  toggleDistanceRelationLineVisibilityByKind,
  addDistanceRelationForCurrentPoint,
  removeDistanceRelationById,
}: InfoBoxMeasurement3DContentProps) => {
  if (isPlanarPolygonMeasurementView) {
    return (
      <InfoBoxMeasurement3DPolygonContent
        selectedPolylineSummary={selectedPolylineSummary}
        selectedPolylineSegmentLineMode={selectedPolylineSegmentLineMode}
        updateSelectedPolylineSegmentLineMode={
          updateSelectedPolylineSegmentLineMode
        }
        stopEventPropagation={stopEventPropagation}
        selectedPolygonSurfaceTypeValue={selectedPolygonSurfaceTypeValue}
        polygonSurfaceTypeOptions={polygonSurfaceTypeOptions}
        updateSelectedPolygonSurfaceType={updateSelectedPolygonSurfaceType}
        showSurfaceAreaForType={showSurfaceAreaForType}
        showHorizontalAreaForType={showHorizontalAreaForType}
        selectedConnectedPlanarPolygonTotalAreaSquareMeters={
          selectedConnectedPlanarPolygonTotalAreaSquareMeters
        }
        selectedPolygonHorizontalAreaSquareMeters={
          selectedPolygonHorizontalAreaSquareMeters
        }
        selectedPolygonCircumferenceSummary={
          selectedPolygonCircumferenceSummary
        }
        formatSignificant={formatSignificant}
        selectedConnectedPlanarPolygonCount={
          selectedConnectedPlanarPolygonCount
        }
        selectedConnectedRoofAverageSlopeDeg={
          selectedConnectedRoofAverageSlopeDeg
        }
        selectedConnectedRoofSlopeLabels={selectedConnectedRoofSlopeLabels}
        selectedPolygonTiltInfo={selectedPolygonTiltInfo}
        selectedPolygonVertexLabels={selectedPolygonVertexLabels}
      />
    );
  }

  if (measurementViewType.kind === "pureLabel") {
    return (
      <InfoBoxMeasurement3DPureLabelContent
        isLivePreview={isPureLabelLivePreview}
        stopEventPropagation={stopEventPropagation}
        pureLabelAppearance={pureLabelAppearance}
        selectedPureLabelColorStyleId={selectedPureLabelColorStyleId}
        pureLabelDefaultFontSizePx={pureLabelDefaultFontSizePx}
        pureLabelMinFontSizePx={pureLabelMinFontSizePx}
        pureLabelMaxFontSizePx={pureLabelMaxFontSizePx}
        pureLabelFontSizeStepPx={pureLabelFontSizeStepPx}
        pureLabelColorStyleOptions={pureLabelColorStyleOptions}
        adjustCurrentPureLabelFontSize={adjustCurrentPureLabelFontSize}
        handlePureLabelColorStyleChange={handlePureLabelColorStyleChange}
      />
    );
  }

  if (
    measurementViewType.kind !== SPATIAL_MARKUP_KIND_POINT &&
    measurementViewType.kind !== SPATIAL_MARKUP_KIND_DISTANCE
  ) {
    return null;
  }

  if (!currentMeasurement && !measurementViewType.isLivePreview) {
    return null;
  }

  if (measurementViewType.kind === SPATIAL_MARKUP_KIND_POINT) {
    return (
      <InfoBoxMeasurement3DPointContent
        isLivePreview={measurementViewType.isLivePreview}
        currentMeasurement={currentMeasurement}
        livePreviewPointGeometryWGS84={livePreviewPointGeometryWGS84}
        isRelativeElevationEditActive={isRelativeElevationEditActive}
        relativeElevationValue={relativeElevationValue}
        stopEventPropagation={stopEventPropagation}
        elevationInputSharedProps={elevationInputSharedProps}
        relativeElevationInputWidthPx={relativeElevationInputWidthPx}
        handleElevationInputChange={handleElevationInputChange}
        stopElevationEditMode={stopElevationEditMode}
        startRelativeElevationEditMode={startRelativeElevationEditMode}
      />
    );
  }

  return (
    <InfoBoxMeasurement3DDistanceContent
      isLivePreview={measurementViewType.isLivePreview}
      currentMeasurement={currentMeasurement}
      hasActiveDistancePreviewAnchor={hasActiveDistancePreviewAnchor}
      livePreviewDistanceRow={livePreviewDistanceRow}
      livePreviewPointGeometryWGS84={livePreviewPointGeometryWGS84}
      isReferencePointWithoutEdges={isReferencePointWithoutEdges}
      pointRelationRows={pointRelationRows}
      isRelativeElevationEditActive={isRelativeElevationEditActive}
      relativeElevationValue={relativeElevationValue}
      stopEventPropagation={stopEventPropagation}
      elevationInputSharedProps={elevationInputSharedProps}
      relativeElevationInputWidthPx={relativeElevationInputWidthPx}
      handleElevationInputChange={handleElevationInputChange}
      stopElevationEditMode={stopElevationEditMode}
      startRelativeElevationEditMode={startRelativeElevationEditMode}
      relationMetricEdit={relationMetricEdit}
      relationMetricInputSharedProps={relationMetricInputSharedProps}
      handleRelationMetricValueChange={handleRelationMetricValueChange}
      stopRelationMetricEditMode={stopRelationMetricEditMode}
      startRelationMetricEditMode={startRelationMetricEditMode}
      toggleDistanceRelationLineVisibilityByKind={
        toggleDistanceRelationLineVisibilityByKind
      }
      addDistanceRelationForCurrentPoint={addDistanceRelationForCurrentPoint}
      removeDistanceRelationById={removeDistanceRelationById}
    />
  );
};
