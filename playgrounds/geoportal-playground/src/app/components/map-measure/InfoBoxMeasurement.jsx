import ResponsiveInfoBox from 'react-cismap/topicmaps/ResponsiveInfoBox';
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
} from '../../store/slices/measurements';
import { useSelector, useDispatch } from 'react-redux';
import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTrashCan,
  faMagnifyingGlassLocation,
} from '@fortawesome/free-solid-svg-icons';
import MeasurementTitle from './MeasurementTitle';

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

  useEffect(() => {
    // console.log('www visible drawing mode', drawingMode);
    // console.log('www visible updateShape mode', updateShape);
    // console.log('www visible step after updating mode', updateShape);

    if (moveToShape) {
      console.log('www visible a');
      dispatch(setActiveShape(moveToShape));
      const positionInArr = activeShapeHandler(activeShape);
      setStepAfterMoveToShape(activeShape);
      // setCurrentMeasure(positionInArr);
      dispatch(setMoveToShape(null));
    } else if (updateShape) {
      console.log('www visible b');
      setStepAfterUpdating(true);
    } else if (!stepAfterUpdating && !stepAfterCreating) {
      console.log('www visible c');
      if (stepAfterMoveToShape) {
        const positionInArr = activeShapeHandler(stepAfterMoveToShape);
        setCurrentMeasure(positionInArr);
        setStepAfterUpdating(false);
        setStepAfterMoveToShape(null);
      } else {
        setLastMeasureActive();
        setStepAfterUpdating(false);
      }
    } else if (drawingMode) {
      console.log('www visible d');
      setLastMeasureActive();
    } else if (stepAfterCreating) {
      console.log('www visible e');
      setLastMeasureActive();
      setStepAfterCreating(false);
      dispatch(setUpdateShape(false));
    } else if (mapMovingEnd) {
      console.log('www visible f');
      setStepAfterUpdating(false);

      // setLastMeasureActive();
      dispatch(setMapMovingEnd(false));
    } else {
      console.log('www visible else');
      // setLastMeasureActive();
    }
  }, [
    visibleShapesData,
    moveToShape,
    updateShape,
    stepAfterCreating,
    drawingMode,
    mapMovingEnd,
    // oldVisibleDataLength,
  ]);

  useEffect(() => {
    console.log('www visible currentMeasure', currentMeasure);
    if (visibleShapesData[currentMeasure]?.shapeId) {
      dispatch(setActiveShape(visibleShapesData[currentMeasure].shapeId));
    }
  }, [currentMeasure]);

  useEffect(() => {
    const positionInArr = activeShapeHandler(activeShape);

    setCurrentMeasure(positionInArr);

    let checkIfActiveShapeIsVisible = visibleShapesData.some(
      (m) => m.shapeId === activeShape
    );
    // const checkIfActiveShapeIsVisible = visibleShapesData.some(
    //   (m) => m.shapeId === activeShape && m.shapeId !== 5555
    // );

    const checkOldAndNewMeasurementLength =
      oldDataLength === measurementsData.length;

    // console.log('www visible less', checkOldAndNewMeasurementLength);
    console.log('www visible shape id', activeShape);

    if (!checkIfActiveShapeIsVisible && !checkOldAndNewMeasurementLength) {
      // console.log('www visible active !!!!!');
      setStepAfterCreating(true);
    }

    setOldDataLength(measurementsData.length);
  }, [activeShape, measurementsData]);

  const decreaseCurrentHandler = () => {
    dispatch(setMoveToShape(null));
    setCurrentMeasure((prev) => {
      if (prev <= 0) {
        return visibleShapesData.length - 1;
      }

      return prev - 1;
    });
  };

  const increaseCurrentHandler = () => {
    dispatch(setMoveToShape(null));

    setCurrentMeasure((prev) => {
      if (prev >= visibleShapesData.length - 1) {
        return 0;
      }

      return prev + 1;
    });
  };

  const activeShapeHandler = (shapeId) => {
    console.log('www positionInArr', visibleShapesData);

    let activeShapePosition = null;
    visibleShapesData.forEach((s, idx) => {
      if (s.shapeId === shapeId) {
        activeShapePosition = idx;
      }
    });

    console.log('www place', activeShapePosition);
    return activeShapePosition;
  };
  const deleteShapeHandler = () => {
    dispatch(setDeleteMeasurements(true));
  };
  const moveToShapeHandler = () => {
    dispatch(setMoveToShape(true));
  };

  const setLastMeasureActive = () => {
    const initialCureentMeasure =
      visibleShapesData.length - 1 < 0 ? 0 : visibleShapesData.length - 1;
    setCurrentMeasure(initialCureentMeasure);
  };

  return (
    <div>
      {visibleShapesData[currentMeasure] && (
        <ResponsiveInfoBox
          pixelwidth={350}
          header={
            <div className="w-full bg-blue-500 py-0.5 pl-1">Messungen</div>
          }
          // s
          alwaysVisibleDiv={
            <div className="mt-2 mb-2 w-[96%] flex justify-between items-center">
              <span
                style={{ cursor: 'pointer' }}
                className="capitalize text-[14px]"
                onClick={() =>
                  dispatch(
                    setActiveShape(visibleShapesData[currentMeasure].shapeId)
                  )
                }
              >
                Linienzug #{visibleShapesData[currentMeasure].number}
                <MeasurementTitle
                  title={visibleShapesData[currentMeasure].number}
                />
              </span>
              <div>{visibleShapesData[currentMeasure].shapeId}</div>
              <div className="flex justify-between items-center w-[12%] gap-1">
                <FontAwesomeIcon
                  onClick={() =>
                    dispatch(
                      setMoveToShape(visibleShapesData[currentMeasure].shapeId)
                    )
                  }
                  className="cursor-pointer text-[16px] text-[#808080]"
                  icon={faMagnifyingGlassLocation}
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
              <span className="text-[12px] mb-2">
                {visibleShapesData[currentMeasure].distance}
              </span>
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
                  style={{ fontSize: '10.5px' }}
                >
                  &lt;&lt;
                </a>
                <span className="mx-4">Messungen angezeigt</span>
                <a
                  className="renderAsLink text-[#0078a8]"
                  onClick={increaseCurrentHandler}
                  style={{ fontSize: '10.5px' }}
                >
                  &gt;&gt;
                </a>
              </div>
            </div>
          }
          fixedRow={{}}
        />
      )}
    </div>
  );
};

export default InfoBoxMeasurement;
