import React from "react";
import { useContext, useEffect } from "react";
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
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import useLeafletZoomControls from "../hooks/useLeafletZoomControls";
import { RoutedMapLocateControl } from "@carma-mapping/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompress,
  faExpand,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

const EMobiKarte = () => {
  const { setClusteringOptions, setFilterState } = useContext(
    FeatureCollectionDispatchContext
  );
  const { secondaryInfoVisible } = useContext(UIContext);
  const { setSecondaryInfoVisible } = useContext(UIDispatchContext);
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions, selectedFeature, filteredItems, shownFeatures } =
    useContext(FeatureCollectionContext);
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  useSelectionTopicMap();

  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

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
    <>
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
            <div className="flex flex-col">
              <ControlButtonStyler
                onClick={zoomInLeaflet}
                className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                dataTestId="zoom-in-control"
                title="Vergrößern"
              >
                <FontAwesomeIcon icon={faPlus} className="text-base" />
              </ControlButtonStyler>
              <ControlButtonStyler
                onClick={zoomOutLeaflet}
                className="!rounded-t-none !border-t-[1px]"
                dataTestId="zoom-out-control"
                title="Verkleinern"
              >
                <FontAwesomeIcon icon={faMinus} className="text-base" />
              </ControlButtonStyler>
            </div>
          </Control>

          <Control position="topleft" order={50}>
            <ControlButtonStyler
              title={
                document.fullscreenElement
                  ? "Vollbildmodus beenden"
                  : "Vollbildmodus"
              }
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  document.documentElement.requestFullscreen();
                }
              }}
              dataTestId="full-screen-control"
            >
              <FontAwesomeIcon
                icon={document.fullscreenElement ? faCompress : faExpand}
              />
            </ControlButtonStyler>
          </Control>
          <Control position="topleft" order={60} title="Mein Standort">
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={false}
              nativeTooltip={true}
            />
          </Control>
          <Control position="bottomleft" order={10}>
            <div data-test-id="fuzzy-search" className="h-full w-full pl-2">
              <LibFuzzySearch
                priorityTypes={[
                  "emob",
                  "bezirke",
                  "quartiere",
                  "adressen",
                  "streets",
                  "pois",
                  "poisAlternativeNames",
                  "kitas",
                  "schulen",
                ]}
                typeInference={{
                  adressen: (item) => {
                    if (item.glyph === "home") {
                      return "adressen";
                    } else if (item.glyph === "road") {
                      return "streets";
                    } else {
                      return "adressen";
                    }
                  },

                  pois: (item) => {
                    if (item.glyph === "tag") {
                      return "pois";
                    } else if (item.glyph === "tags") {
                      return "poisAlternativeNames";
                    } else if (item.glyph === "graduation-cap") {
                      return "schulen";
                    } else {
                      return "pois";
                    }
                  },
                }}
                pixelwidth={
                  responsiveState === "normal"
                    ? "300px"
                    : windowSize.width - gap
                }
                placeholder="Ladestation | Stadtteil | Adresse | POI"
              />
            </div>
          </Control>
        </ControlLayout>
      </div>
      <TopicMapComponent
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        modalMenu={<Menu />}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
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
    </>
  );
};

export default EMobiKarte;
