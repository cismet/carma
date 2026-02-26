import type { MouseEvent as ReactMouseEvent } from "react";

import { InputNumber, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsDownToLine,
  faCheck,
  faEye,
  faEyeSlash,
  faLock,
  faLockOpen,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import Icon from "react-cismap/commons/Icon";
import {
  formatNumber,
  getCustomPointMeasurementName,
  isPointMeasurementEntry,
  type MeasurementEntry,
} from "@carma-mapping/engines/cesium/measurements";
import {
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_POINT,
} from "../../types/measurementKindRegistry";

import MeasurementTitle from "../MeasurementTitle";
import InfoBoxMeasurementLabelTitle from "./InfoBoxMeasurementLabelTitle";
import { InfoBoxMeasurement3DActionIcon } from "./InfoBoxMeasurement3DActionIcon";
import {
  InfoBoxDistanceSubtitleSection,
  InfoBoxLabelSubtitleSection,
  InfoBoxPointSubtitleSection,
  InfoBoxPolygonSubtitleSection,
} from "./InfoBoxMeasurement3DSubtitleSections";
import { formatCoordinateWithHemisphere } from "./InfoBoxMeasurement3D.formatters";

export type InfoBoxMeasurement3DSubtitleProps = {
  isPlanarPolygonMeasurementView: boolean;
  selectedPlanarPolygonGroup: { id: string; name?: string } | null;
  selectedPlanarPolygonOrder: number;
  collapsedInfoBox: boolean;
  selectedPolylineSummary: {
    segmentCount: number;
    totalLengthMeters: number;
    meanSegmentLengthMeters: number;
    totalAbsoluteElevationChangeMeters: number;
    startEndElevationDeltaMeters: number;
    ascentMeters: number;
    descentMeters: number;
  } | null;
  suppressPolygonAreaInDirectPolylineMode: boolean;
  selectedPolygonPrimaryAreaSquareMeters: number;
  selectedPolygonSurfaceTypeLabel: string;
  handlePolygonNameUpdate: (
    polygonGroupId: string | number,
    name: string
  ) => void;
  flyToSelectedPolygon: () => void;
  deleteSelectedPolygon: () => void;
  isPureLabelLivePreview: boolean;
  navigationEntriesLength: number;
  livePreviewMeasurementKind:
    | typeof SPATIAL_MARKUP_KIND_POINT
    | typeof SPATIAL_MARKUP_KIND_DISTANCE
    | null;
  nextPointMeasureOrder: number;
  nextDistanceMeasureOrder: number;
  nextDistanceMeasureOrderToken: string;
  defaultPointMeasurementPlaceholder: string;
  defaultDistanceMeasurementPlaceholder: string;
  livePreviewPointGeometryWGS84: {
    latitude: number;
    longitude: number;
    height: number;
  } | null;
  currentMeasurement?: MeasurementEntry;
  isReference: boolean;
  currentIndex: number;
  shouldAutofocusLabelTitle: boolean;
  handleMeasurementNameUpdate: (id: string | number, name: string) => void;
  currentMeasurementOrder: number | null;
  currentMeasurementOrderDisplay: string | null;
  currentMeasurementPlaceholder: string;
  flyToMeasurement: () => void;
  isCurrentPointMeasurement: boolean;
  currentPointMeasurementHidden: boolean;
  toggleCurrentPointMeasurementVisibility: (
    event: ReactMouseEvent<SVGSVGElement, MouseEvent>
  ) => void;
  currentPointMeasurementLocked: boolean;
  toggleCurrentPointMeasurementLock: (
    event: ReactMouseEvent<SVGSVGElement, MouseEvent>
  ) => void;
  isPureLabelMeasurement: boolean;
  setAsReferenceHandler: (e?: ReactMouseEvent | MouseEvent) => void;
  deleteShapeHandler: (e?: ReactMouseEvent | MouseEvent) => void;
  isCoordinateEditModeActive: boolean;
  coordinateEditValues: {
    latitude: number | null;
    longitude: number | null;
    latitudeHemisphere: string;
    longitudeHemisphere: string;
  } | null;
  setEditedLatitude: (nextLatitude: number | null) => void;
  setEditedLongitude: (nextLongitude: number | null) => void;
  applyCoordinateDraft: (
    draftLatitude: number | null,
    draftLongitude: number | null
  ) => void;
  inputStepConfig: {
    elevationStep: number;
    latitudeStep: number;
    longitudeStep: number;
  };
  handleCoordinateInputPressEnter: () => void;
  coordinateInputWidthPx: number;
  completeCoordinateEditMode: (e?: ReactMouseEvent | MouseEvent) => void;
  startCoordinateEditMode: (e?: ReactMouseEvent | MouseEvent) => void;
  isAbsoluteElevationEditActive: boolean;
  stopEventPropagation: (event: ReactMouseEvent<HTMLElement>) => void;
  handleElevationInputChange: (value: number | null) => void;
  elevationInputSharedProps: {
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
  absoluteElevationInputWidthPx: number;
  stopElevationEditMode: (e?: ReactMouseEvent | MouseEvent) => void;
  startAbsoluteElevationEditMode: (e?: ReactMouseEvent | MouseEvent) => void;
};

export const InfoBoxMeasurement3DSubtitle = ({
  isPlanarPolygonMeasurementView,
  selectedPlanarPolygonGroup,
  selectedPlanarPolygonOrder,
  collapsedInfoBox,
  selectedPolylineSummary,
  suppressPolygonAreaInDirectPolylineMode,
  selectedPolygonPrimaryAreaSquareMeters,
  selectedPolygonSurfaceTypeLabel,
  handlePolygonNameUpdate,
  flyToSelectedPolygon,
  deleteSelectedPolygon,
  isPureLabelLivePreview,
  navigationEntriesLength,
  livePreviewMeasurementKind,
  nextPointMeasureOrder,
  nextDistanceMeasureOrder,
  nextDistanceMeasureOrderToken,
  defaultPointMeasurementPlaceholder,
  defaultDistanceMeasurementPlaceholder,
  livePreviewPointGeometryWGS84,
  currentMeasurement,
  isReference,
  currentIndex,
  shouldAutofocusLabelTitle,
  handleMeasurementNameUpdate,
  currentMeasurementOrder,
  currentMeasurementOrderDisplay,
  currentMeasurementPlaceholder,
  flyToMeasurement,
  isCurrentPointMeasurement,
  currentPointMeasurementHidden,
  toggleCurrentPointMeasurementVisibility,
  currentPointMeasurementLocked,
  toggleCurrentPointMeasurementLock,
  isPureLabelMeasurement,
  setAsReferenceHandler,
  deleteShapeHandler,
  isCoordinateEditModeActive,
  coordinateEditValues,
  setEditedLatitude,
  setEditedLongitude,
  applyCoordinateDraft,
  inputStepConfig,
  handleCoordinateInputPressEnter,
  coordinateInputWidthPx,
  completeCoordinateEditMode,
  startCoordinateEditMode,
  isAbsoluteElevationEditActive,
  stopEventPropagation,
  handleElevationInputChange,
  elevationInputSharedProps,
  absoluteElevationInputWidthPx,
  stopElevationEditMode,
  startAbsoluteElevationEditMode,
}: InfoBoxMeasurement3DSubtitleProps) => (
  <>
    {isPlanarPolygonMeasurementView && selectedPlanarPolygonGroup ? (
      <InfoBoxPolygonSubtitleSection
        selectedPlanarPolygonGroup={selectedPlanarPolygonGroup}
        selectedPlanarPolygonOrder={selectedPlanarPolygonOrder}
        collapsedInfoBox={collapsedInfoBox}
        selectedPolylineSummary={selectedPolylineSummary}
        suppressPolygonAreaInDirectPolylineMode={
          suppressPolygonAreaInDirectPolylineMode
        }
        selectedPolygonPrimaryAreaSquareMeters={
          selectedPolygonPrimaryAreaSquareMeters
        }
        selectedPolygonSurfaceTypeLabel={selectedPolygonSurfaceTypeLabel}
        onPolygonNameUpdate={handlePolygonNameUpdate}
        onFlyToSelectedPolygon={flyToSelectedPolygon}
        onDeleteSelectedPolygon={deleteSelectedPolygon}
      />
    ) : isPureLabelLivePreview ? (
      <InfoBoxLabelSubtitleSection
        collapsedInfoBox={collapsedInfoBox}
        order={navigationEntriesLength + 1}
        isLivePreview
      />
    ) : livePreviewMeasurementKind === SPATIAL_MARKUP_KIND_POINT ? (
      <InfoBoxPointSubtitleSection
        collapsedInfoBox={collapsedInfoBox}
        order={nextPointMeasureOrder}
        pointMeasurementPlaceholder={defaultPointMeasurementPlaceholder}
        livePreviewPointGeometryWGS84={livePreviewPointGeometryWGS84}
        isLivePreview
      />
    ) : livePreviewMeasurementKind === SPATIAL_MARKUP_KIND_DISTANCE ? (
      <InfoBoxDistanceSubtitleSection
        collapsedInfoBox={collapsedInfoBox}
        order={nextDistanceMeasureOrder}
        orderToken={nextDistanceMeasureOrderToken}
        distanceMeasurementPlaceholder={defaultDistanceMeasurementPlaceholder}
        livePreviewPointGeometryWGS84={livePreviewPointGeometryWGS84}
        isLivePreview
      />
    ) : currentMeasurement ? (
      <div className="mt-1 mb-0 w-full px-2">
        <div className="flex justify-between items-start gap-2">
          <span
            style={{ cursor: "default" }}
            className={`font-bold flex-1 min-w-0 ${
              isReference ? "italic" : ""
            }`}
          >
            {isPointMeasurementEntry(currentMeasurement) &&
            currentMeasurement.auxiliaryLabelAnchor ? (
              <InfoBoxMeasurementLabelTitle
                measurement={currentMeasurement}
                order={navigationEntriesLength - currentIndex}
                collapsed={collapsedInfoBox}
                onNameUpdate={handleMeasurementNameUpdate}
                autoFocusTrigger={
                  shouldAutofocusLabelTitle
                    ? currentMeasurement.timestamp ?? 0
                    : undefined
                }
              />
            ) : (
              <MeasurementTitle
                key={currentMeasurement.id}
                order={
                  currentMeasurementOrder ??
                  navigationEntriesLength - currentIndex
                }
                title={
                  getCustomPointMeasurementName(currentMeasurement.name) || ""
                }
                shapeId={currentMeasurement.id}
                setUpdateMeasurementStatus={() => {}}
                updateTitleMeasurementById={handleMeasurementNameUpdate}
                isCollapsed={collapsedInfoBox}
                placeholderText={`${currentMeasurementPlaceholder} #${
                  currentMeasurementOrderDisplay ??
                  `${navigationEntriesLength - currentIndex}`
                }`}
                clearPlaceholderOnFocus
                autoFocusTrigger={
                  shouldAutofocusLabelTitle
                    ? currentMeasurement.timestamp ?? 0
                    : undefined
                }
                showOrder={false}
                collapsedContent={
                  isPointMeasurementEntry(currentMeasurement)
                    ? `NHN ${formatNumber(
                        currentMeasurement.geometryWGS84.height
                      )} m`
                    : ""
                }
                editable={true}
                capitalize={false}
                multiline={true}
              />
            )}
          </span>
          <div className="flex justify-end items-center shrink-0 mt-0 gap-2">
            <Tooltip title="Zur Messung fliegen">
              <Icon
                name="search-location"
                onClick={(event) => {
                  event.stopPropagation();
                  flyToMeasurement();
                }}
                className="cursor-pointer text-[16px] text-[#808080] hover:text-[#a0a0a0]"
                data-test-id="flyto-measurement-btn"
              />
            </Tooltip>
            {isCurrentPointMeasurement && (
              <>
                <InfoBoxMeasurement3DActionIcon
                  title={
                    currentPointMeasurementHidden ? "Einblenden" : "Ausblenden"
                  }
                  onClick={toggleCurrentPointMeasurementVisibility}
                  icon={currentPointMeasurementHidden ? faEyeSlash : faEye}
                  dataTestId="toggle-measurement-visibility-btn"
                />
                <InfoBoxMeasurement3DActionIcon
                  title={
                    currentPointMeasurementLocked ? "Entsperren" : "Sperren"
                  }
                  onClick={toggleCurrentPointMeasurementLock}
                  icon={currentPointMeasurementLocked ? faLock : faLockOpen}
                  dataTestId="toggle-measurement-lock-btn"
                />
              </>
            )}
            {!isReference && !isPureLabelMeasurement && (
              <InfoBoxMeasurement3DActionIcon
                title="Als Referenzhöhe setzen"
                onClick={setAsReferenceHandler}
                icon={faArrowsDownToLine}
                dataTestId="set-reference-btn"
              />
            )}
            <InfoBoxMeasurement3DActionIcon
              title="Löschen"
              onClick={deleteShapeHandler}
              icon={faTrashCan}
              dataTestId="delete-measurement-btn"
            />
          </div>
        </div>
        {isPointMeasurementEntry(currentMeasurement) &&
          !currentMeasurement.auxiliaryLabelAnchor &&
          (isCoordinateEditModeActive ? (
            <div
              className="w-full text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-1"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="inline-flex items-center gap-1">
                <InputNumber
                  value={coordinateEditValues?.latitude}
                  onChange={(value) => {
                    const nextLatitude =
                      typeof value === "number" ? value : null;
                    setEditedLatitude(nextLatitude);
                    applyCoordinateDraft(
                      nextLatitude,
                      coordinateEditValues?.longitude ?? null
                    );
                  }}
                  step={inputStepConfig.latitudeStep}
                  precision={6}
                  min={-90}
                  max={90}
                  controls
                  changeOnWheel
                  onPressEnter={handleCoordinateInputPressEnter}
                  style={{ width: coordinateInputWidthPx }}
                  data-test-id="latitude-edit-input"
                />
                <span className="text-[9px] uppercase tracking-wide text-gray-500">
                  Lat °{coordinateEditValues?.latitudeHemisphere ?? "N"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1">
                <InputNumber
                  value={coordinateEditValues?.longitude}
                  onChange={(value) => {
                    const nextLongitude =
                      typeof value === "number" ? value : null;
                    setEditedLongitude(nextLongitude);
                    applyCoordinateDraft(
                      coordinateEditValues?.latitude ?? null,
                      nextLongitude
                    );
                  }}
                  step={inputStepConfig.longitudeStep}
                  precision={6}
                  min={-180}
                  max={180}
                  controls
                  changeOnWheel
                  onPressEnter={handleCoordinateInputPressEnter}
                  style={{ width: coordinateInputWidthPx }}
                  data-test-id="longitude-edit-input"
                />
                <span className="text-[9px] uppercase tracking-wide text-gray-500">
                  Lon °{coordinateEditValues?.longitudeHemisphere ?? "O"}
                </span>
              </span>
              <button
                type="button"
                onClick={completeCoordinateEditMode}
                className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                data-test-id="coordinates-edit-complete-btn"
                aria-label="Koordinatenbearbeitung abschließen"
              >
                <FontAwesomeIcon icon={faCheck} />
              </button>
            </div>
          ) : (
            <div
              className="w-full text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-2 whitespace-nowrap"
              data-test-id="coordinates-display-btn"
            >
              <button
                type="button"
                onClick={startCoordinateEditMode}
                className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left text-[10px] font-normal text-gray-500 whitespace-nowrap"
              >
                {formatCoordinateWithHemisphere(
                  currentMeasurement.geometryWGS84.latitude,
                  true
                )}{" "}
                {formatCoordinateWithHemisphere(
                  currentMeasurement.geometryWGS84.longitude,
                  false
                )}
              </button>
              {isAbsoluteElevationEditActive ? (
                <span
                  className="inline-flex items-center gap-1"
                  onClick={stopEventPropagation}
                >
                  <InputNumber
                    value={currentMeasurement.geometryWGS84.height}
                    onChange={handleElevationInputChange}
                    {...elevationInputSharedProps}
                    style={{
                      width: absoluteElevationInputWidthPx,
                    }}
                    data-test-id="elevation-edit-input"
                  />
                  <button
                    type="button"
                    onClick={stopElevationEditMode}
                    className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                    data-test-id="elevation-edit-complete-btn"
                    aria-label="Höhenbearbeitung abschließen"
                  >
                    <FontAwesomeIcon icon={faCheck} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={startAbsoluteElevationEditMode}
                  className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left text-[10px] font-normal text-gray-500 whitespace-nowrap"
                  data-test-id="elevation-display-btn"
                >
                  {formatNumber(currentMeasurement.geometryWGS84.height)} m ü.
                  NHN
                  {isReference ? " ist Bezugshöhe" : ""}
                </button>
              )}
            </div>
          ))}
      </div>
    ) : (
      <div className="mt-2 w-[90%] p-2" data-test-id="empty-measurement-info">
        <p className="text-[#212529] font-normal text-xs leading-normal">
          Für Punktmessungen auf das Stadtmodell klicken. Die erste Messung
          definiert die Referenzhöhe.
        </p>
      </div>
    )}
  </>
);
