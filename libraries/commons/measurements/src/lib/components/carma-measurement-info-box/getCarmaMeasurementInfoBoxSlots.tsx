import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import type { Cartesian3 } from "@carma/cesium";
import {
  formatNumber,
  getCustomPointMeasurementName,
  type MeasurementEntry,
  type PointMeasurementEntry,
} from "@carma-mapping/engines/cesium/measurements";
import { Tooltip } from "antd";
import {
  faArrowsDownToLine,
  faEye,
  faEyeSlash,
  faLock,
  faLockOpen,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import Icon from "react-cismap/commons/Icon";

import { toAlphabeticSequence } from "../../utils/measurementTokens";
import MeasurementTitle from "../MeasurementTitle";
import { formatCoordinateWithHemisphere } from "../infobox/InfoBoxMeasurement3D.formatters";
import { InfoBoxMeasurement3DActionIcon } from "../infobox/InfoBoxMeasurement3DActionIcon";
import { CarmaMeasurementInfoBoxNotImplemented } from "./CarmaMeasurementInfoBoxNotImplemented";

export type MeasurementSlotKind = "point" | "distance" | "unsupported";

export type MeasurementDisplayPoint = {
  latitude: number;
  longitude: number;
  height: number;
};

export type DistanceTableRow = {
  id: string;
  relationId?: string;
  label: string;
  vertical: number;
  horizontalDistance: number;
  distance: number;
  isImplicitReferenceRow?: boolean;
};

export type MeasurementSlotActions = {
  updateMeasurementNameById: (id: string, name: string) => void;
  updateMeasurementById: (id: string, patch: Partial<MeasurementEntry>) => void;
  deleteMeasurementById: (id: string) => void;
  toggleMeasurementLockById: (id: string) => void;
  flyToMeasurementById: (id: string) => void;
  setReferencePoint: (nextReference: Cartesian3 | null) => void;
};

type BaseMeasurementSlotsInput = {
  measurement: PointMeasurementEntry | null;
  displayPoint: MeasurementDisplayPoint | null;
  relativeElevation: number | null;
  isReference: boolean;
  actions: MeasurementSlotActions;
};

export type PointMeasurementSlotsInput = BaseMeasurementSlotsInput & {
  kind: "point";
  currentOrder: number | null;
  nextOrder: number;
  isLivePreview: boolean;
};

export type DistanceMeasurementSlotsInput = BaseMeasurementSlotsInput & {
  kind: "distance";
  currentOrder: number | null;
  currentOrderToken: string | null;
  nextOrder: number;
  isLivePreview: boolean;
  hasPreviewAnchor: boolean;
  subtitleDirectDistanceMeters: number | null;
  distanceTableRows: DistanceTableRow[];
};

export type UnsupportedMeasurementSlotsInput = {
  kind: "unsupported";
  unsupportedKind?: string;
};

export type MeasurementSlotsInput =
  | PointMeasurementSlotsInput
  | DistanceMeasurementSlotsInput
  | UnsupportedMeasurementSlotsInput;

export type MeasurementSlots = {
  headingTitle: string;
  subtitle: ReactNode;
  content: ReactNode;
  collapsible: boolean;
  instructionText: string | null;
};

const POINT_TITLE = "Punktmessung";
const DISTANCE_TITLE = "Distanzmessung";
const POINT_MODE_INSTRUCTION = "Klick auf das Modell, um den Punkt zu setzen.";
const DISTANCE_FIRST_POINT_INSTRUCTION =
  "Klick auf das Modell, um den ersten Punkt der Distanzmessung zu setzen.";
const DISTANCE_SECOND_POINT_INSTRUCTION =
  "Klick auf das Modell, um den zweiten Punkt der Distanzmessung zu setzen.";

const getDistanceInstructionText = (hasPreviewAnchor: boolean): string =>
  hasPreviewAnchor
    ? DISTANCE_SECOND_POINT_INSTRUCTION
    : DISTANCE_FIRST_POINT_INSTRUCTION;

const getPointTitleToken = (input: PointMeasurementSlotsInput): string =>
  `${input.currentOrder ?? input.nextOrder}`;

const getDistanceTitleToken = (input: DistanceMeasurementSlotsInput): string =>
  input.currentOrderToken && input.currentOrderToken.trim().length > 0
    ? input.currentOrderToken.trim()
    : toAlphabeticSequence((input.currentOrder ?? input.nextOrder) - 1);

const renderMeasurementActions = (
  measurement: PointMeasurementEntry,
  isReference: boolean,
  actions: MeasurementSlotActions
): ReactNode => (
  <div className="flex justify-end items-center shrink-0 mt-0 gap-2">
    <Tooltip title="Zur Messung fliegen">
      <Icon
        name="search-location"
        onClick={(event: ReactMouseEvent<HTMLElement, MouseEvent>) => {
          event.stopPropagation();
          actions.flyToMeasurementById(measurement.id);
        }}
        className="cursor-pointer text-[16px] text-[#808080] hover:text-[#a0a0a0]"
        data-test-id="carma-flyto-measurement-btn"
      />
    </Tooltip>
    <InfoBoxMeasurement3DActionIcon
      title={measurement.hidden ? "Einblenden" : "Ausblenden"}
      icon={measurement.hidden ? faEyeSlash : faEye}
      onClick={(event) => {
        event.stopPropagation();
        actions.updateMeasurementById(measurement.id, {
          hidden: !measurement.hidden,
        });
      }}
      dataTestId="carma-toggle-measurement-visibility-btn"
    />
    <InfoBoxMeasurement3DActionIcon
      title={measurement.locked ? "Entsperren" : "Sperren"}
      icon={measurement.locked ? faLock : faLockOpen}
      onClick={(event) => {
        event.stopPropagation();
        actions.toggleMeasurementLockById(measurement.id);
      }}
      dataTestId="carma-toggle-measurement-lock-btn"
    />
    {!isReference && (
      <InfoBoxMeasurement3DActionIcon
        title="Als Referenzhöhe setzen"
        icon={faArrowsDownToLine}
        onClick={(event) => {
          event.stopPropagation();
          actions.setReferencePoint(measurement.geometryECEF);
        }}
        dataTestId="carma-set-reference-btn"
      />
    )}
    <InfoBoxMeasurement3DActionIcon
      title="Löschen"
      icon={faTrashCan}
      onClick={(event) => {
        event.stopPropagation();
        actions.deleteMeasurementById(measurement.id);
      }}
      dataTestId="carma-delete-measurement-btn"
    />
  </div>
);

type EditableSubtitleParams = {
  measurementTypeTitle: string;
  titleToken: string;
  measurement: PointMeasurementEntry | null;
  displayPoint: MeasurementDisplayPoint | null;
  subtitleMetaText?: string | null;
  isReference: boolean;
  previewOrder: number;
  actions: MeasurementSlotActions;
};

const renderEditableMeasurementSubtitle = ({
  measurementTypeTitle,
  titleToken,
  measurement,
  displayPoint,
  subtitleMetaText,
  isReference,
  previewOrder,
  actions,
}: EditableSubtitleParams): ReactNode => (
  <div className="mt-1 mb-0 w-full px-2">
    <div className="flex justify-between items-start gap-2">
      <span
        className={`font-bold flex-1 min-w-0 ${isReference ? "italic" : ""}`}
      >
        <MeasurementTitle
          key={measurement?.id ?? `${measurementTypeTitle}-preview`}
          order={previewOrder}
          title={
            measurement
              ? getCustomPointMeasurementName(measurement.name) || ""
              : ""
          }
          shapeId={measurement?.id ?? `${measurementTypeTitle}-preview`}
          setUpdateMeasurementStatus={() => {}}
          updateTitleMeasurementById={(shapeId, title) =>
            actions.updateMeasurementNameById(String(shapeId), title)
          }
          isCollapsed={false}
          placeholderText={`${measurementTypeTitle} #${titleToken}`}
          clearPlaceholderOnFocus
          showOrder={false}
          editable={Boolean(measurement)}
          capitalize={false}
          multiline={true}
        />
      </span>
      {measurement
        ? renderMeasurementActions(measurement, isReference, actions)
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
        {formatNumber(displayPoint.height)} m
      </div>
    ) : null}
  </div>
);

