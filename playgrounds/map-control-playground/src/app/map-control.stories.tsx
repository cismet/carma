import type { Meta, StoryObj } from '@storybook/react';
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
} from '@carma/map-control';
import {
  AimOutlined,
  HomeOutlined,
  LoadingOutlined,
  SettingFilled,
  SmileOutlined,
  SyncOutlined,
  ShrinkOutlined,
  MinusOutlined,
  PlusOutlined,
  ExclamationCircleOutlined,
  MenuOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import GoogleMapIframe from './components/GoogleMapIframe';
import DemoExcalidraw from './components/DemoExcalidraw';
import InfoBox from 'react-cismap/topicmaps/InfoBox';
import GenericInfoBoxFromFeature from 'react-cismap/topicmaps/GenericInfoBoxFromFeature';

if (typeof global === 'undefined') {
  window.global = window;
}

const meta: Meta<typeof Map> = {
  component: Map,
  title: 'MapControl',
};
export default meta;
type Story = StoryObj<typeof Map>;

const MapWithProviders = () => {
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
      <Map />
    </TopicMapContextProvider>
  );
};

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

const LocateControl = ({ startLocate = 0 }) => {
  const { routedMapRef } = useContext(TopicMapContext);
  const [locationInstance, setLocationInstance] = useState(null);

  useEffect(() => {
    if (!locationInstance && routedMapRef) {
      const mapExample = routedMapRef.leafletMap.leafletElement;
      const lc = L.control
        .locate({
          position: 'topright',
          strings: {
            title: 'demo location',
          },
          flyTo: true,
          drawMarker: false,
          icon: 'custom_icon',
        })
        .addTo(mapExample);
      setLocationInstance(lc);
    }

    // return () => {
    //   lc.remove();
    // };
  }, [routedMapRef]);

  useEffect(() => {
    if (startLocate) {
      locationInstance.start();
    }
  }, [startLocate]);

  return null;
};

export const ReplaceLocatorFromLeaflet = () => {
  const [locationProps, setLocationProps] = useState(0);
  const [containerHeight, setContainerHeight] = useState(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerHeight({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef]);
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
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: 24,
        }),
      }}
    >
      <ControlLayout>
        <Control position="topleft" order={30}>
          <ControlButtonStyler>
            <AimOutlined onClick={() => setLocationProps((prev) => prev + 1)} />
          </ControlButtonStyler>
          <LocateControl startLocate={locationProps} />
        </Control>
        <Main ref={containerRef}>
          <Map mapStyle={containerHeight} />
        </Main>
      </ControlLayout>
    </TopicMapContextProvider>
  );
};

export const ExcalidrawExample = () => {
  const [locationProps, setLocationProps] = useState(0);
  const [containerHeight, setContainerHeight] = useState(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerHeight({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef]);
  return (
    <ControlLayout>
      <Control position="topleft" order={40}>
        <AimOutlined />
      </Control>
      <Control position="topleft" order={30}>
        <SettingFilled />
      </Control>
      <Control position="topleft" order={20}>
        <ShrinkOutlined />
      </Control>
      <Control position="topleft" order={10}>
        <PlusOutlined />
      </Control>
      <Control position="topright" order={1}>
        <SyncOutlined />
      </Control>
      <Control position="topright" order={40}>
        <AimOutlined />
      </Control>
      <Control position="topright" order={30}>
        <SettingFilled />
      </Control>
      <Control position="bottomright" order={20}>
        <ShrinkOutlined />
      </Control>
      <Control position="bottomright" order={10}>
        <PlusOutlined />
      </Control>
      <Control position="bottomright" order={1}>
        <HomeOutlined />
      </Control>
      <Control position="bottomleft" order={80}>
        <HomeOutlined />
      </Control>
      <Control position="bottomleft" order={1}>
        <LoadingOutlined />
      </Control>
      <Control position="bottomleft" order={2}>
        <LoadingOutlined />
      </Control>
      <Control position="bottomleft" order={1}>
        <SyncOutlined />
      </Control>
      <Main ref={containerRef}>
        <DemoExcalidraw />
      </Main>
    </ControlLayout>
  );
};

export const ResponsiveControlWithTwoColumns = () => {
  const [containerWidth, setContainerWidth] = useState(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerWidth(containerRef.current?.clientWidth);
    }
  }, [containerRef]);

  return (
    <ControlLayout>
      <Control position="bottomleft" order={1}>
        <div style={{ width: '600px', background: 'red' }}>
          A search component
        </div>
      </Control>
      <Control position="bottomright" order={1}>
        <div
          style={{
            width: '400px',
            background: containerWidth ? 'yellow' : 'blue',
          }}
        >
          Info banner
        </div>
      </Control>
      <Main ref={containerRef}>
        <GoogleMapIframe />
      </Main>
    </ControlLayout>
  );
};

