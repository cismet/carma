import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { Tooltip } from "antd";
import {
  faArrowsDownToLine,
  faDownload,
  faEye,
  faEyeSlash,
  faLock,
  faLockOpen,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import Icon from "react-cismap/commons/Icon";
import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  formatMeasurementShortLabelToken,
  formatNumber,
  getCustomPointAnnotationName,
  type PointAnnotationEntry,
  type AnnotationShortLabelKind,
} from "@carma-mapping/annotations/core";
import { formatCoordinateWithHemisphere } from "../AnnotationInfoBox.formatters";
import {
  AnnotationInfoBoxActionIcon,
  AnnotationInfoTitleInput,
} from "../components";
import { annotationTooltipProps } from "../../shared/annotationTooltip";
import type {
  AnnotationDisplayPoint,
  AnnotationInfoBoxEntryPayload,
  AnnotationSlotActions,
  DistanceTableRow,
} from "../annotationInfoBoxSlots.types";

export const POINT_TITLE = "Punktmessung";
export const DISTANCE_TITLE = "Distanzmessung";
export const LABEL_TITLE = "Beschriftung";
export const INFO_BOX_BODY_TEXT_CLASSNAME =
  "text-[12px] leading-normal text-[#212529]";
export const INFO_BOX_MUTED_BODY_TEXT_CLASSNAME =
  "text-[12px] leading-normal text-gray-500";
export const INFO_BOX_ACTION_ICON_CLASSNAME =
  "cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]";

export const POINT_MODE_INSTRUCTION =
  "Auf das Modell klicken, um eine Punktmessung zu setzen.";
const DISTANCE_FIRST_POINT_INSTRUCTION =
  "Klick auf das Modell, um den ersten Punkt der Distanzmessung zu setzen.";
const DISTANCE_SECOND_POINT_INSTRUCTION =
  "Klick auf das Modell, um den zweiten Punkt der Distanzmessung zu setzen.";

export const getDistanceInstructionText = (
  hasCandidateAnchor: boolean
): string =>
  hasCandidateAnchor
    ? DISTANCE_SECOND_POINT_INSTRUCTION
    : DISTANCE_FIRST_POINT_INSTRUCTION;

export const buildInfoBoxDefaultMeasurementName = ({
  annotationTypeTitle,
  shortLabelToken,
}: {
  annotationTypeTitle: string;
  shortLabelToken: string | null;
}): string => {
  const normalizedToken = shortLabelToken?.trim();
  return normalizedToken
    ? `${annotationTypeTitle} ${normalizedToken}`
    : annotationTypeTitle;
};

export const getDefaultShortLabelToken = (
  kind:
    | typeof ANNOTATION_TYPE_POINT
    | typeof ANNOTATION_TYPE_DISTANCE
    | typeof ANNOTATION_TYPE_LABEL,
  counter: number
): string => formatMeasurementShortLabelToken(kind, counter);

export const getInfoBoxPointDefaultName = ({
  currentOrder,
  nextOrder,
}: {
  currentOrder: number | null;
  nextOrder: number;
}): string =>
  buildInfoBoxDefaultMeasurementName({
    annotationTypeTitle: POINT_TITLE,
    shortLabelToken: getDefaultShortLabelToken(
      ANNOTATION_TYPE_POINT,
      currentOrder ?? nextOrder
    ),
  });

export const getInfoBoxDistanceDefaultName = ({
  currentOrderToken,
  currentOrder,
  nextOrder,
}: {
  currentOrderToken: string | null;
  currentOrder: number | null;
  nextOrder: number;
}): string =>
  buildInfoBoxDefaultMeasurementName({
    annotationTypeTitle: DISTANCE_TITLE,
    shortLabelToken:
      currentOrderToken?.trim() ||
      getDefaultShortLabelToken(
        ANNOTATION_TYPE_DISTANCE,
        currentOrder ?? nextOrder
      ),
  });

export const getInfoBoxLabelDefaultName = (order: number): string =>
  buildInfoBoxDefaultMeasurementName({
    annotationTypeTitle: LABEL_TITLE,
    shortLabelToken: getDefaultShortLabelToken(ANNOTATION_TYPE_LABEL, order),
  });

