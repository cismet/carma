import { Select, Switch } from "antd";

import {
  formatAreaAdaptive,
  formatNumber,
} from "@carma-mapping/engines/cesium/measurements";
import {
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  type PolylineSegmentLineMode,
} from "../../types/measurementTypes";

type PolygonSurfaceTypeOption = "roof" | "facade" | "terrain" | "footprint";

type PolygonSummary = {
  segmentCount: number;
  totalLengthMeters: number;
  meanSegmentLengthMeters: number;
  totalAbsoluteElevationChangeMeters: number;
  startEndElevationDeltaMeters: number;
  ascentMeters: number;
  descentMeters: number;
};

type PolygonCircumferenceSummary = {
  planarMeters: number;
  threeDMeters: number;
};

type PolygonTiltInfo = {
  tiltDeg: number;
  slopePercentText: string;
  normalDirectionText: string;
};

type PolygonSurfaceTypeSelectOption = {
  value: PolygonSurfaceTypeOption;
  label: string;
};

type InfoBoxMeasurement3DPolygonContentProps = {
  selectedPolylineSummary: PolygonSummary | null;
  selectedPolylineSegmentLineMode: PolylineSegmentLineMode;
  updateSelectedPolylineSegmentLineMode: (
    nextMode: PolylineSegmentLineMode
  ) => void;
  stopEventPropagation: (event: React.MouseEvent<HTMLElement>) => void;
  selectedPolygonSurfaceTypeValue: PolygonSurfaceTypeOption;
  polygonSurfaceTypeOptions: PolygonSurfaceTypeSelectOption[];
  updateSelectedPolygonSurfaceType: (
    nextType: PolygonSurfaceTypeOption
  ) => void;
  showSurfaceAreaForType: boolean;
  showHorizontalAreaForType: boolean;
  selectedConnectedPlanarPolygonTotalAreaSquareMeters: number;
  selectedPolygonHorizontalAreaSquareMeters: number;
  selectedPolygonCircumferenceSummary: PolygonCircumferenceSummary;
  formatSignificant: (value: number, significantDigits?: number) => string;
  selectedConnectedPlanarPolygonCount: number;
  selectedConnectedRoofAverageSlopeDeg: number | null;
  selectedConnectedRoofSlopeLabels: string[];
  selectedPolygonTiltInfo: PolygonTiltInfo;
  selectedPolygonVertexLabels: string[];
};

