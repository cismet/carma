import { Switch } from "antd";
import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_POLYLINE,
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  formatAreaAdaptive,
  formatNumber,
} from "@carma-mapping/annotations/core";
import { formatBearingToGermanSectorLabel } from "./AnnotationInfoBox.formatters";
import { AnnotationInfoBoxActionIcon } from "./AnnotationInfoBoxActionIcon";
import { AnnotationInfoTitleInput } from "./AnnotationInfoTitleInput";
import { stopInputEventPropagation } from "./annotationInfoBoxSlots.shared";
import type {
  AnnotationSlots,
  PolygonPolylineAnnotationSlotsInput,
} from "./annotationInfoBoxSlots.types";

const PLANAR_TYPE_TITLE_BY_KIND: Record<
  PolygonPolylineAnnotationSlotsInput["kind"],
  string
> = {
  [ANNOTATION_TYPE_POLYLINE]: "Polygonzug",
  [ANNOTATION_TYPE_AREA_GROUND]: "Grundriss",
  [ANNOTATION_TYPE_AREA_PLANAR]: "Dach",
  [ANNOTATION_TYPE_AREA_VERTICAL]: "Fassade",
};

const getPlanarMetricContent = (input: PolygonPolylineAnnotationSlotsInput) => {
  const cardinalHeading = formatBearingToGermanSectorLabel(input.bearingDeg, {
    useFullLabel: true,
    includeDegree: true,
    fractionDigits: 2,
    mainCardinalRangeDeg: 60,
    flipBy180Deg: true,
  });
  if (input.kind === ANNOTATION_TYPE_POLYLINE) {
    const isComponentsMode =
      (input.segmentLineMode ?? LINEAR_SEGMENT_LINE_MODE_COMPONENTS) ===
      LINEAR_SEGMENT_LINE_MODE_COMPONENTS;
    return (
      <div className="w-full px-2 pb-1 text-[#212529] text-[11px] leading-normal">
        <div className="mb-1">
          Gesamtlänge: {formatNumber(input.totalLengthMeters)} m
        </div>
        <div
          className="mb-1 flex items-center gap-2"
          onClick={stopInputEventPropagation}
          onMouseDown={stopInputEventPropagation}
        >
          <span className="text-gray-500">Segmentdarstellung:</span>
          <span className="text-[10px] text-gray-500">Direkt</span>
          <Switch
            size="small"
            checked={isComponentsMode}
            onChange={(checked) =>
              input.actions.updatePlanarPolygonSegmentLineModeById(
                input.groupId,
                checked
                  ? LINEAR_SEGMENT_LINE_MODE_COMPONENTS
                  : LINEAR_SEGMENT_LINE_MODE_DIRECT
              )
            }
            aria-label="Polygonzug-Segmentdarstellung umschalten"
            data-test-id="infobox-polyline-line-mode-toggle"
          />
          <span className="text-[10px] text-gray-500">Komponenten</span>
        </div>
        {input.polylineSummary ? (
          <>
            <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px]">
              <span className="text-gray-500">Aufstieg:</span>
              <span className="tabular-nums">
                {formatNumber(input.polylineSummary.ascentMeters)} m
              </span>
              <span className="text-gray-500">Abstieg:</span>
              <span className="tabular-nums">
                {formatNumber(input.polylineSummary.descentMeters)} m
              </span>
              <span className="text-gray-500">Summe:</span>
              <span className="tabular-nums">
                {formatNumber(
                  input.polylineSummary.totalAbsoluteElevationChangeMeters
                )}{" "}
                m
              </span>
            </div>
            <div className="mb-1">
              <span className="text-gray-500 mr-1">Δ Start/Ende:</span>
              <span className="tabular-nums">
                {formatNumber(
                  input.polylineSummary.startEndElevationDeltaMeters
                )}{" "}
                m
              </span>
            </div>
            <div className="mb-1">
              <span className="text-gray-500 mr-1">Ø Segmentlänge:</span>
              <span className="tabular-nums">
                {formatNumber(input.polylineSummary.meanSegmentLengthMeters)} m
              </span>
            </div>
            <div>
              <span className="text-gray-500 mr-1">Segmente:</span>
              <span className="tabular-nums">
                {input.polylineSummary.segmentCount}
              </span>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  const areaLabel =
    input.kind === ANNOTATION_TYPE_AREA_PLANAR
      ? "Dachfläche"
      : input.kind === ANNOTATION_TYPE_AREA_VERTICAL
      ? "Fassadenfläche"
      : "Fläche";

  return (
    <div className="w-full px-2 pb-1 text-[#212529] text-[11px] leading-normal">
      {input.kind === ANNOTATION_TYPE_AREA_GROUND ? (
        <div>Typ: {input.surfaceTypeLabel}</div>
      ) : null}
      <div>
        {areaLabel}:{" "}
        {formatAreaAdaptive(Math.max(0, input.areaSquareMeters ?? 0))}
      </div>
      <div>Umfang: {formatNumber(input.totalLengthMeters)} m</div>
      {(input.kind === ANNOTATION_TYPE_AREA_PLANAR ||
        input.kind === ANNOTATION_TYPE_AREA_VERTICAL) &&
      cardinalHeading ? (
        <div>Himmelsrichtung: {cardinalHeading}</div>
      ) : null}
      {(input.kind === ANNOTATION_TYPE_AREA_PLANAR ||
        input.kind === ANNOTATION_TYPE_AREA_VERTICAL) &&
      Number.isFinite(input.verticalityDeg) ? (
        <div>Vertikalität: {formatNumber(input.verticalityDeg ?? 0)}°</div>
      ) : null}
    </div>
  );
};

export const getPlanarAnnotationInfoBoxSlots = (
  input: PolygonPolylineAnnotationSlotsInput
): AnnotationSlots => ({
  headingTitle: PLANAR_TYPE_TITLE_BY_KIND[input.kind],
  subtitle: (
    <div className="mt-1 mb-0 w-full px-2">
      <div className="flex justify-between items-start gap-2">
        <span className="font-bold flex-1 min-w-0">
          <AnnotationInfoTitleInput
            key={input.groupId}
            value={input.name ?? ""}
            placeholder={`${PLANAR_TYPE_TITLE_BY_KIND[input.kind]} #${
              input.order
            }`}
            editable={true}
            capitalize={false}
            multiline={true}
            onChange={(nextTitle) =>
              input.actions.updatePlanarPolygonNameById(
                input.groupId,
                nextTitle
              )
            }
            onCommit={(nextTitle) =>
              input.actions.updatePlanarPolygonNameById(
                input.groupId,
                nextTitle
              )
            }
          />
        </span>
        <AnnotationInfoBoxActionIcon
          title="Löschen"
          icon={faTrashCan}
          onClick={(event) => {
            event.stopPropagation();
            input.actions.deletePlanarPolygonGroupById(input.groupId);
          }}
          dataTestId="carma-delete-planar-group-btn"
        />
      </div>
    </div>
  ),
  content: getPlanarMetricContent(input),
  collapsible: input.kind === ANNOTATION_TYPE_POLYLINE,
  instructionText: null,
});
