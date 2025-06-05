import { Control } from "@carma-mapping/map-controls-layout";
import { useContext, useEffect, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import {
  defaultTypeInference,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import LibreMap from "./libremap/LibreMap";

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
    children,
  } = props;

  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);
  const [map, setMap] = useState(<></>);

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
      setMap(<LibreMap />);
    }
  }, [mapEngine]);

  return (
    <div>
      {zoomControls && (
        <Control position="topleft" order={10}>
          <ZoomControl />
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
    </div>
  );
};

export default CarmaMap;
