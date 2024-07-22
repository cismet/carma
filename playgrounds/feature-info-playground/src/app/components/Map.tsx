import { useEffect, useRef, useState } from 'react';
// @ts-ignore
import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
import 'leaflet/dist/leaflet.css';
import CismapLayer from 'react-cismap/CismapLayer';
import proj4 from 'proj4';
import { proj4crs25832def } from 'react-cismap/constants/gis';
import { useDispatch } from 'react-redux';
import {
  setGMLOutput,
  setJSONOutput,
  setOldVariant,
} from '../store/slices/mapping';
import { getLeafNodes } from '../helper/featureInfo';

const Map = ({ layer }) => {
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();

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
        hamburgerMenu={false}
        locatorControl={false}
        fullScreenControl={false}
        mapStyle={{ width, height }}
        leafletMapProps={{ editable: true }}
        minZoom={5}
        gazetteerSearchControl={false}
        onclick={(e) => {
          // @ts-ignore
          const pos = proj4(proj4.defs('EPSG:4326'), proj4crs25832def, [
            e.latlng.lng,
            e.latlng.lat,
          ]);

          const minimalBoxSize = 0.0001;
          const url =
            layer.url +
            `?SERVICE=WMS&request=GetFeatureInfo&format=image%2Fpng&transparent=true&version=1.1.1&tiled=true&width=1&height=1&srs=EPSG%3A25832&` +
            `bbox=` +
            `${pos[0] - minimalBoxSize},` +
            `${pos[1] - minimalBoxSize},` +
            `${pos[0] + minimalBoxSize},` +
            `${pos[1] + minimalBoxSize}&` +
            `x=0&y=0&` +
            `layers=${layer.name}&` +
            `feature_count=100&QUERY_LAYERS=${layer.name}&`;

          const imgUrl =
            `
          https://maps.wuppertal.de/umwelt?&VERSION=1.1.1&REQUEST=GetFeatureInfo&BBOX=` +
            `${pos[0] - minimalBoxSize},` +
            `${pos[1] - minimalBoxSize},` +
            `${pos[0] + minimalBoxSize},` +
            `${pos[1] + minimalBoxSize}` +
            `&WIDTH=1&HEIGHT=1&SRS=EPSG:25832&FORMAT=image/png&TRANSPARENT=TRUE&BGCOLOR=0xF0F0F0&EXCEPTIONS=application/vnd.ogc.se_xml&FEATURE_COUNT=99&LAYERS=${layer.name}&STYLES=default&QUERY_LAYERS=${layer.name}&INFO_FORMAT=text/html&X=0&Y=0
          `;

          fetch(url)
            .then((response) => response.text())
            .then((data) => {
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(data, 'text/xml');
              const content =
                xmlDoc.getElementsByTagName('gml:featureMember')[0];
              dispatch(setGMLOutput(content.outerHTML));

              dispatch(setJSONOutput(getLeafNodes(content)));
            });

          fetch(imgUrl)
            .then((response) => response.text())
            .then((data) => {
              dispatch(setOldVariant(data));
            });
        }}
      >
        {layer && (
          <CismapLayer
            key={layer.name}
            url={layer.url}
            maxZoom={26}
            layers={layer.name}
            format="image/png"
            tiled={true}
            transparent="true"
            pane="additionalLayers1"
            opacity={0.7}
            type={'wmts'}
          />
        )}
      </TopicMapComponent>
    </div>
  );
};

export default Map;