const renderRelativeElevationContent = (
  relativeElevation: number | null
): ReactNode => (
  <div className="w-full px-2 pb-1 text-[#212529] text-[11px] leading-normal">
    {relativeElevation !== null ? (
      <div>
        {formatNumber(relativeElevation)} m relative Höhe über Bezugspunkt
      </div>
    ) : (
      <div>Keine Referenzhöhe gesetzt.</div>
    )}
  </div>
);

const renderDistanceTableContent = (
  rows: DistanceTableRow[],
  isLivePreview: boolean,
  hasPreviewAnchor: boolean
): ReactNode => {
  if (isLivePreview && !hasPreviewAnchor) {
    return null;
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="w-full px-2 pb-1">
      <table className="w-full text-[10px] leading-tight">
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

const getSlotsFromPointMeasure = (
  input: PointMeasurementSlotsInput
): MeasurementSlots => ({
  headingTitle:
    input.measurement || !input.isLivePreview
      ? POINT_TITLE
      : `${POINT_TITLE} (Neu)`,
  subtitle: renderEditableMeasurementSubtitle({
    measurementTypeTitle: POINT_TITLE,
    titleToken: getPointTitleToken(input),
    measurement: input.measurement,
    displayPoint: input.displayPoint,
    isReference: input.isReference,
    previewOrder: input.currentOrder ?? input.nextOrder,
    actions: input.actions,
  }),
  content: renderRelativeElevationContent(input.relativeElevation),
  collapsible: Boolean(input.measurement || input.isLivePreview),
  instructionText: input.isLivePreview ? POINT_MODE_INSTRUCTION : null,
});

const getSlotsFromDistanceMeasure = (
  input: DistanceMeasurementSlotsInput
): MeasurementSlots => ({
  headingTitle:
    input.measurement || !input.isLivePreview
      ? DISTANCE_TITLE
      : `${DISTANCE_TITLE} (Neu)`,
  subtitle: renderEditableMeasurementSubtitle({
    measurementTypeTitle: DISTANCE_TITLE,
    titleToken: getDistanceTitleToken(input),
    measurement: input.measurement,
    displayPoint: input.displayPoint,
    subtitleMetaText:
      input.subtitleDirectDistanceMeters !== null
        ? `${formatNumber(input.subtitleDirectDistanceMeters)} m`
        : null,
    isReference: input.isReference,
    previewOrder: input.currentOrder ?? input.nextOrder,
    actions: input.actions,
  }),
  content: renderDistanceTableContent(
    input.distanceTableRows,
    input.isLivePreview,
    input.hasPreviewAnchor
  ),
  collapsible: Boolean(input.measurement || input.isLivePreview),
  instructionText: input.isLivePreview
    ? getDistanceInstructionText(input.hasPreviewAnchor)
    : null,
});

const getSlotsFromUnsupportedMeasurement = (
  input: UnsupportedMeasurementSlotsInput
): MeasurementSlots => ({
  headingTitle: "Messung",
  subtitle: null,
  content: (
    <CarmaMeasurementInfoBoxNotImplemented
      kind={input.unsupportedKind ?? "unsupported"}
    />
  ),
  collapsible: false,
  instructionText: null,
});

export const getMeasurementInfoBoxSlots = (
  input: MeasurementSlotsInput
): MeasurementSlots => {
  switch (input.kind) {
    case "point":
      return getSlotsFromPointMeasure(input);
    case "distance":
      return getSlotsFromDistanceMeasure(input);
    default:
      return getSlotsFromUnsupportedMeasurement(input);
  }
};
