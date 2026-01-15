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
  getBearing,
  formatGeographic,
  formatRelativeENU,
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

  const deleteAllHandler = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAllMeasurements();
  };

  const setAsReferenceHandler = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMeasurement && isPointMeasurementEntry(currentMeasurement)) {
      setReferencePoint(currentMeasurement.geometryECEF);
    }
  };

  const infoBoxHeaderColor = "#0078a8";

  let geoStrings = ["", "", ""];
  let relStrings = ["", "", ""];
  let hasRelative = false;

  if (currentMeasurement && isPointMeasurementEntry(currentMeasurement)) {
    geoStrings = formatGeographic(
      currentMeasurement.geometryWGS84.longitude,
      currentMeasurement.geometryWGS84.latitude,
      currentMeasurement.geometryWGS84.height
    );

    if (referencePoint) {
      const dist = getEuclideanDistance(
        currentMeasurement.geometryECEF,
        referencePoint
      );
      if (dist > 0) {
        const enu = getENU(currentMeasurement.geometryECEF, referencePoint);
        const bearing = getBearing(enu.east, enu.north);
        relStrings = formatRelativeENU(dist, bearing, enu.up);
        hasRelative = true;
      }
    }
  }

  return (
    <div>
      {currentMeasurement && (
        <ResponsiveInfoBox
          pixelwidth={pixelWidth}
          panelClick={() => {}}
          header={
            <div
              className="w-full"
              style={{ backgroundColor: infoBoxHeaderColor }}
            >
              3D Messungen
            </div>
          }
          alwaysVisibleDiv={
            <div className="mt-2 mb-2 w-[96%] flex justify-between items-start gap-4">
              <span
                style={{ cursor: "default", width: "100%" }}
                className="pl-3 font-bold"
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
                      ? geoStrings[2]
                      : ""
                  }
                  editable={false}
                />
              </span>
              <div className="flex justify-between items-center w-[18%] mt-1 gap-2">
                <Tooltip title="Alle löschen">
                  <FontAwesomeIcon
                    onClick={deleteAllHandler}
                    className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                    icon={faTrash}
                    data-test-id="delete-all-measurement-btn"
                  />
                </Tooltip>
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
          }
          collapsibleDiv={
            <div>
              <div className="text-[12px] mb-1">
                {isPointMeasurementEntry(currentMeasurement) && (
                  <>
                    <div className="mt-2 text-sm pl-2">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                        {/* Row 1: Height | Delta Height */}
                        <div className="flex items-center gap-2">
                          <span>{geoStrings[2]}</span>
                          <Tooltip title="Als Referenzhöhe setzen">
                            <FontAwesomeIcon
                              onClick={setAsReferenceHandler}
                              className="cursor-pointer text-[#0078a8] hover:text-[#0056b3]"
                              icon={faArrowsDownToLine}
                              data-test-id="set-reference-btn"
                            />
                          </Tooltip>
                        </div>
                        <span>{hasRelative ? relStrings[2] : ""}</span>

                        {/* Row 2: Lat | Distance */}
                        <span>{geoStrings[1]}</span>
                        <span>{hasRelative ? relStrings[0] : ""}</span>

                        {/* Row 3: Lon | Bearing */}
                        <span>{geoStrings[0]}</span>
                        <span>{hasRelative ? relStrings[1] : ""}</span>
                      </div>
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
          }
          fixedRow={true}
        />
      )}
      {!currentMeasurement && (
        <ResponsiveInfoBox
          panelClick={() => {}}
          header={
            <div
              className="w-full"
              style={{ backgroundColor: infoBoxHeaderColor }}
            >
              3D Messungen
            </div>
          }
          pixelwidth={pixelWidth}
          isCollapsible={false}
          alwaysVisibleDiv={
            <div
              className="mt-2 w-[90%] p-2"
              data-test-id="empty-measurement-info"
            >
              <p className="text-[#212529] font-normal text-xs leading-normal">
                Für Punktmessungen auf das Stadtmodell klicken. Die erste
                Messung definiert die Referenzhöhe.
              </p>
            </div>
          }
          collapsibleDiv={<></>}
          fixedRow={false}
        />
      )}
    </div>
  );
}
