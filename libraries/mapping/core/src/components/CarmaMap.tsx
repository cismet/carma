import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import { useCallback, useContext, useState } from "react";
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
import maplibregl from "maplibre-gl";

// Import from the new maplibre engine library
import {
  LibreMap,
  LibreMapProps,
  LibreLayer,
  VectorStyle,
  slugifyUrl,
  WUPPERTAL_CONFIG,
} from "@carma-mapping/engines/maplibre";

export type { VectorStyle, LibreLayer };

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
  backgroundLayers?: string | null;
  libreLayers?: LibreLayer[];
  children?: React.ReactNode;
  onProgressUpdate?: (progress: { current: number; total: number }) => void;
  embedded?: boolean;
  /** Non-interactive map: disables all controls, compass, interaction */
  miniMap?: boolean;
}

const CarmaMapContent = (props: CarmaMapProps) => {
  const {
    mapEngine = "leaflet",
    miniMap = false,
    locatorControl: locatorControlProp = true,
    fullScreenControl: fullScreenControlProp = true,
    zoomControls: zoomControlsProp = true,
    terrainControl: terrainControlProp = true,
    gazetteerSearchControl: gazetteerSearchControlProp = true,
    gazetteerSearchComponent,
    modalMenu,
    backgroundLayers,
    libreLayers,
    children,
    embedded = false,
  } = props;

  // miniMap mode: disable all controls, compass, interaction, infobox
  const locatorControl = miniMap ? false : locatorControlProp;
  const fullScreenControl = miniMap ? false : fullScreenControlProp;
  const zoomControls = miniMap ? false : zoomControlsProp;
  const terrainControl = miniMap ? false : terrainControlProp;
  const gazetteerSearchControl = miniMap ? false : gazetteerSearchControlProp;

  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);
  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { selectedBackground, backgroundConfigurations } = useContext<
    typeof TopicMapStylingContext
  >(TopicMapStylingContext);
  const [libreMap, setLibreMap] = useState<maplibregl.Map | null>(null);
  const [showTerrain, setShowTerrain] = useState(false);

  // Stable callback to avoid re-creating LibreMap on every render
  const handleLibreMapReady = useCallback(
    (map: maplibregl.Map) => {
      setLibreMap(map);
      props.setLibreMap?.(map);
    },
    [props.setLibreMap]
  );

  // Compute background layers - either from props or from context.
  // undefined = prop not provided, fall through to context.
  // null or "" = explicitly no background layer.
  const effectiveBackgroundLayers =
    backgroundLayers !== undefined
      ? backgroundLayers
      : backgroundConfigurations?.[selectedBackground]?.layerkey;

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

            {mapEngine === "maplibre" && !miniMap && (
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
                      if (libreMap?.terrain) {
                        libreMap.setTerrain(null);
                        setShowTerrain(false);
                      } else if (libreMap) {
                        libreMap.setTerrain({
                          source: WUPPERTAL_CONFIG.terrain
                            ? slugifyUrl(WUPPERTAL_CONFIG.terrain.url)
                            : "terrainSource",
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

            {mapEngine === "leaflet" && (
              <TopicMapComponent
                {...props}
                locatorControl={false}
                fullScreenControl={false}
                zoomControls={false}
                gazetteerSearchControl={false}
              >
                {children}
              </TopicMapComponent>
            )}
            {mapEngine === "maplibre" && (
              <LibreMap
                backgroundLayers={effectiveBackgroundLayers}
                setLibreMap={handleLibreMapReady}
                layers={libreLayers}
                layerMode={props.layerMode}
                onProgressUpdate={props.onProgressUpdate}
                filterFunction={props.filterFunction}
                useRouting={miniMap ? false : props.useRouting}
                onFeatureSelect={miniMap ? undefined : props.onFeatureSelect}
                overrideGlyphs={props.overrideGlyphs}
                selectionEnabled={miniMap ? false : props.selectionEnabled}
                preserveDrawingBuffer={props.preserveDrawingBuffer}
                interactive={miniMap ? false : undefined}
                debugLog={props.debugLog}
                logErrors={props.logErrors}
                exposeMapToWindow={props.exposeMapToWindow}
                selectFromHits={miniMap ? undefined : props.selectFromHits}
              />
            )}
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
