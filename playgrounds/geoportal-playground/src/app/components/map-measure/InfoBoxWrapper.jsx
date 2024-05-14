import ResponsiveInfoBox from 'react-cismap/topicmaps/ResponsiveInfoBox';
import { getShapes, setActiveShape } from '../../store/slices/measurements';
import { useSelector, useDispatch } from 'react-redux';
import { useState, useEffect } from 'react';

const InfoBoxWrapper = () => {
  const measurementsData = useSelector(getShapes);
  const dispatch = useDispatch();
  const [currentMeasure, setCurrentMeasure] = useState(
    measurementsData.length - 1 < 0 ? 0 : measurementsData.length - 1
  );
  const [oldDataLength, setOldDataLength] = useState(measurementsData.length);

  useEffect(() => {
    console.log('nnn length', measurementsData.length);
    console.log('nnn oldDataLength', oldDataLength);

    if (measurementsData.length > oldDataLength) {
      increaseCurrentHandler();
    }
    if (measurementsData.length < oldDataLength) {
      decreaseCurrentHandler();
    }

    setOldDataLength(measurementsData.length);
  }, [measurementsData, oldDataLength]);

  useEffect(() => {
    dispatch(setActiveShape(measurementsData[currentMeasure].shapeId));
  }, [currentMeasure]);

  const decreaseCurrentHandler = () => {
    setCurrentMeasure((prev) => {
      if (prev <= 0) {
        return measurementsData.length - 1;
      }

      const newIndex = prev - 1;
      return newIndex;
    });
  };

  const increaseCurrentHandler = () => {
    setCurrentMeasure((prev) => {
      if (prev >= measurementsData.length - 1) {
        return 0;
      }

      const newIndex = prev + 1;
      return newIndex;
    });
  };

  return (
    <div>
      {measurementsData[currentMeasure] && (
        <ResponsiveInfoBox
          pixelwidth={300}
          header={<div className="w-full bg-blue-500 px-2">Messungen</div>}
          alwaysVisibleDiv={
            <span
              style={{ cursor: 'pointer' }}
              className="capitalize"
              onClick={() =>
                dispatch(
                  setActiveShape(measurementsData[currentMeasure].shapeId)
                )
              }
            >
              {measurementsData[currentMeasure].shapeType} Nummer #
              {measurementsData[currentMeasure].number}
            </span>
          }
          collapsibleDiv={
            <>
              <span>{measurementsData[currentMeasure].distance}</span>
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
                <span className="mx-4">Messungen angezeigt</span>
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
