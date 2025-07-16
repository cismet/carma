import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import { useContext, useEffect, useState } from "react";
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
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  searchTextPlaceholder,
  MenuTooltip,
  InfoBoxTextTitle,
  InfoBoxTextContent,
} from "@carma-collab/wuppertal/potenzialflaechen-online";
import {
  defaultTypeInference,
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";

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

function PotenzialflaechenOnlineMap({
  staticGazData,
  dynGazData,
  jwt,
  setJWT,
  setLoginInfo,
}) {
  const [allGAazData, setAllGazData] = useState([]);

  const { setSelectedFeatureByPredicate, setFilterState } = useContext(
    FeatureCollectionDispatchContext
  );
  const { zoomToFeature } = useContext(TopicMapDispatchContext);
  const { history } = useContext(TopicMapContext);
  const { setAppMenuActiveMenuSection, setAppMenuVisible } =
    useContext(UIDispatchContext);

  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );

  const { gazData } = useGazData();
  const { setSelection } = useSelection();

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

  useEffect(() => {
    setAllGazData([
      ...(dynGazData || []),
      ...staticGazData,
      ...(gazData || []),
    ]);
  }, [staticGazData, dynGazData, gazData]);

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
      const gazId = selection.more?.pid;
      setSelectedFeatureByPredicate((feature) => {
        try {
          const check = parseInt(feature.properties.id) === gazId;
          if (check === true) {
            zoomToFeature(feature);
          }
          return check;
        } catch (e) {
          return false;
        }
      });
    }, 100);
  };

  return (
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
      <ControlLayout ifStorybook={false}>
        <Control position="topleft" order={10}>
          <ZoomControl />
        </Control>

        <Control position="topleft" order={50}>
          <FullscreenControl />
        </Control>
        <Control position="topleft" order={60} title="Mein Standort">
          <RoutedMapLocateControl
            tourRefLabels={null}
            disabled={false}
            nativeTooltip={true}
          />
        </Control>
        <Control position="bottomleft" order={10}>
          <div style={{ marginTop: "4px" }}>
            <LibFuzzySearch
              key={"PotenzialflaechenOnlineMap" + allGAazData.length}
              gazData={allGAazData}
              onSelection={onGazetteerSelection}
              pixelwidth={
                responsiveState === "normal" ? "300px" : windowSize.width - gap
              }
              placeholder={searchTextPlaceholder}
              priorityTypes={[
                "gewerbe",
                "wohnbau",
                "wiedernutzung",
                "baulucke",
                "brachflache",
                "restpot",
                "adressen",
                "streets",
                "bezirke",
                "quartiere",
                "pois",
                "poisAlternativeNames",
                "schulen",
                "kitas",
              ]}
              typeInference={{
                ...defaultTypeInference,
                potflaechegazdata: (item) => {
                  if (item.overlay === "G") {
                    return "gewerbe";
                  } else if (item.overlay === "W") {
                    return "wohnbau";
                  } else if (item.overlay === "N") {
                    return "wiedernutzung";
                  } else if (item.overlay === "L") {
                    return "baulucke";
                  } else if (item.overlay === "B") {
                    return "brachflache";
                  } else {
                    return "restpot";
                  }
                },
              }}
            />
          </div>
        </Control>
        <TopicMapComponent
          mapStyle={{ backgroundColor: "white" }}
          applicationMenuTooltipString={<MenuTooltip />}
          homeZoom={13}
          maxZoom={22}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          gazetteerSearchControl={true}
          gazetteerSearchComponent={EmptySearchComponent}
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
        >
          <TopicMapSelectionContent />
          <FeatureCollection
            jwt={jwt}
            setJWT={setJWT}
            setLoginInfo={setLoginInfo}
          />
          {/* <LogSelection /> */}
        </TopicMapComponent>
      </ControlLayout>
    </div>
  );
}

export default PotenzialflaechenOnlineMap;
