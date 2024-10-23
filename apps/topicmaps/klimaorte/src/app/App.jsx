import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import { MappingConstants } from "react-cismap";
import Icon from "react-cismap/commons/Icon";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";
import { getClusterIconCreatorFunction } from "react-cismap/tools/uiHelper";
import "react-cismap/topicMaps.css";
import "./App.css";
import itemFilterFunction from "./helper/filter";
import convertBPKlimaItemsToFeature from "./helper/itemConverter";
import KlimaorteMap from "./KlimaorteMap";
import createItemsDictionary from "./helper/createItemsDictionary";
import getKlimaOrtkarteStyler from "./helper/styler";
import deriveSecondarySelection from "./helper/deriveSecondarySelection";
import { md5FetchJSON } from "react-cismap/tools/fetching";
export const dataHost = "https://wupp-topicmaps-data.cismet.de";

const appKey = "Klimaortkarte.TopicMap";
const getPOIColors = async (setPoiColors) => {
  md5FetchJSON("poi_colors", dataHost + "/data/poi.farben.json").then(
    (data) => {
      setPoiColors(data);
    },
  );
};

const getConvertBPKlimaItemsToFeature = (poiColors) => {
  return (item, poiColors) => {
    return convertBPKlimaItemsToFeature(item, poiColors);
  };
};

function App() {
  const [poiColors, setPoiColors] = useState();
  useEffect(() => {
    getPOIColors(setPoiColors);
    document.title = "Klimaortkarte Wuppertal";
  }, []);

  return (
    <TopicMapContextProvider
      appKey={appKey}
      featureTooltipFunction={(feature) => feature?.text}
      featureItemsURL={dataHost + "/data/klimaortkarte.data.2.json"}
      featureItemsURL__={"/data/klimaortkarte.data.json"}
      createFeatureItemsDictionary={createItemsDictionary}
      deriveSecondarySelection={deriveSecondarySelection}
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getKlimaOrtkarteStyler}
      convertItemToFeature={getConvertBPKlimaItemsToFeature(poiColors)}
      clusteringEnabled={true}
      itemFilterFunction={itemFilterFunction}
      classKeyFunction={(item) => item.thema?.name}
      getColorFromProperties={(item) => item?.thema?.farbe}
      additionalLayerConfiguration={{
        fernwaerme: {
          title: (
            <span>
              Fernwärme{" "}
              <Icon
                style={{
                  color: "#EEB48C",
                  width: "30px",
                  textAlign: "center",
                }}
                name={"circle"}
              />
            </span>
          ),
          initialActive: true,
          layer: (
            <StyledWMSTileLayer
              key={"fernwaermewsw"}
              url="https://maps.wuppertal.de/infra"
              layers="fernwaermewsw"
              format="image/png"
              tiled="true"
              transparent="true"
              maxZoom={19}
              opacity={0.7}
            />
          ),
        },
      }}
      clusteringOptions={{
        iconCreateFunction: getClusterIconCreatorFunction(
          30,
          (props) => props.color,
        ),
        disableClusteringAtZoom: 20,
      }}
    >
      <KlimaorteMap />
    </TopicMapContextProvider>
  );
}

export default App;
