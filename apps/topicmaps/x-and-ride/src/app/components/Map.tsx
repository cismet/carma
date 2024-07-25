import { useContext, useEffect, useState } from 'react';
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from 'react-cismap/contexts/FeatureCollectionContextProvider';
import { TopicMapStylingContext } from 'react-cismap/contexts/TopicMapStylingContextProvider';
import FeatureCollection from 'react-cismap/FeatureCollection';
import TopicMapComponent from 'react-cismap/topicmaps/TopicMapComponent';
import GenericInfoBoxFromFeature from 'react-cismap/topicmaps/GenericInfoBoxFromFeature';
import { getGazData } from '../../helper/gazData';
import { getPoiClusterIconCreatorFunction } from '../../helper/styler';
import Icon from 'react-cismap/commons/Icon';
import {
  UIContext,
  UIDispatchContext,
} from 'react-cismap/contexts/UIContextProvider';
import Menu from './Menu';
import SecondaryInfoModal from './menu/SecondaryInfoModal';

const Map = () => {
  const [gazData, setGazData] = useState([]);
  const { setClusteringOptions } = useContext(FeatureCollectionDispatchContext);
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions, selectedFeature } = useContext(
    FeatureCollectionContext
  );
  const { secondaryInfoVisible } = useContext(UIContext);
  const {
    setAppMenuActiveMenuSection,
    setAppMenuVisible,
    setSecondaryInfoVisible,
  } = useContext(UIDispatchContext);

  useEffect(() => {
    getGazData(setGazData);
  }, []);

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: getPoiClusterIconCreatorFunction,
      });
    }
  }, [markerSymbolSize]);

  return (
    <TopicMapComponent
      gazData={gazData}
      modalMenu={<Menu />}
      locatorControl={true}
      photoLightBox
      gazetteerSearchPlaceholder="P+R | B+R | Stadtteil | Adresse | POI"
      applicationMenuTooltipString="Filter | Einstellungen | Kompaktanleitung"
      infoBox={
        <GenericInfoBoxFromFeature
          pixelwidth={350}
          config={{
            displaySecondaryInfoAction: true,
            city: 'Wuppertal',
            navigator: {
              noun: {
                singular: 'Anlage',
                plural: 'Anlagen',
              },
            },
            noFeatureTitle: 'Keine Anlagen gefunden!',
            noCurrentFeatureContent: (
              <p>
                Für mehr Anlagen Ansicht mit <Icon name="minus-square" />{' '}
                verkleinern oder mit untenstehendem Link alle Treffer der
                aktuellen Filterung anzeigen. Ggf. Filtereinstellungen im
                <a
                  onClick={() => {
                    setAppMenuVisible(true);
                    setAppMenuActiveMenuSection('filter');
                  }}
                  className="renderAsLink"
                >
                  {' '}
                  Anwendungsmenü
                  <Icon
                    name="bars"
                    style={{
                      color: 'black',
                    }}
                  />{' '}
                </a>
                zurücksetzen
              </p>
            ),
          }}
        />
      }
    >
      {secondaryInfoVisible && (
        <SecondaryInfoModal
          feature={selectedFeature}
          setOpen={setSecondaryInfoVisible}
        />
      )}
      <FeatureCollection></FeatureCollection>
    </TopicMapComponent>
  );
};

export default Map;
