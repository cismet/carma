import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import FeatureCollection from "react-cismap/FeatureCollection";
import "react-cismap/topicMaps.css";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import "./App.css";
import MyMenu from "./Menu";
import InfoPanel from "./SecondaryInfo";
import {
  searchTextPlaceholder,
  MenuTooltip,
  InfoBoxTextContent,
} from "@carma-collab/wuppertal/luftmessstationen";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearchWrapper from "./components/FuzzySearchWrapper";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComment } from "@fortawesome/free-solid-svg-icons";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";

function Comp() {
  const contactButtonHandler = () => {
    let link = document.createElement("a");
    link.setAttribute("type", "hidden");
    const br = "\n";

    let mailToHref =
      "mailto:luftreinhaltung@stadt.wuppertal.de?subject=Rückfrage zu Messwerten&body=" +
      encodeURI(
        `Sehr geehrte Damen und Herren,${br}${br} zu der Luftmessstationskarte `
      ) +
      encodeURI(`auf${br}${br}`) +
      `${window.location.href.replace(/&/g, "%26").replace(/#/g, "%23")}` +
      encodeURI(
        `${br}` +
          `${br}` +
          `habe ich folgende Frage:${br}` +
          `${br}${br}${br}${br}` +
          `Mit freundlichen Grüßen${br}` +
          `${br}` +
          `${br}`
      );
    document.body.appendChild(link);
    link.href = mailToHref;
    link.click();
  };

  useEffect(() => {
    document.title = "Luftmessstationskarte Wuppertal";
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
          <Control position="topleft" order={70}>
            <ControlButtonStyler
              onClick={contactButtonHandler}
              title="Rückfrage zu den Messwerten"
            >
              <FontAwesomeIcon icon={faComment} className="text-base" />
            </ControlButtonStyler>
          </Control>
          <Control position="bottomleft" order={10}>
            <div data-test-id="fuzzy-search" className="h-full w-full pl-2">
              <FuzzySearchWrapper
                searchTextPlaceholder={searchTextPlaceholder}
              />
            </div>
          </Control>
        </ControlLayout>
      </div>
      <TopicMapComponent
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        modalMenu={<MyMenu />}
        applicationMenuTooltipString={<MenuTooltip />}
        gazetteerSearchComponent={EmptySearchComponent}
        infoBox={
          <GenericInfoBoxFromFeature
            pixelwidth={350}
            config={{
              displaySecondaryInfoAction: true,

              city: "Wuppertal",
              navigator: {
                noun: {
                  singular: "Messstation",
                  plural: "Messstationen",
                },
              },
              noCurrentFeatureTitle: "Keine Messtationen gefunden",
              noCurrentFeatureContent: <InfoBoxTextContent />,
            }}
          />
        }
        secondaryInfo={<InfoPanel />}
      >
        <TopicMapSelectionContent />

        <FeatureCollection></FeatureCollection>
        {/* <LogSelection /> */}
      </TopicMapComponent>
    </>
  );
}

export default Comp;
