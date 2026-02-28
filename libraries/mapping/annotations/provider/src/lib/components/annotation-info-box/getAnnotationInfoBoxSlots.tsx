import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import type { Cartesian3 } from "@carma/cesium";
import {
  formatAreaAdaptive,
  formatNumber,
  getCustomPointAnnotationName,
  type AnnotationEntry,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/cesium";
import { Tooltip } from "antd";
import {
  faArrowsDownToLine,
  faEye,
  faEyeSlash,
  faLock,
  faLockOpen,
  faMinus,
  faPlus,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Icon from "react-cismap/commons/Icon";
import {
  SPATIAL_MARKUP_KIND_AREA,
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_LABEL,
  SPATIAL_MARKUP_KIND_PLANAR,
  SPATIAL_MARKUP_KIND_POINT,
  SPATIAL_MARKUP_KIND_POLYLINE,
  SPATIAL_MARKUP_KIND_VERTICAL,
  toAlphabeticSequence,
} from "@carma-mapping/annotations/core";
import {
  formatBearingToGermanCardinal,
  formatCoordinateWithHemisphere,
} from "./AnnotationInfoBox.formatters";
import { AnnotationInfoBoxActionIcon } from "./AnnotationInfoBoxActionIcon";
import { AnnotationInfoBoxNotImplemented } from "./AnnotationInfoBoxNotImplemented";
import { AnnotationInfoTitleInput } from "./AnnotationInfoTitleInput";

type SupportedAnnotationSlotKind =
  | typeof SPATIAL_MARKUP_KIND_POINT
  | typeof SPATIAL_MARKUP_KIND_DISTANCE
  | typeof SPATIAL_MARKUP_KIND_LABEL
  | typeof SPATIAL_MARKUP_KIND_POLYLINE
  | typeof SPATIAL_MARKUP_KIND_AREA
  | typeof SPATIAL_MARKUP_KIND_PLANAR
  | typeof SPATIAL_MARKUP_KIND_VERTICAL;

export type AnnotationSlotKind = SupportedAnnotationSlotKind | "unsupported";

export type AnnotationDisplayPoint = {
  latitude: number;
  longitude: number;
  height: number;
  anchorHeight?: number;
  verticalOffset?: number;
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

export type AnnotationSlotActions = {
  updateMeasurementNameById: (id: string, name: string) => void;
  updateMeasurementById: (id: string, patch: Partial<AnnotationEntry>) => void;
  deleteMeasurementById: (id: string) => void;
  toggleMeasurementLockById: (id: string) => void;
  flyToMeasurementById: (id: string) => void;
  setReferencePoint: (nextReference: Cartesian3 | null) => void;
  confirmPointLabelInputById: (id: string) => void;
  updatePointLabelAppearanceById: (
    id: string,
    appearance: AnnotationEntry["labelAppearance"] | undefined
  ) => void;
  updatePlanarPolygonNameById: (id: string, name: string) => void;
  deletePlanarPolygonGroupById: (id: string) => void;
};

type BaseAnnotationSlotsInput = {
  measurement: PointAnnotationEntry | null;
  displayPoint: AnnotationDisplayPoint | null;
  relativeElevation: number | null;
  isReference: boolean;
  actions: AnnotationSlotActions;
};

export type PointAnnotationSlotsInput = BaseAnnotationSlotsInput & {
  kind: typeof SPATIAL_MARKUP_KIND_POINT;
  currentOrder: number | null;
  nextOrder: number;
  isLivePreview: boolean;
};

export type DistanceAnnotationSlotsInput = BaseAnnotationSlotsInput & {
  kind: typeof SPATIAL_MARKUP_KIND_DISTANCE;
  currentOrder: number | null;
  currentOrderToken: string | null;
  nextOrder: number;
  isLivePreview: boolean;
  hasPreviewAnchor: boolean;
  subtitleDirectDistanceMeters: number | null;
  distanceTableRows: DistanceTableRow[];
};

export type LabelAnnotationSlotsInput = BaseAnnotationSlotsInput & {
  kind: typeof SPATIAL_MARKUP_KIND_LABEL;
  isLivePreview: boolean;
  autoFocusTitleTrigger?: number | string;
  pureLabelAppearance: {
    fontSizePx: number;
    backgroundColor: string;
    textColor: string;
  } | null;
  pureLabelDefaultFontSizePx: number;
  pureLabelMinFontSizePx: number;
  pureLabelMaxFontSizePx: number;
  pureLabelFontSizeStepPx: number;
  adjustCurrentPureLabelFontSize: (deltaPx: number) => void;
  handlePureLabelBackgroundColorChange: (colorHex: string) => void;
  handlePureLabelTextColorChange: (colorHex: string) => void;
};

export type PolygonPolylineAnnotationSlotsInput = {
  kind:
    | typeof SPATIAL_MARKUP_KIND_POLYLINE
    | typeof SPATIAL_MARKUP_KIND_AREA
    | typeof SPATIAL_MARKUP_KIND_PLANAR
    | typeof SPATIAL_MARKUP_KIND_VERTICAL;
  groupId: string;
  name?: string;
  order: number;
  totalLengthMeters: number;
  areaSquareMeters?: number;
  bearingDeg?: number;
  surfaceTypeLabel: string;
  actions: AnnotationSlotActions;
};

export type UnsupportedAnnotationSlotsInput = {
  kind: "unsupported";
  unsupportedKind?: string;
};

export type AnnotationSlotsInput =
  | PointAnnotationSlotsInput
  | DistanceAnnotationSlotsInput
  | LabelAnnotationSlotsInput
  | PolygonPolylineAnnotationSlotsInput
  | UnsupportedAnnotationSlotsInput;

export type AnnotationSlots = {
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
const LABEL_TITLE = "Beschriftung";
const LABEL_MODE_INSTRUCTION =
  "Klick auf das Modell, um eine Beschriftung zu platzieren.";
const PLANAR_TYPE_TITLE_BY_KIND: Record<
  PolygonPolylineAnnotationSlotsInput["kind"],
  string
> = {
  [SPATIAL_MARKUP_KIND_POLYLINE]: "Polygonzug",
  [SPATIAL_MARKUP_KIND_AREA]: "Grundriss",
  [SPATIAL_MARKUP_KIND_PLANAR]: "Dach",
  [SPATIAL_MARKUP_KIND_VERTICAL]: "Fassade",
};

const getDistanceInstructionText = (hasPreviewAnchor: boolean): string =>
  hasPreviewAnchor
    ? DISTANCE_SECOND_POINT_INSTRUCTION
    : DISTANCE_FIRST_POINT_INSTRUCTION;

const getPointTitleToken = (input: PointAnnotationSlotsInput): string =>
  `${input.currentOrder ?? input.nextOrder}`;

const getDistanceTitleToken = (input: DistanceAnnotationSlotsInput): string =>
  input.currentOrderToken && input.currentOrderToken.trim().length > 0
    ? input.currentOrderToken.trim()
    : toAlphabeticSequence((input.currentOrder ?? input.nextOrder) - 1);

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
    <AnnotationInfoBoxActionIcon
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
    <AnnotationInfoBoxActionIcon
      title={measurement.locked ? "Entsperren" : "Sperren"}
      icon={measurement.locked ? faLock : faLockOpen}
      onClick={(event) => {
        event.stopPropagation();
        actions.toggleMeasurementLockById(measurement.id);
      }}
      dataTestId="carma-toggle-measurement-lock-btn"
    />
    {!isReference && (
      <AnnotationInfoBoxActionIcon
        title="Als Referenzhöhe setzen"
        icon={faArrowsDownToLine}
        onClick={(event) => {
          event.stopPropagation();
          actions.setReferencePoint(measurement.geometryECEF);
        }}
        dataTestId="carma-set-reference-btn"
      />
    )}
    <AnnotationInfoBoxActionIcon
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
  annotationTypeTitle: string;
  titleToken: string;
  measurement: PointAnnotationEntry | null;
  displayPoint: AnnotationDisplayPoint | null;
  subtitleMetaText?: string | null;
  isReference: boolean;
  actions: AnnotationSlotActions;
  autoFocusTrigger?: number | string;
  onTitleCommit?: (title: string) => void;
};

const renderEditableAnnotationSubtitle = ({
  annotationTypeTitle,
  titleToken,
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
          key={measurement?.id ?? `${annotationTypeTitle}-preview`}
          value={
            measurement
              ? getCustomPointAnnotationName(measurement.name) || ""
              : ""
          }
          placeholder={`${annotationTypeTitle} #${titleToken}`}
          editable={Boolean(measurement)}
          capitalize={false}
          multiline={true}
          autoFocusTrigger={autoFocusTrigger}
          onChange={(nextTitle) => {
            if (!measurement) return;
            actions.updateMeasurementNameById(measurement.id, nextTitle);
          }}
          onCommit={(nextTitle) => {
            if (!measurement) return;
            actions.updateMeasurementNameById(measurement.id, nextTitle);
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

const stopInputEventPropagation = (
  event: ReactMouseEvent<HTMLElement, MouseEvent>
) => {
  event.stopPropagation();
};

const DEFAULT_LABEL_BACKGROUND_HEX = "#c8c8c8";
const DEFAULT_LABEL_TEXT_HEX = "#000000";

const toHexChannel = (value: number): string =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");

const normalizeColorToHex = (
  value: string | undefined,
  fallbackHex: string
): string => {
  const trimmed = value?.trim();
  if (!trimmed) return fallbackHex;

  const hexMatch = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
    }
    return `#${hex.toLowerCase()}`;
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?)\s*)?\)$/
  );
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `#${toHexChannel(Number(r))}${toHexChannel(Number(g))}${toHexChannel(
      Number(b)
    )}`;
  }

  return fallbackHex;
};

const renderPureLabelContent = (
  input: LabelAnnotationSlotsInput
): ReactNode => {
  if (input.isLivePreview) {
    return (
      <div className="text-[12px] mb-0">
        <div className="mt-1 text-sm pl-2 pr-1 text-gray-500">
          {LABEL_MODE_INSTRUCTION}
        </div>
      </div>
    );
  }

  return (
    <div className="text-[12px] mb-0">
      <div className="mt-1 text-sm pl-2 pr-1">
        <div
          className="mb-2 flex items-center gap-2"
          onClick={stopInputEventPropagation}
          onMouseDown={stopInputEventPropagation}
        >
          <span className="text-gray-500">Schriftgröße:</span>
          <button
            type="button"
            onClick={() =>
              input.adjustCurrentPureLabelFontSize(
                -input.pureLabelFontSizeStepPx
              )
            }
            className="h-5 w-5 inline-flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            disabled={
              !input.pureLabelAppearance ||
              input.pureLabelAppearance.fontSizePx <=
                input.pureLabelMinFontSizePx
            }
            aria-label="Schriftgröße verkleinern"
          >
            <FontAwesomeIcon icon={faMinus} />
          </button>
          <span className="tabular-nums min-w-[48px] text-center">
            {input.pureLabelAppearance?.fontSizePx ??
              input.pureLabelDefaultFontSizePx}
            px
          </span>
          <button
            type="button"
            onClick={() =>
              input.adjustCurrentPureLabelFontSize(
                input.pureLabelFontSizeStepPx
              )
            }
            className="h-5 w-5 inline-flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            disabled={
              !input.pureLabelAppearance ||
              input.pureLabelAppearance.fontSizePx >=
                input.pureLabelMaxFontSizePx
            }
            aria-label="Schriftgröße vergrößern"
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>
        <div
          className="mb-1 flex items-center gap-2"
          onClick={stopInputEventPropagation}
          onMouseDown={stopInputEventPropagation}
        >
          <span className="text-gray-500">Hintergrund:</span>
          <input
            type="color"
            aria-label="Hintergrundfarbe"
            value={normalizeColorToHex(
              input.pureLabelAppearance?.backgroundColor,
              DEFAULT_LABEL_BACKGROUND_HEX
            )}
            onChange={(event) =>
              input.handlePureLabelBackgroundColorChange(event.target.value)
            }
            className="h-6 w-8 rounded border border-gray-300 bg-transparent cursor-pointer p-0"
          />
          <span className="text-gray-500">Text:</span>
          <input
            type="color"
            aria-label="Textfarbe"
            value={normalizeColorToHex(
              input.pureLabelAppearance?.textColor,
              DEFAULT_LABEL_TEXT_HEX
            )}
            onChange={(event) =>
              input.handlePureLabelTextColorChange(event.target.value)
            }
            className="h-6 w-8 rounded border border-gray-300 bg-transparent cursor-pointer p-0"
          />
        </div>
      </div>
    </div>
  );
};