export const getInfoBoxNodeChainDefaultName = ({
  annotationTypeTitle,
  kind,
  counter,
  shortLabelToken,
}: {
  annotationTypeTitle: string;
  kind: AnnotationShortLabelKind;
  counter: number;
  shortLabelToken?: string | null;
}): string =>
  buildInfoBoxDefaultMeasurementName({
    annotationTypeTitle,
    shortLabelToken:
      shortLabelToken?.trim() ||
      formatMeasurementShortLabelToken(kind, counter),
  });

const formatDisplayHeight = (displayPoint: AnnotationDisplayPoint): string => {
  const hasOffset =
    Number.isFinite(displayPoint.anchorHeight) &&
    Number.isFinite(displayPoint.verticalOffset) &&
    Math.abs(displayPoint.verticalOffset ?? 0) > 1e-9;

  if (!hasOffset) {
    return `${formatNumber(displayPoint.height)} m`;
  }

  const sign = (displayPoint.verticalOffset ?? 0) >= 0 ? "+" : "-";
  return `${formatNumber(
    displayPoint.anchorHeight ?? 0
  )} ${sign} ${formatNumber(Math.abs(displayPoint.verticalOffset ?? 0))}m`;
};

const renderAnnotationActions = (
  measurement: PointAnnotationEntry,
  isReference: boolean,
  actions: AnnotationSlotActions
): ReactNode => (
  <div className="flex justify-end items-center shrink-0 mt-0 gap-2">
    <Tooltip {...annotationTooltipProps} title="Zur Messung fliegen">
      <Icon
        name="search-location"
        onClick={(event: ReactMouseEvent<HTMLElement, MouseEvent>) => {
          event.stopPropagation();
          actions.flyToById(measurement.id);
        }}
        className={INFO_BOX_ACTION_ICON_CLASSNAME}
        data-test-id="carma-flyto-measurement-btn"
      />
    </Tooltip>
    <AnnotationInfoBoxActionIcon
      title="Als GeoJSON exportieren"
      icon={faDownload}
      onClick={(event) => {
        event.stopPropagation();
        actions.exportGeoJsonById(measurement.id);
      }}
      dataTestId="carma-export-measurement-geojson-btn"
    />
    <AnnotationInfoBoxActionIcon
      title={measurement.hidden ? "Einblenden" : "Ausblenden"}
      icon={measurement.hidden ? faEyeSlash : faEye}
      onClick={(event) => {
        event.stopPropagation();
        actions.toggleVisibilityByIds([measurement.id]);
      }}
      dataTestId="carma-toggle-measurement-visibility-btn"
      fixedWidth={true}
    />
    {!isReference && (
      <AnnotationInfoBoxActionIcon
        title="Als Referenzhöhe setzen"
        icon={faArrowsDownToLine}
        onClick={(event) => {
          event.stopPropagation();
          actions.setReferencePointId(measurement.id);
        }}
        dataTestId="carma-set-reference-btn"
      />
    )}
    <AnnotationInfoBoxActionIcon
      title={measurement.locked ? "Entsperren" : "Sperren"}
      icon={measurement.locked ? faLock : faLockOpen}
      onClick={(event) => {
        event.stopPropagation();
        actions.toggleLockByIds([measurement.id]);
      }}
      dataTestId="carma-toggle-measurement-lock-btn"
      fixedWidth={true}
    />
    <AnnotationInfoBoxActionIcon
      title={
        measurement.locked
          ? "Gesperrte Messung kann nicht gelöscht werden"
          : "Löschen"
      }
      icon={faTrashCan}
      onClick={(event) => {
        event.stopPropagation();
        actions.removeByIds([measurement.id]);
      }}
      dataTestId="carma-delete-measurement-btn"
      disabled={measurement.locked}
    />
  </div>
);

type EditableSubtitleParams = {
  defaultDisplayName: string;
  measurement: PointAnnotationEntry | null;
  displayPoint: AnnotationDisplayPoint | null;
  subtitleMetaText?: string | null;
  isReference: boolean;
  actions: AnnotationSlotActions;
  autoFocusTrigger?: number | string;
  onTitleCommit?: (title: string) => void;
};

