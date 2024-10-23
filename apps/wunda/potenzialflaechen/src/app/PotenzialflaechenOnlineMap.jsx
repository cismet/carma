import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import React, { useContext, useEffect } from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import { FeatureCollectionDispatchContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import {
  TopicMapContext,
  TopicMapDispatchContext,
} from "react-cismap/contexts/TopicMapContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { defaultLayerConf } from "react-cismap/tools/layerFactory";
import { removeQueryPart } from "react-cismap/tools/routingHelper";
import "react-cismap/topicMaps.css";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import "./App.css";
import FeatureCollection from "./components/FeatureCollection";
import InfoBox from "./components/InfoBox";
import MyMenu from "./components/Menu";
import InfoPanel from "./components/SecondaryInfo";
import {
  searchTextPlaceholder,
  MenuTooltip,
  InfoBoxTextTitle,
  InfoBoxTextContent,
} from "@carma-collab/wuppertal/potenzialflaechen-online";

// import consolere from "console-remote-client";

// consolere.connect({
//   server: "http://bender:8088",
//   channel: "pf", // required
//   redirectDefaultConsoleToRemote: false, // optional, default: false
//   disableDefaultConsoleOutput: false, // optional, default: false
// });

// console.re.log("S T A R T");

const baseLayerConf = { ...defaultLayerConf };
baseLayerConf.namedLayers.cismetLight = {
  type: "vector",
  style: "https://omt.map-hosting.de/styles/cismet-light/style.json",
};

export const appKey = "Potenzialflaechen.Online.Wuppertal";

function PotenzialflaechenOnlineMap({ gazData, jwt, setJWT, setLoginInfo }) {
  const { setSelectedFeatureByPredicate, setFilterState } = useContext(
    FeatureCollectionDispatchContext,
  );
  const { zoomToFeature } = useContext(TopicMapDispatchContext);
  const { history } = useContext(TopicMapContext);
  const { setAppMenuActiveMenuSection, setAppMenuVisible } =
    useContext(UIDispatchContext);

  useEffect(() => {
    const handleCleanStart = (search) => {
      const foundCleanStart =
        new URLSearchParams(search).get("cleanStart") != null;
      if (foundCleanStart === true) {
        let newSearch = removeQueryPart(search, "cleanStart");
        history.push(newSearch);
        setFilterState({ kampagnen: [] });
        setAppMenuVisible(true);
        setTimeout(() => {
          setAppMenuActiveMenuSection("filter");
        }, 50);
      }
    };
    handleCleanStart(history.location.search);
    return history.listen(() => {
      handleCleanStart(history.location.search);
    });
  }, [history, setFilterState, setAppMenuVisible, setAppMenuActiveMenuSection]);

  return (
    <TopicMapComponent
      mapStyle={{ backgroundColor: "white" }}
      applicationMenuTooltipString={<MenuTooltip />}
      gazData={gazData}
      homeZoom={13}
      maxZoom={22}
      locatorControl={true}
      gazetteerSearchPlaceholder={searchTextPlaceholder}
      modalMenu={<MyMenu />}
      infoBox={
        <InfoBox
          pixelwidth={350}
          config={{
            displaySecondaryInfoAction: true,
            city: "Wuppertal",
            navigator: {
              noun: {
                singular: "Potenzialfläche",
                plural: "Potenzialflächen",
              },
            },
            noCurrentFeatureTitle: <InfoBoxTextTitle />,
            noCurrentFeatureContent: <InfoBoxTextContent />,
          }}
        />
      }
      secondaryInfo={<InfoPanel />}
      gazetteerHitTrigger={(hits) => {
        if (Array.isArray(hits) && hits[0]?.more?.pid) {
          setSelectedFeatureByPredicate((feature) => {
            try {
              const check =
                parseInt(feature.properties.id) === hits[0].more.pid;
              if (check === true) {
                zoomToFeature(feature);
              }
              return check;
            } catch (e) {
              return false;
            }
          });
        }
      }}
    >
      <FeatureCollection
        jwt={jwt}
        setJWT={setJWT}
        setLoginInfo={setLoginInfo}
      />
      {/* <LogSelection /> */}
    </TopicMapComponent>
  );
}

export default PotenzialflaechenOnlineMap;
