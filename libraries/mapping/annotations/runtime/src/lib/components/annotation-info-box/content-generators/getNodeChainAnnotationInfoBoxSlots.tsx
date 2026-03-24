import { type MouseEvent as ReactMouseEvent } from "react";
import { Switch, Tooltip } from "antd";
import {
  faDownload,
  faEye,
  faEyeSlash,
  faLock,
  faLockOpen,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import Icon from "react-cismap/commons/Icon";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  formatAreaAdaptive,
  formatNumber,
  type DerivedPolylinePath,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import { formatBearingToGermanSectorLabel } from "../AnnotationInfoBox.formatters";
import {
  AnnotationInfoBoxActionIcon,
  AnnotationInfoTitleInput,
} from "../components";
import { annotationTooltipProps } from "../../shared/annotationTooltip";
import {
  getInfoBoxNodeChainDefaultName,
  INFO_BOX_ACTION_ICON_CLASSNAME,
  INFO_BOX_BODY_TEXT_CLASSNAME,
  stopInputEventPropagation,
} from "./shared";
import type {
  AnnotationInfoBoxEntryPayload,
  AnnotationSlots,
  PolylineSummary,
} from "../annotationInfoBoxSlots.types";

const NODE_CHAIN_TYPE_TITLE_BY_KIND: Record<
  NodeChainAnnotation["type"],
  string
> = {
  [ANNOTATION_TYPE_POLYLINE]: "Polygonzug",
  [ANNOTATION_TYPE_DISTANCE]: "Distanzmessung",
  [ANNOTATION_TYPE_AREA_GROUND]: "Grundriss",
  [ANNOTATION_TYPE_AREA_PLANAR]: "Dach",
  [ANNOTATION_TYPE_AREA_VERTICAL]: "Fassade",
};

const getPolylineSummary = (
  polyline: DerivedPolylinePath | null
): PolylineSummary | null => {
  if (!polyline || polyline.segmentLengthsMeters.length === 0) {
    return null;
  }

  const segmentCount = polyline.segmentLengthsMeters.length;
  const meanSegmentLengthMeters = polyline.totalLengthMeters / segmentCount;
  const heights = polyline.nodeHeightsMeters;

  let ascentMeters = 0;
  let descentMeters = 0;
  for (let index = 1; index < heights.length; index += 1) {
    const delta = heights[index] - heights[index - 1];
    if (!Number.isFinite(delta) || Math.abs(delta) <= 1e-9) continue;
    if (delta > 0) {
      ascentMeters += delta;
    } else {
      descentMeters += Math.abs(delta);
    }
  }

  return {
    segmentCount,
    meanSegmentLengthMeters,
    totalAbsoluteElevationChangeMeters: ascentMeters + descentMeters,
    startEndElevationDeltaMeters:
      heights.length >= 2 ? heights[heights.length - 1] - heights[0] : 0,
    ascentMeters,
    descentMeters,
  };
};

const getNodeChainMetricContent = (input: AnnotationInfoBoxEntryPayload) => {
  const annotation =
    input.nodeChainAnnotation && input.kind === input.nodeChainAnnotation.type
      ? input.nodeChainAnnotation
      : null;
  if (!annotation) {
    return null;
  }

  const totalLengthMeters =
    annotation.perimeterMeters ?? input.polylinePath?.totalLengthMeters ?? 0;
  const segmentLineMode =
    annotation.type === ANNOTATION_TYPE_POLYLINE
      ? annotation.segmentLineMode ??
        input.fallbackPolylineSegmentLineMode ??
        LINEAR_SEGMENT_LINE_MODE_COMPONENTS
      : null;
  const polylineSummary = getPolylineSummary(input.polylinePath);
  const cardinalHeading = formatBearingToGermanSectorLabel(
    annotation.bearingDeg,
    {
      useFullLabel: true,
      includeDegree: true,
      fractionDigits: 2,
      mainCardinalRangeDeg: 60,
      flipBy180Deg: true,
    }
  );
  if (annotation.type === ANNOTATION_TYPE_POLYLINE) {
    const isComponentsMode =
      (segmentLineMode ?? LINEAR_SEGMENT_LINE_MODE_COMPONENTS) ===
      LINEAR_SEGMENT_LINE_MODE_COMPONENTS;
    return (
      <div className={`w-full px-2 pb-1 ${INFO_BOX_BODY_TEXT_CLASSNAME}`}>
        <div className="mb-1">
          Gesamtlänge: {formatNumber(totalLengthMeters)} m
        </div>
        <div
          className="mb-1 flex items-center gap-2"
          onClick={stopInputEventPropagation}
          onMouseDown={stopInputEventPropagation}
        >
          <span className="text-gray-500">Segmentdarstellung:</span>
          <span className="text-gray-500">Direkt</span>
          <Switch
            size="small"
            checked={isComponentsMode}
            onChange={(checked) =>
              input.actions.updateVisualizerOptionsById(annotation.id, {
                segmentLineMode: checked
                  ? LINEAR_SEGMENT_LINE_MODE_COMPONENTS
                  : LINEAR_SEGMENT_LINE_MODE_DIRECT,
              })
            }
            aria-label="Polygonzug-Segmentdarstellung umschalten"
            data-test-id="infobox-polyline-line-mode-toggle"
          />
          <span className="text-gray-500">Komponenten</span>
        </div>
        {polylineSummary ? (
          <>
            <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-gray-500">Aufstieg:</span>
              <span className="tabular-nums">
                {formatNumber(polylineSummary.ascentMeters)} m
              </span>
              <span className="text-gray-500">Abstieg:</span>
              <span className="tabular-nums">
                {formatNumber(polylineSummary.descentMeters)} m
              </span>
              <span className="text-gray-500">Summe:</span>
              <span className="tabular-nums">
                {formatNumber(
                  polylineSummary.totalAbsoluteElevationChangeMeters
                )}{" "}
                m
              </span>
            </div>
            <div className="mb-1">
              <span className="text-gray-500 mr-1">Δ Start/Ende:</span>
              <span className="tabular-nums">
                {formatNumber(polylineSummary.startEndElevationDeltaMeters)} m
              </span>
            </div>
            <div className="mb-1">
              <span className="text-gray-500 mr-1">Ø Segmentlänge:</span>
              <span className="tabular-nums">
                {formatNumber(polylineSummary.meanSegmentLengthMeters)} m
              </span>
            </div>
            <div>
              <span className="text-gray-500 mr-1">Segmente:</span>
              <span className="tabular-nums">
                {polylineSummary.segmentCount}
              </span>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  const areaLabel =
    annotation.type === ANNOTATION_TYPE_AREA_PLANAR
      ? "Dachfläche"
      : annotation.type === ANNOTATION_TYPE_AREA_VERTICAL
      ? "Fassadenfläche"
      : "Fläche";

  return (
    <div className={`w-full px-2 pb-1 ${INFO_BOX_BODY_TEXT_CLASSNAME}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span>
          {areaLabel}:{" "}
          <span className="tabular-nums">
            {formatAreaAdaptive(Math.max(0, annotation.areaSquareMeters ?? 0))}
          </span>
        </span>
        <span>
          Umfang:{" "}
          <span className="tabular-nums">
            {formatNumber(totalLengthMeters)} m
          </span>
        </span>
      </div>
      {(annotation.type === ANNOTATION_TYPE_AREA_PLANAR ||
        annotation.type === ANNOTATION_TYPE_AREA_VERTICAL) &&
      cardinalHeading ? (
        <div>Himmelsrichtung: {cardinalHeading}</div>
      ) : null}
      {annotation.type === ANNOTATION_TYPE_AREA_PLANAR &&
      Number.isFinite(annotation.verticalityDeg) ? (
        <div>Vertikalität: {formatNumber(annotation.verticalityDeg ?? 0)}°</div>
      ) : null}
    </div>
  );
};

const stopHeadingActionPropagation = (
  event:
    | ReactMouseEvent<HTMLElement, MouseEvent>
    | ReactMouseEvent<SVGSVGElement, MouseEvent>
) => {
  event.stopPropagation();
};

const renderNodeChainHeadingActions = (
  input: AnnotationInfoBoxEntryPayload
) => {
  const annotationLockedById = new Map(
    input.annotations.map((entry) => [entry.id, Boolean(entry.locked)] as const)
  );
  const isLocked =
    Boolean(input.nodeChainAnnotation) &&
    input.nodeChainAnnotation.nodeIds.length > 0 &&
    input.nodeChainAnnotation.nodeIds.every((nodeId) =>
      Boolean(annotationLockedById.get(nodeId))
    );

  return (
    <div
      className="flex items-center gap-2"
      onMouseDown={stopInputEventPropagation}
      onClick={stopInputEventPropagation}
    >
      <Tooltip {...annotationTooltipProps} title="Zur Messung fliegen">
        <Icon
          name="search-location"
          onClick={(event: ReactMouseEvent<HTMLElement, MouseEvent>) => {
            stopHeadingActionPropagation(event);
            if (!input.nodeChainAnnotation) return;
            input.actions.flyToById(input.nodeChainAnnotation.id);
          }}
          className={INFO_BOX_ACTION_ICON_CLASSNAME}
          data-test-id="carma-flyto-node-chain-annotation-btn"
        />
      </Tooltip>
      <AnnotationInfoBoxActionIcon
        title="Als GeoJSON exportieren"
        icon={faDownload}
        onClick={(event) => {
          stopHeadingActionPropagation(event);
          if (!input.nodeChainAnnotation) return;
          input.actions.exportGeoJsonById(input.nodeChainAnnotation.id);
        }}
        dataTestId="carma-export-node-chain-annotation-geojson-btn"
      />
      <AnnotationInfoBoxActionIcon
        title={input.nodeChainAnnotation?.hidden ? "Einblenden" : "Ausblenden"}
        icon={input.nodeChainAnnotation?.hidden ? faEyeSlash : faEye}
        onClick={(event) => {
          stopHeadingActionPropagation(event);
          if (!input.nodeChainAnnotation) return;
          input.actions.toggleVisibilityByIds([input.nodeChainAnnotation.id]);
        }}
        dataTestId="carma-toggle-node-chain-annotation-visibility-btn"
        fixedWidth={true}
      />
      <AnnotationInfoBoxActionIcon
        title={isLocked ? "Entsperren" : "Sperren"}
        icon={isLocked ? faLock : faLockOpen}
        onClick={(event) => {
          stopHeadingActionPropagation(event);
          if (!input.nodeChainAnnotation) return;
          input.actions.toggleLockByIds([input.nodeChainAnnotation.id]);
        }}
        dataTestId="carma-toggle-node-chain-annotation-lock-btn"
        fixedWidth={true}
      />
      <AnnotationInfoBoxActionIcon
        title={
          isLocked ? "Gesperrte Messung kann nicht gelöscht werden" : "Löschen"
        }
        icon={faTrashCan}
        onClick={(event) => {
          stopHeadingActionPropagation(event);
          if (!input.nodeChainAnnotation) return;
          input.actions.removeByIds([input.nodeChainAnnotation.id]);
        }}
        dataTestId="carma-delete-node-chain-annotation-btn"
        disabled={isLocked}
      />
    </div>
  );
};

export const getNodeChainAnnotationInfoBoxSlots = (
  input: AnnotationInfoBoxEntryPayload
): AnnotationSlots => {
  const sameKindGroups =
    input.kind === ANNOTATION_TYPE_POLYLINE
      ? input.polylineAnnotations
      : input.kind === ANNOTATION_TYPE_AREA_GROUND
      ? input.groundPolygons
      : input.kind === ANNOTATION_TYPE_AREA_PLANAR
      ? input.planarPolygons
      : input.kind === ANNOTATION_TYPE_AREA_VERTICAL
      ? input.verticalPolygons
      : [];
  const order = input.nodeChainAnnotation
    ? Math.max(
        0,
        sameKindGroups.findIndex(
          (group) => group.id === input.nodeChainAnnotation?.id
        )
      ) + 1
    : sameKindGroups.length + 1;
  const annotationTypeTitle =
    input.kind === ANNOTATION_TYPE_POLYLINE ||
    input.kind === ANNOTATION_TYPE_AREA_GROUND ||
    input.kind === ANNOTATION_TYPE_AREA_PLANAR ||
    input.kind === ANNOTATION_TYPE_AREA_VERTICAL
      ? NODE_CHAIN_TYPE_TITLE_BY_KIND[input.kind]
      : "Messung";
  const nodeChainKind =
    input.nodeChainAnnotation?.type ?? ANNOTATION_TYPE_POLYLINE;
  const nodeChainShortLabelToken = input.nodeChainAnnotation
    ? input.nodeChainAnnotation.nodeIds
        .map((pointId) =>
          input.pointMarkerBadgeByPointId[pointId]?.text?.trim()
        )
        .find((token) => Boolean(token)) ?? null
    : null;

  return {
    headingTitle: annotationTypeTitle,
    subtitle: (
      <div className="mt-1 mb-0 w-full px-2">
        <div className="flex justify-between items-start gap-2">
          <span className="font-bold flex-1 min-w-0">
            <AnnotationInfoTitleInput
              key={input.annotationId ?? `${input.kind}-preview`}
              value={input.nodeChainAnnotation?.name ?? ""}
              placeholder={getInfoBoxNodeChainDefaultName({
                annotationTypeTitle,
                kind: nodeChainKind,
                counter: order,
                shortLabelToken: nodeChainShortLabelToken,
              })}
              editable={Boolean(input.nodeChainAnnotation)}
              capitalize={false}
              multiline={true}
              onChange={(nextTitle) => {
                if (!input.nodeChainAnnotation) return;
                input.actions.updateNameById(
                  input.nodeChainAnnotation.id,
                  nextTitle
                );
              }}
              onCommit={(nextTitle) => {
                if (!input.nodeChainAnnotation) return;
                input.actions.updateNameById(
                  input.nodeChainAnnotation.id,
                  nextTitle
                );
              }}
            />
          </span>
          {input.nodeChainAnnotation
            ? renderNodeChainHeadingActions(input)
            : null}
        </div>
      </div>
    ),
    content: getNodeChainMetricContent(input),
    collapsible: input.kind === ANNOTATION_TYPE_POLYLINE,
    instructionText: null,
  };
};
