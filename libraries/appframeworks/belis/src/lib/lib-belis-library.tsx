import { useContext, useEffect, useRef, useState } from "react";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useNavigate, useLocation } from "react-router-dom";
import { convertBounds2BBox } from "./utils/gisHelper";
import { MappingConstants, RoutedMap } from "react-cismap";
import { modifyQueryPart } from "./utils/routingHelper";
import { BelisFeatureCollection } from "./components/BelisFeatureCollection";
import { BackgroundLayers } from "./components/BackgroundLayers";
import { FocusRectangle } from "./components/FocusRectangle";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import PaleOverlay from "react-cismap/PaleOverlay";
import type { ReactNode } from "react";
import type { LatLngBounds, Point, Map as LeafletMap } from "leaflet";
import { featuresFilter, FilterState } from "..";

type BoundsAndSize = {
  mapBounds: LatLngBounds;
  mapSize: Point;
};
interface LeafletPane extends HTMLElement {
  _leaflet_pos?: { x: number; y: number };
}

interface RoutedMapWithLeaflet extends RoutedMap {
  leafletMap: { leafletElement: L.Map };
}

interface BelisMapProps {
  refRoutedMap: React.RefObject<RoutedMapWithLeaflet>;
  width: number;
  height: number;
  jwt: string;
  setBounds: (mapBounds: LatLngBounds) => void;
  setMapRef: (mapRef: LeafletMap) => void;
  setZoom: (z: string | null) => void;
  loadObjects: (opts: {
    boundingBox: any;
    inFocusMode: boolean;
    zoom: string | null;
    jwt: string;
    force?: boolean;
  }) => void;
  featureCollection: any[];
  inFocusMode: boolean;
  fcMode: string;
  // secondaryInfoVisible: boolean;
  selectedFeature: any;
  featureCollectionMode: string;
  loadingState: boolean;
  connectionMode: "FROMCACHE" | "ONLINE";
  zoom: number | null;
  inPaleMode: boolean;
  background: string;
  initIndex: (done: (initialized: boolean) => void) => void;
  handleSelectedFeature: (f: any) => void;
  MODES: {
    OBJECTS: "OBJECTS";
    TASKLISTS: "TASKLISTS";
    PROTOCOLS: "PROTOCOLS";
  };
  children?: ReactNode;
  activeBackgroundLayer?: string | null;
  backgroundLayerOpacities?: any;
  filter?: FilterState;
}

export const CONNECTIONMODE = { FROMCACHE: "FROMCACHE", ONLINE: "ONLINE" };

