import { useState, useEffect, useContext } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import MeasurementTitle from "./MeasurementTitle";
import Icon from "react-cismap/commons/Icon";
import { UIContext } from "react-cismap/contexts/UIContextProvider";
import "../styles/infoBox.css";
import { Tooltip } from "antd";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { ResponsiveInfoBox } from "@carma-appframeworks/portals";

export interface MeasurementShape {
  shapeId: number | string;
  distance?: number;
  area?: number;
  customTitle?: string;
  shapeType?: "line" | "polygon" | string;
  [key: string]: unknown;
}

export interface InfoBoxMeasurementProps {
  measurementsData: MeasurementShape[];
  visibleShapesData: MeasurementShape[];
  activeShape?: number | string | null;
  moveToShape?: number | string | null;
  updateShape?: boolean;
  drawingMode?: boolean;
  mapMovingEnd?: boolean;

  // UI
  collapsedInfoBox?: boolean;

  // Actions (previously dispatched)
  setMoveToShape: (id: number | string | null) => void;
  setActiveShape: (id: number | string | null) => void;
  setUpdateShape: (status: boolean) => void;
  setDeleteAll: (value: boolean) => void;
  setMapMovingEnd: (status: boolean) => void;
  setShowAll: (value: boolean) => void;
  updateTitle: (shapeId: number | string, title: string) => void;
}

