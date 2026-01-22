import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import { useContext, useEffect, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import {
  FullscreenControl,
  LibreMapLocateControl,
  LibrePitchingCompass,
  MapFrameworkSwitcherProvider,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import {
  defaultTypeInference,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import LibreMap, { LibreMapProps } from "./libremap/LibreMap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faMountainCity } from "@fortawesome/free-solid-svg-icons";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import {
  createHashRouter,
  RouterProvider,
  useInRouterContext,
} from "react-router-dom";
import { HashStateProvider } from "@carma-providers/hash-state";
import { Tooltip } from "antd";

export type VectorStyle = {
  name: string;
  style: string;
  layer?: string;
  infoboxMapping?: string[];
};

export type LibreLayer =
  | ({ type: "vector" } & VectorStyle)
  | { type: "geojson"; name: string; data: string; infoboxMapping?: string[] };

interface CarmaMapProps extends LibreMapProps {
  mapEngine?: "leaflet" | "maplibre" | "cesium";
  onClick?: () => void;
  modalMenu?: React.ReactNode;
  gazetteerSearchControl?: boolean;
  gazetteerSearchComponent?: React.ReactNode;
  applicationMenuTooltipString?: string;
  locatorControl?: boolean;
  fullScreenControl?: boolean;
  zoomControls?: boolean;
  terrainControl?: boolean;
  contactButtonEnabled?: boolean;
  infoBox?: React.ReactNode;
  vectorStyles?: VectorStyle[];
  backgroundLayers?: string;
  libreLayers?: LibreLayer[];
  children?: React.ReactNode;
  onProgressUpdate?: (progress: { current: number; total: number }) => void;
  embedded?: boolean;
}

const CarmaMapContent = (props: CarmaMapProps) => {
  const {
    mapEngine = "leaflet",
    locatorControl = true,
    fullScreenControl = true,
    zoomControls = true,
    terrainControl = true,
    gazetteerSearchControl = true,
    gazetteerSearchComponent,
    modalMenu,
    backgroundLayers,
    libreLayers,
    children,
    embedded = false,
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
  const [showTerrain, setShowTerrain] = useState(false);

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
          backgroundLayers={
            backgroundLayers ??
            backgroundConfigurations[selectedBackground].layerkey
          }
          setLibreMap={setLibreMap}
          layers={libreLayers}
          onProgressUpdate={props.onProgressUpdate}
          filterFunction={props.filterFunction}
          useRouting={props.useRouting}
        />
      );
    }
  }, [mapEngine, selectedBackground]);

  return (
    <HashStateProvider>
      <MapFrameworkSwitcherProvider>
        <div
          className={
            embedded
              ? "relative flex flex-col w-full h-full"
              : TAILWIND_CLASSNAMES_FULLSCREEN_FIXED
          }
        >
          <ControlLayout ifStorybook={false}>
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

            {mapEngine === "maplibre" && terrainControl && (
              <Control position="topleft" order={30}>
                <Tooltip title={"Terrain"} placement="right">
                  <ControlButtonStyler
                    onClick={() => {
                      if (libreMap.terrain) {
                        libreMap.setTerrain(null);
                        setShowTerrain(false);
                      } else {
                        libreMap.setTerrain({
                          source: "terrainSource",
                          exaggeration: 1,
                        });
                        setShowTerrain(true);
                      }
                    }}
                    className="font-semibold"
                  >
                    <FontAwesomeIcon
                      icon={faMountainCity}
                      className={showTerrain ? "text-[#1677ff]" : ""}
                    />
                  </ControlButtonStyler>
                </Tooltip>
              </Control>
            )}

            {fullScreenControl && (
              <Control position="topleft" order={50}>
                <FullscreenControl />
              </Control>
            )}

            {locatorControl && mapEngine === "leaflet" && (
              <Control position="topleft" order={60}>
                <RoutedMapLocateControl
                  tourRefLabels={null}
                  disabled={false}
                  nativeTooltip={true}
                />
              </Control>
            )}

            {locatorControl && mapEngine === "maplibre" && (
              <Control position="topleft" order={60}>
                <LibreMapLocateControl map={libreMap} nativeTooltip={true} />
              </Control>
            )}

            {props.modalMenu && (
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
            {modalMenu}
          </ControlLayout>
        </div>
      </MapFrameworkSwitcherProvider>
    </HashStateProvider>
  );
};

export const CarmaMap = (props: CarmaMapProps) => {
  const isInRouterContext = useInRouterContext();

  // If already inside a router, render content directly
  if (isInRouterContext) {
    return <CarmaMapContent {...props} />;
  }

  // Otherwise, create our own router
  return (
    <RouterProvider
      router={createHashRouter([
        {
          element: <CarmaMapContent {...props} />,
          path: "*",
        },
      ])}
    />
  );
};

export default CarmaMap;
