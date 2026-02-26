import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import {
  formatAreaAdaptive,
  formatNumber,
} from "@carma-mapping/engines/cesium/measurements";
import Icon from "react-cismap/commons/Icon";
import { Tooltip } from "antd";
import { faTrashCan } from "@fortawesome/free-solid-svg-icons";

import MeasurementTitle from "../MeasurementTitle";
import { InfoBoxMeasurement3DActionIcon } from "./InfoBoxMeasurement3DActionIcon";
import { formatCoordinateWithHemisphere } from "./InfoBoxMeasurement3D.formatters";

type PolygonSummary = {
  totalLengthMeters: number;
  startEndElevationDeltaMeters: number;
};

type LivePreviewPointGeometry = {
  latitude: number;
  longitude: number;
  height: number;
};

type PolygonGroupForSubtitle = {
  id: string;
  name?: string;
};

type SubtitleSectionWrapperProps = {
  children: ReactNode;
};

const SubtitleSectionWrapper = ({ children }: SubtitleSectionWrapperProps) => (
  <div className="mt-1 mb-0 w-full px-2">{children}</div>
);

type InfoBoxPolygonSubtitleSectionProps = {
  selectedPlanarPolygonGroup: PolygonGroupForSubtitle;
  selectedPlanarPolygonOrder: number;
  collapsedInfoBox: boolean;
  selectedPolylineSummary: PolygonSummary | null;
  suppressPolygonAreaInDirectPolylineMode: boolean;
  selectedPolygonPrimaryAreaSquareMeters: number;
  selectedPolygonSurfaceTypeLabel: string;
  onPolygonNameUpdate: (polygonGroupId: string | number, name: string) => void;
  onFlyToSelectedPolygon: () => void;
  onDeleteSelectedPolygon: () => void;
};

export const InfoBoxPolygonSubtitleSection = ({
  selectedPlanarPolygonGroup,
  selectedPlanarPolygonOrder,
  collapsedInfoBox,
  selectedPolylineSummary,
  suppressPolygonAreaInDirectPolylineMode,
  selectedPolygonPrimaryAreaSquareMeters,
  selectedPolygonSurfaceTypeLabel,
  onPolygonNameUpdate,
  onFlyToSelectedPolygon,
  onDeleteSelectedPolygon,
}: InfoBoxPolygonSubtitleSectionProps) => {
  const handleFlyToSelectedPolygon = (
    event: ReactMouseEvent<HTMLElement, MouseEvent>
  ) => {
    event.stopPropagation();
    onFlyToSelectedPolygon();
  };

  const handleDeleteSelectedPolygon = (
    event: ReactMouseEvent<SVGSVGElement, MouseEvent>
  ) => {
    event.stopPropagation();
    onDeleteSelectedPolygon();
  };

  return (
    <SubtitleSectionWrapper>
      <div className="flex justify-between items-start gap-2">
        <span
          style={{ cursor: "default" }}
          className="font-bold flex-1 min-w-0"
        >
          <MeasurementTitle
            key={selectedPlanarPolygonGroup.id}
            order={selectedPlanarPolygonOrder}
            title={selectedPlanarPolygonGroup.name ?? ""}
            shapeId={selectedPlanarPolygonGroup.id}
            setUpdateMeasurementStatus={() => {}}
            updateTitleMeasurementById={onPolygonNameUpdate}
            isCollapsed={collapsedInfoBox}
            placeholderText={`Polygonzug #${selectedPlanarPolygonOrder || 1}`}
            clearPlaceholderOnFocus
            showOrder={false}
            collapsedContent={
              selectedPolylineSummary && suppressPolygonAreaInDirectPolylineMode
                ? `${formatNumber(selectedPolylineSummary.totalLengthMeters)} m`
                : formatAreaAdaptive(selectedPolygonPrimaryAreaSquareMeters)
            }
            editable={true}
            capitalize={false}
            multiline={true}
          />
        </span>
        <div className="flex justify-end items-center shrink-0 mt-0 gap-2">
          <Tooltip title="Zum Polygon fliegen">
            <Icon
              name="search-location"
              onClick={handleFlyToSelectedPolygon}
              className="cursor-pointer text-[16px] text-[#808080] hover:text-[#a0a0a0]"
              data-test-id="flyto-polygon-btn"
            />
          </Tooltip>
          <InfoBoxMeasurement3DActionIcon
            title="Polygon löschen"
            icon={faTrashCan}
            onClick={handleDeleteSelectedPolygon}
            dataTestId="delete-polygon-btn"
          />
        </div>
      </div>
      <div className="w-full text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-2 whitespace-nowrap">
        {selectedPolylineSummary ? (
          <span>
            Polygonzug •{" "}
            {formatNumber(selectedPolylineSummary.totalLengthMeters)} m •
            Höhendifferenz:{" "}
            {formatNumber(
              Math.abs(selectedPolylineSummary.startEndElevationDeltaMeters)
            )}{" "}
            m
          </span>
        ) : (
          <span>
            {selectedPolygonSurfaceTypeLabel} •{" "}
            {formatAreaAdaptive(selectedPolygonPrimaryAreaSquareMeters)}
          </span>
        )}
      </div>
    </SubtitleSectionWrapper>
  );
};