export function InfoBoxMeasurement({
  measurementsData,
  visibleShapesData,
  activeShape,
  moveToShape,
  updateShape,
  drawingMode,
  mapMovingEnd,
  setMoveToShape,
  setActiveShape,
  setUpdateShape,
  setDeleteAll,
  setMapMovingEnd,
  setShowAll,
  updateTitle,
}: InfoBoxMeasurementProps) {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  const [currentMeasure, setCurrentMeasure] = useState(0);
  const [oldDataLength, setOldDataLength] = useState(measurementsData.length);
  const [stepAfterMoveToShape, setStepAfterMoveToShape] = useState<
    number | string | null
  >(null);
  const [stepAfterUpdating, setStepAfterUpdating] = useState(false);
  const [stepAfterCreating, setStepAfterCreating] = useState(false);
  const { collapsedInfoBox } = useContext<typeof UIContext>(UIContext);

  useEffect(() => {
    if (moveToShape) {
      setStepAfterMoveToShape(activeShape ?? null);
      setMoveToShape(null);
    } else if (updateShape && !drawingMode) {
      setStepAfterUpdating(true);
    } else if (!stepAfterUpdating && !stepAfterCreating) {
      if (stepAfterMoveToShape) {
        const positionInArr = activeShapeHandler(stepAfterMoveToShape);
        if (positionInArr !== null) {
          setCurrentMeasure(positionInArr);
        }
        setStepAfterUpdating(false);
        setStepAfterMoveToShape(null);
      } else if (visibleShapesData.length === 1) {
        setLastMeasureActive();
        setActiveShape(visibleShapesData[0].shapeId);
      } else {
        setLastMeasureActive();
      }
    } else if (drawingMode) {
      setLastMeasureActive();
    } else if (stepAfterCreating) {
      setLastMeasureActive();
      setStepAfterCreating(false);
      setUpdateShape(false);
    } else if (mapMovingEnd) {
      setStepAfterUpdating(false);
      setMapMovingEnd(false);
    } else {
    }
  }, [
    visibleShapesData,
    moveToShape,
    updateShape,
    stepAfterCreating,
    drawingMode,
    mapMovingEnd,
  ]);

  useEffect(() => {
    if (visibleShapesData[currentMeasure]?.shapeId) {
      setActiveShape(visibleShapesData[currentMeasure].shapeId);
    }
  }, [currentMeasure]);

  useEffect(() => {
    const positionInArr = activeShapeHandler(activeShape ?? null);

    if (positionInArr !== null) {
      setCurrentMeasure(positionInArr);
    }

    let checkIfActiveShapeIsVisible = visibleShapesData.some(
      (m) => m.shapeId === activeShape
    );

    const checkOldAndNewMeasurementLength =
      oldDataLength === measurementsData.length;

    if (!checkIfActiveShapeIsVisible && !checkOldAndNewMeasurementLength) {
      setStepAfterCreating(true);
    }

    setOldDataLength(measurementsData.length);
  }, [activeShape, measurementsData]);

  const decreaseCurrentHandler = () => {
    setMoveToShape(null);
    cleanUpdateMeasurementStatus();
    setCurrentMeasure((prev) => {
      if (prev <= 0) {
        return visibleShapesData.length - 1;
      }

      return prev - 1;
    });
  };

  const increaseCurrentHandler = () => {
    setMoveToShape(null);
    cleanUpdateMeasurementStatus();
    setCurrentMeasure((prev) => {
      if (prev >= visibleShapesData.length - 1) {
        return 0;
      }

      return prev + 1;
    });
  };

  const activeShapeHandler = (
    shapeId: number | string | null
  ): number | null => {
    let activeShapePosition: number | null = null;
    visibleShapesData.forEach((s, idx) => {
      if (s.shapeId === shapeId) {
        activeShapePosition = idx;
      }
    });
    return activeShapePosition;
  };

  const getPositionInAllArray = (shapeId: number | string): number | null => {
    let activeShapePosition: number | null = null;
    measurementsData.forEach((s, idx) => {
      if (s.shapeId === shapeId) {
        activeShapePosition = idx;
      }
    });
    return activeShapePosition;
  };

  const getOrderOfShape = (shapeId: number | string): number => {
    let position: number;
    if (shapeId === 5555) {
      position =
        measurementsData.length === 0 ? 1 : measurementsData.length + 1;
    } else {
      const arrayPosition = getPositionInAllArray(shapeId);
      position = arrayPosition !== null ? arrayPosition + 1 : 1;
    }
    return position;
  };

  const deleteShapeHandler = (e: React.MouseEvent) => {
    e.stopPropagation();

    setDeleteAll(true);
    cleanUpdateMeasurementStatus();
    setLastMeasureActive();
  };

  const setUpdateMeasurementStatus = (status: boolean) => {
    setUpdateShape(status);
  };

  const cleanUpdateMeasurementStatus = () => {
    setUpdateShape(false);
  };

  const setLastMeasureActive = () => {
    const initialCureentMeasure =
      visibleShapesData.length - 1 < 0 ? 0 : visibleShapesData.length - 1;
    setCurrentMeasure(initialCureentMeasure);
  };

  const updateTitleMeasurementById = (
    shapeId: number | string,
    customTitle: string
  ) => {
    updateTitle(shapeId, customTitle);
  };

  return (
    <div>
      {visibleShapesData[currentMeasure] && (
        <ResponsiveInfoBox
          pixelwidth={350}
          panelClick={() => {}}
          header={<div className="w-full bg-blue-500">Messungen</div>}
          alwaysVisibleDiv={
            <div className="mt-2 mb-2 w-[96%] flex justify-between items-start gap-4">
              <span style={{ cursor: "pointer", width: "100%" }}>
                <MeasurementTitle
                  // key={
                  //   visibleShapesData[currentMeasure].shapeId +
                  //   visibleShapesData[currentMeasure]?.area
                  // }
                  order={getOrderOfShape(
                    visibleShapesData[currentMeasure].shapeId
                  )}
                  title={
                    visibleShapesData[currentMeasure]?.customTitle
                      ? visibleShapesData[currentMeasure]?.customTitle
                      : addDefaultShapeNameToTitle(
                          visibleShapesData[currentMeasure]
                        )
                  }
                  shapeId={visibleShapesData[currentMeasure].shapeId}
                  setUpdateMeasurementStatus={setUpdateMeasurementStatus}
                  updateTitleMeasurementById={updateTitleMeasurementById}
                  isCollapsed={collapsedInfoBox}
                  collapsedContent={
                    visibleShapesData[currentMeasure].shapeType === "polygon"
                      ? `${visibleShapesData[currentMeasure].area}`
                      : `${visibleShapesData[currentMeasure].distance}`
                  }
                />
              </span>
              {drawingMode ? (
                <Tooltip title="Aktuelle Messung abbrechen">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const map = routedMapRef.leafletMap.leafletElement;
                      map.fire("draw:canceled");
                    }}
                  >
                    <FontAwesomeIcon
                      icon={faBan}
                      className="cursor-pointer text-[16px] text-[#808080] hover:text-[#a0a0a0]"
                    />
                  </button>
                </Tooltip>
              ) : (
                <div className="flex justify-between items-center w-[12%] mt-1 gap-2">
                  <Icon
                    name="search-location"
                    onClick={() => {
                      setMoveToShape(visibleShapesData[currentMeasure].shapeId);
                      cleanUpdateMeasurementStatus();
                    }}
                    className="cursor-pointer text-[16px] text-[#808080] hover:text-[#a0a0a0]"
                    data-test-id="zoom-measurement-btn"
                  />
                  <FontAwesomeIcon
                    onClick={deleteShapeHandler}
                    className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                    icon={faTrashCan}
                    data-test-id="delete-measurement-btn"
                  />
                </div>
              )}
            </div>
          }
          collapsibleDiv={
            <div>
              <div className="text-[12px] mb-1">
                Strecke: {visibleShapesData[currentMeasure].distance}
              </div>
              {visibleShapesData[currentMeasure]?.area && (
                <div className="text-[12px] mb-1">
                  Flächeninhalt: {visibleShapesData[currentMeasure].area}
                </div>
              )}
              <div className="flex justify-center items-center w-[96%] mt-2 pt-3">
                <span
                  className="mx-4 text-[#0078a8] cursor-pointer"
                  onClick={() => setShowAll(true)}
                >
                  {measurementsData.length} Messungen verfügbar
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
                  {visibleShapesData.length} Messungen angezeigt
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
      {!visibleShapesData[currentMeasure] && (
        <ResponsiveInfoBox
          panelClick={() => {}}
          header={""}
          pixelwidth={350}
          isCollapsible={false}
          alwaysVisibleDiv={
            <div
              className="mt-2 w-[90%] p-2"
              data-test-id="empty-measurement-info"
            >
              <p className="text-[#212529] font-normal text-xs leading-normal">
                {measurementsData.length !== 0
                  ? "Um alle Messungen zu sehen, klicken Sie auf den unten stehenden Link"
                  : "Aktuell sind keine Messungen vorhanden. Neue Messungen können mit einem Klick auf die Karte angelegt werden."}
              </p>
            </div>
          }
          collapsibleDiv={
            <div>
              <div className="flex justify-center items-center w-[96%]">
                <span
                  className="mx-4 text-[#0078a8] cursor-pointer"
                  onClick={() => setShowAll(true)}
                >
                  {measurementsData.length} Messungen verfügbar
                </span>
              </div>
              <div className="flex justify-between items-center w-[96%] mt-1 mb-1"></div>
            </div>
          }
          fixedRow={false}
        />
      )}
    </div>
  );
}

function addDefaultShapeNameToTitle(shape: MeasurementShape): string {
  let newShape = "Linienzug";
  if (shape.area) {
    newShape = "Fläche";
  }
  return newShape;
}
