import ResponsiveInfoBox from 'react-cismap/topicmaps/ResponsiveInfoBox';
import {
  getShapes,
  setActiveShape,
  getActiveShapes,
  getVisibleShapes,
} from '../../store/slices/measurements';
import { useSelector, useDispatch } from 'react-redux';
import { useState, useEffect } from 'react';

const InfoBoxWrapper = () => {
  const measurementsData = useSelector(getShapes);
  const visibleShapesData = useSelector(getVisibleShapes);
  const activeLine = useSelector(getActiveShapes);
  const dispatch = useDispatch();
  const [currentMeasure, setCurrentMeasure] = useState(0);
  // const [currentMeasure, setCurrentMeasure] = useState(
  //   visibleShapesData.length - 1 < 0 ? 0 : visibleShapesData.length - 1
  // );
  const [oldDataLength, setOldDataLength] = useState(visibleShapesData.length);

  useEffect(() => {
    // console.log('nnn length', visibleShapesData.length);
    console.log('nnn visibleShapesData');
    // console.log('nnn oldDataLength', oldDataLength);

    // if (visibleShapesData.length > oldDataLength) {
    //   increaseCurrentHandler();
    // }
    // if (visibleShapesData.length < oldDataLength) {
    //   decreaseCurrentHandler();
    // }

    const initialCureentMeasure =
      visibleShapesData.length - 1 < 0 ? 0 : visibleShapesData.length - 1;
    setCurrentMeasure(initialCureentMeasure);
    // setOldDataLength(visibleShapesData.length);
  }, [visibleShapesData, oldDataLength]);

  useEffect(() => {
    console.log('nnn', currentMeasure);
    if (visibleShapesData[currentMeasure]?.shapeId) {
      console.log('aaa activeLine', activeLine);
      if (visibleShapesData[currentMeasure].shapeId !== activeLine) {
        dispatch(setActiveShape(visibleShapesData[currentMeasure].shapeId));
      }
    }
  }, [currentMeasure, activeLine]);

  const decreaseCurrentHandler = () => {
    setCurrentMeasure((prev) => {
      if (prev <= 0) {
        return visibleShapesData.length - 1;
      }

      return prev - 1;
    });
  };

  const increaseCurrentHandler = () => {
    setCurrentMeasure((prev) => {
      if (prev >= visibleShapesData.length - 1) {
        return 0;
      }

      return prev + 1;
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
                <a
                  className="renderAsLink"
                  onClick={decreaseCurrentHandler}
                  style={{ fontSize: '10.5px' }}
                >
                  &lt;&lt;
                </a>
                <span className="mx-4">
                  {visibleShapesData.length} Messungen angezeigt
                </span>
                <a
                  className="renderAsLink"
                  onClick={increaseCurrentHandler}
                  style={{ fontSize: '10.5px' }}
                >
                  &gt;&gt;
                </a>
              </div>
            </>
          }
        />
      )}
    </div>
  );
};

export default InfoBoxWrapper;
