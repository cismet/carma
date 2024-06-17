import type { Meta, StoryObj } from '@storybook/react';
import React, { useEffect, useContext, useState } from 'react';
import { MappingConstants } from 'react-cismap';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';

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
import { ControlLayout, Control, Main } from '@carma/map-control';

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

export const SimpleExample = () => {
  return <MapWithProviders />;
};

const LocateControl = ({ startLocate = false }) => {
  console.log('yyy');
  const { routedMapRef } = useContext(TopicMapContext);
  const [locationInstance, setLocationInstance] = useState(null);

  useEffect(() => {
    if (!locationInstance && routedMapRef) {
      console.log('yyy', routedMapRef.leafletMap.leafletElement);
      const mapExample = routedMapRef.leafletMap.leafletElement;
      const lc = L.control
        .locate({
          position: 'topright',
          strings: {
            title: 'Show me where I am!',
          },
          flyTo: true,
        })
        .addTo(mapExample);
      setLocationInstance(lc);
    }

    //   return () => {
    //     lc.remove();
    //   };
  }, [routedMapRef]);

  // useEffect(() => {
  //   if (startLocate && locateControlRef.current) {
  //     locateControlRef.current.start();
  //   }
  // }, [startLocate]);

  return null;
};

export const SimpleLayout = () => {
  return (
    <ControlLayout>
      <Control position="topright" order={30}>
        <div>L</div>
      </Control>

      <Main>
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
          <Map />
          <LocateControl />
        </TopicMapContextProvider>
      </Main>
    </ControlLayout>
  );
};
