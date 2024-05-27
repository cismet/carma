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
import { faSearch } from '@fortawesome/free-solid-svg-icons';
import Icon from 'react-cismap/commons/Icon';

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
  const [firstLoading, setFirstLoading] = useState(true);

  useEffect(() => {
    // console.log('www visible drawing mode', drawingMode);
    // console.log('www visible updateShape mode', updateShape);
    // console.log('www visible step after updating mode', updateShape);

    if (moveToShape) {
      dispatch(setActiveShape(moveToShape));
      console.log('www a');

      const positionInArr = activeShapeHandler(activeShape);
      setStepAfterMoveToShape(activeShape);
      dispatch(setMoveToShape(null));
    } else if (updateShape) {
      setStepAfterUpdating(true);
      console.log('www b');
    } else if (!stepAfterUpdating && !stepAfterCreating) {
      console.log('www c');
      if (stepAfterMoveToShape) {
        console.log('www c a');
        const positionInArr = activeShapeHandler(stepAfterMoveToShape);
        setCurrentMeasure(positionInArr);
        setStepAfterUpdating(false);
        setStepAfterMoveToShape(null);
      } else if (visibleShapesData.length === 1) {
        setLastMeasureActive();
        console.log('www c b');
        console.log('www c b', visibleShapesData.length);
        console.log('www c b', visibleShapesData);
        dispatch(setActiveShape(visibleShapesData[0].shapeId));
      } else {
        setLastMeasureActive();
        setStepAfterUpdating(false);
        console.log('www c c');
      }
    } else if (drawingMode) {
      console.log('www d');

      setLastMeasureActive();
    } else if (stepAfterCreating) {
      console.log('www e');

      setLastMeasureActive();
      setStepAfterCreating(false);
      dispatch(setUpdateShape(false));
    } else if (mapMovingEnd) {
      setStepAfterUpdating(false);
      console.log('www f');

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
    console.log(
      'www currentMeasure visibleShapesData',
      visibleShapesData.length
    );
    if (visibleShapesData[currentMeasure]?.shapeId) {
      dispatch(setActiveShape(visibleShapesData[currentMeasure].shapeId));
    }
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

    if (!checkIfActiveShapeIsVisible && !checkOldAndNewMeasurementLength) {
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
            <div className="mt-2 mb-2 w-[96%] flex justify-between items-start gap-4">
              <span
                style={{ cursor: 'pointer' }}
                // className="capitalize text-[14px]"
                onClick={() =>
                  dispatch(
                    setActiveShape(visibleShapesData[currentMeasure].shapeId)
                  )
                }
              >
                {/* Linienzug #{visibleShapesData[currentMeasure].number} */}
                <span>
                  Order
                  {getOrderOfShape(visibleShapesData[currentMeasure].shapeId)}
                </span>
                <MeasurementTitle
                  key={visibleShapesData[currentMeasure].shapeId}
                  title={`Linienzug #${getOrderOfShape(
                    visibleShapesData[currentMeasure].shapeId
                  )}`}
                />
              </span>
              <div>{visibleShapesData[currentMeasure].shapeId}</div>
              <div className="flex justify-between items-center w-[12%] mt-1 gap-2">
                <Icon
                  name="search-location"
                  onClick={() =>
                    dispatch(
                      setMoveToShape(visibleShapesData[currentMeasure].shapeId)
                    )
                  }
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
