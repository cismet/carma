import React from "react";
import { useContext, useEffect, useState } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { LightBoxContext } from "react-cismap/contexts/LightBoxContextProvider";
import {
  TopicMapStylingContext,
  TopicMapStylingDispatchContext,
} from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";

import {
  fotoKraemerCaptionFactory,
  fotoKraemerUrlManipulation,
  getGazData,
  getPOIColors,
} from "./helper/helper";
import { getPoiClusterIconCreatorFunction } from "./helper/styler";
import Menu from "./Menu";

const Stadtplankarte = ({ poiColors }) => {
  const [gazData, setGazData] = useState([]);
  const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext(
    FeatureCollectionDispatchContext
  );
  const lightBoxContext = useContext(LightBoxContext);
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions, selectedFeature } = useContext(
    FeatureCollectionContext
  );
  useEffect(() => {
    getGazData(setGazData);
  }, []);

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: markerSymbolSize,
          poiColors,
        }),
      });
    }
  }, [markerSymbolSize]);

  return (
    <TopicMapComponent
      gazData={gazData}
      modalMenu={<Menu />}
      locatorControl={true}
      gazetteerSearchPlaceholder="Stadtteil | Adresse | POI"
      gazetteerHitTrigger={(hits) => {
        if ((Array.isArray(hits) && hits[0]?.more?.pid) || hits[0]?.more?.kid) {
          const gazId = hits[0]?.more?.pid || hits[0]?.more?.kid;
          setSelectedFeatureByPredicate(
            (feature) => feature.properties.id === gazId
          );
        }
      }}
      applicationMenuTooltipString="Themenstadtplan | Einstellungen | Kompaktanleitung"
      infoBox={
        <GenericInfoBoxFromFeature
          pixelwidth={350}
          config={{
            displaySecondaryInfoAction: false,
            city: "Wuppertal",
            navigator: {
              noun: {
                singular: "POI",
                plural: "POIs",
              },
            },
            noCurrentFeatureTitle: "Keine POIs gefunden",
            noCurrentFeatureContent: (
              <span>
                Für mehr POI Ansicht mit verkleinern. Um nach Themenfeldern zu
                filtern, das Menü öffnen.
              </span>
            ),
          }}
          photoUrlManipulation={fotoKraemerUrlManipulation}
          captionFactory={fotoKraemerCaptionFactory}
        />
      }
    >
      <FeatureCollection></FeatureCollection>
    </TopicMapComponent>
  );
};

export default Stadtplankarte;
