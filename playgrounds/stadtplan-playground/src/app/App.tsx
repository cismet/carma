import { useEffect, useRef, useState } from 'react';
// import styles from './App.module.css';
// import Button from 'react-bootstrap/Button';
// import Form from 'react-bootstrap/Form';
// import Nav from 'react-bootstrap/Nav';
// import Navbar from 'react-bootstrap/Navbar';
// import NavDropdown from 'react-bootstrap/NavDropdown';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';
import GazetteerHitDisplay from 'react-cismap/GazetteerHitDisplay';
import GazetteerSearchComponent from 'react-cismap/GazetteerSearchComponent';
import ProjSingleGeoJson from 'react-cismap/ProjSingleGeoJson';
import { MappingConstants, RoutedMap } from 'react-cismap';
import { md5FetchText, fetchJSON } from 'react-cismap/tools/fetching';
import { getGazDataForTopicIds } from 'react-cismap/tools/gazetteerHelper';

const host = 'https://wupp-topicmaps-data.cismet.de';

export const getGazData = async (
  setGazData,
  topics = [
    'bpklimastandorte',
    'pois',
    'kitas',
    'bezirke',
    'quartiere',
    'adressen',
  ]
) => {
  const prefix = 'GazDataForStories';
  const sources = {};

  sources.adressen = await md5FetchText(
    prefix,
    host + '/data/3857/adressen.json'
  );
  sources.bezirke = await md5FetchText(
    prefix,
    host + '/data/3857/bezirke.json'
  );
  sources.quartiere = await md5FetchText(
    prefix,
    host + '/data/3857/quartiere.json'
  );
  sources.pois = await md5FetchText(prefix, host + '/data/3857/pois.json');
  sources.kitas = await md5FetchText(prefix, host + '/data/3857/kitas.json');
  sources.bpklimastandorte = await md5FetchText(
    prefix,
    host + '/data/3857/bpklimastandorte.json'
  );
  // sources.no2 = await md5FetchText(prefix, host + "/data/3857/no2.json");

  const gazData = getGazDataForTopicIds(sources, topics);

  setGazData(gazData);
};

export function App() {
  const mapStyle = {
    height: 600,
    cursor: 'pointer',
  };
  let urlSearchParams = new URLSearchParams(window.location.href);
  const mapRef = useRef(null);
  const [gazetteerHit, setGazetteerHit] = useState(null);
  const [overlayFeature, setOverlayFeature] = useState(null);
  const [gazData, setGazData] = useState([]);
  useEffect(() => {
    const res = getGazData(setGazData);
    console.log('ggg', res);
  }, []);

  return (
    <div>
      <div>Simple Map with detached GazetteerSearchControl</div>

      <br />
      <TopicMapContextProvider featureItemsURL="/data/parkscheinautomatenfeatures.json">
        <div>
          <GazetteerSearchComponent
            mapRef={mapRef}
            gazetteerHit={gazetteerHit}
            setGazetteerHit={setGazetteerHit}
            overlayFeature={overlayFeature}
            setOverlayFeature={setOverlayFeature}
            gazData={gazData}
            enabled={gazData.length > 0}
            dropup={false}
            referenceSystem={MappingConstants.crs3857}
            referenceSystemDefinition={MappingConstants.proj4crs3857def}
          />
        </div>
        <div style={{ height: 50 }}></div>
        <RoutedMap
        // style={mapStyle}
        // key={'leafletRoutedMap'}
        // referenceSystem={MappingConstants.crs3857}
        // referenceSystemDefinition={MappingConstants.proj4crs3857def}
        // ref={mapRef}
        // layers=""
        // doubleClickZoom={false}
        // onclick={(e) => console.log('gazetteerHit', gazetteerHit)}
        // ondblclick={(e) => console.log('doubleclick', e)}
        // autoFitProcessedHandler={() =>
        //   this.props.mappingActions.setAutoFit(false)
        // }
        // backgroundlayers={'ruhrWMSlight@40|trueOrtho2018@10|rvrSchrift@100'}
        // urlSearchParams={urlSearchParams}
        // fullScreenControlEnabled={false}
        // locateControlEnabled={false}
        // minZoom={7}
        // maxZoom={18}
        // zoomSnap={0.5}
        // zoomDelta={0.5}
        >
          {overlayFeature && (
            <ProjSingleGeoJson
              key={JSON.stringify(overlayFeature)}
              geoJson={overlayFeature}
              masked={true}
              mapRef={mapRef}
            />
          )}
          <GazetteerHitDisplay
            key={'gazHit' + JSON.stringify(gazetteerHit)}
            gazetteerHit={gazetteerHit}
          />
        </RoutedMap>
      </TopicMapContextProvider>
    </div>
  );
}

export default App;