export const renderEditableAnnotationSubtitle = ({
  defaultDisplayName,
  measurement,
  displayPoint,
  subtitleMetaText,
  isReference,
  actions,
  autoFocusTrigger,
  onTitleCommit,
}: EditableSubtitleParams): ReactNode => (
  <div className="mt-1 mb-0 w-full px-2">
    <div className="flex justify-between items-start gap-2">
      <span
        className={`font-bold flex-1 min-w-0 ${isReference ? "italic" : ""}`}
      >
        <AnnotationInfoTitleInput
          key={measurement?.id ?? `${defaultDisplayName}-preview`}
          value={
            measurement
              ? getCustomPointAnnotationName(measurement.name) || ""
              : ""
          }
          placeholder={defaultDisplayName}
          editable={Boolean(measurement)}
          capitalize={false}
          multiline={true}
          autoFocusTrigger={autoFocusTrigger}
          onChange={(nextTitle) => {
            if (!measurement) return;
            actions.updateNameById(measurement.id, nextTitle);
          }}
          onCommit={(nextTitle) => {
            if (!measurement) return;
            actions.updateNameById(measurement.id, nextTitle);
            onTitleCommit?.(nextTitle);
          }}
        />
      </span>
      {measurement
        ? renderAnnotationActions(measurement, isReference, actions)
        : null}
    </div>
    {subtitleMetaText ? (
      <div className="w-full text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-2 whitespace-nowrap">
        {subtitleMetaText}
      </div>
    ) : displayPoint ? (
      <div className="w-full text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-2 whitespace-nowrap">
        {formatCoordinateWithHemisphere(displayPoint.latitude, true)}{" "}
        {formatCoordinateWithHemisphere(displayPoint.longitude, false)} • NHN{" "}
        {formatDisplayHeight(displayPoint)}
      </div>
    ) : null}
  </div>
);

export const renderRelativeElevationContent = (
  relativeElevation: number | null
): ReactNode => (
  <div className={`w-full px-2 pb-1 ${INFO_BOX_BODY_TEXT_CLASSNAME}`}>
    {relativeElevation !== null ? (
      <div>
        {formatNumber(relativeElevation)} m relative Höhe über Bezugspunkt
      </div>
    ) : (
      <div>Keine Referenzhöhe gesetzt.</div>
    )}
  </div>
);

export const renderDistanceTableContent = (
  rows: DistanceTableRow[],
  isCandidate: boolean,
  hasCandidateAnchor: boolean
): ReactNode => {
  if (isCandidate && !hasCandidateAnchor) {
    return null;
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="w-full px-2 pb-1">
      <table className={`w-full ${INFO_BOX_BODY_TEXT_CLASSNAME}`}>
        <thead>
          <tr className="text-left text-gray-500">
            <th className="font-normal pr-2">Punkt</th>
            <th className="font-normal text-right pr-2">Vertikal</th>
            <th className="font-normal text-right pr-2">Horizontal</th>
            <th className="font-normal text-right pr-2">Distanz</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              style={row.isImplicitReferenceRow ? { opacity: 0.8 } : undefined}
            >
              <td className="pr-2">{row.label}</td>
              <td className="text-right tabular-nums pr-2">
                {formatNumber(row.vertical)} m
              </td>
              <td className="text-right tabular-nums pr-2">
                {formatNumber(row.horizontalDistance)} m
              </td>
              <td className="text-right tabular-nums pr-2">
                {formatNumber(row.distance)} m
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const getNodeChainCollections = ({
  polylineAnnotations,
  groundPolygons,
  planarPolygons,
  verticalPolygons,
}: Pick<
  AnnotationInfoBoxEntryPayload,
  | "polylineAnnotations"
  | "groundPolygons"
  | "planarPolygons"
  | "verticalPolygons"
>) => [
  ...polylineAnnotations,
  ...groundPolygons,
  ...planarPolygons,
  ...verticalPolygons,
];

export const stopInputEventPropagation = (
  event: ReactMouseEvent<HTMLElement, MouseEvent>
) => {
  event.stopPropagation();
};
