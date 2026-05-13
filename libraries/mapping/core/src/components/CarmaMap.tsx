import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import { useCallback, useContext, useEffect, useState } from "react";
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
  RASTER_PAINT_PRESETS,
} from "@carma-mapping/engines/maplibre";
import type { RasterPaintOverrides } from "@carma-mapping/engines/maplibre";

export type { VectorStyle, LibreLayer };

interface CarmaMapProps extends LibreMapProps {
  mapEngine?: "leaflet" | "maplibre" | "cesium";
  /**
   * Application key used to scope localStorage keys (e.g. terrain setting).
   * Without this, settings leak across apps on the same origin.
   */
  appKey?: string;
  /** Show a crosshair overlay that jumps to the last click position (debug aid for 3D selection) */
  clickCrosshairDebugMode?: boolean;
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
  /** Extra <Control> siblings injected into the internal ControlLayout.
   * Auto-stack with the built-in topleft/topright/bottom columns by `order`,
   * same mechanism apps/geoportal uses in MapWrapper. */
  extraControls?: React.ReactNode;
  onProgressUpdate?: (progress: { current: number; total: number }) => void;
  embedded?: boolean;
  /** Non-interactive map: disables all controls, compass, interaction */
  miniMap?: boolean;
  /** Runtime parameters for 3D layers (e.g. radiusMix, useLoft) */
  threeRuntimeParams?: Record<string, number | string>;
  /** Ref for 3D layer performance data */
  threePerfRef?: React.MutableRefObject<
    import("@carma-mapping/engines/threejs").ThreePerfData
  >;
  /** Maximum tilt (pitch) in degrees. Defaults to 60 (MapLibre's stock cap). */
  maxPitch?: number;
}

const TERRAIN_STORAGE_KEY = "carma-map-terrain";

