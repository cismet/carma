import React, { useContext, useEffect, useState } from 'react';
import { MappingConstants } from 'react-cismap';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';
import { md5FetchText } from 'react-cismap/tools/fetching';
import EnviroMetricMap from '@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMap';
import { getGazDataForTopicIds } from 'react-cismap/tools/gazetteerHelper';

import GenericModalApplicationMenu from 'react-cismap/topicmaps/menu/ModalApplicationMenu';
import { version as cismapEnvirometricsVersion } from '@cismet-dev/react-cismap-envirometrics-maps/meta';
import CrossTabCommunicationControl from 'react-cismap/CrossTabCommunicationControl';
import CrossTabCommunicationContextProvider from 'react-cismap/contexts/CrossTabCommunicationContextProvider';

import config from './config';

import { getApplicationVersion } from './version';
import NotesDisplay from './NotesDisplay';
import { EnviroMetricMapContext } from '@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMapContextProvider';
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';
// import { getCollabedHelpComponentConfig } from '@cismet-collab/flooding-wupp-texts';

function App() {
  console.log('xxx');

  const reactCismapEnvirometricsVersion = cismapEnvirometricsVersion;
  const version = getApplicationVersion();
  const [hochwasserschutz, setHochwasserschutz] = useState(true);

  const email = 'hochwasser@stadt.wuppertal.de';
  const [gazData, setGazData] = useState([]);
  const [hinweisData, setHinweisData] = useState([]);

  const getGazData = async (setData) => {
    const prefix = 'GazDataForHochwasserkarteByCismet';
    const sources = {};

    sources.geps = await md5FetchText(
      prefix,
      'https://wunda-geoportal.cismet.de/data/3857/geps.json'
    );
    sources.geps_reverse = await md5FetchText(
      prefix,
      'https://wunda-geoportal.cismet.de/data/3857/geps_reverse.json'
    );
    sources.adressen = await md5FetchText(
      prefix,
      'https://wunda-geoportal.cismet.de/data/3857/adressen.json'
    );
    sources.bezirke = await md5FetchText(
      prefix,
      'https://wunda-geoportal.cismet.de/data/3857/bezirke.json'
    );
    sources.quartiere = await md5FetchText(
      prefix,
      'https://wunda-geoportal.cismet.de/data/3857/quartiere.json'
    );
    sources.pois = await md5FetchText(
      prefix,
      'https://wunda-geoportal.cismet.de/data/3857/pois.json'
    );
    sources.kitas = await md5FetchText(
      prefix,
      'https://wunda-geoportal.cismet.de/data/3857/kitas.json'
    );

    const gazData = getGazDataForTopicIds(sources, [
      'geps',
      'geps_reverse',
      'pois',
      'kitas',
      'quartiere',
      'bezirke',
      'adressen',
    ]);

    setData(gazData);
  };

  useEffect(() => {
    getGazData(setGazData);
    // getHinweisData(setHinweisData, config.config.hinweisDataUrl);
  }, []);

  return (
    <CrossTabCommunicationContextProvider
      role="sync"
      token="floodingAndRainhazardSyncWupp"
    >
      <TopicMapContextProvider
        appKey={'Hochwasserkarte.Story.Wuppertal'}
        referenceSystem={MappingConstants.crs3857}
        referenceSystemDefinition={MappingConstants.proj4crs3857def}
        // baseLayerConf={wuppertalConfig.overridingBaseLayerConf}
        infoBoxPixelWidth={370}
      >
        <EnviroMetricMap
          // appMenu={
          //   <GenericModalApplicationMenu
          //     {...getCollabedHelpComponentConfig({
          //       version,
          //       reactCismapRHMVersion: reactCismapEnvirometricsVersion,

          //       email,
          //     })}
          //   />
          // }
          applicationMenuTooltipString="Anleitung | Hintergrund"
          initialState={config.initialState}
          emailaddress="hochwasser@stadt.wuppertal.de"
          config={config.config}
          homeZoom={18}
          contactButtonEnabled={false}
          homeCenter={[51.27202324060668, 7.20162372978018]}
          modeSwitcherTitle="Hochwassergefahrenkarte Wuppertal"
          documentTitle="Hochwassergefahrenkarte Wuppertal"
          gazData={gazData}
          gazetteerSearchPlaceholder="Stadtteil | Adresse | POI | GEP"
          animationEnabled={false}
          toggleEnabled={true}
          customInfoBoxToggleState={hochwasserschutz}
          customInfoBoxToggleStateSetter={setHochwasserschutz}
          customInfoBoxDerivedToggleState={(toggleState, state) =>
            state.selectedSimulation !== 2 && toggleState
          }
          customInfoBoxDerivedToggleClickable={(controlState) => {
            return controlState.selectedSimulation !== 2;
          }}
        >
          <CrossTabCommunicationControl hideWhenNoSibblingIsPresent={true} />
          <StateAwareChildren />
        </EnviroMetricMap>
      </TopicMapContextProvider>
    </CrossTabCommunicationContextProvider>
  );
}

const StateAwareChildren = () => {
  const { controlState } = useContext(EnviroMetricMapContext);
  const conf = config.config;
  const state = controlState;

  return (
    <>
      {controlState.customInfoBoxToggleState &&
        state.selectedSimulation !== 2 && <NotesDisplay />}
      {controlState.customInfoBoxToggleState === false &&
        conf.simulations[state.selectedSimulation].gefaehrdungsLayer && (
          <StyledWMSTileLayer
            key={
              'rainHazardMap.depthLayer' +
              conf.simulations[state.selectedSimulation].gefaehrdungsLayer +
              '.' +
              state.selectedBackground
            }
            url={conf.modelWMS}
            layers={
              conf.simulations[state.selectedSimulation].gefaehrdungsLayer
            }
            version="1.1.1"
            transparent="true"
            format="image/png"
            tiled={true}
            styles={conf.simulations[state.selectedSimulation].depthStyle}
            maxZoom={22}
            opacity={0.8}
          />
        )}
    </>
  );
};

export default App;
