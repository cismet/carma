import { useContext, useEffect, useState } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import { getGazData } from "../../helper/gazData";
import {
  getAllEinrichtungen,
  getPoiClusterIconCreatorFunction,
} from "../../helper/styler";
import Menu from "./Menu";
import Icon from "react-cismap/commons/Icon";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";

const Map = () => {
  const [gazData, setGazData] = useState([]);
  const {
    setSelectedFeatureByPredicate,
    setClusteringOptions,
    setFilterState,
  } = useContext(FeatureCollectionDispatchContext);
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  // @ts-expect-error legacy codebase exception
  const { clusteringOptions, itemsDictionary } = useContext(
    FeatureCollectionContext,
  );
  const { setAppMenuActiveMenuSection, setAppMenuVisible } =
    useContext(UIDispatchContext);

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
    const einrichtungen = getAllEinrichtungen().map(
      (einrichtung) => einrichtung,
    );
    const veranstaltungen = itemsDictionary?.veranstaltungsarten?.map(
      (veranstaltung) => veranstaltung,
    );
    setFilterState({
      einrichtung: einrichtungen,
      veranstaltung: veranstaltungen,
      mode: "einrichtungen",
    });
  }, [itemsDictionary]);

  return (
    <TopicMapComponent
      gazData={gazData}
      modalMenu={<Menu />}
      locatorControl={true}
      photoLightBox
      gazetteerSearchPlaceholder="Stadtteil | Adresse | POI"
      gazetteerHitTrigger={(hits) => {
        if ((Array.isArray(hits) && hits[0]?.more?.pid) || hits[0]?.more?.kid) {
          const gazId = hits[0]?.more?.pid || hits[0]?.more?.kid;
          setSelectedFeatureByPredicate(
            (feature) => feature.properties.id === gazId,
          );
        }
      }}
      applicationMenuTooltipString="Mein Kulturstadtplan | Einstellungen | Kompaktanleitung"
      infoBox={
        <GenericInfoBoxFromFeature
          pixelwidth={350}
          config={{
            city: "Wuppertal",
            navigator: {
              noun: {
                singular: "POI",
                plural: "POIs",
              },
            },
            noFeatureTitle: "Keine POI gefunden!",
            noCurrentFeatureContent: (
              <p>
                Für mehr POI Ansicht mit <Icon name="minus-square" />{" "}
                verkleinern. Um nach Themenfeldern zu filtern, das
                <a
                  onClick={() => {
                    setAppMenuVisible(true);
                    setAppMenuActiveMenuSection("filter");
                  }}
                  className="renderAsLink"
                >
                  {" "}
                  Men&uuml;&nbsp;
                  <Icon
                    name="bars"
                    style={{
                      color: "black",
                    }}
                  />{" "}
                  &ouml;ffnen.
                </a>
              </p>
            ),
          }}
        />
      }
    >
      <FeatureCollection></FeatureCollection>
    </TopicMapComponent>
  );
};

export default Map;
