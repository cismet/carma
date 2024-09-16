import ResponsiveInfoBox from "react-cismap/topicmaps/ResponsiveInfoBox";
import {
  getShapes,
  setActiveShape,
  getActiveShapes,
  getVisibleShapes,
  setShowAllMeasurements,
  getUpdateShapeToShape,
  setUpdateShape,
  setDeleteMeasurements,
  getMoveToShape,
  setMoveToShape,
  getDrawingShape,
  setMapMovingEnd,
  getMapMovingEnd,
  updateTitle,
} from "../../store/slices/measurements";
import { useSelector, useDispatch } from "react-redux";
import { useState, useEffect, useContext } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
import MeasurementTitle from "./MeasurementTitle";
import Icon from "react-cismap/commons/Icon";
import { UIContext } from "react-cismap/contexts/UIContextProvider";

const InfoBoxMeasurement = () => {
  const measurementsData = useSelector(getShapes);
  const visibleShapesData = useSelector(getVisibleShapes);
  const activeShape = useSelector(getActiveShapes);
  const moveToShape = useSelector(getMoveToShape);
  const updateShape = useSelector(getUpdateShapeToShape);
  const drawingMode = useSelector(getDrawingShape);
  const mapMovingEnd = useSelector(getMapMovingEnd);
  const dispatch = useDispatch();
  const [currentMeasure, setCurrentMeasure] = useState(0);
  const [oldDataLength, setOldDataLength] = useState(measurementsData.length);
  const [stepAfterMoveToShape, setStepAfterMoveToShape] = useState(null);
  const [stepAfterUpdating, setStepAfterUpdating] = useState(false);
  const [stepAfterCreating, setStepAfterCreating] = useState(false);
  const { collapsedInfoBox } = useContext(UIContext);

  useEffect(() => {
    if (moveToShape) {
      setStepAfterMoveToShape(activeShape);
      dispatch(setMoveToShape(null));
    } else if (updateShape && !drawingMode) {
      setStepAfterUpdating(true);
    } else if (!stepAfterUpdating && !stepAfterCreating) {
      if (stepAfterMoveToShape) {
        const positionInArr = activeShapeHandler(stepAfterMoveToShape);
        setCurrentMeasure(positionInArr);
        setStepAfterUpdating(false);
        setStepAfterMoveToShape(null);
      } else if (visibleShapesData.length === 1) {
        setLastMeasureActive();
        dispatch(setActiveShape(visibleShapesData[0].shapeId));
      } else {
        setLastMeasureActive();
      }
    } else if (drawingMode) {
      setLastMeasureActive();
    } else if (stepAfterCreating) {
      setLastMeasureActive();
      setStepAfterCreating(false);
      dispatch(setUpdateShape(false));
    } else if (mapMovingEnd) {
      setStepAfterUpdating(false);
      dispatch(setMapMovingEnd(false));
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
      dispatch(setActiveShape(visibleShapesData[currentMeasure].shapeId));
    }
  }, [currentMeasure]);

  useEffect(() => {
    const positionInArr = activeShapeHandler(activeShape);

    setCurrentMeasure(positionInArr);

    let checkIfActiveShapeIsVisible = visibleShapesData.some(
      (m) => m.shapeId === activeShape,
    );

    const checkOldAndNewMeasurementLength =
      oldDataLength === measurementsData.length;

    if (!checkIfActiveShapeIsVisible && !checkOldAndNewMeasurementLength) {
      setStepAfterCreating(true);
    }

    setOldDataLength(measurementsData.length);
  }, [activeShape, measurementsData]);

  const decreaseCurrentHandler = () => {
    dispatch(setMoveToShape(null));
    cleanUpdateMeasurementStatus();
    setCurrentMeasure((prev) => {
      if (prev <= 0) {
        return visibleShapesData.length - 1;
      }

      return prev - 1;
    });
  };

  const increaseCurrentHandler = () => {
    dispatch(setMoveToShape(null));
    cleanUpdateMeasurementStatus();
    setCurrentMeasure((prev) => {
      if (prev >= visibleShapesData.length - 1) {
        return 0;
      }

      return prev + 1;
    });
  };

  const activeShapeHandler = (shapeId) => {
    let activeShapePosition = null;
    visibleShapesData.forEach((s, idx) => {
      if (s.shapeId === shapeId) {
        activeShapePosition = idx;
      }
    });
    return activeShapePosition;
  };

  const getPositionInAllArray = (shapeId) => {
    let activeShapePosition = null;
    measurementsData.forEach((s, idx) => {
      if (s.shapeId === shapeId) {
        activeShapePosition = idx;
      }
    });
    return activeShapePosition;
  };

  const getOrderOfShape = (shapeId) => {
    let position;
    if (shapeId === 5555) {
      position =
        measurementsData.length === 0 ? 1 : measurementsData.length + 1;
    } else {
      position = getPositionInAllArray(shapeId) + 1;
    }
    return position;
  };

  const deleteShapeHandler = (e) => {
    e.stopPropagation();

    dispatch(setDeleteMeasurements(true));
    cleanUpdateMeasurementStatus();
  };

  const setUpdateMeasurementStatus = (status) => {
    dispatch(setUpdateShape(status));
  };

  const cleanUpdateMeasurementStatus = () => {
    dispatch(setUpdateShape(false));
  };

  const setLastMeasureActive = () => {
    const initialCureentMeasure =
      visibleShapesData.length - 1 < 0 ? 0 : visibleShapesData.length - 1;
    setCurrentMeasure(initialCureentMeasure);
  };

  const updateTitleMeasurementById = (shapeId, customTitle) => {
    dispatch(updateTitle(shapeId, customTitle));
  };

  return (
    <div>
      {visibleShapesData[currentMeasure] && (
        <ResponsiveInfoBox
          pixelwidth={350}
          header={
            <div className="w-full bg-blue-500 py-0.5 pl-1">Messungen</div>
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
                    visibleShapesData[currentMeasure].shapeId,
                  )}
                  title={
                    visibleShapesData[currentMeasure]?.customTitle
                      ? visibleShapesData[currentMeasure]?.customTitle
                      : addDefaultShapeNameToTitle(
                          visibleShapesData[currentMeasure],
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
              {/* <div>{visibleShapesData[currentMeasure].shapeId}</div> */}
              <div className="flex justify-between items-center w-[12%] mt-1 gap-2">
                <Icon
                  name="search-location"
                  onClick={() => {
                    dispatch(
                      setMoveToShape(visibleShapesData[currentMeasure].shapeId),
                    );
                    cleanUpdateMeasurementStatus();
                  }}
                  className="cursor-pointer text-[16px] text-[#808080]"
                />
                <FontAwesomeIcon
                  onClick={deleteShapeHandler}
                  className="cursor-pointer text-base text-[#808080]"
                  icon={faTrashCan}
                />
              </div>
            </div>
          }
          collapsibleDiv={
            <div>
              <div className="text-[12px] mb-1">
                Strecke: {visibleShapesData[currentMeasure].distance}
              </div>
              {visibleShapesData[currentMeasure]?.area && (
                <div className="text-[12px] mb-1">
                  Fläche: {visibleShapesData[currentMeasure].area}
                </div>
              )}
              <div className="flex justify-center items-center w-[96%] mt-2 pt-3">
                <span
                  className="mx-4 text-[#0078a8] cursor-pointer"
                  onClick={() => dispatch(setShowAllMeasurements(true))}
                >
                  {measurementsData.length} Messungen verfügbar
                </span>
              </div>
              <div className="flex justify-between items-center w-[96%] mt-1 mb-2">
                <a
                  className="renderAsLink text-[#0078a8]"
                  onClick={decreaseCurrentHandler}
                  style={{ fontSize: "10.5px" }}
                >
                  &lt;&lt;
                </a>
                <span className="mx-4">
                  {visibleShapesData.length} Messungen angezeigt
                </span>
                <a
                  className="renderAsLink text-[#0078a8]"
                  onClick={increaseCurrentHandler}
                  style={{ fontSize: "10.5px" }}
                >
                  &gt;&gt;
                </a>
              </div>
            </div>
          }
          fixedRow={{}}
        />
      )}
      {!visibleShapesData[currentMeasure] && (
        <ResponsiveInfoBox
          pixelwidth={350}
          isCollapsible={false}
          alwaysVisibleDiv={
            <div className="mt-2 w-[90%] p-2">
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
                  onClick={() => dispatch(setShowAllMeasurements(true))}
                >
                  {measurementsData.length} Messungen verfügbar
                </span>
              </div>
              <div className="flex justify-between items-center w-[96%] mt-1 mb-1"></div>
            </div>
          }
          fixedRow={{}}
        />
      )}
    </div>
  );
};

export default InfoBoxMeasurement;

function addDefaultShapeNameToTitle(shape) {
  let newShape = "Linienzug";
  if (shape.area) {
    newShape = "Polygon";
  }
  return newShape;
}