export const InfoBoxMeasurement3DPolygonContent = ({
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
}: InfoBoxMeasurement3DPolygonContentProps) => (
  <div className="text-[12px] mb-0">
    <div className="text-sm pl-2 pr-1">
      {selectedPolylineSummary ? (
        <>
          <div className="mb-1">
            <span className="text-gray-500 mr-1">Gesamtlänge:</span>
            <span className="tabular-nums">
              {formatNumber(selectedPolylineSummary.totalLengthMeters)} m
            </span>
          </div>
          <div
            className="mb-1 flex items-center gap-2"
            onClick={stopEventPropagation}
            onMouseDown={stopEventPropagation}
          >
            <span className="text-gray-500">Segmentdarstellung:</span>
            <span className="text-[10px] text-gray-500">Direkt</span>
            <Switch
              size="small"
              checked={
                selectedPolylineSegmentLineMode ===
                LINEAR_SEGMENT_LINE_MODE_COMPONENTS
              }
              onChange={(checked) =>
                updateSelectedPolylineSegmentLineMode(
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
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px]">
            <span className="text-gray-500">Aufstieg:</span>
            <span className="tabular-nums">
              {formatNumber(selectedPolylineSummary.ascentMeters)} m
            </span>
            <span className="text-gray-500">Abstieg:</span>
            <span className="tabular-nums">
              {formatNumber(selectedPolylineSummary.descentMeters)} m
            </span>
            <span className="text-gray-500">Summe:</span>
            <span className="tabular-nums">
              {formatNumber(
                selectedPolylineSummary.totalAbsoluteElevationChangeMeters
              )}{" "}
              m
            </span>
          </div>
          <div className="mb-1">
            <span className="text-gray-500 mr-1">Δ Start/Ende:</span>
            <span className="tabular-nums">
              {formatNumber(
                selectedPolylineSummary.startEndElevationDeltaMeters
              )}{" "}
              m
            </span>
          </div>
          <div className="mb-1">
            <span className="text-gray-500 mr-1">Ø Segmentlänge:</span>
            <span className="tabular-nums">
              {formatNumber(selectedPolylineSummary.meanSegmentLengthMeters)} m
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="mb-1">
            <span className="text-gray-500 mr-1">Typ:</span>
            <Select
              size="small"
              value={selectedPolygonSurfaceTypeValue}
              options={polygonSurfaceTypeOptions}
              onChange={updateSelectedPolygonSurfaceType}
              style={{ minWidth: 148 }}
              onClick={stopEventPropagation}
              onMouseDown={stopEventPropagation}
            />
          </div>
          {showSurfaceAreaForType && (
            <div className="mb-1">
              <span className="text-gray-500 mr-1">Oberfläche:</span>
              <span className="tabular-nums">
                {formatAreaAdaptive(
                  selectedConnectedPlanarPolygonTotalAreaSquareMeters
                )}
              </span>
            </div>
          )}
          {showHorizontalAreaForType && (
            <div className="mb-1">
              <span className="text-gray-500 mr-1">Horizontalfläche:</span>
              <span className="tabular-nums">
                {formatAreaAdaptive(selectedPolygonHorizontalAreaSquareMeters)}
              </span>
            </div>
          )}
          <div className="mb-1">
            <span className="text-gray-500 mr-1">Planarer Umfang:</span>
            <span className="tabular-nums">
              {formatSignificant(
                selectedPolygonCircumferenceSummary.planarMeters
              )}{" "}
              m
            </span>
          </div>
          <div className="mb-1">
            <span className="text-gray-500 mr-1">3D-Umfang:</span>
            <span className="tabular-nums">
              {formatSignificant(
                selectedPolygonCircumferenceSummary.threeDMeters
              )}{" "}
              m
            </span>
          </div>
          <div className="mb-1">
            <span className="text-gray-500 mr-1">Teilflächen:</span>
            <span>{selectedConnectedPlanarPolygonCount}</span>
          </div>
          <div className="mb-1">
            <span className="text-gray-500 mr-1">Ø Dachneigung:</span>
            <span className="tabular-nums">
              {selectedConnectedRoofAverageSlopeDeg === null
                ? "Keine Dächer"
                : `${formatNumber(selectedConnectedRoofAverageSlopeDeg)}°`}
            </span>
          </div>
          <div className="mb-1">
            <span className="text-gray-500 mr-1">Dachneigung je Dach:</span>
            <span>
              {selectedConnectedRoofSlopeLabels.length > 0
                ? selectedConnectedRoofSlopeLabels.join(" • ")
                : "Keine Dächer"}
            </span>
          </div>
          <div className="mb-1">
            <span className="text-gray-500 mr-1">Kippwinkel:</span>
            <span className="tabular-nums">
              {formatNumber(selectedPolygonTiltInfo.tiltDeg)}° (
              {selectedPolygonTiltInfo.slopePercentText})
            </span>
          </div>
          <div className="mb-1">
            <span className="text-gray-500 mr-1">Normalrichtung:</span>
            <span>{selectedPolygonTiltInfo.normalDirectionText}</span>
          </div>
          <div className="mb-1">
            <span className="text-gray-500 mr-1">Knoten:</span>
            <span>
              {selectedPolygonVertexLabels.length > 0
                ? selectedPolygonVertexLabels.join(" - ")
                : "Keine"}
            </span>
          </div>
        </>
      )}
    </div>
  </div>
);
