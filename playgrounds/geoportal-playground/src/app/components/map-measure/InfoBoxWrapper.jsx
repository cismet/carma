import ResponsiveInfoBox from 'react-cismap/topicmaps/ResponsiveInfoBox';
import {
  getShapes,
  setActiveShape,
  getActiveShapes,
  getVisibleShapes,
  setShowAllMeasurements,
} from '../../store/slices/measurements';
import { useSelector, useDispatch } from 'react-redux';
import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrashCan } from '@fortawesome/free-solid-svg-icons';
const InfoBoxWrapper = () => {
  const measurementsData = useSelector(getShapes);
  const visibleShapesData = useSelector(getVisibleShapes);
  const activeShape = useSelector(getActiveShapes);
  const dispatch = useDispatch();
  const [currentMeasure, setCurrentMeasure] = useState(0);
  const [oldDataLength, setOldDataLength] = useState(visibleShapesData.length);

  useEffect(() => {
    const initialCureentMeasure =
      visibleShapesData.length - 1 < 0 ? 0 : visibleShapesData.length - 1;
    setCurrentMeasure(initialCureentMeasure);
  }, [visibleShapesData]);

  useEffect(() => {
    console.log('nnn', currentMeasure);
    if (visibleShapesData[currentMeasure]?.shapeId) {
      dispatch(setActiveShape(visibleShapesData[currentMeasure].shapeId));
    }
  }, [currentMeasure]);

  useEffect(() => {
    const positionInArr = activeShapeHandler(activeShape);
    setCurrentMeasure(positionInArr);
  }, [activeShape]);

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

  const activeShapeHandler = (shapeId) => {
    let activeShapePosition = null;
    visibleShapesData.forEach((s, idx) => {
      if (s.shapeId === shapeId) {
        activeShapePosition = idx;
      }
    });

    return activeShapePosition;
  };

  return (
    <div>
      {visibleShapesData[currentMeasure] && (
        <ResponsiveInfoBox
          pixelwidth={350}
          header={
            <div className="w-full bg-blue-500 py-0.5 pl-1">Messungen</div>
          }
          s
          alwaysVisibleDiv={
            <div className="mt-2 mb-4 w-[96%] flex justify-between items-center">
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
              </span>
              <FontAwesomeIcon
                className="cursor-pointer text-base text-[#808080]"
                icon={faTrashCan}
              />
            </div>
          }
          collapsibleDiv={
            <div>
              <span className="text-[12px] mt-4">
                {visibleShapesData[currentMeasure].distance}
              </span>
              <div className="flex justify-center items-center w-[96%] pt-4">
                <span
                  className="mx-4 text-[#0078a8]"
                  onClick={() => dispatch(setShowAllMeasurements(true))}
                >
                  {measurementsData.length} Messungen verfügbar
                </span>
              </div>
              <div className="flex justify-between items-center w-[96%] mb-2">
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

export default InfoBoxWrapper;
