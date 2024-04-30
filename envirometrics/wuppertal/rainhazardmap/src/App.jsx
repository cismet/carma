import React, { useEffect, useState } from 'react';
import { MappingConstants } from 'react-cismap';
import TopicMapContextProvider from 'react-cismap/contexts/TopicMapContextProvider';
import { md5FetchText } from 'react-cismap/tools/fetching';
import HeavyRainHazardMap from '@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap';
import GenericModalApplicationMenu from 'react-cismap/topicmaps/menu/ModalApplicationMenu';
import Datengrundlage from './help/Help10Datengrundlage';
import Karteninhalt from './help//Help20Karteninhalt';
import InKartePositionieren from './help/Help30InKartePositionieren';
import MeinStandort from './help/Help40MeinStandort';
import ZeitlicherVerlauf from './help/Help45ZeitlicherVerlauf';
import WasserstandAbfragen from './help/Help50WasserstandAbfragen';
import SimulierteSzenarien from './help/Help60SimulierteSzenarien';
import Aussagekraft from './help/Help70AussagekraftDerSimulationen';
import ModellfehlerMelden from './help//Help80ModellfehlerMelden';
import Haftungsausschluss from './help/Help90HaftungsausschlussWupp';
import Footer from '@cismet-dev/react-cismap-envirometrics-maps/components/customizablehelp/Help99Footer';
import { getGazDataForTopicIds } from 'react-cismap/tools/gazetteerHelper';
import { md5FetchJSON } from 'react-cismap/tools/fetching';

import config from './config';
import { getApplicationVersion } from './version';
import NotesDisplay from './NotesDisplay';

function App() {
  const email = 'starkregen@stadt.wuppertal.de';
  const [gazData, setGazData] = useState([]);
  const [hinweisData, setHinweisData] = useState([]);

  const getGazData = async (setData) => {
    const prefix = 'GazDataForStarkregengefahrenkarteByCismet';
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

  const getHinweisData = async (setHinweisData, url) => {
    const prefix = 'HinweisDataForStarkregengefahrenkarteByCismet';
    const data = await md5FetchJSON(prefix, url);

    const features = [];
    let id = 1;
    for (const d of data) {
      features.push({
        type: 'Feature',
        id: id++,
        properties: d,
        geometry: d.geojson,
        crs: {
          type: 'name',
          properties: {
            name: 'urn:ogc:def:crs:EPSG::25832',
          },
        },
      });
    }
    console.log('yy hinweisData', features);

    setHinweisData(features || []);
  };

  useEffect(() => {
    getGazData(setGazData);
    getHinweisData(setHinweisData, config.config.hinweisDataUrl);
  }, []);

  return (
    <TopicMapContextProvider
      appKey={'cismetRainhazardMap.Wuppertal'}
      referenceSystem={MappingConstants.crs3857}
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      infoBoxPixelWidth={370}
    >
      <HeavyRainHazardMap
        applicationMenuTooltipString="Anleitung | Hintergrund"
        appMenu={
          <GenericModalApplicationMenu
            menuIntroduction={
              <span>
                Bitte wählen Sie eine der folgenden farbigen Schaltflächen, um
                sich weitere Informationen zu dem entsprechenden Thema anzeigen
                zu lassen:
              </span>
            }
            menuIcon="info"
            menuTitle="Kompaktanleitung und Hintergrundinformationen"
            menuSections={[
              <Datengrundlage key="Datengrundlage" />,
              <Karteninhalt
                key="Karteninhalt"
                simulationsklammer={undefined}
              />,
              <InKartePositionieren key="InKartePositionieren" />,
              <MeinStandort key="MeinStandort" />,
              <ZeitlicherVerlauf key="ZeitlicherVerlauf" />,
              <WasserstandAbfragen key="Wasserstand" />,
              <SimulierteSzenarien key="SimulierteSzenarien" />,
              <Aussagekraft key="Aussagekraft" />,
              <ModellfehlerMelden key="ModellfehlerMelden" email={email} />,
              <Haftungsausschluss key="Haftungsausschluss" />,
            ]}
            menuFooter={
              <Footer
                appName="Starkregengefahrenkarte Wuppertal"
                version={getApplicationVersion()}
                hintergrundkartenText="True Orthophoto 2022, Amtliche Basiskarte (ABK), Hillshade © Stadt Wuppertal | Stadtkarte 2.0 © RVR | WebAtlasDE © BKG"
                taglineModelling={
                  <div>
                    <b>Modellierung und Simulationsberechnung</b> (Version 2.1 |
                    10/2022):{' '}
                    <a
                      target="_customer"
                      href="https://www.wsw-online.de/wsw-energie-wasser/privatkunden/"
                    >
                      WSW Energie und Wasser AG
                    </a>{' '}
                    |{' '}
                    <a target="_pecher" href="https://www.pecher.de/">
                      Dr. Pecher AG (Erkrath)
                    </a>
                  </div>
                }
              />
            }
          />
        }
        gazetteerSearchPlaceholder="Stadtteil | Adresse | POI | GEP"
        emailaddress={email}
        initialState={config.initialState}
        config={config.config}
        homeZoom={18}
        homeCenter={[51.27202324060668, 7.20162372978018]}
        modeSwitcherTitle="Starkregengefahrenkarte"
        documentTitle="Starkregengefahrenkarte Wuppertal"
        gazData={gazData}
      >
        <NotesDisplay hinweisData={hinweisData} />
      </HeavyRainHazardMap>
    </TopicMapContextProvider>
  );
}

export default App;
