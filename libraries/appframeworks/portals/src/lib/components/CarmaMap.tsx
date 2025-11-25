import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { useContext, useEffect, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import {
  FullscreenControl,
  LibrePitchingCompass,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import {
  defaultTypeInference,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import LibreMap from "./libremap/LibreMap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";

export type VectorStyle = {
  name: string;
  style: string;
  layer?: string;
  infoboxMapping?: string[];
};

interface CarmaMapProps {
  mapEngine?: "leaflet" | "maplibre" | "cesium";
  onClick: () => void;
  modalMenu?: React.ReactNode;
  gazetteerSearchControl?: boolean;
  gazetteerSearchComponent?: React.ReactNode;
  applicationMenuTooltipString?: string;
  locatorControl?: boolean;
  fullScreenControl?: boolean;
  zoomControls?: boolean;
  contactButtonEnabled?: boolean;
  infoBox?: React.ReactNode;
  vectorStyles?: VectorStyle[];
  backgroundLayers?: string;
  children?: React.ReactNode;
}

export const CarmaMap = (props: CarmaMapProps) => {
  const {
    mapEngine = "leaflet",
    locatorControl = true,
    fullScreenControl = true,
    zoomControls = true,
    gazetteerSearchControl = true,
    gazetteerSearchComponent,
    modalMenu,
    backgroundLayers,
    children,
  } = props;

  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);
  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { selectedBackground, backgroundConfigurations } = useContext<
    typeof TopicMapStylingContext
  >(TopicMapStylingContext);
  const [map, setMap] = useState(<></>);
  const [libreMap, setLibreMap] = useState<maplibregl.Map | null>(null);

  useEffect(() => {
    if (mapEngine === "leaflet") {
      setMap(
        <TopicMapComponent
          {...props}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          gazetteerSearchControl={false}
        >
          {children}
        </TopicMapComponent>
      );
    }

    if (mapEngine === "maplibre") {
      setMap(
        <LibreMap
          vectorStyles={props.vectorStyles}
          backgroundLayers={
            backgroundLayers ??
            backgroundConfigurations[selectedBackground].layerkey
          }
          setLibreMap={setLibreMap}
        />
      );
    }
  }, [mapEngine, selectedBackground]);

  return (
    <div>
      {zoomControls && (
        <Control position="topleft" order={10}>
          <ZoomControl mapEngine={mapEngine} libreMap={libreMap} />
        </Control>
      )}

      {mapEngine === "maplibre" && (
        <Control position="topleft" order={20}>
          <ControlButtonStyler
            useDisabledStyle={false}
            dataTestId="compass-control"
          >
            <LibrePitchingCompass map={libreMap} />
          </ControlButtonStyler>
        </Control>
      )}

      {fullScreenControl && (
        <Control position="topleft" order={50}>
          <FullscreenControl />
        </Control>
      )}

      {locatorControl && (
        <Control position="topleft" order={60}>
          <RoutedMapLocateControl
            tourRefLabels={null}
            disabled={false}
            nativeTooltip={true}
          />
        </Control>
      )}

      <Control position="topright" order={10}>
        <ControlButtonStyler
          useDisabledStyle={false}
          onClick={() => {
            setAppMenuVisible(true);
          }}
        >
          <FontAwesomeIcon icon={faBars} className="text-base" />
        </ControlButtonStyler>
      </Control>

      {gazetteerSearchControl && (
        <Control position="bottomleft" order={10}>
          {gazetteerSearchComponent ? (
            gazetteerSearchComponent
          ) : (
            <div data-test-id="fuzzy-search" style={{ marginTop: "4px" }}>
              <LibFuzzySearch
                pixelwidth={
                  responsiveState === "normal"
                    ? "300px"
                    : windowSize.width - gap
                }
                placeholder="Stadtteil | Adresse | POI"
                priorityTypes={[
                  "pois",
                  "poisAlternativeNames",
                  "bezirke",
                  "quartiere",
                  "adressen",
                  "streets",
                  "schulen",
                  "kitas",
                ]}
                typeInference={defaultTypeInference}
              />
            </div>
          )}
        </Control>
      )}

      {map}
      {modalMenu}
    </div>
  );
};

export default CarmaMap;
