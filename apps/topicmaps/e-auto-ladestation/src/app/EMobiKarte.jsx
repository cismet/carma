import React from "react";
import { useContext, useEffect, useState } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { LightBoxContext } from "react-cismap/contexts/LightBoxContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";

import Menu from "./Menu";
import { getPoiClusterIconCreatorFunction } from "./helper/styler";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import {
  UIContext,
  UIDispatchContext,
} from "react-cismap/contexts/UIContextProvider";
import SecondaryInfoModal from "./SecondaryInfoModal";
import { getGazData } from "./helper/gazData";

const EMobiKarte = () => {
  const [gazData, setGazData] = useState([]);
  const {
    setSelectedFeatureByPredicate,
    setClusteringOptions,
    setFilterState,
  } = useContext(FeatureCollectionDispatchContext);
  const { secondaryInfoVisible } = useContext(UIContext);
  const { setSecondaryInfoVisible } = useContext(UIDispatchContext);
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions, selectedFeature, filteredItems, shownFeatures } =
    useContext(FeatureCollectionContext);
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

  useEffect(() => {
    setFilterState({
      nur_online: false,
      oeffnungszeiten: "*",
      stecker: undefined,
      nur_gruener_strom: false,
      nur_schnelllader: false,
    });
  }, []);

  return (
    <TopicMapComponent
      gazData={gazData}
      modalMenu={<Menu />}
      locatorControl={true}
      gazetteerSearchPlaceholder="Ladestation | Stadtteil | Adresse | POI"
      gazetteerHitTrigger={(hits) => {
        if ((Array.isArray(hits) && hits[0]?.more?.pid) || hits[0]?.more?.id) {
          const gazId = hits[0]?.more?.pid || hits[0]?.more?.id;
          setSelectedFeatureByPredicate(
            (feature) => feature.properties.id === gazId,
          );
        }
      }}
      applicationMenuTooltipString="Filter | Einstellungen | Kompaktanleitung"
      infoBox={
        <GenericInfoBoxFromFeature
          pixelwidth={350}
          config={{
            displaySecondaryInfoAction: true,
            city: "Wuppertal",
            navigator: {
              noun: {
                singular: "Ladestation",
                plural: "Ladestationen",
              },
            },
            noCurrentFeatureTitle: "Keine Ladestationen gefunden",
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
      <FeatureCollection></FeatureCollection>
      {secondaryInfoVisible && (
        <SecondaryInfoModal
          feature={selectedFeature}
          setOpen={setSecondaryInfoVisible}
        />
      )}
    </TopicMapComponent>
  );
};

export default EMobiKarte;
