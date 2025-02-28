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
import {
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";
import { getGazData } from "./helper/gazData";

const EMobiKarte = () => {
  // const [gazData, setGazData] = useState([]);
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
  // useEffect(() => {
  //   getGazData(setGazData);
  // }, []);

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

  const { gazData } = useGazData();
  const { setSelection } = useSelection();

  useSelectionTopicMap();

  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
    setTimeout(() => {
      console.log("xxx selection", selection);
      const gazId = selection.more?.pid || selection.more?.id;
      console.log("xxx gazId", gazId);

      setSelectedFeatureByPredicate(
        (feature) => feature.properties.id === gazId
      );
    }, [100]);
  };

  return (
    <>
      <TopicMapComponent
        gazData={gazData}
        modalMenu={<Menu />}
        locatorControl={true}
        // gazetteerSearchPlaceholder="Ladestation | Stadtteil | Adresse | POI"
        // gazetteerHitTrigger={(hits) => {
        //   if (
        //     (Array.isArray(hits) && hits[0]?.more?.pid) ||
        //     hits[0]?.more?.id
        //   ) {
        //     console.log("xxx hits data", hits);
        //     const gazId = hits[0]?.more?.pid || hits[0]?.more?.id;
        //     console.log("xxx gazId", hits);

        //     setSelectedFeatureByPredicate(
        //       (feature) => feature.properties.id === gazId
        //     );
        //   }
        // }}
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
        <TopicMapSelectionContent />

        <FeatureCollection></FeatureCollection>
        {secondaryInfoVisible && (
          <SecondaryInfoModal
            feature={selectedFeature}
            setOpen={setSecondaryInfoVisible}
          />
        )}
      </TopicMapComponent>
      <div className="custom-left-control">
        <LibFuzzySearch
          gazData={gazData}
          onSelection={onGazetteerSelection}
          placeholder="Ladestation | Stadtteil | Adresse | POI"
        />
      </div>
    </>
  );
};

export default EMobiKarte;
