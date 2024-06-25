import React, { useEffect, useContext, useState, useRef } from 'react';
import { MappingConstants } from 'react-cismap';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';
import GazetteerSearchComponent from 'react-cismap/GazetteerSearchComponent';
import convertItemToFeature from './helper/convertItemToFeature';
import { TopicMapContext } from 'react-cismap/contexts/TopicMapContextProvider';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import 'react-cismap/topicMaps.css';
import './App.css';
import Map from './Map';
import {
  getFeatureStyler,
  getPoiClusterIconCreatorFunction,
} from './helper/styler';
import './index.css';
import 'leaflet.locatecontrol/dist/L.Control.Locate.css';
import 'leaflet.locatecontrol';
import {
  ControlLayout,
  Control,
  Main,
  ControlButtonStyler,
  ControlCenterStyler,
} from '@carma/map-control';
import {
  AimOutlined,
  HomeOutlined,
  LoadingOutlined,
  SettingFilled,
  SyncOutlined,
  ShrinkOutlined,
  MenuOutlined,
  PlusOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import GoogleMapIframe from './components/GoogleMapIframe';
import DemoExcalidraw from './components/DemoExcalidraw';
import InfoBox from 'react-cismap/topicmaps/InfoBox';
import GenericInfoBoxFromFeature from 'react-cismap/topicmaps/GenericInfoBoxFromFeature';
import { Divider } from 'antd';

if (typeof global === 'undefined') {
  window.global = window;
}

const iconPadding = {
  backgroundColor: '#fff',
  border: '2px solid rgba(0, 0, 0, .23)',
  borderRadius: '4px',
  width: '34px',
  height: '34px',
  textAlign: 'center',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '18px',
};

function App() {
  const [containerWidth, setContainerWidth] = useState(null);
  const [resonsiveCollapse, setResonsiveCollapse] = useState(null);
  const containerRef = useRef(null);
  const [layoutHeight, setLayoutHeight] = useState(null);

  useEffect(() => {
    document.title = 'Map Wuppertal';
  }, []);

  useEffect(() => {
    if (containerRef) {
      setContainerWidth({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef, layoutHeight]);

  return (
    <TopicMapContextProvider
      appKey="OnlineBaederkarteWuppertal2022"
      featureItemsURL={
        'https://wupp-topicmaps-data.cismet.de/data/baeder.data.json'
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getPoiClusterIconCreatorFunction({ svgSize: 24 }),
      }}
    >
      <ControlLayout
        onResponsiveCollapse={(collapseEvent) => {
          setResonsiveCollapse(collapseEvent);
        }}
        onHeightResize={setLayoutHeight}
        ifStorybook={false}
      >
        <Control position="topleft" order={10}>
          <ControlButtonStyler height="63px" fontSize="14px">
            <PlusOutlined />
            <Divider
              style={{
                marginTop: '0px',
                marginBottom: '0px',
              }}
            />
            <MinusOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topleft" order={30}>
          <ControlButtonStyler>
            <SettingFilled />
          </ControlButtonStyler>
        </Control>
        <Control position="topleft" order={20}>
          <ControlButtonStyler>
            <ShrinkOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topright" order={30}>
          <ControlButtonStyler>
            <MenuOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topcenter" order={30}>
          <div
            style={{
              ...iconPadding,
              fontSize: '14px',
              opacity: 0.9,
              width: '100%',
              maxWidth: '100%',
              height: '100%',
              padding: '5px 4px',
              border: 'none',
              borderRadius: '0px',
            }}
          >
            <div>Center controller</div>
          </div>
        </Control>
        <Control position="bottomleft" order={10} fullCollapseWidth={true}>
          <GazetteerSearchComponent />
        </Control>
        <Control position="bottomright" order={10} fullCollapseWidth={true}>
          <div
            style={{
              width: '300px',
              background: 'white',
              height: '80px',
              padding: '4px',
              fontSize: '12px',
              opacity: '0.9',
            }}
          >
            Info Box
          </div>
        </Control>
        <Main ref={containerRef}>
          <Map mapStyle={containerWidth} />
        </Main>
      </ControlLayout>
      {/* <Map /> */}
    </TopicMapContextProvider>
  );
}

export default App;
