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
import Menu from './Menu';
import SecondaryInfoModal from './SecondaryInfoModal';
import {
  UIContext,
  UIDispatchContext,
} from 'react-cismap/contexts/UIContextProvider';

const Map = () => {
  const [gazData, setGazData] = useState([]);
  const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext(
    FeatureCollectionDispatchContext
  );
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions, selectedFeature } = useContext(
    FeatureCollectionContext
  );
  const { secondaryInfoVisible } = useContext(UIContext);
  const { setSecondaryInfoVisible } = useContext(UIDispatchContext);
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
      gazetteerSearchPlaceholder="Ladestation | Verleih | Adresse"
      gazetteerHitTrigger={(hits) => {
        if ((Array.isArray(hits) && hits[0]?.more?.pid) || hits[0]?.more?.kid) {
          const gazId = hits[0]?.more?.pid || hits[0]?.more?.kid;
          setSelectedFeatureByPredicate(
            (feature) => feature.properties.id === gazId
          );
        }
      }}
      applicationMenuTooltipString="Filter | Einstellungen | Kompaktanleitung"
      infoBox={
        <GenericInfoBoxFromFeature
          pixelwidth={350}
          config={{
            displaySecondaryInfoAction: true,
            city: 'Wuppertal',
            navigator: {
              noun: {
                singular: 'Sation',
                plural: 'Stationen',
              },
            },
            noCurrentFeatureTitle: 'Keine Stationen gefunden',
            noCurrentFeatureContent: (
              <span>
                Für mehr Ladestationen Ansicht mit verkleinern oder mit dem
                untenstehenden Link auf das komplette Stadtgebiet zoomen.
              </span>
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