export const ResponsiveCollapsWithTwoColumnsOnBottom = () => {
  const [containerWidth, setContainerWidth] = useState(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerWidth({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef]);
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
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: 24,
        }),
      }}
    >
      <ControlLayout
        onResponsiveCollapse={(collapseEvent) => {
          console.log('xxx', collapseEvent);
        }}
      >
        <Control position="topleft" order={40}>
          <ControlButtonStyler>
            <AimOutlined />
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
        <Control position="bottomleft" order={1}>
          <GazetteerSearchComponent />
        </Control>
        <Control position="bottomright" order={1}>
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
          {/* <GenericInfoBoxFromFeature pixelwidth={300} /> */}
        </Control>

        <Main ref={containerRef}>
          <Map mapStyle={containerWidth} />
        </Main>
      </ControlLayout>
    </TopicMapContextProvider>
  );
};

export const ResponsiveThreeColumnsOnTop = () => {
  const [containerWidth, setContainerWidth] = useState(null);
  const [resonsiveCollapse, setResonsiveCollapse] = useState(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerWidth({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef]);

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
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: 24,
        }),
      }}
    >
      <ControlLayout
        onResponsiveCollapse={(collapseEvent) => {
          setResonsiveCollapse(collapseEvent);
        }}
      >
        <Control position="topleft" order={40}>
          <ControlButtonStyler>
            <AimOutlined />
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
            }}
          >
            <div>Center controller</div>
          </div>
        </Control>
        <Main ref={containerRef}>
          <Map mapStyle={containerWidth} />
        </Main>
      </ControlLayout>
    </TopicMapContextProvider>
  );
};

export const ResponsiveAllPosition = () => {
  const [containerWidth, setContainerWidth] = useState(null);
  const [resonsiveCollapse, setResonsiveCollapse] = useState(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerWidth({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef]);

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
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: 24,
        }),
      }}
    >
      <ControlLayout
        onResponsiveCollapse={(collapseEvent) => {
          setResonsiveCollapse(collapseEvent);
        }}
      >
        <Control position="topleft" order={40}>
          <ControlButtonStyler>
            <AimOutlined />
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
            }}
          >
            <div>Center controller</div>
          </div>
        </Control>
        <Control position="bottomleft" order={1}>
          <GazetteerSearchComponent />
        </Control>
        <Control position="bottomright" order={1}>
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

          {/* <GenericInfoBoxFromFeature pixelwidth={300} /> */}
        </Control>
        <Main ref={containerRef}>
          <Map mapStyle={containerWidth} />
        </Main>
      </ControlLayout>
    </TopicMapContextProvider>
  );
};

export const ResponsiveDebugMode = () => {
  const [containerWidth, setContainerWidth] = useState(null);
  const [resonsiveCollapse, setResonsiveCollapse] = useState(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerWidth({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef]);

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
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: 24,
        }),
      }}
    >
      <ControlLayout
        onResponsiveCollapse={(collapseEvent) => {
          setResonsiveCollapse(collapseEvent);
        }}
        debugMode={true}
      >
        <Control position="topleft" order={40}>
          <ControlButtonStyler>
            <AimOutlined />
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
            }}
          >
            <div>Center controller</div>
          </div>
        </Control>
        <Control position="bottomleft" order={1}>
          <GazetteerSearchComponent />
        </Control>
        <Control position="bottomright" order={10}>
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
        <Control position="bottomright" order={20}>
          <div
            style={{
              width: '120px',
              background: 'green',
              height: '80px',
              padding: '4px',
              fontSize: '12px',
              opacity: '0.9',
            }}
          >
            Pic Box
          </div>
        </Control>
        <Control position="bottomright" order={20}>
          <div
            style={{
              width: '50px',
              background: 'yellow',
              height: '80px',
              padding: '4px',
              fontSize: '12px',
              opacity: '0.9',
            }}
          >
            New Box
          </div>
        </Control>
        <Main ref={containerRef}>
          <Map mapStyle={containerWidth} />
        </Main>
      </ControlLayout>
    </TopicMapContextProvider>
  );
};
