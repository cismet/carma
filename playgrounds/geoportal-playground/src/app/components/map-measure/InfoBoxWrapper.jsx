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
    console.log('nnn current', currentMeasure);

    if (measurementsData.length > oldDataLength) {
      increaseCurrentHandler();
    }
    if (measurementsData.length < oldDataLength) {
      decreaseCurrentHandler();
    }

    setOldDataLength(measurementsData.length);
  }, [measurementsData, oldDataLength, currentMeasure]);

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
          header={<span style={{ width: '100%', height: '6px' }}></span>}
          alwaysVisibleDiv={
            <span
              style={{ cursor: 'pointer' }}
              onClick={() =>
                dispatch(
                  setActiveShape(measurementsData[currentMeasure].shapeId)
                )
              }
            >
              Messung Nummer #{measurementsData[currentMeasure].shapeId}
            </span>
          }
          collapsibleDiv={
            <>
              {' '}
              <span>
                {measurementsData[currentMeasure].distance} (
                {measurementsData[currentMeasure].shapeType})
              </span>
              <div onClick={decreaseCurrentHandler}>Prev</div>
              <div onClick={increaseCurrentHandler}>Next</div>
            </>
          }
        />
      )}
    </div>
  );
};

export default InfoBoxWrapper;