export function BelisMap({
  refRoutedMap,
  width,
  height,
  jwt,
  setBounds,
  setMapRef,
  setZoom,
  loadObjects,
  featureCollection,
  inFocusMode,
  fcMode,
  // secondaryInfoVisible,
  selectedFeature,
  featureCollectionMode,
  loadingState,
  connectionMode,
  zoom,
  inPaleMode,
  background,
  initIndex,
  handleSelectedFeature,
  MODES,
  children,
  activeBackgroundLayer = null,
  backgroundLayerOpacities = {},
  filter = featuresFilter,
}: BelisMapProps) {
  const mapRef = refRoutedMap?.current?.leafletMap?.leafletElement;
  const blockingTime = 1000;
  const [blockLoading, setBlockLoading] = useState<boolean>(false);
  const [indexInitialized, setIndexInitialized] = useState<boolean>(false);
  const [mapBoundsAndSize, setMapBoundsAndSize] = useState<
    BoundsAndSize | undefined
  >(undefined);
  const [indexInitializationRequested, setIndexInitializationRequested] =
    useState<boolean>(false);
  const { selectedBackground, backgroundConfigurations } = useContext<
    typeof TopicMapStylingContext
  >(TopicMapStylingContext);
  const { setRoutedMapRef } = useContext<typeof TopicMapDispatchContext>(
    TopicMapDispatchContext
  );
  const timeoutHandlerRef = useRef<number | undefined>(undefined);
  const navigate = useNavigate();
  const browserlocation = useLocation();

  const boundsFromMapRef = mapRef?.getBounds() || null;
  const sizeFromMapRef = mapRef?.getSize() || null;

  const urlSearchParams = new URLSearchParams(browserlocation.search);

  let backgroundsFromMode;
  try {
    backgroundsFromMode = backgroundConfigurations[selectedBackground].layerkey;
  } catch (e) {}

  const _backgroundLayers = backgroundsFromMode || "rvrGrau@40";

  const { mapSize, mapBounds } = mapBoundsAndSize || {};

  useEffect(() => {
    if (mapRef) {
      setMapRef(mapRef);
      if (mapRef.attributionControl) {
        mapRef.attributionControl.setPrefix("");
      }
      mapRef.on("movestart", () => {
        setBlockLoading(true);
      });
      mapRef.on("moveend", () => {
        setBlockLoading(true);
        window.clearTimeout(timeoutHandlerRef.current);
        timeoutHandlerRef.current = window.setTimeout(() => {
          setBlockLoading(false);
        }, blockingTime);
      });
      mapRef.on("zoomstart", () => {
        setBlockLoading(true);
      });
      mapRef.on("zoomend", () => {
        setBlockLoading(true);
        window.clearTimeout(timeoutHandlerRef.current);
        timeoutHandlerRef.current = window.setTimeout(() => {
          setBlockLoading(false);
        }, blockingTime);
      });
    }
  }, [mapRef]);

  useEffect(() => {
    if (!mapRef) return;

    setMapBoundsAndSize((old) => {
      let next = old;

      try {
        const pane =
          mapRef.getPane && (mapRef.getPane("mapPane") as LeafletPane);
        if (!pane || !pane._leaflet_pos) {
          return old;
        }

        const mapBounds = mapRef.getBounds();
        const mapSize = mapRef.getSize();

        if (
          old === undefined ||
          JSON.stringify(old.mapBounds) !== JSON.stringify(mapBounds) ||
          JSON.stringify(old.mapSize) !== JSON.stringify(mapSize)
        ) {
          next = { mapBounds, mapSize };
          setBounds(mapBounds);
        }
      } catch (_e) {
        return old;
      }

      return next;
    });
  }, [mapRef, sizeFromMapRef, boundsFromMapRef]);

  useEffect(() => {
    if (refRoutedMap?.current !== null) {
      setRoutedMapRef(refRoutedMap.current);
    }
  }, [refRoutedMap]);

  useEffect(() => {
    if (
      blockLoading === false &&
      (indexInitialized || connectionMode !== CONNECTIONMODE.FROMCACHE)
    ) {
      if (mapBounds && mapSize) {
        const boundingBox = convertBounds2BBox(mapBounds);
        const z = urlSearchParams.get("zoom");

        if (zoom !== z) {
          setZoom(z);
        }
        if (featureCollectionMode === MODES.OBJECTS) {
          loadObjects({
            boundingBox,
            inFocusMode,
            zoom: z,
            jwt: jwt,
            force: true,
          });
        } else {
          // console.log("xxx no map for you (mapBounds && mapSize)", mapBounds, mapSize);
        }
      }
    } else {
      // console.log(
      //   "xxx no map for you (blockLoading===false,indexInitialized,isSecondaryCacheReady)",
      //   blockLoading === false,
      //   indexInitialized,
      //   isSecondaryCacheReady
      // );
    }
  }, [
    mapBounds,
    mapSize,
    blockLoading,
    indexInitialized,
    connectionMode,
    featureCollectionMode,
    filter,
  ]);

  useEffect(() => {
    if (connectionMode === CONNECTIONMODE.FROMCACHE) {
      if (loadingState === undefined || indexInitialized === false) {
        if (indexInitializationRequested === false) {
          setIndexInitializationRequested(true);
          initIndex(setIndexInitialized);
        }
      } else {
        // console.log(
        //   "should i initialize index in CONNECTIONMODE.FROMCACHE: no will not",
        //   loadingState
        // );
      }
    }
  }, [connectionMode, loadingState]);

  const mapStyle = {
    height,
    width,
    cursor: "pointer",
    clear: "both",
    display: "flex",
  };

  let symbolColor;
  if (background === "nightplan") {
    symbolColor = "#ffffff";
  } else {
    symbolColor = "#000000";
  }
  return (
    <>
      <RoutedMap
        editable={false}
        zoomControlEnabled={false}
        style={mapStyle}
        key={"leafletRoutedMap"}
        referenceSystem={MappingConstants.crs3857}
        referenceSystemDefinition={MappingConstants.proj4crs3857def}
        ref={refRoutedMap}
        layers=""
        doubleClickZoom={false}
        onclick={(e) => {}}
        ondblclick={(e) => {
          try {
            const classesString = e.originalEvent.path[0].getAttribute("class");

            if (classesString) {
              const classes = classesString.split(" ");

              if (
                classes.includes("leaflet-gl-layer") ||
                classes.includes("leaflet-container")
              ) {
                handleSelectedFeature(null);
              } else {
                // console.log("classes", classesString);
              }
            }
          } catch (e) {
            console.log("error in dbl click", e);
          }
        }}
        // autoFitProcessedHandler={() =>
        //   this.props.mappingActions.setAutoFit(false)
        // }
        urlSearchParams={urlSearchParams}
        backgroundlayers={!activeBackgroundLayer ? _backgroundLayers : null}
        fullScreenControlEnabled={false}
        locateControlEnabled={false}
        minZoom={11}
        maxZoom={22}
        zoomSnap={0.5}
        zoomDelta={0.5}
        fallbackPosition={{
          lat: 51.272399,
          lng: 7.199712,
        }}
        fallbackZoom={18}
        locationChangedHandler={(location) => {
          navigate(
            browserlocation.pathname +
              modifyQueryPart(browserlocation.search, location)
          );
        }}
        boundingBoxChangedHandler={(boundingBox) => {
          // console.log("xxx boundingBox Changed", boundingBox);
        }}
      >
        <BelisFeatureCollection
          // style={{ zIndex: 600 }}
          featureCollection={featureCollection}
          fgColor={symbolColor}
          selectedFeature={selectedFeature}
          handleSelectedFeature={handleSelectedFeature}
        ></BelisFeatureCollection>
        {/* <DebugFeature feature={focusBoundingBox} /> */}
        <FocusRectangle
          inFocusMode={inFocusMode && fcMode === MODES.OBJECTS}
          mapWidth={mapStyle.width}
          mapHeight={mapStyle.height}
        />
        {inPaleMode && <PaleOverlay opacity={0.8} />}

        {activeBackgroundLayer && (
          <>
            <BackgroundLayers
              activeBackgroundLayer={activeBackgroundLayer}
              opacities={backgroundLayerOpacities}
            />
          </>
        )}

        {children}
        <TopicMapSelectionContent />

        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: "0px",
            zIndex: 600,
            width: "100%",
            pointerEvents: "none",
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
          </ControlLayout>
        </div>
      </RoutedMap>
    </>
  );
}
