import { useContext, useEffect, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { Badge } from "react-bootstrap";
import topoBG from "../assets/map-bg/topo.png";
import citymapBG from "../assets/map-bg/citymap.png";
import mixedBG from "../assets/map-bg/mixed.png";
import { modifyQueryPart } from "react-cismap/tools/routingHelper";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import ControlInfoBox from "./ControlInfoBox";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import CismapLayer from "react-cismap/CismapLayer";
import {
  getApplicationVersion,
  TAILWIND_CLASSNAMES_FULLSCREEN_FIXED,
} from "@carma-commons/utils";
import versionData from "../version.json";
// import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/hochwassergefahrenkarte";
import {
  getCollabedHelpComponentConfig,
  tooltipText,
  searchTextPlaceholder,
} from "@carma-collab/wuppertal/hitzeinderstadt";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";

import {
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";

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

const Hitzekarte = () => {
  const version = getApplicationVersion(versionData);

  const { history } = useContext(TopicMapContext);
  const { setAppMenuVisible, setAppMenuActiveMenuSection } =
    useContext(UIDispatchContext);
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  useSelectionTopicMap();

  const [selectedSimulations, setSelectedSimulations] = useState(() => {
    return parseSimulationsFromURL(history.location.search);
  });
  const simulations = [
    {
      layer: "https://tiles.cismet.de/hitzeinsel/style.json",
      longname: "Hitzeinsel im IST-Zustand",
      name: "Hitzebelastung",
      opacity: 0.8,
      subtitle: "",
    },
    {
      layer: "https://tiles.cismet.de/starke_hitzeinsel/style.json",
      name: "starke Hitzebelastung",
      opacity: 0.8,
      subtitle: "",
    },
    {
      layer: "https://tiles.cismet.de/ausweitung_hitzeinsel/style.json",
      longname: "Ausweitung der Hitzeinsel im Zukunftsszenario 2050",
      name: "Zukunftsszenario 2050-2060",
      opacity: 0.8,
      subtitle: "",
    },
  ];
  const [simulationLabels, setSimulationLabels] = useState([]);
  const backgrounds = [
    {
      layerkey: "wupp-plan-live-tiles-3857@90",
      src: citymapBG,
      title: "Stadtplan",
    },

    {
      layerkey: "rvrGrundriss@100|trueOrtho2024@75|rvrSchriftNT@100",
      src: mixedBG,
      title: "Luftbildkarte",
    },
    {
      layerkey: "hillshade|bplan_abkg@30|wupp-plan-live-tiles-3857@20",
      src: topoBG,
      title: "Top. Karte",
    },
  ];
  const [selectedBackgroundIndex, setSelectedBackgroundIndex] = useState(() => {
    return parseBackgroundIndexFromURL(history.location.search);
  });
  const [minifiedInfoBox, setMinifiedInfoBox] = useState(false);
  const legend = [
    { title: "Hitze", lt: 0.3, bg: "#FFD521" },
    { title: "starke Hitze", lt: 0.4, bg: "#FF3C2E" },
    { title: "2050-2060", lt: 1.0, bg: "#CE1EE8" },
  ];

  useEffect(() => {
    let simulationLabels = [];
    simulations.forEach((item, index) => {
      let bsStyle;
      if (selectedSimulations.indexOf(index) !== -1) {
        bsStyle = "primary";
      } else {
        bsStyle = "secondary";
      }
      let label = (
        <a
          style={{
            textDecoration: "none",
            fontSize: "13px",
            marginRight: "2px",
          }}
          onClick={() => {
            setSelectedSimulations((prevSelected) => {
              let updatedSelection;
              if (prevSelected.includes(index)) {
                updatedSelection = prevSelected.filter(
                  (simIndex) => simIndex !== index
                );
              } else {
                updatedSelection = [...prevSelected, index];
              }

              // Update the URL with the new selection
              const selectedSimulationsParam = updatedSelection.join(",");
              history.push(
                modifyQueryPart(history.location.search, {
                  simulations: selectedSimulationsParam,
                })
              );

              return updatedSelection;
            });
          }}
        >
          <Badge variant={bsStyle}>{item.name}</Badge>
        </a>
      );
      simulationLabels.push(label);
    });
    setSimulationLabels(simulationLabels);
  }, [selectedSimulations]);

  let validBackgroundIndex = selectedBackgroundIndex;
  if (validBackgroundIndex >= backgrounds.length) {
    validBackgroundIndex = 0;
  }

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
              pixelwidth={
                responsiveState === "normal" ? "300px" : windowSize.width - gap
              }
              placeholder={searchTextPlaceholder}
            />
          </div>
        </Control>
        <TopicMapComponent
          backgroundlayers={backgrounds[validBackgroundIndex].layerkey}
          applicationMenuIconname="info"
          // backgroundlayers="empty"
          infoBox={
            <ControlInfoBox
              pixelwidth={350}
              selectedSimulations={selectedSimulations}
              simulations={simulations}
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
            />
          }
          modalMenu={
            <GenericModalApplicationMenu
              {...getCollabedHelpComponentConfig({
                versionString: version,
                reactCismapRHMVersion: "",
              })}
            />
          }
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          gazetteerSearchControl={true}
          gazetteerSearchComponent={EmptySearchComponent}
          applicationMenuTooltipString={tooltipText}
        >
          <TopicMapSelectionContent />

          {/* <TileLayer
        maxNativeZoom={20}
        maxZoom={22}
        url={`https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`}
      /> */}
          {selectedSimulations.map((simulationIndex) => {
            const selSimString = JSON.stringify(selectedSimulations);
            return (
              <CismapLayer
                {...{
                  key: "heatmodellayer." + simulationIndex,
                  type: "vector",
                  style: simulations[simulationIndex].layer,
                  pane: "additionalLayers" + simulationIndex,
                  opacity: simulations[simulationIndex].opacity,

                  // onLayerClick: (e) => {
                  //   console.log("xxx onLayerClick", e);
                  // },
                }}
              />
            );
          })}
        </TopicMapComponent>
      </ControlLayout>
    </div>
  );
};

export default Hitzekarte;
