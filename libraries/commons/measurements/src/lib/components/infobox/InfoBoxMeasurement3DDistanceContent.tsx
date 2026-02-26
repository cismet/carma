import { InputNumber } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faEye,
  faEyeSlash,
  faPlus,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import {
  formatNumber,
  isPointMeasurementEntry,
} from "@carma-mapping/engines/cesium/measurements";

import { getElevationInputWidthPx } from "./InfoBoxMeasurement3D.helpers";
import { InfoBoxMeasurement3DRelativeElevationContent } from "./InfoBoxMeasurement3DRelativeElevationContent";
import type { DistanceContentProps } from "./InfoBoxMeasurement3DPointDistance.types";

export const InfoBoxMeasurement3DDistanceContent = ({
  currentMeasurement,
  isLivePreview,
  hasActiveDistancePreviewAnchor,
  livePreviewDistanceRow,
  isReferencePointWithoutEdges,
  pointRelationRows,
  isRelativeElevationEditActive,
  relativeElevationValue,
  stopEventPropagation,
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
}: DistanceContentProps) => {
  if (isReferencePointWithoutEdges && !isLivePreview) {
    return null;
  }

  const isPointMeasurement =
    Boolean(currentMeasurement) && isPointMeasurementEntry(currentMeasurement);

  if (!isPointMeasurement && !isLivePreview) {
    return null;
  }

  if (
    isLivePreview &&
    hasActiveDistancePreviewAnchor &&
    livePreviewDistanceRow
  ) {
    return (
      <div className="text-[12px] mb-0">
        <div className="mt-1 text-sm pl-2">
          <div className="pr-1">
            <div className="flex items-center gap-1 mb-1">
              <InfoBoxMeasurement3DRelativeElevationContent
                interactive={false}
                isRelativeElevationEditActive={isRelativeElevationEditActive}
                relativeElevationValue={relativeElevationValue}
                stopEventPropagation={stopEventPropagation}
                elevationInputSharedProps={elevationInputSharedProps}
                relativeElevationInputWidthPx={relativeElevationInputWidthPx}
                handleElevationInputChange={handleElevationInputChange}
                stopElevationEditMode={stopElevationEditMode}
                startRelativeElevationEditMode={startRelativeElevationEditMode}
              />
            </div>
            <table className="w-full text-[10px] leading-tight">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="font-normal pr-2">Punkt</th>
                  <th className="font-normal text-right pr-2">Vertikal</th>
                  <th className="font-normal text-right pr-2">Horizontal</th>
                  <th className="font-normal text-right pr-2">Distanz</th>
                  <th className="font-normal text-right w-[14px]"></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="pr-2">{livePreviewDistanceRow.label}</td>
                  <td className="text-right tabular-nums pr-2">
                    {formatNumber(livePreviewDistanceRow.elevation)} m
                  </td>
                  <td className="text-right tabular-nums pr-2">
                    {formatNumber(livePreviewDistanceRow.horizontalDistance)} m
                  </td>
                  <td className="text-right tabular-nums pr-2">
                    {formatNumber(livePreviewDistanceRow.distance)} m
                  </td>
                  <td className="text-right"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-[12px] mb-0">
      {(isPointMeasurement || isLivePreview) && (
        <div className="mt-1 text-sm pl-2">
          {!isLivePreview && pointRelationRows.length > 0 ? (
            <div className="pr-1">
              <div className="flex items-center gap-1 mb-1">
                <InfoBoxMeasurement3DRelativeElevationContent
                  interactive
                  isRelativeElevationEditActive={isRelativeElevationEditActive}
                  relativeElevationValue={relativeElevationValue}
                  stopEventPropagation={stopEventPropagation}
                  elevationInputSharedProps={elevationInputSharedProps}
                  relativeElevationInputWidthPx={relativeElevationInputWidthPx}
                  handleElevationInputChange={handleElevationInputChange}
                  stopElevationEditMode={stopElevationEditMode}
                  startRelativeElevationEditMode={
                    startRelativeElevationEditMode
                  }
                />
              </div>
              <table className="w-full text-[10px] leading-tight">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="font-normal pr-2">Punkt</th>
                    <th className="font-normal text-right pr-2">Vertikal</th>
                    <th className="font-normal text-right pr-2">Horizontal</th>
                    <th className="font-normal text-right pr-2">Distanz</th>
                    <th className="font-normal text-right w-[14px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {pointRelationRows.map((row) => (
                    <tr
                      key={`${row.relatedPointId}-${row.relationId}`}
                      className={row.isReference ? "italic" : undefined}
                      style={
                        row.isImplicitReferenceRow
                          ? { opacity: 0.8 }
                          : undefined
                      }
                    >
                      <td className={`pr-2 ${row.isReference ? "italic" : ""}`}>
                        {row.label}
                      </td>
                      <td className="text-right tabular-nums pr-2">
                        {relationMetricEdit?.relatedPointId ===
                          row.relatedPointId &&
                        relationMetricEdit.kind === "vertical" ? (
                          <span
                            className="inline-flex items-center gap-1"
                            onClick={stopEventPropagation}
                          >
                            {!row.isImplicitReferenceRow && (
                              <button
                                type="button"
                                onClick={(event) =>
                                  toggleDistanceRelationLineVisibilityByKind(
                                    row.relationId,
                                    "components",
                                    event
                                  )
                                }
                                className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                                aria-label="Komponentenlinien ein- oder ausblenden"
                                disabled={!row.relationId}
                              >
                                <FontAwesomeIcon
                                  icon={
                                    row.lineVisibility.vertical &&
                                    row.lineVisibility.horizontal
                                      ? faEye
                                      : faEyeSlash
                                  }
                                  className="text-[9px]"
                                />
                              </button>
                            )}
                            <InputNumber
                              value={row.elevation}
                              onChange={(value) =>
                                handleRelationMetricValueChange(
                                  row.relatedPointId,
                                  "vertical",
                                  value
                                )
                              }
                              {...relationMetricInputSharedProps}
                              style={{
                                width: getElevationInputWidthPx(row.elevation),
                              }}
                              data-test-id={`relation-vertical-edit-input-${row.relatedPointId}`}
                            />
                            <button
                              type="button"
                              onClick={stopRelationMetricEditMode}
                              className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                              data-test-id={`relation-vertical-edit-complete-btn-${row.relatedPointId}`}
                              aria-label="Vertikale Distanz bearbeiten abschließen"
                            >
                              <FontAwesomeIcon icon={faCheck} />
                            </button>
                          </span>
                        ) : row.isImplicitReferenceRow ? (
                          <button
                            type="button"
                            onClick={(event) =>
                              startRelationMetricEditMode(
                                row.relatedPointId,
                                "vertical",
                                event
                              )
                            }
                            className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                            data-test-id={`relation-vertical-display-btn-${row.relatedPointId}`}
                          >
                            {formatNumber(row.elevation)} m
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(event) =>
                                toggleDistanceRelationLineVisibilityByKind(
                                  row.relationId,
                                  "components",
                                  event
                                )
                              }
                              className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                              aria-label="Komponentenlinien ein- oder ausblenden"
                              disabled={!row.relationId}
                            >
                              <FontAwesomeIcon
                                icon={
                                  row.lineVisibility.vertical &&
                                  row.lineVisibility.horizontal
                                    ? faEye
                                    : faEyeSlash
                                }
                                className="text-[9px]"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={(event) =>
                                startRelationMetricEditMode(
                                  row.relatedPointId,
                                  "vertical",
                                  event
                                )
                              }
                              className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                              data-test-id={`relation-vertical-display-btn-${row.relatedPointId}`}
                            >
                              {formatNumber(row.elevation)} m
                            </button>
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums pr-2">
                        {relationMetricEdit?.relatedPointId ===
                          row.relatedPointId &&
                        relationMetricEdit.kind === "horizontal" ? (
                          <span
                            className="inline-flex items-center gap-1"
                            onClick={stopEventPropagation}
                          >
                            <InputNumber
                              value={row.horizontalDistance}
                              onChange={(value) =>
                                handleRelationMetricValueChange(
                                  row.relatedPointId,
                                  "horizontal",
                                  value
                                )
                              }
                              min={0}
                              {...relationMetricInputSharedProps}
                              style={{
                                width: getElevationInputWidthPx(
                                  row.horizontalDistance
                                ),
                              }}
                              data-test-id={`relation-horizontal-edit-input-${row.relatedPointId}`}
                            />
                            <button
                              type="button"
                              onClick={stopRelationMetricEditMode}
                              className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                              data-test-id={`relation-horizontal-edit-complete-btn-${row.relatedPointId}`}
                              aria-label="Horizontale Distanz bearbeiten abschließen"
                            >
                              <FontAwesomeIcon icon={faCheck} />
                            </button>
                          </span>
                        ) : row.isImplicitReferenceRow ? (
                          <button
                            type="button"
                            onClick={(event) =>
                              startRelationMetricEditMode(
                                row.relatedPointId,
                                "horizontal",
                                event
                              )
                            }
                            className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                            data-test-id={`relation-horizontal-display-btn-${row.relatedPointId}`}
                          >
                            {formatNumber(row.horizontalDistance)} m
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(event) =>
                              startRelationMetricEditMode(
                                row.relatedPointId,
                                "horizontal",
                                event
                              )
                            }
                            className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                            data-test-id={`relation-horizontal-display-btn-${row.relatedPointId}`}
                          >
                            {formatNumber(row.horizontalDistance)} m
                          </button>
                        )}
                      </td>
                      <td className="text-right tabular-nums pr-2">
                        {relationMetricEdit?.relatedPointId ===
                          row.relatedPointId &&
                        relationMetricEdit.kind === "direct" ? (
                          <span
                            className="inline-flex items-center gap-1"
                            onClick={stopEventPropagation}
                          >
                            {!row.isImplicitReferenceRow && (
                              <button
                                type="button"
                                onClick={(event) =>
                                  toggleDistanceRelationLineVisibilityByKind(
                                    row.relationId,
                                    "direct",
                                    event
                                  )
                                }
                                className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                                aria-label="Direkte Linie ein- oder ausblenden"
                                disabled={!row.relationId}
                              >
                                <FontAwesomeIcon
                                  icon={
                                    row.lineVisibility.direct
                                      ? faEye
                                      : faEyeSlash
                                  }
                                  className="text-[9px]"
                                />
                              </button>
                            )}
                            <InputNumber
                              value={row.distance}
                              onChange={(value) =>
                                handleRelationMetricValueChange(
                                  row.relatedPointId,
                                  "direct",
                                  value
                                )
                              }
                              min={0}
                              {...relationMetricInputSharedProps}
                              style={{
                                width: getElevationInputWidthPx(row.distance),
                              }}
                              data-test-id={`relation-direct-edit-input-${row.relatedPointId}`}
                            />
                            <button
                              type="button"
                              onClick={stopRelationMetricEditMode}
                              className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                              data-test-id={`relation-direct-edit-complete-btn-${row.relatedPointId}`}
                              aria-label="Direkte Distanz bearbeiten abschließen"
                            >
                              <FontAwesomeIcon icon={faCheck} />
                            </button>
                          </span>
                        ) : row.isImplicitReferenceRow ? (
                          <button
                            type="button"
                            onClick={(event) =>
                              startRelationMetricEditMode(
                                row.relatedPointId,
                                "direct",
                                event
                              )
                            }
                            className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                            data-test-id={`relation-direct-display-btn-${row.relatedPointId}`}
                          >
                            {formatNumber(row.distance)} m
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(event) =>
                                toggleDistanceRelationLineVisibilityByKind(
                                  row.relationId,
                                  "direct",
                                  event
                                )
                              }
                              className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                              aria-label="Direkte Linie ein- oder ausblenden"
                              disabled={!row.relationId}
                            >
                              <FontAwesomeIcon
                                icon={
                                  row.lineVisibility.direct ? faEye : faEyeSlash
                                }
                                className="text-[9px]"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={(event) =>
                                startRelationMetricEditMode(
                                  row.relatedPointId,
                                  "direct",
                                  event
                                )
                              }
                              className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                              data-test-id={`relation-direct-display-btn-${row.relatedPointId}`}
                            >
                              {formatNumber(row.distance)} m
                            </button>
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        {row.isImplicitReferenceRow ? (
                          <button
                            type="button"
                            onClick={(event) =>
                              addDistanceRelationForCurrentPoint(
                                row.relatedPointId,
                                event
                              )
                            }
                            className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0]"
                            aria-label="Referenzlinie als Kante hinzufügen"
                          >
                            <FontAwesomeIcon
                              icon={faPlus}
                              className="text-[9px]"
                            />
                          </button>
                        ) : row.relationId ? (
                          <button
                            type="button"
                            onClick={(event) =>
                              removeDistanceRelationById(row.relationId, event)
                            }
                            className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0]"
                            aria-label="Punktbeziehung löschen"
                          >
                            <FontAwesomeIcon
                              icon={faTrashCan}
                              className="text-[9px]"
                            />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="pr-1 flex items-center gap-1">
              <InfoBoxMeasurement3DRelativeElevationContent
                interactive={!isLivePreview}
                isRelativeElevationEditActive={isRelativeElevationEditActive}
                relativeElevationValue={relativeElevationValue}
                stopEventPropagation={stopEventPropagation}
                elevationInputSharedProps={elevationInputSharedProps}
                relativeElevationInputWidthPx={relativeElevationInputWidthPx}
                handleElevationInputChange={handleElevationInputChange}
                stopElevationEditMode={stopElevationEditMode}
                startRelativeElevationEditMode={startRelativeElevationEditMode}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
