import { useState, useEffect, useContext } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrashCan,
  faTrash,
  faArrowsDownToLine,
} from "@fortawesome/free-solid-svg-icons";
import MeasurementTitle from "./MeasurementTitle";
import { UIContext } from "react-cismap/contexts/UIContextProvider";
import "../styles/infoBox.css";
import { Tooltip } from "antd";
import { ResponsiveInfoBox } from "@carma-appframeworks/portals";
import {
  useCesiumMeasurements,
  isPointMeasurementEntry,
  getEuclideanDistance,
  getENU,
  formatNumber,
} from "@carma-mapping/engines/cesium/measurements";
import { InfoBoxMeasurementProps } from "../..";

export function InfoBoxMeasurement3D({
  pixelWidth = 350,
}: InfoBoxMeasurementProps) {
  const {
    measurements,
    clearAllMeasurements,
    clearMeasurementsByIds,
    setReferencePoint,
    referencePoint,
  } = useCesiumMeasurements();
  const { collapsedInfoBox } = useContext<typeof UIContext>(UIContext);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevLen, setPrevLen] = useState(measurements.length);

  // Measurements reversed to show newest first
  const visibleMeasurements = [...measurements].reverse();
  const currentMeasurement = visibleMeasurements[currentIndex];

  useEffect(() => {
    if (measurements.length !== prevLen) {
      setCurrentIndex(0); // Jump to newest on change
      setPrevLen(measurements.length);
    }
  }, [measurements.length, prevLen]);

  useEffect(() => {
    if (measurements.length === 0 && referencePoint) {
      setReferencePoint(null);
    } else if (
      measurements.length === 1 &&
      measurements[0] &&
      isPointMeasurementEntry(measurements[0]) &&
      !referencePoint
    ) {
      setReferencePoint(measurements[0].geometryECEF);
    }
  }, [measurements, referencePoint, setReferencePoint]);

  const decreaseCurrentHandler = () => {
    const newIndex =
      currentIndex <= 0 ? visibleMeasurements.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
  };

  const increaseCurrentHandler = () => {
    const newIndex =
      currentIndex >= visibleMeasurements.length - 1 ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
  };

  const deleteShapeHandler = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMeasurement) {
      clearMeasurementsByIds([currentMeasurement.id]);
    }
  };

  const setAsReferenceHandler = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMeasurement && isPointMeasurementEntry(currentMeasurement)) {
      setReferencePoint(currentMeasurement.geometryECEF);
    }
  };

  const infoBoxHeaderColor = "#3b82f6";

  const formatCoordinate = (val: number, isLat: boolean) => {
    const str = Math.abs(val).toLocaleString("de-DE", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    });
    const suffix = isLat ? (val >= 0 ? "N" : "S") : val >= 0 ? "O" : "W";
    return `${str}° ${suffix}`;
  };

  const isSingleMeasurement = measurements.length === 1;
  let isReference = false;
  let relativeValues: { distance: number; up: number } | null = null;

  if (currentMeasurement && isPointMeasurementEntry(currentMeasurement)) {
    if (isSingleMeasurement) {
      isReference = true;
    } else if (referencePoint) {
      const dist = getEuclideanDistance(
        currentMeasurement.geometryECEF,
        referencePoint
      );
      if (dist > 0.001) {
        const enu = getENU(currentMeasurement.geometryECEF, referencePoint);
        relativeValues = { distance: dist, up: enu.up };
      } else {
        isReference = true;
      }
    }
  }

  return (
    <div>
      <ResponsiveInfoBox
        pixelwidth={pixelWidth}
        panelClick={() => {}}
        isCollapsible={!!currentMeasurement}
        header={
          <div
            className="w-full pl-1"
            style={{ backgroundColor: infoBoxHeaderColor }}
          >
            3D Messungen
          </div>
        }
        alwaysVisibleDiv={
          currentMeasurement ? (
            <div className="mt-2 mb-2 w-full px-2 flex justify-between items-start gap-4">
              <span
                style={{ cursor: "default", width: "100%" }}
                className={`font-bold ${isReference ? "italic" : ""}`}
              >
                <MeasurementTitle
                  key={currentMeasurement.id}
                  order={visibleMeasurements.length - currentIndex}
                  title={"Punktmessung"}
                  shapeId={currentMeasurement.id}
                  setUpdateMeasurementStatus={() => {}}
                  updateTitleMeasurementById={() => {}}
                  isCollapsed={collapsedInfoBox}
                  collapsedContent={
                    isPointMeasurementEntry(currentMeasurement)
                      ? `NHN ${formatNumber(
                          currentMeasurement.geometryWGS84.height
                        )} m`
                      : ""
                  }
                  editable={false}
                />
                {isPointMeasurementEntry(currentMeasurement) && (
                  <div className="text-[10px] font-normal text-gray-500 -mt-1">
                    {formatCoordinate(
                      currentMeasurement.geometryWGS84.latitude,
                      true
                    )}{" "}
                    {formatCoordinate(
                      currentMeasurement.geometryWGS84.longitude,
                      false
                    )}
                  </div>
                )}
              </span>
              <div className="flex justify-end items-center w-[18%] mt-1 gap-2">
                {!isReference && (
                  <Tooltip title="Als Referenzhöhe setzen">
                    <FontAwesomeIcon
                      onClick={setAsReferenceHandler}
                      className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                      icon={faArrowsDownToLine}
                      data-test-id="set-reference-btn"
                    />
                  </Tooltip>
                )}
                <Tooltip title="Löschen">
                  <FontAwesomeIcon
                    onClick={deleteShapeHandler}
                    className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                    icon={faTrashCan}
                    data-test-id="delete-measurement-btn"
                  />
                </Tooltip>
              </div>
            </div>
          ) : (
            <div
              className="mt-2 w-[90%] p-2"
              data-test-id="empty-measurement-info"
            >
              <p className="text-[#212529] font-normal text-xs leading-normal">
                Für Punktmessungen auf das Stadtmodell klicken. Die erste
                Messung definiert die Referenzhöhe.
              </p>
            </div>
          )
        }
        collapsibleDiv={
          currentMeasurement ? (
            <div>
              <div className="text-[12px] mb-1">
                {isPointMeasurementEntry(currentMeasurement) && (
                  <>
                    <div className="mt-2 text-sm pl-2 grid grid-cols-[max-content_max-content_1fr] gap-x-2">
                      {isReference ? (
                        <>
                          <div className="font-semibold">NHN-Höhe</div>
                          <div className="font-semibold text-right tabular-nums">
                            {formatNumber(
                              currentMeasurement.geometryWGS84.height
                            )}{" "}
                            m
                          </div>
                          <div></div>
                        </>
                      ) : (
                        <>
                          <div>
                            Höhe<sub>Relativ</sub>
                          </div>
                          <div className="text-right tabular-nums">
                            {formatNumber(relativeValues?.up ?? 0)} m
                          </div>
                          <div className="whitespace-nowrap">
                            (NHN{" "}
                            {formatNumber(
                              currentMeasurement.geometryWGS84.height
                            )}{" "}
                            m)
                          </div>

                          <div>Distanz</div>
                          <div className="text-right tabular-nums">
                            {formatNumber(relativeValues?.distance ?? 0)} m
                          </div>
                          <div></div>
                        </>
                      )}
                      {isReference && !isSingleMeasurement && (
                        <div className="col-span-3 italic">
                          ist Referenzhöhe
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex justify-center items-center w-[96%] mt-2 pt-3">
                <span className="mx-4 text-[#0078a8] cursor-default">
                  {visibleMeasurements.length} Messungen verfügbar
                </span>
              </div>
              <div className="flex justify-between items-center w-[96%] mt-1 mb-2">
                <a
                  className="renderAsLink text-[#0078a8] cursor-pointer"
                  onClick={decreaseCurrentHandler}
                  data-test-id="switch-measurement-left"
                  style={{ fontSize: "10.5px" }}
                >
                  &lt;&lt;
                </a>
                <span className="mx-4">
                  {currentIndex + 1} von {visibleMeasurements.length}
                </span>
                <a
                  className="renderAsLink text-[#0078a8] cursor-pointer"
                  onClick={increaseCurrentHandler}
                  data-test-id="switch-measurement-right"
                  style={{ fontSize: "10.5px" }}
                >
                  &gt;&gt;
                </a>
              </div>
            </div>
          ) : (
            <></>
          )
        }
        fixedRow={!!currentMeasurement}
      />
    </div>
  );
}
