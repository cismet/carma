import { useContext, useEffect, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { getGazData } from "./helper/helper";
import { Badge } from "react-bootstrap";
import topoBG from "../assets/map-bg/topo.png";
import citymapBG from "../assets/map-bg/citymap.png";
import mixedBG from "../assets/map-bg/mixed.png";
import {
  removeQueryPart,
  modifyQueryPart,
} from "react-cismap/tools/routingHelper";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import ControlInfoBox from "./ControlInfoBox";
import ResponsiveInfoBox from "react-cismap/topicmaps/ResponsiveInfoBox";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import CismapLayer from "react-cismap/CismapLayer";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../version.json";
import { getCollabedHelpComponentConfig } from "./getCollabedHelpComponentConfig";

import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";

import citymapGrey from "../assets/map-bg/citymapGrey.png";
import citymapBg from "../assets/map-bg/citymap.png";
import orthoBg from "../assets/map-bg/ortho.png";
import DetailsBox from "./DetailsBox";

import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import {
  TopicMapSelectionContent,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { isAreaTypeWithGEP } from "@carma-commons/resources";

const parseSimulationsFromURL = (search) => {
  const params = new URLSearchParams(search);
  const simulationsParam = params.get("simulations");
  if (simulationsParam) {
    return simulationsParam.split(",").map(Number); // Convert to array of integers
  }
  return [0, 1, 2]; // Default value if not found in URL
};

const parseBackgroundIndexFromURL = (search) => {
  const params = new URLSearchParams(search);
  const bgParam = params.get("bg");
  if (bgParam) {
    return parseInt(bgParam, 10); // Convert to integer
  }
  return 0; // Default value if not found in URL
};

const SolarPotentialMap = () => {
  const version = getApplicationVersion(versionData);

  const [selectedFeature, setSelectedFeature] = useState();
  const { history } = useContext(TopicMapContext);
  const { setAppMenuVisible, setAppMenuActiveMenuSection } =
    useContext(UIDispatchContext);
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  const [gazData, setGazData] = useState([]);

  const [simulationLabels, setSimulationLabels] = useState([]);
  const backgrounds = [
    {
      layerkey: "basemap_grey@15",
      src: citymapGrey,
      title: "Basiskarte (grau)",
    },

    {
      layerkey: "basemap_relief@20",
      src: citymapBg,
      title: "Basiskarte (bunt)",
    },
    {
      layerkey: "slDOPcismet2|basemap_grey@20",
      src: orthoBg,
      title: "Luftbildkarte",
    },
  ];
  const [selectedBackgroundIndex, setSelectedBackgroundIndex] = useState(() => {
    return parseBackgroundIndexFromURL(history.location.search);
  });
  const [minifiedInfoBox, setMinifiedInfoBox] = useState(false);

  const legendOpacity = 0.85;
  const legend = [
    {
      title: "niedrig",
      lt: -0.0001,
      bg: "hsla(60, 100%, 50%," + legendOpacity + ")",
    },
    {
      title: "mittel",
      lt: 1.01,
      bg: "hsla(40, 100%, 50%," + legendOpacity + ")",
    },
    {
      title: "hoch",
      lt: 5.01,
      bg: "hsla(20, 100%, 50%," + legendOpacity + ")",
    },
    {
      title: "sehr hoch",
      lt: 10.01,
      bg: "hsla(0, 100%, 50%," + legendOpacity + ")",
    },
  ];

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
      isAreaSelection: isAreaTypeWithGEP(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  useEffect(() => {
    getGazData(setGazData);
  }, []);

  // let info = (

  // );

  let validBackgroundIndex = selectedBackgroundIndex;
  if (validBackgroundIndex >= backgrounds.length) {
    validBackgroundIndex = 0;
  }
  return (
    <>
      {" "}
      <div
        className="controls-container"
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          bottom: "0px",
          zIndex: 600,
        }}
      >
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
            <div className="h-full w-full pl-2">
              <LibFuzzySearch
                gazData={gazData}
                onSelection={onGazetteerSelection}
                pixelwidth={
                  responsiveState === "normal"
                    ? "300px"
                    : windowSize.width - gap
                }
                placeholder="Adresssuche"
              />
            </div>
          </Control>
        </ControlLayout>
      </div>
      <TopicMapComponent
        homeZoom={13}
        homeCenter={[49.31780796845044, 6.75342544913292]}
        // modeSwitcherTitle="Solarpotenzial Saarlouis"
        // documentTitle="Solarpotenzial Saarlouis"
        backgroundlayers={backgrounds[validBackgroundIndex].layerkey}
        applicationMenuIconname="info"
        // backgroundlayers="empty"
        infoBox={
          <ControlInfoBox
            pixelwidth={350}
            simulationLabels={simulationLabels}
            backgrounds={backgrounds}
            selectedBackgroundIndex={selectedBackgroundIndex}
            setBackgroundIndex={(index) => {
              setSelectedBackgroundIndex(index);

              history.push(
                modifyQueryPart(history.location.search, { bg: index })
              );
            }}
            minified={minifiedInfoBox}
            minify={(minified) => setMinifiedInfoBox(minified)}
            legendObject={legend}
            featureInfoModeActivated={false}
            setFeatureInfoModeActivation={() => {}}
            featureInfoValue={undefined}
            showModalMenu={(section) => {
              setAppMenuVisible(true);
              setAppMenuActiveMenuSection(section);
            }}
            mapClickListener={() => {}}
            mapRef={undefined}
            mapCursor={undefined}
            secondaryInfoBoxElements={[
              selectedFeature && (
                <DetailsBox
                  legendObject={legend}
                  selectedFeature={selectedFeature}
                  featureInfoValue={selectedFeature?.properties.Elec_Prod_}
                  setFeatureInfoModeActivation={() => {
                    setSelectedFeature(undefined);
                  }}
                  showModalMenu={(section) => {
                    setAppMenuVisible(true);
                    setAppMenuActiveMenuSection(section);
                  }}
                />
              ),
            ]}
          />
        }
        contactButtonEnabled={false}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        modalMenu={
          <GenericModalApplicationMenu
            {...getCollabedHelpComponentConfig({
              version: version,
              reactCismapRHMVersion: "",
            })}
          />
        }
        gazetteerSearchPlaceholder={"Adressen"}
        gazetteerHitTrigger={(hits) => {
          if (
            (Array.isArray(hits) && hits[0]?.more?.pid) ||
            hits[0]?.more?.kid
          ) {
            const gazId = hits[0]?.more?.pid || hits[0]?.more?.kid;
            setSelectedFeatureByPredicate(
              (feature) => feature.properties.id === gazId
            );
          }
        }}
        applicationMenuTooltipString={"Anleitung | Hintergrund"}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
      >
        <TopicMapSelectionContent />
        <CismapLayer
          key={"key" + selectedFeature?.properties.id}
          style="https://tiles.cismet.de/solarpotenzial_sls/style.json"
          type="vector"
          selectionEnabled={true}
          maxSelectionCount={1}
          manualSelectionManagement={true}
          onSelectionClick={(e) => {}}
          onSelectionChanged={(e) => {
            if (e?.hit) {
              setSelectedFeature(e.hit);
              e.hit.setSelection(true);
            }
          }}
          opacity={1}
          pane="additionalLayers1"
        />
      </TopicMapComponent>
    </>
  );
};

export default SolarPotentialMap;