type InfoBoxLabelSubtitleSectionProps = {
  collapsedInfoBox: boolean;
  order: number;
  isLivePreview: boolean;
};

export const InfoBoxLabelSubtitleSection = ({
  collapsedInfoBox,
  order,
  isLivePreview,
}: InfoBoxLabelSubtitleSectionProps) => (
  <SubtitleSectionWrapper>
    <div className="flex justify-between items-start gap-2">
      <span style={{ cursor: "default" }} className="font-bold flex-1 min-w-0">
        <MeasurementTitle
          key="label-preview-title"
          order={order}
          title=""
          shapeId="label-preview"
          setUpdateMeasurementStatus={() => {}}
          updateTitleMeasurementById={() => {}}
          isCollapsed={collapsedInfoBox}
          placeholderText="Beschriftung"
          clearPlaceholderOnFocus
          showOrder={false}
          collapsedContent="Beschriftung"
          editable={false}
          capitalize={false}
          multiline={false}
        />
      </span>
    </div>
    <div className="w-full text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-2 whitespace-nowrap">
      {isLivePreview
        ? "Klick auf das Modell, um eine Beschriftung zu platzieren."
        : "Beschriftung"}
    </div>
  </SubtitleSectionWrapper>
);

type InfoBoxPointSubtitleSectionProps = {
  collapsedInfoBox: boolean;
  order: number;
  pointMeasurementPlaceholder: string;
  livePreviewPointGeometryWGS84: LivePreviewPointGeometry | null;
  isLivePreview: boolean;
};

export const InfoBoxPointSubtitleSection = ({
  collapsedInfoBox,
  order,
  pointMeasurementPlaceholder,
  livePreviewPointGeometryWGS84,
  isLivePreview,
}: InfoBoxPointSubtitleSectionProps) => (
  <SubtitleSectionWrapper>
    <div className="flex justify-between items-start gap-2">
      <span style={{ cursor: "default" }} className="font-bold flex-1 min-w-0">
        <MeasurementTitle
          key="point-preview-title"
          order={order}
          title=""
          shapeId="point-preview"
          setUpdateMeasurementStatus={() => {}}
          updateTitleMeasurementById={() => {}}
          isCollapsed={collapsedInfoBox}
          placeholderText={`${pointMeasurementPlaceholder} #${order}`}
          clearPlaceholderOnFocus
          showOrder={false}
          collapsedContent={`NHN ${formatNumber(
            livePreviewPointGeometryWGS84?.height ?? 0
          )} m`}
          editable={false}
          capitalize={false}
          multiline={false}
        />
      </span>
    </div>
    <div className="w-full text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-2 whitespace-nowrap">
      {isLivePreview && livePreviewPointGeometryWGS84
        ? `${formatCoordinateWithHemisphere(
            livePreviewPointGeometryWGS84.latitude,
            true
          )} ${formatCoordinateWithHemisphere(
            livePreviewPointGeometryWGS84.longitude,
            false
          )} • NHN ${formatNumber(livePreviewPointGeometryWGS84.height)} m`
        : isLivePreview
        ? "Punktposition wird aktualisiert..."
        : "Punktmessung"}
    </div>
  </SubtitleSectionWrapper>
);

type InfoBoxDistanceSubtitleSectionProps = {
  collapsedInfoBox: boolean;
  order: number;
  orderToken: string;
  distanceMeasurementPlaceholder: string;
  livePreviewPointGeometryWGS84: LivePreviewPointGeometry | null;
  isLivePreview: boolean;
};

export const InfoBoxDistanceSubtitleSection = ({
  collapsedInfoBox,
  order,
  orderToken,
  distanceMeasurementPlaceholder,
  livePreviewPointGeometryWGS84,
  isLivePreview,
}: InfoBoxDistanceSubtitleSectionProps) => (
  <SubtitleSectionWrapper>
    <div className="flex justify-between items-start gap-2">
      <span style={{ cursor: "default" }} className="font-bold flex-1 min-w-0">
        <MeasurementTitle
          key="distance-preview-title"
          order={order}
          title=""
          shapeId="distance-preview"
          setUpdateMeasurementStatus={() => {}}
          updateTitleMeasurementById={() => {}}
          isCollapsed={collapsedInfoBox}
          placeholderText={`${distanceMeasurementPlaceholder} #${orderToken}`}
          clearPlaceholderOnFocus
          showOrder={false}
          collapsedContent={
            livePreviewPointGeometryWGS84
              ? `NHN ${formatNumber(livePreviewPointGeometryWGS84.height)} m`
              : distanceMeasurementPlaceholder
          }
          editable={false}
          capitalize={false}
          multiline={false}
        />
      </span>
    </div>
    <div className="w-full text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-2 whitespace-nowrap">
      {isLivePreview && livePreviewPointGeometryWGS84
        ? `${formatCoordinateWithHemisphere(
            livePreviewPointGeometryWGS84.latitude,
            true
          )} ${formatCoordinateWithHemisphere(
            livePreviewPointGeometryWGS84.longitude,
            false
          )} • NHN ${formatNumber(livePreviewPointGeometryWGS84.height)} m`
        : isLivePreview
        ? "Punktposition wird aktualisiert..."
        : "Distanzmessung"}
    </div>
  </SubtitleSectionWrapper>
);
