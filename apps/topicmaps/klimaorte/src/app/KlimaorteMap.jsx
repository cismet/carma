import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import { useContext, useEffect, useState } from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import FeatureCollection from "react-cismap/FeatureCollection";
import "react-cismap/topicMaps.css";
import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import ModeSwitcher from "./ModeSwitcher";

import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import "./App.css";
import MyMenu from "./Menu";
import InfoPanel from "./SecondaryInfo";
import { dataHost } from "./App";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import {
  TopicMapContext,
  TopicMapDispatchContext,
} from "react-cismap/contexts/TopicMapContextProvider";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";

import { removeQueryPart } from "react-cismap/tools/routingHelper";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
import { appModes, getMode, getModeUrl } from "./helper/modeParser";
import { getClusterIconCreatorFunction } from "react-cismap/tools/uiHelper";
import { getColorConsideringSeondarySelection } from "./helper/styler";
import InfoBox from "./InfoBox";
import {
  searchTextPlaceholder,
  MenuTooltip,
} from "@carma-collab/wuppertal/klimaorte";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearchWrapper from "./components/FuzzySearchWrapper";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";

function KlimaorteMap() {
  const { setSelectedFeatureByPredicate } = useContext(
    FeatureCollectionDispatchContext
  );
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);
  const {
    selectedFeature,
    items,
    shownFeatures,
    allFeatures,
    secondarySelection,
  } = useContext(FeatureCollectionContext);
  const { zoomToFeature, setAppMode } = useContext(TopicMapDispatchContext);
  const { history, appMode } = useContext(TopicMapContext);

  useEffect(() => {
    if (appMode === undefined) {
      setAppMode(getMode());
    }
  }, [appMode, setAppMode]);

  useEffect(() => {
    if (allFeatures !== undefined) {
      const handleShow = (search) => {
        //check whether shownFeatures is undefined
        //then the map is not ready wait for it
        if (shownFeatures === undefined || items === undefined) {
          return;
        }
        const show = new URLSearchParams(search).get("show");
        const foundShow = show != null;

        //http://localhost:3000/app#/orte?lat=51.23910202395776&lng=7.194871992741512&zoom=8&show=ort.10
        //http://localhost:3000/app#/routen?lat=51.23910202395776&lng=7.194871992741512&zoom=8&show=route.beyenburg

        if (foundShow === true) {
          //split the show paramter (seperated by . in type and key)
          const [type, key] = show.split(".");
          console.log("type", type);
          console.log("key", key);

          //todo check if the show type matches the current mode
          // if not ignore the show parameter

          let predicate = () => false;
          if (type === "ort") {
            predicate = (feature) => {
              try {
                return (
                  parseInt(feature.properties.standort.id) === parseInt(key) // in this case is key=id
                );
              } catch (e) {
                return false;
              }
            };
          } else if (type === "route") {
            predicate = (feature) => {
              try {
                return (
                  feature.properties.key === key // in this case is key=key
                );
              } catch (e) {
                return false;
              }
            };
          }

          //check whether the feature is already shown
          const foundFeature = shownFeatures.find(predicate);

          if (foundFeature !== undefined) {
            setSelectedFeatureByPredicate(predicate);
            zoomToFeature(foundFeature);
          } else {
            //check whether the feature is in the items list
            const foundFeature = allFeatures.find(predicate);

            if (foundFeature !== undefined) {
              zoomToFeature(foundFeature);
            } else {
              console.log("Objekt mit Standort.ID=" + show + " nicht gefunden");
            }
          }
          history.push(removeQueryPart(search, "show"));

          // setFilterState({ kampagnen: [] });
          // setAppMenuVisible(true);
          // setTimeout(() => {
          //   setAppMenuActiveMenuSection("filter");
          // }, 50);
        }
      };

      handleShow(history.location.search);
      return history.listen(() => {
        handleShow(history.location.search);
      });
    }
  }, [
    history,
    shownFeatures,
    items,
    allFeatures,
    setSelectedFeatureByPredicate,
    zoomToFeature,
  ]);

  let weitereAngebote;
  const item = selectedFeature?.properties;
  let moreDataAvailable = false;
  //case switch for  selectedFeature.featuretype
  switch (selectedFeature?.featuretype) {
    case "route":
      moreDataAvailable = true;
      break;
    case "zwischenstopp":
      moreDataAvailable = true;
      break;
    case "ort":
      const angebot = item;
      if (angebot) {
        weitereAngebote = items.filter(
          (testItem) =>
            testItem.typ === "ort" &&
            testItem?.standort.id === angebot?.standort?.id &&
            testItem.id !== angebot.id
        );
        moreDataAvailable =
          weitereAngebote.length > 0 ||
          selectedFeature?.properties?.bemerkung !== undefined ||
          selectedFeature?.properties?.kommentar !== undefined;
      }
      break;
    case "aussichtspunkt":
      break;
    case "poi":
      break;
    default:
      break;
  }

  const linkProduction = new URLSearchParams(history.location.search).get(
    "linkProduction"
  );
  const linkProductionEnabled = linkProduction != null;

  let secondaryInfoBoxElements = [
    <InfoBoxFotoPreview
      lightBoxDispatchContext={lightBoxDispatchContext}
      currentFeature={selectedFeature}
    />,
  ];

  if (linkProductionEnabled) {
    secondaryInfoBoxElements.push(
      <a
        href={
          window.location.href +
          "&show=" +
          selectedFeature?.properties?.standort?.id
        }
        target="_blank"
        rel="noreferrer"
      >
        π
      </a>
    );
  }

  let iconCreateFunction;

  if (appMode === appModes.ROUTEN) {
    iconCreateFunction = getClusterIconCreatorFunction(30, (props) => {
      return getColorConsideringSeondarySelection(props, secondarySelection);
    });
  } else {
    iconCreateFunction = getClusterIconCreatorFunction(
      30,
      (props) => props.color
    );
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
            <FuzzySearchWrapper searchTextPlaceholder={searchTextPlaceholder} />
          </div>
        </Control>
        <div className="mode-container-switcher">
          <ModeSwitcher
            mode={appMode}
            setMode={(mode) => {
              window.location.href = getModeUrl(mode);
              // setModeState(mode);
              setAppMode(mode);
            }}
          />
          <TopicMapComponent
            maxZoom={19}
            minZoom={8}
            applicationMenuTooltipString={<MenuTooltip appMode={appMode} />}
            locatorControl={false}
            fullScreenControl={false}
            zoomControls={false}
            modalMenu={<MyMenu mode={appMode} />}
            gazetteerSearchControl={true}
            gazetteerSearchComponent={EmptySearchComponent}
            infoBox={
              <InfoBox
                key={JSON.stringify(selectedFeature)}
                appMode={appMode}
                pixelwidth={400}
                secondaryInfoBoxElements={secondaryInfoBoxElements}
                moreDataAvailable={moreDataAvailable}
                selectedFeature={selectedFeature}
                secondarySelection={secondarySelection}
              />
            }
            secondaryInfo={<InfoPanel />}
          >
            <TopicMapSelectionContent />
            <FeatureCollection
              key={"featureCollection" + appMode}
              clusteringOptions={{
                iconCreateFunction,
              }}
            />
          </TopicMapComponent>
        </div>
      </ControlLayout>
    </div>
  );
}

export default KlimaorteMap;
