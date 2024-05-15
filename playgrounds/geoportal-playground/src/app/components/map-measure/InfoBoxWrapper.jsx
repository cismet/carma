import ResponsiveInfoBox from 'react-cismap/topicmaps/ResponsiveInfoBox';
import {
  getShapes,
  setActiveShape,
  getVisibleShapes,
} from '../../store/slices/measurements';
import { useSelector, useDispatch } from 'react-redux';
import { useState, useEffect } from 'react';

const InfoBoxWrapper = () => {
  const measurementsData = useSelector(getShapes);
  const visibleShapesData = useSelector(getVisibleShapes);
  const dispatch = useDispatch();
  const [currentMeasure, setCurrentMeasure] = useState(
    visibleShapesData.length - 1 < 0 ? 0 : visibleShapesData.length - 1
  );
  const [oldDataLength, setOldDataLength] = useState(visibleShapesData.length);

  useEffect(() => {
    console.log('nnn length', visibleShapesData.length);
    console.log('nnn oldDataLength', oldDataLength);

    if (visibleShapesData.length > oldDataLength) {
      increaseCurrentHandler();
    }
    if (visibleShapesData.length < oldDataLength) {
      decreaseCurrentHandler();
    }

    setOldDataLength(visibleShapesData.length);
  }, [visibleShapesData, oldDataLength]);

  useEffect(() => {
    if (visibleShapesData[currentMeasure]?.shapeId) {
      dispatch(setActiveShape(visibleShapesData[currentMeasure].shapeId));
    }
  }, [visibleShapesData]);

  const decreaseCurrentHandler = () => {
    setCurrentMeasure((prev) => {
      if (prev <= 0) {
        return visibleShapesData.length - 1;
      }

      const newIndex = prev - 1;
      return newIndex;
    });
  };

  const increaseCurrentHandler = () => {
    setCurrentMeasure((prev) => {
      if (prev >= visibleShapesData.length - 1) {
        return 0;
      }

      const newIndex = prev + 1;
      return newIndex;
    });
  };

  return (
    <div>
      {visibleShapesData[currentMeasure] && (
        <ResponsiveInfoBox
          pixelwidth={300}
          header={<div className="w-full bg-blue-500 px-2">Messungen</div>}
          alwaysVisibleDiv={
            <span
              style={{ cursor: 'pointer' }}
              className="capitalize"
              onClick={() =>
                dispatch(
                  setActiveShape(visibleShapesData[currentMeasure].shapeId)
                )
              }
            >
              {visibleShapesData[currentMeasure].shapeType} Nummer #
              {visibleShapesData[currentMeasure].number}
            </span>
          }
          collapsibleDiv={
            <>
              <span>{visibleShapesData[currentMeasure].distance}</span>
              <div className="flex justify-center items-center">
                <span className="mx-4">
                  {measurementsData.length} Messungen angezeigt in Wuppertal
                </span>
              </div>
              <div className="flex justify-between items-center w-[90%]">
                <span
                  onClick={decreaseCurrentHandler}
                  style={{ fontSize: '20px' }}
                >
                  &laquo;
                </span>
                <span className="mx-4">
                  {visibleShapesData.length} Messungen angezeigt
                </span>
                <span
                  onClick={increaseCurrentHandler}
                  style={{ fontSize: '20px' }}
                >
                  &raquo;
                </span>
              </div>
            </>
          }
        />
      )}
    </div>
  );
};

export default InfoBoxWrapper;
