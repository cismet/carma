import React, { useEffect, useState, useContext } from "react";
import EnviroMetricMap from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMap";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import CrossTabCommunicationControl from "react-cismap/CrossTabCommunicationControl";
import config from "./config";
import versionData from "./version.json";
import {
  getApplicationVersion,
  TAILWIND_CLASSNAMES_FULLSCREEN_FIXED,
} from "@carma-commons/utils";
import NotesDisplay from "./NotesDisplay";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/starkregengefahrenkarte";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import FuzzySearch from "./app/components/FuzzySearch";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { faHouseChimney, faComment } from "@fortawesome/free-solid-svg-icons";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";

export const HOME_ZOOM = 18;

export const HOME_CENTER = [51.272021202386675, 7.201605141162873];

function App() {
  const email = "starkregen@stadt.wuppertal.de";
  const { routedMapRef: routedMap } = useContext(TopicMapContext);
  const homeControlLeaflet = () => {};
  const onHomeClick = () => {
    routedMap.leafletMap.leafletElement.flyTo(HOME_CENTER, HOME_ZOOM);
  };
  const [hinweisData, setHinweisData] = useState([]);
  const version = getApplicationVersion(versionData);

  const getHinweisData = async (setHinweisData, url) => {
    const prefix = "HinweisDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    const features = [];
    let id = 1;
    for (const d of data) {
      features.push({
        type: "Feature",
        id: id++,
        properties: d,
        geometry: d.geojson,
        crs: {
          type: "name",
          properties: {
            name: "urn:ogc:def:crs:EPSG::25832",
          },
        },
      });
    }
    console.log("yy hinweisData", features);

    setHinweisData(features || []);
  };

  useEffect(() => {
    getHinweisData(setHinweisData, config.config.hinweisDataUrl);
  }, []);

  return (
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
      <div
        className="controls-container"
        style={{
          position: "absolute",
          top: "45px",
          left: "-2px",
          bottom: "0px",
          zIndex: 500,
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
            <RoutedMapLocateControl tourRefLabels={null} disabled={false} />
          </Control>

          <Control position="topleft" order={70}>
            <ControlButtonStyler
              onClick={onHomeClick}
              dataTestId="home-control"
              title="Auf Rathaus positionieren"
            >
              <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
            </ControlButtonStyler>
          </Control>
          <Control position="topleft" order={70}>
            <ControlButtonStyler
              onClick={() => {
                let link = document.createElement("a");
                link.setAttribute("type", "hidden");
                const br = "\n";
                const iOS =
                  !!navigator.platform &&
                  /iPad|iPhone|iPod/.test(navigator.platform);

                let normalMailToHref =
                  "mailto:" +
                  email +
                  "?subject=eventueller Fehler im Geländemodell&body=" +
                  encodeURI(
                    `Sehr geehrte Damen und Herren,${br}${br} in der Starkregengefahrenkarte `
                  ) +
                  encodeURI(`auf${br}${br}`) +
                  `${window.location.href
                    .replace(/&/g, "%26")
                    .replace(/#/g, "%23")}` +
                  encodeURI(
                    `${br}` +
                      `${br}` +
                      `ist mir folgendes aufgefallen:${br}` +
                      `${br}${br}${br}${br}` +
                      `Mit freundlichen Grüßen${br}` +
                      `${br}` +
                      `${br}`
                  );
                let iosMailToHref =
                  "mailto:" +
                  email +
                  "?subject=eventueller Fehler im Geländemodell&body=" +
                  encodeURI(
                    `Sehr geehrte Damen und Herren, in der Starkregengefahrenkarte `
                  ) +
                  encodeURI(`auf `) +
                  `${window.location.href
                    .replace(/&/g, "%26")
                    .replace(/#/g, "%23")}` +
                  encodeURI(` ist mir folgendes aufgefallen:`);
                document.body.appendChild(link);
                if (iOS) {
                  link.href = iosMailToHref;
                } else {
                  link.href = normalMailToHref;
                }

                link.click();
              }}
              dataTestId="contactButton"
              title="Fehler im Geländemodell melden"
            >
              <FontAwesomeIcon icon={faComment} className="text-lg" />
            </ControlButtonStyler>
          </Control>
          <Control position="bottomleft" order={10}>
            <FuzzySearch />
          </Control>
        </ControlLayout>
      </div>
      <div className="mode-container-switcher">
        <EnviroMetricMap
          applicationMenuTooltipString="Anleitung | Hintergrund"
          appMenu={
            <GenericModalApplicationMenu
              {...getCollabedHelpComponentConfig({
                versionString: version,
                reactCismapRHMVersion: "_",

                email,
              })}
            />
          }
          contactButtonEnabled={false}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          gazetteerSearchControl={true}
          gazetteerSearchComponent={EmptySearchComponent}
          emailaddress={email}
          initialState={config.initialState}
          config={config.config}
          homeZoom={18}
          homeCenter={[51.27202324060668, 7.20162372978018]}
          modeSwitcherTitle="Starkregengefahrenkarte"
          documentTitle="Starkregengefahrenkarte Wuppertal"
        >
          <TopicMapSelectionContent />
          <NotesDisplay hinweisData={hinweisData} />
          <CrossTabCommunicationControl hideWhenNoSibblingIsPresent={true} />
        </EnviroMetricMap>
      </div>
    </div>
  );
}

export default App;
