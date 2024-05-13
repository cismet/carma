import { useEffect, useRef, useState, useContext } from 'react';
// @ts-ignore
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';
// @ts-ignore
import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
// @ts-ignore
// @ts-ignore
import FeatureCollection from 'react-cismap/FeatureCollection';
// @ts-ignore
import { getGazData } from '../helper/helper';
import { useSelector } from 'react-redux';
// @ts-ignore
import { getMode } from './../store/slices/ui';
import { TopicMapContext } from 'react-cismap/contexts/TopicMapContextProvider';
import ResponsiveInfoBox from 'react-cismap/topicmaps/ResponsiveInfoBox';
import InfoBoxWrapper from './map-measure/InfoBoxWrapper';

const Map = () => {
  const [gazData, setGazData] = useState([]);
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mode = useSelector(getMode);

  function createWMSBbox(bbox) {
    // Extracting values from the object
    const { left, top, right, bottom } = bbox;

    // Constructing the bbox string for WMS request
    return `width=1024&height=682&bbox=${left},${bottom},${right},${top}`;
  }

  useEffect(() => {
    getGazData(setGazData);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (wrapperRef.current) {
        setHeight(wrapperRef.current.clientHeight);
        setWidth(wrapperRef.current.clientWidth);
      }
    };

    window.addEventListener('resize', handleResize);

    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [mode]);

  return (
    <div className="h-full w-full" ref={wrapperRef}>
      <TopicMapComponent
        gazData={gazData}
        hamburgerMenu={false}
        locatorControl={true}
        mapStyle={{ width, height }}
        leafletMapProps={{ editable: true }}
        mappingBoundsChanged={(boundingbox) => {
          // console.log('xxx bbox', createWMSBbox(boundingbox));
        }}
        gazetteerSearchPlaceholder="Stadtteil | Adresse | POI"
        infoBox={<InfoBoxWrapper />}
      >
        {/* <StyledWMSTileLayer
          {...{
            type: 'wmts',
            url: 'https://geodaten.metropoleruhr.de/spw2/service',
            layers: 'spw2_light_grundriss',
            version: '1.3.0',
            tileSize: 512,
            transparent: true,
            opacity: 0.3,
          }}
        ></StyledWMSTileLayer> */}
        <FeatureCollection></FeatureCollection>
      </TopicMapComponent>
    </div>
  );
};

export default Map;