const getSlotsFromPointAnnotation = (
  input: PointAnnotationSlotsInput
): AnnotationSlots => ({
  headingTitle:
    input.measurement || !input.isLivePreview
      ? POINT_TITLE
      : `${POINT_TITLE} (Neu)`,
  subtitle: renderEditableAnnotationSubtitle({
    annotationTypeTitle: POINT_TITLE,
    titleToken: getPointTitleToken(input),
    measurement: input.measurement,
    displayPoint: input.displayPoint,
    isReference: input.isReference,
    actions: input.actions,
  }),
  content: renderRelativeElevationContent(input.relativeElevation),
  collapsible: Boolean(input.measurement || input.isLivePreview),
  instructionText: input.isLivePreview ? POINT_MODE_INSTRUCTION : null,
});

const getSlotsFromDistanceAnnotation = (
  input: DistanceAnnotationSlotsInput
): AnnotationSlots => ({
  headingTitle:
    input.measurement || !input.isLivePreview
      ? DISTANCE_TITLE
      : `${DISTANCE_TITLE} (Neu)`,
  subtitle: renderEditableAnnotationSubtitle({
    annotationTypeTitle: DISTANCE_TITLE,
    titleToken: getDistanceTitleToken(input),
    measurement: input.measurement,
    displayPoint: input.displayPoint,
    subtitleMetaText:
      input.subtitleDirectDistanceMeters !== null
        ? `${formatNumber(input.subtitleDirectDistanceMeters)} m`
        : null,
    isReference: input.isReference,
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

const getSlotsFromLabelAnnotation = (
  input: LabelAnnotationSlotsInput
): AnnotationSlots => ({
  headingTitle:
    input.measurement || !input.isLivePreview
      ? LABEL_TITLE
      : `${LABEL_TITLE} (Neu)`,
  subtitle: renderEditableAnnotationSubtitle({
    annotationTypeTitle: LABEL_TITLE,
    titleToken: "1",
    measurement: input.measurement,
    displayPoint: input.displayPoint,
    isReference: input.isReference,
    actions: input.actions,
    autoFocusTrigger: input.autoFocusTitleTrigger,
    onTitleCommit: (title) => {
      if (!input.measurement) return;
      if (!title.trim()) return;
      input.actions.confirmPointLabelInputById(input.measurement.id);
    },
  }),
  content: renderPureLabelContent(input),
  collapsible: Boolean(input.measurement || input.isLivePreview),
  instructionText: null,
});

const getPlanarMetricContent = (
  input: PolygonPolylineAnnotationSlotsInput
) => {
  const cardinalHeading = formatBearingToGermanCardinal(input.bearingDeg);
  if (input.kind === SPATIAL_MARKUP_KIND_POLYLINE) {
    return (
      <div className="w-full px-2 pb-1 text-[#212529] text-[11px] leading-normal">
        Gesamtlänge: {formatNumber(input.totalLengthMeters)} m
      </div>
    );
  }

  return (
    <div className="w-full px-2 pb-1 text-[#212529] text-[11px] leading-normal">
      <div>
        {input.surfaceTypeLabel}:{" "}
        {formatAreaAdaptive(Math.max(0, input.areaSquareMeters ?? 0))}
      </div>
      {(input.kind === SPATIAL_MARKUP_KIND_PLANAR ||
        input.kind === SPATIAL_MARKUP_KIND_VERTICAL) &&
      cardinalHeading ? (
        <div>Himmelsrichtung: {cardinalHeading}</div>
      ) : null}
    </div>
  );
};

const getSlotsFromPlanarAnnotation = (
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
  collapsible: true,
  instructionText: null,
});

const getSlotsFromUnsupportedAnnotation = (
  input: UnsupportedAnnotationSlotsInput
): AnnotationSlots => ({
  headingTitle: "Messung",
  subtitle: null,
  content: (
    <AnnotationInfoBoxNotImplemented
      kind={input.unsupportedKind ?? "unsupported"}
    />
  ),
  collapsible: false,
  instructionText: null,
});

export const getAnnotationInfoBoxSlots = (
  input: AnnotationSlotsInput
): AnnotationSlots => {
  switch (input.kind) {
    case SPATIAL_MARKUP_KIND_POINT:
      return getSlotsFromPointAnnotation(input);
    case SPATIAL_MARKUP_KIND_DISTANCE:
      return getSlotsFromDistanceAnnotation(input);
    case SPATIAL_MARKUP_KIND_LABEL:
      return getSlotsFromLabelAnnotation(input);
    case SPATIAL_MARKUP_KIND_POLYLINE:
    case SPATIAL_MARKUP_KIND_AREA:
    case SPATIAL_MARKUP_KIND_PLANAR:
    case SPATIAL_MARKUP_KIND_VERTICAL:
      return getSlotsFromPlanarAnnotation(input);
    default:
      return getSlotsFromUnsupportedAnnotation(input);
  }
};
