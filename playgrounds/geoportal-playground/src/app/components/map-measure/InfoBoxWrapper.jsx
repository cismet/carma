import ResponsiveInfoBox from 'react-cismap/topicmaps/ResponsiveInfoBox';
import { getShapes } from '../../store/slices/measurements';
import { useSelector } from 'react-redux';
import { Carousel } from 'antd';

const InfoBoxWrapper = () => {
  const measurementsData = useSelector(getShapes);

  return (
    <div>
      {/* <ResponsiveInfoBox
        pixelwidth={300}
        header={
          <span>
            {measurementsData.length !== 0
              ? measurementsData[0].shapeId
              : 'Messen'}
          </span>
        }
        alwaysVisibleDiv={
          <span>
            {measurementsData.length !== 0
              ? measurementsData[0].distance
              : 'Always Visible Div'}
          </span>
        }
        collapsibleDiv={
          <span>
            {measurementsData.length !== 0
              ? measurementsData[0].shapeType
              : 'Collapsible Div'}
          </span>
        }
      /> */}
      {measurementsData.length !== 0 &&
        measurementsData.map((data) => {
          return (
            <ResponsiveInfoBox
              pixelwidth={300}
              header={<span>{data.shapeId}</span>}
              alwaysVisibleDiv={<span>{data.distance}</span>}
              collapsibleDiv={<span>{data.shapeType}</span>}
            />
          );
        })}
    </div>
  );
};

export default InfoBoxWrapper;
