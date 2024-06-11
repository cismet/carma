import { useEffect, useRef, useState, useContext } from 'react';
// @ts-ignore
import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
import { getGazData } from '../helper/helper';
import { useSelector } from 'react-redux';
import InfoBoxMeasurement from './map-measure/InfoBoxMeasurement';
import { getLayers } from '../store/slices/mapping';
import LayerWrapper from './layers/LayerWrapper';
// @ts-ignore
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';

const Map = () => {
  const [gazData, setGazData] = useState([]);
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const layers = useSelector(getLayers);

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
  }, []);

  return (
    <div className="h-full w-full" ref={wrapperRef}>
      <TopicMapComponent
        gazData={gazData}
        hamburgerMenu={false}
        locatorControl={true}
        mapStyle={{ width, height }}
        leafletMapProps={{ editable: true }}
        minZoom={5}
        mappingBoundsChanged={(boundingbox) => {
          // console.log('xxx bbox', createWMSBbox(boundingbox));
        }}
        gazetteerSearchPlaceholder="Stadtteil | Adresse | POI"
        infoBox={<InfoBoxMeasurement />}
      >
        <LayerWrapper />
        {layers.map((layer) => (
          <StyledWMSTileLayer
            type="wms"
            url={layer.url}
            maxZoom={26}
            layers={layer.id}
            format="image/png"
            tiled={true}
            transparent="true"
            opacity={layer.opacity.toFixed(1) || 0.7}
          />
        ))}
      </TopicMapComponent>
    </div>
  );
};

export default Map;
