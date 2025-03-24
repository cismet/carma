import { useContext, useEffect } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { LightBoxContext } from "react-cismap/contexts/LightBoxContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import {
  InfoBoxTextContent,
  InfoBoxTextTitle,
  MenuTooltip,
  searchTextPlaceholder,
} from "@carma-collab/wuppertal/stadtplan";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import IconComp from "react-cismap/commons/Icon";
import { getPoiClusterIconCreatorFunction } from "./helper/styler";
import Menu from "./Menu";
import FuzzySearch from "./components/FuzzySearch";
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

const Stadtplankarte = ({ poiColors }) => {
  const { setClusteringOptions } = useContext(FeatureCollectionDispatchContext);
  const lightBoxContext = useContext(LightBoxContext);
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions, selectedFeature, filterState } = useContext(
    FeatureCollectionContext
  );

  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: markerSymbolSize,
          poiColors,
        }),
      });
    }
  }, [markerSymbolSize]);

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
              <FuzzySearch />
            </div>
          </Control>
        </ControlLayout>
      </div>
      <TopicMapComponent
        modalMenu={<Menu />}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        applicationMenuTooltipString={<MenuTooltip />}
        infoBox={
          filterState === undefined || filterState.positiv.length > 0 ? (
            <GenericInfoBoxFromFeature
              pixelwidth={350}
              config={{
                displaySecondaryInfoAction: false,
                city: "Wuppertal",
                navigator: {
                  noun: {
                    singular: "POI",
                    plural: "POIs",
                  },
                },
                noFeatureTitle: <InfoBoxTextTitle />,
                noCurrentFeatureContent: <InfoBoxTextContent />,
              }}
              captionFactory={(linkUrl, feature) => {
                const urheber =
                  feature?.properties?.urheber_foto || "Stadt Wuppertal";
                let link = "https://www.wuppertal.de/service/impressum.php";

                if (urheber === "Stadt Wuppertal, Wuppertal Marketing GmbH") {
                  link =
                    "https://www.wuppertal.de/microsite/WMG/impressum_431218.php";
                } else if (urheber === "Stadt Wuppertal, Medienzentrum") {
                  link =
                    "https://www.wuppertal.de/kultur-bildung/schule/medienzentrum/index.php";
                }

                return (
                  <a href={link} target="_fotos">
                    <IconComp name="copyright" /> {urheber}
                  </a>
                );
              }}
            />
          ) : (
            <div></div>
          )
        }
      >
        <TopicMapSelectionContent />
        <FeatureCollection></FeatureCollection>
      </TopicMapComponent>
    </>
  );
};

export default Stadtplankarte;