const CarmaMapContent = (props: CarmaMapProps) => {
  const {
    mapEngine = "leaflet",
    appKey,
    miniMap = false,
    clickCrosshairDebugMode = false,
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
    extraControls,
    embedded = false,
  } = props;

  const terrainStorageKey = appKey
    ? `${appKey}:${TERRAIN_STORAGE_KEY}`
    : TERRAIN_STORAGE_KEY;

  // Warn once if appKey is missing (settings leak across apps on the same origin)
  useState(() => {
    if (!appKey && !miniMap) {
      console.warn(
        "[CarmaMap] appKey prop is not set. localStorage settings (e.g. terrain) " +
        "will leak across all apps on this origin. Pass appKey to scope them."
      );
    }
  });

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
  const { selectedBackground, backgroundConfigurations, namedMapStyle } =
    useContext<typeof TopicMapStylingContext>(TopicMapStylingContext);
  const [libreMap, setLibreMap] = useState<maplibregl.Map | null>(null);
  const [showTerrain, setShowTerrain] = useState(() => {
    try { return localStorage.getItem(terrainStorageKey) === "true"; } catch { return false; }
  });
  // Crosshair debug: store geographic position so the crosshair tracks
  // correctly when terrain is toggled or camera moves
  const [crosshairLngLat, setCrosshairLngLat] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [crosshairScreen, setCrosshairScreen] = useState<{
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (!libreMap || !clickCrosshairDebugMode) return;
    const handler = (e: maplibregl.MapMouseEvent) => {
      setCrosshairLngLat({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    };
    libreMap.on("click", handler);
    return () => {
      libreMap.off("click", handler);
    };
  }, [libreMap, clickCrosshairDebugMode]);

  // RAF loop: continuously project stored lnglat to screen coords
  // so crosshair tracks correctly during terrain toggle / camera move
  useEffect(() => {
    if (!libreMap || !crosshairLngLat || !clickCrosshairDebugMode) return;
    let rafId: number;
    const update = () => {
      const pt = libreMap.project([crosshairLngLat.lng, crosshairLngLat.lat]);
      const rect = libreMap.getCanvas().getBoundingClientRect();
      setCrosshairScreen({ x: pt.x + rect.left, y: pt.y + rect.top });
      rafId = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(rafId);
  }, [libreMap, crosshairLngLat, clickCrosshairDebugMode]);

  // Stable callback to avoid re-creating LibreMap on every render
  const handleLibreMapReady = useCallback(
    (map: maplibregl.Map) => {
      setLibreMap(map);
      props.setLibreMap?.(map);

      // Restore terrain if it was persisted as enabled
      if (showTerrain && !map.terrain) {
        const source = WUPPERTAL_CONFIG.terrain
          ? slugifyUrl(WUPPERTAL_CONFIG.terrain.url)
          : "terrainSource";
        const apply = () => {
          if (map.getSource(source)) {
            map.setTerrain({ source, exaggeration: 1 });
          }
        };
        if (map.isStyleLoaded()) {
          apply();
        } else {
          map.once("styledata", apply);
        }
      }
    },
    [props.setLibreMap, showTerrain]
  );

  // Compute background layers - either from props or from context.
  // undefined = prop not provided, fall through to context.
  // null or "" = explicitly no background layer.
  const effectiveBackgroundLayers =
    backgroundLayers !== undefined
      ? backgroundLayers
      : backgroundConfigurations?.[selectedBackground]?.layerkey;

  // Resolve backgroundRasterPaint: explicit prop wins, otherwise derive
  // from namedMapStyle in TopicMapStylingContext (set by the menu's
  // NamedMapStyleChooser radio buttons, same mechanism as Leaflet).
  const effectiveRasterPaint: RasterPaintOverrides | undefined =
    props.backgroundRasterPaint ??
    (typeof namedMapStyle === "string" && namedMapStyle in RASTER_PAINT_PRESETS
      ? RASTER_PAINT_PRESETS[namedMapStyle as keyof typeof RASTER_PAINT_PRESETS]
      : undefined);

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
                        localStorage.setItem(terrainStorageKey, "false");
                      } else if (libreMap) {
                        libreMap.setTerrain({
                          source: WUPPERTAL_CONFIG.terrain
                            ? slugifyUrl(WUPPERTAL_CONFIG.terrain.url)
                            : "terrainSource",
                          exaggeration: 1,
                        });
                        setShowTerrain(true);
                        localStorage.setItem(terrainStorageKey, "true");
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

            {extraControls}

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
                onSelectionChanged={
                  miniMap ? undefined : props.onSelectionChanged
                }
                overrideGlyphs={props.overrideGlyphs}
                selectionEnabled={miniMap ? false : props.selectionEnabled}
                preserveDrawingBuffer={props.preserveDrawingBuffer}
                interactive={miniMap ? false : undefined}
                debugLog={props.debugLog}
                logErrors={props.logErrors}
                exposeMapToWindow={props.exposeMapToWindow}
                selectFromHits={miniMap ? undefined : props.selectFromHits}
                overrideSelectedFeature={
                  miniMap ? undefined : props.overrideSelectedFeature
                }
                gazetteerInfoOnClick={
                  miniMap ? false : props.gazetteerInfoOnClick
                }
                backgroundRasterPaint={effectiveRasterPaint}
                threeRuntimeParams={props.threeRuntimeParams}
                threePerfRef={props.threePerfRef}
                maxPitch={props.maxPitch}
              />
            )}
            {modalMenu}
          </ControlLayout>

          {clickCrosshairDebugMode && crosshairScreen && (
            <>
              {/* Red crosshair: actual click position (terrain-aware) */}
              <div
                style={{
                  position: "fixed",
                  left: `${crosshairScreen.x}px`,
                  top: 0,
                  width: 1,
                  height: "100vh",
                  background: "rgba(255,0,0,0.6)",
                  pointerEvents: "none",
                  zIndex: 999999,
                }}
              />
              <div
                style={{
                  position: "fixed",
                  left: 0,
                  top: `${crosshairScreen.y}px`,
                  height: 1,
                  width: "100vw",
                  background: "rgba(255,0,0,0.6)",
                  pointerEvents: "none",
                  zIndex: 999999,
                }}
              />
            </>
          )}
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
