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
import { useMapMeasurementsContext } from "./MapMeasurementsProvider";
import { InfoBoxMeasurementProps, MeasurementShape } from "../..";

export function InfoBoxMeasurement({
  pixelWidth = 350,
}: InfoBoxMeasurementProps) {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const {
    shapes: measurementsData,
    activeShape,
    setActiveShape,
    moveToShape,
    setMoveToShape,
    visibleShapes: visibleShapesData,
    updateShape,
    setUpdateShape,
    drawingShape: drawingMode,
    mapMovingEnd,
    setMapMovingEnd,
    setDeleteAll,
    setShowAll,
    updateTitle,
    config,
  } = useMapMeasurementsContext();

  const { editableTitle, infoBoxHeaderColor } = config;

  const [currentMeasure, setCurrentMeasure] = useState(0);
  const [oldDataLength, setOldDataLength] = useState(measurementsData.length);
  const [stepAfterMoveToShape, setStepAfterMoveToShape] = useState<
    number | string | null
  >(null);
  const [stepAfterUpdating, setStepAfterUpdating] = useState(false);
  const [stepAfterCreating, setStepAfterCreating] = useState(false);
  const { collapsedInfoBox } = useContext<typeof UIContext>(UIContext);

  // Handle moveToShape - zoom functionality
  useEffect(() => {
    if (moveToShape) {
      setStepAfterMoveToShape(activeShape ?? null);
      setMoveToShape(null);
    }
  }, [moveToShape, activeShape, setMoveToShape]);

  // Handle map moving end
  useEffect(() => {
    if (mapMovingEnd) {
      setStepAfterUpdating(false);
      setMapMovingEnd(false);
    }
  }, [mapMovingEnd, setMapMovingEnd]);

  // Handle drawing mode
  useEffect(() => {
    if (drawingMode) {
      // setLastMeasureActive();
      setActiveShape(5555);
      return;
    }
  }, [drawingMode]);

  // Handle step after creating
  useEffect(() => {
    if (stepAfterCreating) {
      setLastMeasureActive();
      setStepAfterCreating(false);
      setUpdateShape(false);
    }
  }, [stepAfterCreating]);

  // Handle update shape
  useEffect(() => {
    if (updateShape && !drawingMode) {
      setStepAfterUpdating(true);
    } else if (!stepAfterUpdating && !stepAfterCreating) {
      if (stepAfterMoveToShape) {
        setStepAfterUpdating(false);
        setStepAfterMoveToShape(null);
      } else {
        setLastMeasureActive();
      }
    }
  }, [visibleShapesData, updateShape]);

  // Handle activeShape changes - keep currentMeasure in sync
  useEffect(() => {
    if (activeShape) {
      const positionInArr = activeShapeHandler(activeShape);
      if (positionInArr !== null) {
        setCurrentMeasure(positionInArr);
      }
    }
  }, [activeShape, visibleShapesData]);

  useEffect(() => {
    const positionInArr = activeShapeHandler(activeShape ?? null);

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
    const currentIndex = activeShapeHandler(activeShape);
    if (currentIndex !== null) {
      const newIndex =
        currentIndex <= 0 ? visibleShapesData.length - 1 : currentIndex - 1;
      if (visibleShapesData[newIndex]) {
        setActiveShape(visibleShapesData[newIndex].shapeId);
      }
    }
  };

  const increaseCurrentHandler = () => {
    setMoveToShape(null);
    cleanUpdateMeasurementStatus();
    // Update activeShape (source of truth), currentMeasure will be derived
    const currentIndex = activeShapeHandler(activeShape);
    if (currentIndex !== null) {
      const newIndex =
        currentIndex >= visibleShapesData.length - 1 ? 0 : currentIndex + 1;
      if (visibleShapesData[newIndex]) {
        setActiveShape(visibleShapesData[newIndex].shapeId);
      }
    }
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

    // the method activate delete process in  MapMeasurementsObjects
    setDeleteAll(true);
    // cleanUpdateMeasurementStatus();
    // setLastMeasureActive();
  };

  const setUpdateMeasurementStatus = (status: boolean) => {
    setUpdateShape(status);
  };

  const cleanUpdateMeasurementStatus = () => {
    setUpdateShape(false);
  };

  const setLastMeasureActive = () => {
    // Set activeShape (source of truth) to the last visible shape
    if (activeShape === 5555) {
      return;
    }

    const isActiveShapeVisible = visibleShapesData.some(
      (m) => m.shapeId === activeShape
    );

    const lastIndex = visibleShapesData.length - 1;
    if (
      lastIndex >= 0 &&
      visibleShapesData[lastIndex] &&
      !isActiveShapeVisible
    ) {
      setActiveShape(visibleShapesData[lastIndex].shapeId);
    }
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
          pixelwidth={pixelWidth}
          panelClick={() => {}}
          header={
            <div
              className="w-full"
              style={{ backgroundColor: infoBoxHeaderColor }}
            >
              Messungen
            </div>
          }
          alwaysVisibleDiv={
            <div className="mt-2 mb-2 w-[96%] flex justify-between items-start gap-4">
              <span style={{ cursor: "pointer", width: "100%" }}>
                <MeasurementTitle
                  key={
                    visibleShapesData[currentMeasure].shapeId +
                    visibleShapesData[currentMeasure]?.area
                  }
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
                  editable={editableTitle}
                />
              </span>
              {drawingMode ? (
                <>
                  {" "}
                  <Tooltip title="Aktuelle Messung abbrechen">
                    <div
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
                    </div>
                  </Tooltip>
                </>
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
                {visibleShapesData[currentMeasure]?.area ? "Umfang" : "Strecke"}
                : {visibleShapesData[currentMeasure].distance}
                {visibleShapesData[currentMeasure]?.area && (
                  <>
                    <span className="mx-2">|</span>
                    Fläche: {visibleShapesData[currentMeasure].area}
                  </>
                )}
              </div>
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
          pixelwidth={pixelWidth}
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
                  onClick={() => {
                    const shapesLength = measurementsData.length;
                    if (shapesLength > 0) {
                      const shapeId =
                        measurementsData[shapesLength - 1]?.shapeId;
                      if (!drawingMode) {
                        setActiveShape(shapeId);
                      }
                      setShowAll(true);
                    }
                  }}
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
